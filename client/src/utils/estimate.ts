import type { FileMeta, PrintSettings } from '../types';

/** Client mirror of the server page-range parser ("1-3", "1,3,5", mixed). */
export function parsePageRangeClient(range: string, totalPages: number): number[] | null {
  const out = new Set<number>();
  for (const part of range.split(',')) {
    const seg = part.trim();
    if (!seg) continue;
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(seg);
    if (!m) return null;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    if (a < 1 || b > totalPages || a > b) return null;
    for (let p = a; p <= b; p++) out.add(p);
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

export function rateFor(pricing: Record<string, number>, paper: string, color: string): number {
  return pricing[`${paper}:${color}`] ?? 2;
}

export interface Estimate {
  pages: number;
  sheets: number;
  price: number;
  invalidRange: string | null;
}

/** Live estimate mirroring the server's calcEstimate. */
export function estimate(
  files: FileMeta[],
  settings: PrintSettings,
  pageRanges: Record<string, string>,
  pricing: Record<string, number>
): Estimate {
  let pages = 0;
  let sheets = 0;
  let invalidRange: string | null = null;

  for (const f of files) {
    if (f.kind === 'pdf') {
      const rangeStr = (pageRanges[f.id] || '').trim();
      if (!rangeStr) {
        pages += f.pages;
        sheets += Math.ceil(f.pages / settings.pagesPerSheet);
      } else {
        const sel = parsePageRangeClient(rangeStr, f.pages);
        if (!sel) {
          invalidRange = f.originalName;
        } else {
          pages += sel.length;
          sheets += Math.ceil(sel.length / settings.pagesPerSheet);
        }
      }
    } else {
      pages += 1;
      sheets += 1;
    }
  }

  const price = sheets * settings.copies * rateFor(pricing, settings.paper, settings.color);
  return { pages, sheets, price, invalidRange };
}
