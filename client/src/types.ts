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
  pageRange?: string;
}

export interface FileMeta {
  id: string;
  sessionId: string;
  originalName: string;
  ext: string;
  mimeType: string;
  kind: 'image' | 'pdf';
  size: number;
  pages: number;
  width: number;
  height: number;
  savedByAdmin: boolean;
  status: string;
  edited: boolean;
  createdAt: string;
  expiresAt: string | null;
}

export interface RequestFileEntry {
  fileId: string;
  name: string;
  kind: 'image' | 'pdf';
  size: number;
  pages: number;
  pageRange?: string;
}

export type RequestStatus = 'waiting' | 'processing' | 'printing' | 'completed' | 'rejected' | 'cancelled';

export interface PrintRequest {
  id: string;
  code: string;
  sessionCode: string;
  files: RequestFileEntry[];
  settings: PrintSettings;
  estPages: number;
  estSheets: number;
  estPrice: number;
  finalPrice: number | null;
  status: RequestStatus;
  rejectReason?: string;
  createdAt: string;
  completedAt: string | null;
  accessToken?: string;
}

export type JobStatus = 'queued' | 'assigned' | 'printing' | 'completed' | 'failed' | 'cancelled' | 'paused';

export interface PrintJob {
  id: string;
  code: string;
  requestId: string;
  requestCode: string;
  fileName: string;
  printerName: string;
  settings: PrintSettings;
  pages: number;
  sheets: number;
  status: JobStatus;
  position: number;
  attempts: number;
  demo: boolean;
  error: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface Printer {
  id: string;
  name: string;
  type: 'usb' | 'network' | 'virtual';
  status: 'online' | 'offline' | 'unknown';
  isDefault: boolean;
  source: 'agent' | 'manual' | 'demo';
  lastSeenAt: string | null;
}

export interface Terminal {
  id: string;
  code: string;
  label: string;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  uploadUrl: string;
  qrDataUrl: string;
  expiresAt: string;
}

export interface ShopSettings {
  address: string;
  phone: string;
  logoUrl: string;
  defaultPaper: PaperSize;
  defaultColor: ColorMode;
  defaultOrientation: Orientation;
  defaultSides: Sides;
  defaultScaling: Scaling;
  defaultPagesPerSheet: PagesPerSheet;
  defaultPrinterId: string | null;
  defaultLanguage: 'en' | 'hi';
  retentionHours: number;
  maxFileSizeMb: number;
  pricing: Record<string, number>;
}

export interface ShopInfo {
  name: string;
  settings: {
    maxFileSizeMb: number;
    retentionHours: number;
    defaultPaper: PaperSize;
    defaultColor: ColorMode;
    defaultOrientation: Orientation;
    defaultSides: Sides;
    defaultScaling: Scaling;
    defaultPagesPerSheet: PagesPerSheet;
    defaultLanguage: 'en' | 'hi';
    pricing: Record<string, number>;
    address: string;
    phone: string;
  };
}

export interface CustomerSession {
  code: string;
  expiresAt: string;
  terminalCode: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export const PAPER_LABELS: Record<PaperSize, string> = {
  a4: 'A4',
  a3: 'A3',
  a5: 'A5',
  letter: 'Letter',
  legal: 'Legal',
  '4x6': '4x6 photo',
  custom: 'Custom',
};

export function money(n: number): string {
  return `₹${(n ?? 0).toLocaleString('en-IN')}`;
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
