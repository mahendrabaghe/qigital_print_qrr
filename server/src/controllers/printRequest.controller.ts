import { z } from 'zod';
import { PrintRequest, type PrintRequestDoc } from '../models/PrintRequest';
import { File } from '../models/File';
import { Shop } from '../models/Shop';
import { HttpError, asyncHandler } from '../utils/errors';
import { calcEstimate } from '../utils/pricing';
import { parsePageRange, PageRangeError } from '../utils/pageRange';
import { genAccessToken } from '../utils/codes';
import { emitToSession, emitToShop } from '../sockets/emit';
import { generateReceiptPdf } from '../services/receipt.service';
import { authenticateAdmin, requireSession, type AuthedRequest } from '../middleware/auth';
import type { PrintSettings } from '../types/print';

const settingsSchema = z.object({
  paper: z.enum(['a4', 'a3', 'a5', 'letter', 'legal', '4x6', 'custom']),
  color: z.enum(['color', 'bw']),
  copies: z.number().int().min(1).max(99),
  orientation: z.enum(['portrait', 'landscape']),
  sides: z.enum(['single', 'double']),
  scaling: z.enum(['actual', 'fit', 'fill']),
  pagesPerSheet: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6), z.literal(9)]),
});

const createSchema = z.object({
  files: z
    .array(
      z.object({
        fileId: z.string().regex(/^[a-f\d]{24}$/i),
        pageRange: z.string().max(200).optional(),
      })
    )
    .min(1, 'At least one file is required'),
  settings: settingsSchema,
});

function genRequestCode(): string {
  return `PRT-${Math.floor(10000 + Math.random() * 90000)}`;
}

async function createUniqueCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = genRequestCode();
    if (!(await PrintRequest.exists({ code }))) return code;
  }
  return `PRT-${Date.now().toString().slice(-8)}`;
}

async function broadcastRequest(request: PrintRequestDoc, event: string): Promise<void> {
  const payload = { request: request.toPublic() };
  emitToShop(request.shopId.toString(), event, payload);
  emitToSession(request.sessionCode, event, payload);
}

export const createPrintRequest = [
  requireSession,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = createSchema.parse(req.body);
    const session = req.session!;

    const fileDocs = await File.find({
      _id: { $in: body.files.map((f) => f.fileId) },
      sessionId: session._id,
      status: 'active',
    });
    if (fileDocs.length !== body.files.length) {
      throw new HttpError(400, 'FILE_INVALID', 'One or more files are no longer available. Please re-upload.');
    }

    const entries = [];
    for (const input of body.files) {
      const doc = fileDocs.find((d) => d._id.toString() === input.fileId)!;
      let pages = 1;
      let pageRange: string | undefined;
      if (doc.kind === 'pdf') {
        if (input.pageRange && input.pageRange.trim()) {
          try {
            const selected = parsePageRange(input.pageRange, doc.pages);
            pageRange = [...selected].join(',');
            pages = selected.length;
          } catch (err) {
            if (err instanceof PageRangeError) {
              throw new HttpError(400, 'PAGE_RANGE_INVALID', `For "${doc.originalName}": ${err.message}`);
            }
            throw err;
          }
        } else {
          pages = doc.pages;
        }
      }
      entries.push({
        fileId: doc._id,
        name: doc.originalName,
        kind: doc.kind,
        size: doc.size,
        pages,
        pageRange,
      });
    }

    const settings = body.settings as PrintSettings;
    const shop = await Shop.findById(session.shopId);
    const pricing = (shop?.settings as unknown as { pricing?: Record<string, number> })?.pricing ?? {};
    const est = calcEstimate(entries, settings, pricing);

    const code = await createUniqueCode();
    const accessToken = genAccessToken();

    const request = await PrintRequest.create({
      code,
      shopId: session.shopId,
      sessionId: session._id,
      sessionCode: session.code,
      accessToken,
      files: entries,
      settings,
      estPages: est.pages,
      estSheets: est.sheets,
      estPrice: est.price,
      status: 'waiting',
    });

    broadcastRequest(request, 'request:created');
    res.status(201).json({ request: request.toPublic({ includeToken: true }) });
  }),
];

const listQuerySchema = z.object({
  status: z.string().optional(),
  search: z.string().max(100).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listPrintRequests = asyncHandler(async (req: AuthedRequest, res) => {
  const q = listQuerySchema.parse(req.query);
  const filter: Record<string, unknown> = { shopId: req.shop!._id };

  if (q.status && q.status !== 'all') filter.status = q.status;
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) (filter.createdAt as Record<string, unknown>).$gte = new Date(`${q.from}T00:00:00`);
    if (q.to) (filter.createdAt as Record<string, unknown>).$lte = new Date(`${q.to}T23:59:59.999`);
  }
  if (q.search) {
    const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ code: rx }, { 'files.name': rx }];
  }

  const total = await PrintRequest.countDocuments(filter);
  const requests = await PrintRequest.find(filter)
    .sort({ createdAt: -1 })
    .skip((q.page - 1) * q.limit)
    .limit(q.limit);

  res.json({ requests: requests.map((r) => r.toPublic()), total, page: q.page, limit: q.limit });
});

/** Admin JWT or the request's access token (customer status page). */
async function authorizeRequestAccess(req: AuthedRequest): Promise<PrintRequestDoc | null> {
  const id = req.params.id;
  if (!/^[a-f\d]{24}$/i.test(id)) return null;
  const doc = await PrintRequest.findById(id);
  if (!doc) return null;
  const token = req.query.token || req.headers['x-request-token'];
  if (typeof token === 'string' && token === doc.accessToken) return doc;
  try {
    const { user } = await authenticateAdmin(req);
    if (user.shopId.toString() === doc.shopId.toString()) return doc;
  } catch {
    /* fall through */
  }
  return null;
}

export const getPrintRequest = asyncHandler(async (req: AuthedRequest, res) => {
  const doc = await authorizeRequestAccess(req);
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Print request not found');
  res.json({ request: doc.toPublic() });
});

const statusSchema = z.object({
  status: z.enum(['processing', 'printing', 'completed', 'rejected', 'cancelled']),
  rejectReason: z.string().max(300).optional(),
  finalPrice: z.number().min(0).nullable().optional(),
});

export const updatePrintRequestStatus = asyncHandler(async (req: AuthedRequest, res) => {
  const body = statusSchema.parse(req.body);
  const doc = await PrintRequest.findOne({ _id: req.params.id, shopId: req.shop!._id });
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Print request not found');
  if (doc.status === 'completed' || doc.status === 'rejected' || doc.status === 'cancelled') {
    throw new HttpError(400, 'STATUS_LOCKED', `Request is already ${doc.status}`);
  }
  doc.status = body.status;
  if (body.status === 'rejected') doc.rejectReason = body.rejectReason || '';
  if (body.status === 'completed') {
    doc.completedAt = new Date();
    doc.finalPrice = body.finalPrice ?? doc.estPrice;
  }
  await doc.save();
  await broadcastRequest(doc, 'request:statusChanged');
  res.json({ request: doc.toPublic() });
});

export const getReceipt = asyncHandler(async (req: AuthedRequest, res) => {
  const doc = await authorizeRequestAccess(req);
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Print request not found');
  if (doc.status !== 'completed') {
    throw new HttpError(400, 'NOT_COMPLETED', 'A receipt is available once the request is completed');
  }
  const pdf = await generateReceiptPdf(doc);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${doc.code}.pdf"`);
  res.send(pdf);
});
