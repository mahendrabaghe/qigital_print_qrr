import { describe, it, expect } from 'vitest';
import { parsePageRange, PageRangeError } from '../utils/pageRange';
import { calcEstimate, rateFor, DEFAULT_PRICING } from '../utils/pricing';
import { sumatraPrintSettings, pageDims, fitRect, PAPER_SIZES } from '../utils/paper';
import { genTerminalCode, genSessionCode, genAccessToken, genAgentToken } from '../utils/codes';
import { DEFAULT_PRINT_SETTINGS, type PrintSettings } from '../types/print';

describe('parsePageRange', () => {
  it('parses simple ranges', () => {
    expect(parsePageRange('1-3', 10)).toEqual([1, 2, 3]);
  });

  it('parses comma lists', () => {
    expect(parsePageRange('1,3,5', 5)).toEqual([1, 3, 5]);
  });

  it('parses mixed expressions and dedupes + sorts', () => {
    expect(parsePageRange('5, 1-3, 2, 8-9', 10)).toEqual([1, 2, 3, 5, 8, 9]);
  });

  it('handles single pages and whitespace', () => {
    expect(parsePageRange(' 2 ', 5)).toEqual([2]);
  });

  it('rejects start after end', () => {
    expect(() => parsePageRange('5-2', 10)).toThrow(PageRangeError);
  });

  it('rejects zero or negative numbers', () => {
    expect(() => parsePageRange('0', 10)).toThrow(PageRangeError);
  });

  it('rejects out-of-range pages', () => {
    expect(() => parsePageRange('11', 10)).toThrow(PageRangeError);
    expect(() => parsePageRange('1-20', 10)).toThrow(PageRangeError);
  });

  it('rejects garbage', () => {
    expect(() => parsePageRange('abc', 10)).toThrow(PageRangeError);
    expect(() => parsePageRange('1;', 10)).toThrow(PageRangeError);
  });
});

describe('pricing', () => {
  const settings: PrintSettings = { ...DEFAULT_PRINT_SETTINGS, paper: 'a4', color: 'bw', copies: 1 };

  it('images cost one sheet each', () => {
    const est = calcEstimate(
      [
        { kind: 'image', pages: 1 },
        { kind: 'image', pages: 1 },
      ],
      settings,
      {}
    );
    expect(est).toEqual({ pages: 2, sheets: 2, price: 4 });
  });

  it('pdfs are charged per sheet with N-up', () => {
    const est = calcEstimate([{ kind: 'pdf', pages: 3 }], { ...settings, pagesPerSheet: 2 }, {});
    expect(est.sheets).toBe(2); // ceil(3/2)
    expect(est.price).toBe(4);
  });

  it('copies multiply the price', () => {
    const est = calcEstimate([{ kind: 'pdf', pages: 2 }], { ...settings, copies: 3 }, {});
    expect(est).toEqual({ pages: 2, sheets: 2, price: 12 });
  });

  it('falls back to defaults and supports custom pricing', () => {
    expect(rateFor({}, 'a4', 'color')).toBe(DEFAULT_PRICING['a4:color']);
    expect(rateFor({ 'a4:color': 12 }, 'a4', 'color')).toBe(12);
  });
});

describe('sumatraPrintSettings', () => {
  it('builds the full argument string for a pass-through pdf', () => {
    const settings: PrintSettings = {
      ...DEFAULT_PRINT_SETTINGS,
      copies: 2,
      sides: 'double',
      color: 'bw',
      scaling: 'fit',
      pageRange: '1-3,5',
    };
    expect(sumatraPrintSettings({ kind: 'pdf', settings, imposed: false })).toBe('1-3,5,2x,duplex,monochrome,fit');
  });

  it('omits page range and scaling for imposed PDFs', () => {
    const settings: PrintSettings = { ...DEFAULT_PRINT_SETTINGS, pageRange: '1-2' };
    expect(sumatraPrintSettings({ kind: 'pdf', settings, imposed: true })).toBe('simplex,monochrome');
  });

  it('images never get page range or scaling', () => {
    const settings: PrintSettings = { ...DEFAULT_PRINT_SETTINGS, copies: 4, sides: 'double', color: 'bw' };
    expect(sumatraPrintSettings({ kind: 'image', settings, imposed: false })).toBe('4x,duplex,monochrome');
  });

  it('actual scaling maps to noscale', () => {
    const settings: PrintSettings = { ...DEFAULT_PRINT_SETTINGS, color: 'color', scaling: 'actual' };
    expect(sumatraPrintSettings({ kind: 'pdf', settings, imposed: false })).toBe('simplex,color,noscale');
  });
});

describe('paper math', () => {
  it('a4 portrait matches known point size', () => {
    expect(PAPER_SIZES.a4).toEqual([595.28, 841.89]);
  });

  it('landscape swaps dimensions', () => {
    expect(pageDims('a4', 'landscape')).toEqual([841.89, 595.28]);
  });

  it('fit never overflows the box, fill always covers it', () => {
    const fit = fitRect(100, 50, 0, 0, 200, 200, 'fit');
    expect(fit.w).toBeLessThanOrEqual(200 + 1e-9);
    expect(fit.h).toBeLessThanOrEqual(200 + 1e-9);
    const fill = fitRect(100, 50, 0, 0, 200, 200, 'fill');
    expect(Math.max(fill.w, fill.h)).toBeGreaterThanOrEqual(200 - 1e-9);
  });

  it('centers the result', () => {
    const r = fitRect(100, 100, 0, 0, 200, 300, 'fit');
    expect(r.x).toBeCloseTo(50);
  });
});

describe('codes', () => {
  it('generates unambiguous codes of the right length', () => {
    expect(genTerminalCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(genSessionCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/);
    expect(genAccessToken().length).toBeGreaterThanOrEqual(32);
    expect(genAgentToken().length).toBeGreaterThanOrEqual(32);
  });

  it('never contains ambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(genSessionCode()).not.toMatch(/[0O1IL]/);
    }
  });
});
