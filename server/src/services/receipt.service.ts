import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PrintRequestDoc } from '../models/PrintRequest';
import { Shop } from '../models/Shop';
import { PAPER_LABELS } from '../utils/paper';

const INR = (n: number) => `Rs. ${n.toFixed(2)}`;

export async function generateReceiptPdf(request: PrintRequestDoc): Promise<Uint8Array> {
  const shop = await Shop.findById(request.shopId);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([420, 595]); // A6-ish portrait
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const black = rgb(0.1, 0.1, 0.12);
  const gray = rgb(0.45, 0.47, 0.5);
  let y = 545;

  const center = (text: string, f = font, size = 10) => {
    page.drawText(text, { x: (420 - f.widthOfTextAtSize(text, size)) / 2, y, size, font: f, color: black });
  };

  center(shop?.name ?? 'Print Shop', bold, 16);
  y -= 16;
  if (shop?.settings.address) {
    center(shop.settings.address, font, 8);
    y -= 11;
  }
  if (shop?.settings.phone) {
    center(`Phone: ${shop.settings.phone}`, font, 8);
    y -= 11;
  }
  y -= 4;
  page.drawLine({ start: { x: 30, y }, end: { x: 390, y }, thickness: 1, color: black });
  y -= 20;

  center('PRINT RECEIPT', bold, 11);
  y -= 22;

  const row = (label: string, value: string) => {
    page.drawText(label, { x: 30, y, size: 9, font, color: gray });
    const v = value.length > 44 ? `${value.slice(0, 43)}…` : value;
    page.drawText(v, { x: 420 - 30 - font.widthOfTextAtSize(v, 9), y, size: 9, font: bold, color: black });
    y -= 15;
  };

  row('Request ID', request.code);
  row('Date', new Date(request.completedAt ?? request.createdAt).toLocaleString('en-IN'));

  y -= 6;
  page.drawText('Items', { x: 30, y, size: 9, font: bold, color: black });
  y -= 15;
  for (const f of request.files) {
    const name = f.name.length > 40 ? `${f.name.slice(0, 39)}…` : f.name;
    page.drawText(`- ${name}`, { x: 34, y, size: 9, font, color: black });
    const meta = f.kind === 'pdf' ? `${f.pages} page(s)` : 'photo';
    page.drawText(meta, { x: 390 - font.widthOfTextAtSize(meta, 9), y, size: 9, font, color: gray });
    y -= 14;
  }

  y -= 8;
  const s = request.settings;
  const row2 = (label: string, value: string) => {
    page.drawText(label, { x: 30, y, size: 9, font, color: gray });
    page.drawText(value, { x: 150, y, size: 9, font: bold, color: black });
    y -= 14;
  };
  row2('Paper', `${PAPER_LABELS[s.paper] ?? s.paper}${s.pagesPerSheet > 1 ? ` (${s.pagesPerSheet}/sheet)` : ''}`);
  row2('Color', s.color === 'bw' ? 'Black & White' : 'Color');
  row2('Copies', String(s.copies));
  row2('Sides', s.sides === 'double' ? 'Double-sided' : 'Single-sided');
  row2('Total sheets', String(request.estSheets * s.copies));

  y -= 8;
  page.drawLine({ start: { x: 30, y }, end: { x: 390, y }, thickness: 0.5, color: gray });
  y -= 22;
  const total = `TOTAL:  ${INR(request.finalPrice ?? request.estPrice)}`;
  page.drawText(total, { x: 420 - 30 - bold.widthOfTextAtSize(total, 12), y, size: 12, font: bold, color: black });
  y -= 30;
  center('Pay at counter - Thank you!', font, 8);
  y -= 12;
  center(`Receipt for ${request.code}`, font, 7);

  return pdf.save();
}
