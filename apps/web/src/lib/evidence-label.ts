import { EVIDENCE_TYPE_LABELS, type Evidence } from '@reporter/shared';

/** The subset of evidence fields the label/snippet helpers need. */
type Labelable = Pick<Evidence, 'title' | 'description' | 'contentType'>;

/**
 * Primary heading for a piece of evidence in non-detail views (timeline rows,
 * finding cards, picker rows). Prefers the `title`; falls back to the
 * `description` for legacy evidence created before titles existed, then to the
 * content-type label so there's always something readable.
 */
export function evidenceHeading(ev: Labelable): string {
  const title = ev.title.trim();
  if (title) return title;
  const description = ev.description.trim();
  if (description) return description;
  return EVIDENCE_TYPE_LABELS[ev.contentType];
}

/**
 * The muted one-line snippet shown beneath the heading — only when a real title
 * is present (so we don't repeat the description that's already standing in as
 * the heading) and the description is non-empty.
 */
export function evidenceSnippet(ev: Labelable): string | null {
  const description = ev.description.trim();
  if (ev.title.trim() && description) return description;
  return null;
}
