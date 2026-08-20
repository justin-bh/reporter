import { describe, expect, it } from 'vitest';
import { renderMarkdown, isMarkdownEmpty } from './markdown.js';

describe('renderMarkdown', () => {
  it('renders empty/whitespace input as an empty string', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown('   \n  ')).toBe('');
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
  });

  it('renders basic markdown (headings, bold, lists)', () => {
    const html = renderMarkdown('## Title\n\nSome **bold** text.\n\n- one\n- two');
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
  });

  it('splits blank-line-separated paragraphs into separate <p> blocks', () => {
    const html = renderMarkdown('First paragraph.\n\nSecond paragraph.');
    expect(html).toBe('<p>First paragraph.</p>\n<p>Second paragraph.</p>');
  });

  it('turns a single newline into a <br> (preserves author line breaks)', () => {
    const html = renderMarkdown('line one\nline two');
    expect(html).toContain('line one<br>');
    expect(html).toContain('line two');
  });

  it('does not pass through raw HTML (no injection)', () => {
    const html = renderMarkdown('<script>alert(1)</script> and <b>x</b>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('rejects unsafe link protocols but keeps http/https', () => {
    // An unsafe protocol is not turned into a link — the literal text survives,
    // but there is no clickable <a href="javascript:…">.
    const evil = renderMarkdown('[x](javascript:alert(1))');
    expect(evil).not.toContain('<a ');
    expect(evil).not.toContain('href=');
    const ok = renderMarkdown('[x](https://example.com)');
    expect(ok).toContain('href="https://example.com"');
  });
});

describe('isMarkdownEmpty', () => {
  it('detects empty vs non-empty content', () => {
    expect(isMarkdownEmpty('')).toBe(true);
    expect(isMarkdownEmpty('  \n ')).toBe(true);
    expect(isMarkdownEmpty(null)).toBe(true);
    expect(isMarkdownEmpty('x')).toBe(false);
  });
});
