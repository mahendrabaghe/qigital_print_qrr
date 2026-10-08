import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { detectType, sanitizeFilename, validateUpload, pdfPageCount } from '../services/fileValidation.service';

/** Canonical 1x1 transparent PNG. */
const PNG_1PX = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
    '0000000d49444154789c6260010000000500010d0a2db4' +
    '0000000049454e44ae426082',
  'hex'
);

/** Minimal JPEG: SOI, JFIF APP0, SOF0 (1x1), EOI. */
const JPG_1PX = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000' +
    'ffc0000b0800010001011100' +
    'ffd9',
  'hex'
);

const WEBP_1PX = Buffer.from('52494646240000005745425056503820', 'hex');

describe('detectType (magic bytes)', () => {
  it('recognises png, jpg, pdf, webp', () => {
    expect(detectType(PNG_1PX)).toBe('png');
    expect(detectType(JPG_1PX)).toBe('jpg');
    expect(detectType(Buffer.from('%PDF-1.7\n...'))).toBe('pdf');
    expect(detectType(WEBP_1PX)).toBe('webp');
  });

  it('rejects executables and arbitrary bytes', () => {
    expect(detectType(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(detectType(Buffer.from('hello world'))).toBeNull();
    expect(detectType(Buffer.alloc(0))).toBeNull();
  });
});

describe('sanitizeFilename', () => {
  it('strips path traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Windows\\system32\\evil.png')).toBe('evil.png');
  });

  it('removes control and forbidden characters', () => {
    expect(sanitizeFilename('a<b>:c|"d?e*.png')).toBe('abcde.png');
  });

  it('caps length and never returns empty', () => {
    expect(sanitizeFilename('x'.repeat(300)).length).toBe(120);
    expect(sanitizeFilename('///')).toBe('file');
  });
});

describe('validateUpload', () => {
  const pngUpload = {
    originalname: 'photo.png',
    mimetype: 'image/png',
    size: PNG_1PX.length,
    buffer: PNG_1PX,
  };

  it('accepts a real PNG and reports dimensions', () => {
    const v = validateUpload(pngUpload);
    expect(v).toMatchObject({ ext: 'png', mimeType: 'image/png', kind: 'image', width: 1, height: 1 });
  });

  it('accepts a real JPEG', () => {
    const v = validateUpload({
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
      size: JPG_1PX.length,
      buffer: JPG_1PX,
    });
    expect(v.kind).toBe('image');
    expect(v.width).toBe(1);
  });

  it('rejects content that does not match the declared type', () => {
    expect(() =>
      validateUpload({ ...pngUpload, originalname: 'evil.png', mimetype: 'image/png', buffer: Buffer.from('not a png') })
    ).toThrowError(/not supported|does not match/i);
  });

  it('rejects executable uploads disguised as images', () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0)]);
    expect(() =>
      validateUpload({ originalname: 'virus.png', mimetype: 'image/png', size: exe.length, buffer: exe })
    ).toThrowError(/not supported/i);
  });

  it('rejects disallowed MIME types outright', () => {
    expect(() =>
      validateUpload({ originalname: 'a.exe', mimetype: 'application/x-msdownload', size: 5, buffer: PNG_1PX })
    ).toThrowError(/not supported/i);
  });
});

describe('pdfPageCount', () => {
  it('counts pages of a generated PDF', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) doc.addPage([595, 842]);
    const bytes = Buffer.from(await doc.save());
    expect(await pdfPageCount(bytes)).toBe(3);
  });

  it('rejects garbage PDFs', async () => {
    await expect(pdfPageCount(Buffer.from('%PDF-1.4 broken'))).rejects.toThrowError(/corrupted/i);
  });
});
