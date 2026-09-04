import { rm, stat } from 'node:fs/promises';
import * as p from '@clack/prompts';
import { defaultTagColorFor } from '@reporter/shared';
import type { TermConfig } from './config.js';
import { makeClient } from './client.js';
import { uploadCast } from './upload.js';
import { c, sym } from './theme.js';

/** Sentinel value used to offer inline tag creation from the multiselect. */
const CREATE_TAG = '__create_tag__';

/** A tag as needed for the picker. */
interface TagOption {
  id: number;
  name: string;
}

/**
 * Let the operator select existing tags and create new ones inline. Returns the
 * chosen tag ids, or `null` if they cancelled out of the flow entirely.
 */
async function pickTags(config: TermConfig, engagementSlug: string): Promise<number[] | null> {
  let tags: TagOption[];
  try {
    tags = (await makeClient(config).listTags(engagementSlug)).map((t) => ({
      id: t.id,
      name: t.name,
    }));
  } catch {
    // tags are optional — skip the picker if they can't be loaded
    return [];
  }

  let selected: number[] = [];
  // Loop so a "create a new tag" pick can add the tag and re-open the picker
  // with the previous selection preserved.
  for (;;) {
    const picked = await p.multiselect<number | typeof CREATE_TAG>({
      message: 'Tags (space to select, enter to confirm)',
      options: [
        ...tags.map((t) => ({ value: t.id, label: t.name })),
        { value: CREATE_TAG, label: `${c.accent('➕')} Create a new tag…` },
      ],
      initialValues: selected,
      required: false,
    });
    if (p.isCancel(picked)) return null;

    const values = picked as (number | typeof CREATE_TAG)[];
    selected = values.filter((v): v is number => v !== CREATE_TAG);

    if (!values.includes(CREATE_TAG)) return selected;

    // The operator asked to create a tag: prompt for a name, create it, keep going.
    const name = await p.text({
      message: 'New tag name',
      placeholder: 'e.g. privilege-escalation',
    });
    if (p.isCancel(name)) return null;
    const trimmed = String(name).trim();
    if (!trimmed) continue;

    const spin = p.spinner();
    spin.start(`Creating tag ${c.accent(trimmed)}`);
    try {
      const created = await makeClient(config).createTag(engagementSlug, {
        name: trimmed,
        colorName: defaultTagColorFor(trimmed),
      });
      spin.stop(`${sym.ok} Created tag ${c.accent(created.name)}`);
      if (!tags.some((t) => t.id === created.id)) {
        tags.push({ id: created.id, name: created.name });
      }
      // Auto-select the freshly created tag so the operator doesn't have to hunt.
      if (!selected.includes(created.id)) selected.push(created.id);
    } catch (err) {
      spin.stop(
        `${sym.err} Couldn't create tag: ${err instanceof Error ? err.message : String(err)}`,
      );
      // keep going — the operator can retry with a different name or move on
    }
  }
}

/** Ask the operator to choose an engagement from the server. */
async function chooseEngagement(config: TermConfig): Promise<string | null> {
  const spin = p.spinner();
  spin.start('Loading engagements');
  let engs;
  try {
    engs = await makeClient(config).listEngagements();
    spin.stop(`${engs.length} engagement(s)`);
  } catch (err) {
    spin.stop(`${sym.err} Couldn't load engagements: ${err instanceof Error ? err.message : err}`);
    return null;
  }
  if (engs.length === 0) {
    p.log.warn('No engagements available for this API key.');
    return null;
  }
  const slug = await p.select({
    message: 'Engagement',
    options: engs.map((o) => ({ value: o.slug, label: o.name, hint: o.status })),
  });
  if (p.isCancel(slug)) return null;
  return String(slug);
}

/** Non-interactive overrides supplied via CLI flags. */
export interface UploadOverrides {
  /** Pre-supplied title; when set the Title prompt is skipped. */
  title?: string;
}

