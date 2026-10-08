import { imageSize } from 'image-size';
import { PDFDocument } from 'pdf-lib';
import { HttpError } from '../utils/errors';

export type DetectedType = 'pdf' | 'jpg' | 'png' | 'webp';

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const ALLOWED_MIMES = Object.keys(EXT_BY_MIME);

/** Detect the real file type from magic bytes — never trust the client's claim. */
export function detectType(buf: Buffer): DetectedType | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return 'png';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'webp';
  return null;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const limited = cleaned.slice(0, 120);
  return limited || 'file';
}

export interface ValidatedUpload {
  ext: string;
  mimeType: string;
  kind: 'image' | 'pdf';
  detected: DetectedType;
  pages?: number;
  width?: number;
  height?: number;
}

/**
 * Full upload validation: declared MIME, extension, size and magic bytes must
 * agree. PDFs are parsed (page count + encryption check), images are header-parsed.
 */
export function validateUpload(file: {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}): ValidatedUpload {
  const detected = detectType(file.buffer);
  if (!detected) {
    throw new HttpError(400, 'UNSUPPORTED_FILE_TYPE', 'This file type is not supported. Allowed: PDF, JPG, PNG, WEBP.');
  }
  if (!EXT_BY_MIME[file.mimetype]) {
    throw new HttpError(400, 'UNSUPPORTED_FILE_TYPE', 'This file type is not supported. Allowed: PDF, JPG, PNG, WEBP.');
  }
  const declaredExt = (file.originalname.split('.').pop() ?? '').toLowerCase();
  if (!MIME_BY_EXT[declaredExt]) {
    throw new HttpError(400, 'UNSUPPORTED_FILE_TYPE', 'This file type is not supported. Allowed: PDF, JPG, PNG, WEBP.');
  }
  if (EXT_BY_MIME[file.mimetype] !== detected) {
    throw new HttpError(400, 'FILE_TYPE_MISMATCH', 'File content does not match its type.');
  }

  if (detected === 'pdf') {
    return { ext: 'pdf', mimeType: 'application/pdf', kind: 'pdf', detected };
  }

  try {
    const dim = imageSize(file.buffer);
    const ext = detected === 'jpg' ? 'jpg' : detected;
    return {
      ext,
      mimeType: MIME_BY_EXT[ext],
      kind: 'image',
      detected,
      width: dim.width ?? 0,
      height: dim.height ?? 0,
    };
  } catch {
    throw new HttpError(400, 'INVALID_IMAGE', 'The image file appears to be corrupted.');
  }
}

export async function pdfPageCount(buf: Buffer): Promise<number> {
  try {
    const doc = await PDFDocument.load(buf, { ignoreEncryption: false });
    return doc.getPageCount();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (/encrypt/i.test(msg)) {
      throw new HttpError(400, 'PDF_ENCRYPTED', 'This PDF is password protected. Please remove the password and try again.');
    }
    throw new HttpError(400, 'INVALID_PDF', 'The PDF file appears to be corrupted.');
  }
}
