import { env } from '../config/env';
import { Terminal } from '../models/Terminal';
import { Session } from '../models/Session';
import { File } from '../models/File';
import { Shop } from '../models/Shop';
import { HttpError, asyncHandler } from '../utils/errors';
import { genSessionCode } from '../utils/codes';
import { emitToShop } from '../sockets/emit';
import type { AuthedRequest } from '../middleware/auth';

/** Public subset of shop settings exposed to the customer upload page. */
export async function publicShopInfo(shopId: string) {
  const shop = (await Shop.findById(shopId))!;
  return {
    name: shop.name,
    settings: {
      maxFileSizeMb: Math.min(shop.settings.maxFileSizeMb, env.maxFileSizeMb),
      retentionHours: shop.settings.retentionHours,
      defaultPaper: shop.settings.defaultPaper,
      defaultColor: shop.settings.defaultColor,
      defaultOrientation: shop.settings.defaultOrientation,
      defaultSides: shop.settings.defaultSides,
      defaultScaling: shop.settings.defaultScaling,
      defaultPagesPerSheet: shop.settings.defaultPagesPerSheet,
      defaultLanguage: shop.settings.defaultLanguage,
      pricing: shop.settings.pricing,
      address: shop.settings.address,
      phone: shop.settings.phone,
    },
  };
}

/** Customer scanned the QR: create a fresh session for this visit. */
export const scanTerminal = asyncHandler(async (req: AuthedRequest, res) => {
  const terminalCode = String(req.params.terminalCode || '').toUpperCase();
  const terminal = await Terminal.findOne({ code: terminalCode });
  if (!terminal || !terminal.active) {
    throw new HttpError(404, 'QR_INVALID', 'This QR code is not valid. Please ask the shopkeeper to show the current QR code.');
  }
  const session = await Session.create({
    code: genSessionCode(),
    shopId: terminal.shopId,
    terminalCode: terminal.code,
    expiresAt: new Date(Date.now() + env.sessionTtlHours * 60 * 60 * 1000),
  });
  terminal.lastUsedAt = new Date();
  await terminal.save();

  emitToShop(terminal.shopId.toString(), 'session:created', {
    sessionCode: session.code,
    terminalCode: terminal.code,
    terminalLabel: terminal.label,
    createdAt: session.createdAt,
  });

  res.status(201).json({
    session: { code: session.code, expiresAt: session.expiresAt, terminalCode: terminal.code },
    shop: await publicShopInfo(terminal.shopId.toString()),
  });
});

/** Validate an existing session (page refresh / reconnect) and return its files. */
export const getSession = asyncHandler(async (req: AuthedRequest, res) => {
  const code = String(req.params.code || '').toUpperCase();
  let session = await Session.findOne({ code });
  if (!session || session.status === 'expired' || session.expiresAt < new Date()) {
    throw new HttpError(404, 'SESSION_EXPIRED', 'Your print session has expired. Please scan the shop QR code again.');
  }
  // Sliding expiry while the customer is active.
  session.lastActivityAt = new Date();
  session.expiresAt = new Date(Date.now() + env.sessionTtlHours * 60 * 60 * 1000);
  await session.save();

  const files = await File.find({ sessionId: session._id, status: 'active' }).sort({ createdAt: 1 });
  res.json({
    session: { code: session.code, expiresAt: session.expiresAt, terminalCode: session.terminalCode },
    shop: await publicShopInfo(session.shopId.toString()),
    files: files.map((f) => f.toPublic()),
  });
});