/**
 * Prompt for a required Title, re-asking until the operator enters a non-empty
 * (non-whitespace) value. Returns the trimmed title, or `null` if cancelled.
 */
async function promptTitle(): Promise<string | null> {
  for (;;) {
    const title = await p.text({
      message: 'Title',
      placeholder: 'Short label for this recording',
      validate: (value) => (String(value ?? '').trim() ? undefined : 'Title is required'),
    });
    if (p.isCancel(title)) return null;
    const trimmed = String(title ?? '').trim();
    if (trimmed) return trimmed;
    // Defensive: validate should have caught this, but re-ask rather than upload empty.
  }
}

/** Collect title + description + tags and upload the recording. */
export async function promptAndUpload(
  config: TermConfig,
  castPath: string,
  parentEvidenceUuid?: string,
  overrides: UploadOverrides = {},
): Promise<boolean> {
  const engagementSlug = await chooseEngagement(config);
  if (!engagementSlug) return false;
  if (parentEvidenceUuid) {
    p.log.info(`Filing as linked evidence on ${c.muted(parentEvidenceUuid)}`);
  }

  // Title is required. Use the flag value when supplied non-interactively,
  // otherwise prompt (re-asking until it's non-empty).
  let title: string;
  const overrideTitle = overrides.title?.trim();
  if (overrideTitle) {
    title = overrideTitle;
  } else {
    const prompted = await promptTitle();
    if (prompted === null) return false;
    title = prompted;
  }

  const description = await p.text({
    message: 'Description',
    placeholder: 'What does this recording show?',
  });
  if (p.isCancel(description)) return false;

  const tagIds = (await pickTags(config, engagementSlug)) ?? [];

  const spin = p.spinner();
  spin.start('Uploading recording');
  try {
    const uuid = await uploadCast(config, castPath, {
      engagementSlug,
      title,
      description: String(description ?? ''),
      tagIds,
      parentEvidenceUuid,
    });
    spin.stop(`${sym.ok} Uploaded as evidence ${c.muted(uuid)}`);
    return true;
  } catch (err) {
    spin.stop(`${sym.err} Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    // Preserve the evidence link and title in the retry hint so a copied command
    // re-files it as linked evidence (not new top-level evidence) and keeps the title.
    const linkFlag = parentEvidenceUuid ? ` --link-to ${parentEvidenceUuid}` : '';
    const titleFlag = ` --title "${title.replace(/"/g, '\\"')}"`;
    p.log.info(`Your recording is saved at ${c.accent(castPath)} — retry with:`);
    p.log.info(`  ${c.muted(`reporter-term upload "${castPath}"${titleFlag}${linkFlag}`)}`);
    return false;
  }
}

/** Full post-recording flow: upload / save / discard. */
export async function handleRecording(
  config: TermConfig,
  castPath: string,
  parentEvidenceUuid?: string,
): Promise<void> {
  const size = await stat(castPath)
    .then((s) => `${(s.size / 1024).toFixed(1)} KB`)
    .catch(() => 'unknown size');
  p.log.step(`Recording saved (${size}).`);

  const action = await p.select({
    message: 'What next?',
    options: [
      { value: 'upload', label: 'Upload to reporter' },
      { value: 'save', label: 'Keep locally only' },
      { value: 'discard', label: 'Discard' },
    ],
    initialValue: 'upload',
  });
  if (p.isCancel(action)) {
    p.outro(`Kept at ${castPath}`);
    return;
  }

  if (action === 'upload') {
    const ok = await promptAndUpload(config, castPath, parentEvidenceUuid);
    if (ok) {
      const del = await p.confirm({ message: 'Delete the local copy?', initialValue: false });
      if (!p.isCancel(del) && del) await rm(castPath, { force: true });
    }
    p.outro('Done.');
  } else if (action === 'save') {
    p.outro(`${sym.ok} Saved at ${c.accent(castPath)}`);
  } else {
    await rm(castPath, { force: true });
    p.outro('Discarded.');
  }
}
