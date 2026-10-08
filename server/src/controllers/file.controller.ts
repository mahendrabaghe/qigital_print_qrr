import crypto from 'crypto';
import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { File, type FileDoc } from '../models/File';
import { Session, type SessionDoc } from '../models/Session';
import { Shop, type ShopDoc } from '../models/Shop';
import { HttpError, asyncHandler } from '../utils/errors';
import { storage } from '../services/storage.service';
import { pdfPageCount, sanitizeFilename, validateUpload } from '../services/fileValidation.service';
import { emitToSession, emitToShop } from '../sockets/emit';
import { authenticateAdmin, authenticateSession, type AuthedRequest } from '../middleware/auth';

interface UploadContext {
  session: SessionDoc;
  shop: ShopDoc;
  maxBytes: number;
}

/**
 * Resolve the upload context before multer runs (size limit depends on shop settings).
 * Customers authenticate with their session code; admins with a JWT (admin edits
 * target the session of the file being replaced).
 */
async function prepareUpload(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    let session: SessionDoc | null = null;
    let shop: ShopDoc | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      ({ shop } = await authenticateAdmin(req));
    } else {
      session = await authenticateSession(req);
    }

    const replaceFileId = (req.body?.replaceFileId as string) || undefined;

    if (!session) {
      if (replaceFileId && /^[a-f\d]{24}$/i.test(replaceFileId)) {
        const target = await File.findById(replaceFileId);
        if (!target || target.shopId.toString() !== shop!._id.toString()) {
          throw new HttpError(404, 'FILE_NOT_FOUND', 'File not found');
        }
        session = await Session.findById(target.sessionId);
      } else {
        const sid = req.body?.sessionId as string | undefined;
        if (sid) session = await Session.findOne({ code: String(sid) });
      }
      if (!session) throw new HttpError(400, 'SESSION_REQUIRED', 'A valid sessionId or replaceFileId is required');
      shop = (await Shop.findById(session.shopId)) as ShopDoc;
    } else {
      shop = (await Shop.findById(session.shopId)) as ShopDoc;
    }

    const maxBytes = Math.min(shop.settings.maxFileSizeMb, env.maxFileSizeMb) * 1024 * 1024;

    (req as Request & { uploadContext?: UploadContext }).uploadContext = { session, shop, maxBytes };

    multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: maxBytes, files: 1 },
      fileFilter: (_req, file, cb) => {
        const ok = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
        if (!ok) {
          cb(new HttpError(400, 'UNSUPPORTED_FILE_TYPE', 'This file type is not supported. Allowed: PDF, JPG, PNG, WEBP.'));
          return;
        }
        cb(null, true);
      },
    }).single('file')(req, res, next);
  } catch (err) {
    next(err);
  }
}

function broadcastFile(shopId: string, session: SessionDoc, doc: FileDoc, edited: boolean): void {
  const payload = { file: doc.toPublic(), sessionCode: session.code, edited };
  emitToShop(shopId, 'file:uploaded', payload);
  emitToSession(session.code, 'file:uploaded', payload);
}

export const uploadFile = [
  prepareUpload,
  asyncHandler(async (req: AuthedRequest, res) => {
    const ctx = (req as Request & { uploadContext?: UploadContext }).uploadContext!;
    const { session, shop } = ctx;
    const file = req.file;
    if (!file) throw new HttpError(400, 'NO_FILE', 'No file received');

    const validated = validateUpload(file);
    let pages = 1;
    if (validated.kind === 'pdf') {
      pages = await pdfPageCount(file.buffer);
    }

    const name = sanitizeFilename(file.originalname);
    const storageKey = `${shop._id}/${session._id}/${crypto.randomUUID()}.${validated.ext}`;
    await storage.put(storageKey, file.buffer);

    // Editing flow: replace the content of an existing file record (same id).
    const replaceFileId = (req.body?.replaceFileId as string) || undefined;
    if (replaceFileId && /^[a-f\d]{24}$/i.test(replaceFileId)) {
      const target = await File.findOne({ _id: replaceFileId, sessionId: session._id, status: 'active' });
      if (target) {
        await storage.delete(target.storageKey).catch(() => undefined);
        target.originalName = `${name.replace(/\.[^.]+$/, '')}.${validated.ext}`;
        target.ext = validated.ext;
        target.mimeType = validated.mimeType;
        target.kind = validated.kind;
        target.size = file.size;
        target.pages = pages;
        target.width = validated.width ?? 0;
        target.height = validated.height ?? 0;
        target.storageKey = storageKey;
        target.editedFrom = target.editedFrom ?? target._id;
        await target.save();
        broadcastFile(shop._id.toString(), session, target, true);
        return res.json({ file: target.toPublic() });
      }
    }

    const expiresAt = new Date(Date.now() + shop.settings.retentionHours * 60 * 60 * 1000);
    const doc = await File.create({
      shopId: shop._id,
      sessionId: session._id,
      terminalCode: session.terminalCode,
      originalName: name,
      ext: validated.ext,
      mimeType: validated.mimeType,
      kind: validated.kind,
      size: file.size,
      pages,
      width: validated.width ?? 0,
      height: validated.height ?? 0,
      storageKey,
      expiresAt,
    });

    broadcastFile(shop._id.toString(), session, doc, false);
    res.status(201).json({ file: doc.toPublic() });
  }),
];

