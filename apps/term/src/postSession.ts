import { rm, stat } from 'node:fs/promises';
import * as p from '@clack/prompts';
import type { TermConfig } from './config.js';
import { makeClient } from './client.js';
import { uploadCast } from './upload.js';
import { c, sym } from './theme.js';

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

/** Collect description + tags and upload the recording. */
export async function promptAndUpload(
  config: TermConfig,
  castPath: string,
  parentEvidenceUuid?: string,
): Promise<boolean> {
  const engagementSlug = await chooseEngagement(config);
  if (!engagementSlug) return false;
  if (parentEvidenceUuid) {
    p.log.info(`Filing as a comment on evidence ${c.muted(parentEvidenceUuid)}`);
  }

  const description = await p.text({
    message: 'Description',
    placeholder: 'What does this recording show?',
  });
  if (p.isCancel(description)) return false;

  let tagIds: number[] = [];
  try {
    const tags = await makeClient(config).listTags(engagementSlug);
    if (tags.length > 0) {
      const picked = await p.multiselect({
        message: 'Tags (space to select, enter to confirm)',
        options: tags.map((t) => ({ value: t.id, label: t.name })),
        required: false,
      });
      if (!p.isCancel(picked)) tagIds = picked as number[];
    }
  } catch {
    // tags are optional
  }

  const spin = p.spinner();
  spin.start('Uploading recording');
  try {
    const uuid = await uploadCast(config, castPath, {
      engagementSlug,
      description: String(description ?? ''),
      tagIds,
      parentEvidenceUuid,
    });
    spin.stop(`${sym.ok} Uploaded as evidence ${c.muted(uuid)}`);
    return true;
  } catch (err) {
    spin.stop(`${sym.err} Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    // Preserve the comment link in the retry hint so a copied command re-files it
    // as a comment rather than silently creating new top-level evidence.
    const commentFlag = parentEvidenceUuid ? ` --comment-on ${parentEvidenceUuid}` : '';
    p.log.info(`Your recording is saved at ${c.accent(castPath)} — retry with:`);
    p.log.info(`  ${c.muted(`reporter-term upload "${castPath}"${commentFlag}`)}`);
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
