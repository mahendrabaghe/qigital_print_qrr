import type { Orientation, PaperSize, PrintSettings, Scaling } from '../types/print';

/** Portrait page dimensions in PDF points (1 pt = 1/72 inch). */
export const PAPER_SIZES: Record<PaperSize, [number, number]> = {
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
  letter: [612, 792],
  legal: [612, 1008],
  '4x6': [288, 432],
  custom: [595.28, 841.89],
};

export const PAPER_LABELS: Record<PaperSize, string> = {
  a4: 'A4',
  a3: 'A3',
  a5: 'A5',
  letter: 'Letter',
  legal: 'Legal',
  '4x6': '4x6 photo',
  custom: 'Custom',
};

/** Grid layout [cols, rows] for pages-per-sheet. */
export const PPS_GRID: Record<number, [number, number]> = {
  1: [1, 1],
  2: [2, 1],
  4: [2, 2],
  6: [3, 2],
  9: [3, 3],
};

export function pageDims(paper: PaperSize, orientation: Orientation): [number, number] {
  const [w, h] = PAPER_SIZES[paper] ?? PAPER_SIZES.a4;
  return orientation === 'landscape' ? [h, w] : [w, h];
}

/**
 * Build the SumatraPDF `-print-settings` argument for a job.
 * Everything that is NOT baked into the print-ready PDF by the server
 * (copies, duplex, color mode, page range, pdf scaling) is applied here.
 */
export function sumatraPrintSettings(opts: {
  kind: 'image' | 'pdf';
  settings: PrintSettings;
  imposed: boolean;
}): string {
  const { kind, settings, imposed } = opts;
  const parts: string[] = [];

  // Page range only matters for pass-through PDFs (imposed PDFs are pre-filtered).
  if (kind === 'pdf' && !imposed && settings.pageRange) {
    parts.push(settings.pageRange.replace(/\s+/g, ''));
  }
  if (settings.copies > 1) parts.push(`${settings.copies}x`);
  parts.push(settings.sides === 'double' ? 'duplex' : 'simplex');
  parts.push(settings.color === 'bw' ? 'monochrome' : 'color');
  if (kind === 'pdf' && !imposed) {
    const scalingMap: Record<Scaling, string> = { fit: 'fit', fill: 'fit', actual: 'noscale' };
    parts.push(scalingMap[settings.scaling]);
  }
  return parts.join(',');
}

/** Drawing math shared by image pages and N-up imposition. */
export function fitRect(
  srcW: number,
  srcH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  mode: 'fit' | 'fill'
): { x: number; y: number; w: number; h: number } {
  const scale =
    mode === 'fit' ? Math.min(boxW / srcW, boxH / srcH) : Math.max(boxW / srcW, boxH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: boxX + (boxW - w) / 2, y: boxY + (boxH - h) / 2, w, h };
}
