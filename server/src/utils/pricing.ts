import type { ColorMode, PaperSize, PrintSettings } from '../types/print';

/** Default price per sheet (INR), keyed `paper:color`. */
export const DEFAULT_PRICING: Record<string, number> = {
  'a4:bw': 2,
  'a4:color': 10,
  'a3:bw': 5,
  'a3:color': 20,
  'a5:bw': 1,
  'a5:color': 5,
  'letter:bw': 2,
  'letter:color': 10,
  'legal:bw': 3,
  'legal:color': 12,
  '4x6:bw': 5,
  '4x6:color': 10,
  'custom:bw': 5,
  'custom:color': 15,
};

export function rateFor(pricing: Record<string, number>, paper: PaperSize, color: ColorMode): number {
  return pricing[`${paper}:${color}`] ?? DEFAULT_PRICING[`${paper}:${color}`] ?? 2;
}

export interface EstimableFile {
  kind: 'image' | 'pdf';
  pages: number; // selected logical pages
}

export interface Estimate {
  pages: number; // logical pages across all files
  sheets: number; // physical sheets per copy
  price: number; // estimated total (INR)
}

/**
 * Price is charged per printed sheet:
 *   sheets(file) = ceil(selectedPages / pagesPerSheet)  (images always fit on 1 sheet)
 *   price = sum(sheets * copies * rate(paper, color))
 */
export function calcEstimate(
  files: EstimableFile[],
  settings: PrintSettings,
  pricing: Record<string, number>
): Estimate {
  const rate = rateFor(pricing, settings.paper, settings.color);
  let pages = 0;
  let sheets = 0;
  for (const f of files) {
    pages += f.pages;
    sheets += f.kind === 'image' ? 1 : Math.ceil(f.pages / settings.pagesPerSheet);
  }
  return { pages, sheets, price: sheets * settings.copies * rate };
}
