import { z } from 'zod';
import { env } from '../config/env';
import { Terminal, type TerminalDoc } from '../models/Terminal';
import { HttpError, asyncHandler } from '../utils/errors';
import { genTerminalCode } from '../utils/codes';
import { qrDataUrl } from '../services/qr.service';
import type { AuthedRequest } from '../middleware/auth';

const generateSchema = z.object({
  label: z.string().min(1).max(60),
});

function uploadUrl(code: string): string {
  return `${env.publicBaseUrl}/upload/${code}`;
}

async function terminalView(t: TerminalDoc) {
  const url = uploadUrl(t.code);
  return {
    id: t._id.toString(),
    code: t.code,
    label: t.label,
    active: t.active,
    lastUsedAt: t.lastUsedAt,
    createdAt: t.createdAt,
    uploadUrl: url,
    qrDataUrl: await qrDataUrl(url),
    expiresAt: new Date(t.createdAt.getTime() + env.qrTtlDays * 24 * 60 * 60 * 1000),
  };
}

export const generateQr = asyncHandler(async (req: AuthedRequest, res) => {
  const { label } = generateSchema.parse(req.body);
  const terminal = await Terminal.create({
    code: genTerminalCode(),
    shopId: req.shop!._id,
    label,
  });
  res.status(201).json({ terminal: await terminalView(terminal) });
});

export const listQr = asyncHandler(async (req: AuthedRequest, res) => {
  const terminals = await Terminal.find({ shopId: req.shop!._id }).sort({ createdAt: 1 });
  res.json({ terminals: await Promise.all(terminals.map(terminalView)) });
});

export const updateQr = asyncHandler(async (req: AuthedRequest, res) => {
  const schema = z.object({
    label: z.string().min(1).max(60).optional(),
    active: z.boolean().optional(),
  });
  const { label, active } = schema.parse(req.body);
  const terminal = await Terminal.findOne({ _id: req.params.id, shopId: req.shop!._id });
  if (!terminal) throw new HttpError(404, 'NOT_FOUND', 'QR terminal not found');
  if (label !== undefined) terminal.label = label;
  if (active !== undefined) terminal.active = active;
  await terminal.save();
  res.json({ terminal: await terminalView(terminal) });
});

export const regenerateQr = asyncHandler(async (req: AuthedRequest, res) => {
  const terminal = await Terminal.findOne({ _id: req.params.id, shopId: req.shop!._id });
  if (!terminal) throw new HttpError(404, 'NOT_FOUND', 'QR terminal not found');
  terminal.code = genTerminalCode();
  terminal.active = true;
  await terminal.save();
  res.json({ terminal: await terminalView(terminal) });
});

export const deleteQr = asyncHandler(async (req: AuthedRequest, res) => {
  const terminal = await Terminal.findOneAndDelete({ _id: req.params.id, shopId: req.shop!._id });
  if (!terminal) throw new HttpError(404, 'NOT_FOUND', 'QR terminal not found');
  res.json({ ok: true });
});