/** Can this request access the file? Admin JWT, owning session, or print agent. */
async function canAccessFile(req: AuthedRequest, doc: FileDoc): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { user } = await authenticateAdmin(req);
      return user.shopId.toString() === doc.shopId.toString();
    } catch {
      return false;
    }
  }
  const agentToken = req.headers['x-agent-token'];
  if (typeof agentToken === 'string' && agentToken) {
    const shop = await Shop.findOne({ agentToken });
    return !!shop && shop._id.toString() === doc.shopId.toString();
  }
  const sessionCode = req.headers['x-session-id'] || req.query.sessionId;
  if (typeof sessionCode === 'string' && sessionCode) {
    const session = await Session.findById(doc.sessionId);
    return !!session && session.code === sessionCode.toUpperCase();
  }
  return false;
}

export const getFileMeta = asyncHandler(async (req: AuthedRequest, res) => {
  const doc = await File.findById(req.params.id);
  if (!doc || doc.status === 'deleted') throw new HttpError(404, 'FILE_NOT_FOUND', 'File not found');
  if (!(await canAccessFile(req, doc))) throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this file');
  res.json({ file: doc.toPublic() });
});

export const getFileContent = asyncHandler(async (req: AuthedRequest, res) => {
  const doc = await File.findById(req.params.id);
  if (!doc || doc.status === 'deleted') throw new HttpError(404, 'FILE_NOT_FOUND', 'File not found');
  if (!(await canAccessFile(req, doc))) throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this file');

  const download = req.query.download === '1';
  const safeName = doc.originalName.replace(/["\\\r\n]/g, '_');
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Length', doc.size);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${safeName}"`);
  storage.getStream(doc.storageKey).pipe(res);
});

export const patchFile = asyncHandler(async (req: AuthedRequest, res) => {
  const schema = z.object({ savedByAdmin: z.boolean() });
  const { savedByAdmin } = schema.parse(req.body);
  const doc = await File.findOne({ _id: req.params.id, shopId: req.shop!._id });
  if (!doc) throw new HttpError(404, 'FILE_NOT_FOUND', 'File not found');
  doc.savedByAdmin = savedByAdmin;
  // Saved files are kept forever; unsaved files follow the retention window again.
  doc.expiresAt = savedByAdmin ? null : new Date(Date.now() + req.shop!.settings.retentionHours * 60 * 60 * 1000);
  await doc.save();
  res.json({ file: doc.toPublic() });
});

export const deleteFile = asyncHandler(async (req: AuthedRequest, res) => {
  const doc = await File.findById(req.params.id);
  if (!doc) throw new HttpError(404, 'FILE_NOT_FOUND', 'File not found');
  const sessionCode = req.headers['x-session-id'];
  let isOwnerSession = false;
  if (typeof sessionCode === 'string' && sessionCode) {
    const session = await Session.findById(doc.sessionId);
    isOwnerSession = session?.code === sessionCode.toUpperCase();
  }
  const isAdmin = !!req.user && req.user.shopId.toString() === doc.shopId.toString();
  if (!isOwnerSession && !isAdmin) throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this file');
  await storage.delete(doc.storageKey).catch(() => undefined);
  doc.status = 'deleted';
  await doc.save();
  res.json({ ok: true });
});
