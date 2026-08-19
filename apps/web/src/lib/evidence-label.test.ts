import { describe, expect, it } from 'vitest';
import { evidenceHeading, evidenceSnippet } from './evidence-label.js';

const base = { title: '', description: '', contentType: 'image' as const };

describe('evidenceHeading', () => {
  it('prefers the title', () => {
    expect(evidenceHeading({ ...base, title: 'SQLi on login', description: 'details' })).toBe(
      'SQLi on login',
    );
  });

  it('falls back to the description when the title is blank', () => {
    expect(evidenceHeading({ ...base, title: '   ', description: 'legacy note' })).toBe(
      'legacy note',
    );
  });

  it('falls back to the content-type label when both are blank', () => {
    expect(evidenceHeading({ ...base, contentType: 'codeblock' })).toBe('Code block');
  });
});

describe('evidenceSnippet', () => {
  it('returns the description only when a real title is present', () => {
    expect(evidenceSnippet({ ...base, title: 'A title', description: 'the body' })).toBe(
      'the body',
    );
  });

  it('returns null when the description is standing in as the heading', () => {
    expect(evidenceSnippet({ ...base, title: '', description: 'the body' })).toBeNull();
  });

  it('returns null when there is no description', () => {
    expect(evidenceSnippet({ ...base, title: 'A title', description: '  ' })).toBeNull();
  });
});
