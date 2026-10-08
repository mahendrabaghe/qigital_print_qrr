import { PDFDocument } from 'pdf-lib';
import type { PrintSettings } from '../types/print';
import { HttpError } from '../utils/errors';
import { parsePageRange, PageRangeError } from '../utils/pageRange';
import { pageDims, fitRect, PPS_GRID, sumatraPrintSettings } from '../utils/paper';
import { storage } from './storage.service';
import crypto from 'crypto';

export interface PrepInput {
  fileDoc: {
    _id: unknown;
    kind: 'image' | 'pdf';
    ext: string;
    storageKey: string;
    pages: number;
    originalName: string;
  };
  settings: PrintSettings; // includes per-file pageRange for PDFs
}

export interface PrepResult {
  storageKey: string;
  sheets: number; // pages in the print-ready PDF
  pages: number; // logical selected pages
  sumatraArgs: string;
}

/**
 * Produce a print-ready PDF for one file:
 *  - images are placed on a paper-sized page (fit/fill/actual), optionally tiled
 *    pages-per-sheet times (handy for photo sheets)
 *  - PDFs with pagesPerSheet > 1 are imposed into an N-up grid server-side
 *  - pass-through PDFs keep their own layout; page range / scaling / copies /
 *    duplex / color are applied by the print agent through SumatraPDF args
 */
export async function preparePrintFile(input: PrepInput, outKeyPrefix: string): Promise<PrepResult> {
  const { fileDoc, settings } = input;
  const buffer = await storage.get(fileDoc.storageKey);

  if (fileDoc.kind === 'image') {
    const ready = await imageToPdf(buffer, fileDoc.ext, settings);
    const storageKey = `${outKeyPrefix}/job-${crypto.randomUUID()}.pdf`;
    await storage.put(storageKey, Buffer.from(ready));
    return {
      storageKey,
      sheets: 1,
      pages: 1,
      sumatraArgs: sumatraPrintSettings({ kind: 'image', settings, imposed: true }),
    };
  }

  // ---- PDF ----
  let selected: number[];
  try {
    selected = settings.pageRange ? parsePageRange(settings.pageRange, fileDoc.pages) : range(1, fileDoc.pages);
  } catch (err) {
    if (err instanceof PageRangeError) throw new HttpError(400, 'PAGE_RANGE_INVALID', err.message);
    throw err;
  }
  if (selected.length === 0) throw new HttpError(400, 'PAGE_RANGE_INVALID', 'No pages selected');

  if (settings.pagesPerSheet > 1) {
    const ready = await imposePdf(buffer, selected, settings);
    const storageKey = `${outKeyPrefix}/job-${crypto.randomUUID()}.pdf`;
    await storage.put(storageKey, Buffer.from(ready));
    return {
      storageKey,
      sheets: Math.ceil(selected.length / settings.pagesPerSheet),
      pages: selected.length,
      sumatraArgs: sumatraPrintSettings({ kind: 'pdf', settings, imposed: true }),
    };
  }

  // Pass-through: printer driver handles range/scaling via Sumatra args.
  return {
    storageKey: fileDoc.storageKey,
    sheets: selected.length,
    pages: selected.length,
    sumatraArgs: sumatraPrintSettings({ kind: 'pdf', settings, imposed: false }),
  };
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

async function imageToPdf(buffer: Buffer, ext: string, settings: PrintSettings): Promise<Uint8Array> {
  if (ext === 'webp') {
    throw new HttpError(
      422,
      'WEBP_NOT_PRINTABLE',
      'WebP files must be converted by the app before printing. Re-upload the file from the customer page.'
    );
  }
  const pdf = await PDFDocument.create();
  const img = ext === 'png' ? await pdf.embedPng(buffer) : await pdf.embedJpg(buffer);

  const [cols, rows] = PPS_GRID[settings.pagesPerSheet] ?? [1, 1];
  const [pw, ph] = pageDims(settings.paper, settings.orientation);
  const page = pdf.addPage([pw, ph]);

  const cellW = pw / cols;
  const cellH = ph / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const boxX = c * cellW;
      const boxY = ph - (r + 1) * cellH;
      if (settings.scaling === 'actual') {
        // Natural size, 1px = 1pt, centered in the cell (may overflow and be clipped).
        const w = img.width;
        const h = img.height;
        page.drawImage(img, { x: boxX + (cellW - w) / 2, y: boxY + (cellH - h) / 2, width: w, height: h });
      } else {
        const rect = fitRect(img.width, img.height, boxX, boxY, cellW, cellH, settings.scaling);
        page.drawImage(img, rect);
      }
    }
  }
  return pdf.save();
}

async function imposePdf(buffer: Buffer, selected: number[], settings: PrintSettings): Promise<Uint8Array> {
  const src = await PDFDocument.load(buffer);
  const out = await PDFDocument.create();
  const embedded = await out.embedPdf(buffer, selected.map((p) => p - 1));

  const [cols, rows] = PPS_GRID[settings.pagesPerSheet] ?? [1, 1];
  const [pw, ph] = pageDims(settings.paper, settings.orientation);
  const cellW = pw / cols;
  const cellH = ph / rows;

  for (let i = 0; i < embedded.length; i += settings.pagesPerSheet) {
    const page = out.addPage([pw, ph]);
    const group = embedded.slice(i, i + settings.pagesPerSheet);
    group.forEach((ep, j) => {
      const c = j % cols;
      const r = Math.floor(j / cols);
      const boxX = c * cellW;
      const boxY = ph - (r + 1) * cellH;
      const rect = fitRect(ep.width, ep.height, boxX, boxY, cellW, cellH, 'fit');
      page.drawPage(ep, { x: rect.x, y: rect.y, xScale: rect.w / ep.width, yScale: rect.h / ep.height });
    });
  }
  return out.save();
}
