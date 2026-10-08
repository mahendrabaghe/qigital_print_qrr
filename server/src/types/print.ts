export type PaperSize = 'a4' | 'a3' | 'a5' | 'letter' | 'legal' | '4x6' | 'custom';
export type ColorMode = 'color' | 'bw';
export type Orientation = 'portrait' | 'landscape';
export type Sides = 'single' | 'double';
export type Scaling = 'actual' | 'fit' | 'fill';
export type PagesPerSheet = 1 | 2 | 4 | 6 | 9;

export interface PrintSettings {
  paper: PaperSize;
  color: ColorMode;
  copies: number;
  orientation: Orientation;
  sides: Sides;
  scaling: Scaling;
  pagesPerSheet: PagesPerSheet;
  /** Per-file: selected pages for PDFs, e.g. "1-3,5". Undefined = all pages. */
  pageRange?: string;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paper: 'a4',
  color: 'bw',
  copies: 1,
  orientation: 'portrait',
  sides: 'single',
  scaling: 'fit',
  pagesPerSheet: 1,
};
