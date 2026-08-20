/**
 * Markdown rendering — the single source of truth shared by the web editor
 * preview, the desktop renderer, and the server's PDF report. Rendering the same
 * way everywhere guarantees the "Preview" tab in an editor matches the exported
 * document byte-for-byte.
 *
 * Safety: raw HTML in the source is NOT interpreted (`html: false`), so user
 * prose can never inject markup or scripts; markdown-it also rejects unsafe link
 * protocols (javascript:, data:, vbscript:) by default. The output is therefore
 * safe to inject with `dangerouslySetInnerHTML` / string interpolation.
 */
import MarkdownIt from 'markdown-it';

const md: MarkdownIt = new MarkdownIt({
  // No raw HTML passthrough — the input is trusted-author prose, but we still
  // never want stray `<script>`/`<img onerror>` etc. to survive.
  html: false,
  // Autolink bare URLs so "see https://…" becomes a link without markdown syntax.
  linkify: true,
  // A single newline becomes <br> (matches how our textareas historically wrote
  // line breaks), while a blank line still starts a new <p>. This is exactly the
  // "keep my paragraph spacing" behaviour authors expect.
  breaks: true,
  typographer: false,
});

/**
 * Render markdown source to an HTML string. Empty/whitespace-only input returns
 * an empty string so callers can cleanly omit a section. The result is wrapped
 * by the caller (e.g. in a `.md` container) for styling.
 */
export function renderMarkdown(source: string | null | undefined): string {
  const text = (source ?? '').trim();
  if (!text) return '';
  return md.render(text).trim();
}

/** True when the source has no renderable content (empty or whitespace). */
export function isMarkdownEmpty(source: string | null | undefined): boolean {
  return (source ?? '').trim().length === 0;
}
