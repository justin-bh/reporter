import { describe, it, expect } from 'vitest';
import { WATERMARK_MAX_CHARS } from '@reporter/shared';
import { watermarkCss, watermarkFontSize } from './report-style.js';

// Letter page, 0.6in side margins → printable content width in CSS px. The
// diagonal watermark's rotated bounding box must stay within this so no glyph
// clips at the page edge.
const PRINTABLE_WIDTH_PX = (8.5 - 2 * 0.6) * 96; // 700.8
const COS45 = Math.SQRT1_2;
const ADVANCE = 0.82; // matches watermarkFontSize's conservative per-glyph advance

/** The rotated (-45°) bounding-box width of a single line of `n` glyphs. */
function rotatedWidth(fontSize: number, n: number): number {
  const boxWidth = fontSize * ADVANCE * n; // text run width
  const boxHeight = fontSize; // ~line height
  return COS45 * (boxWidth + boxHeight);
}

describe('watermarkFontSize', () => {
  it('clamps within [34, 120]', () => {
    expect(watermarkFontSize('X')).toBe(120); // short text hits the upper cap
    expect(watermarkFontSize('X'.repeat(200))).toBe(34); // very long hits the floor
  });

  it('keeps the rotated word within the printable width for every allowed length', () => {
    for (let n = 1; n <= WATERMARK_MAX_CHARS; n++) {
      const size = watermarkFontSize('X'.repeat(n));
      expect(rotatedWidth(size, n)).toBeLessThanOrEqual(PRINTABLE_WIDTH_PX);
    }
  });

  it('does not clip the default CONFIDENTIAL watermark', () => {
    const text = 'CONFIDENTIAL';
    expect(rotatedWidth(watermarkFontSize(text), text.length)).toBeLessThanOrEqual(
      PRINTABLE_WIDTH_PX,
    );
  });

  it('shrinks (never grows) as text lengthens', () => {
    let prev = Infinity;
    for (let n = 1; n <= WATERMARK_MAX_CHARS; n++) {
      const size = watermarkFontSize('X'.repeat(n));
      expect(size).toBeLessThanOrEqual(prev);
      prev = size;
    }
  });

  it('ignores surrounding whitespace when sizing', () => {
    expect(watermarkFontSize('  DRAFT  ')).toBe(watermarkFontSize('DRAFT'));
  });
});

describe('watermarkCss', () => {
  it('embeds the resolved font size and z-index per layer', () => {
    const behind = watermarkCss('#64748b', 0.11, 'behind', 96);
    expect(behind).toContain('font-size: 96px');
    expect(behind).toContain('z-index: -1');

    const front = watermarkCss('#64748b', 0.11, 'front', 80);
    expect(front).toContain('font-size: 80px');
    expect(front).toContain('z-index: 900');
  });
});
