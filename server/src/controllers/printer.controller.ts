import { z } from 'zod';
import { Printer } from '../models/Printer';
import { Shop } from '../models/Shop';
import { HttpError, asyncHandler } from '../utils/errors';
import { emitToShop } from '../sockets/emit';
import type { AuthedRequest } from '../middleware/auth';

export const listPrinters = asyncHandler(async (req: AuthedRequest, res) => {
  const printers = await Printer.find({ shopId: req.shop!._id }).sort({ isDefault: -1, name: 1 });
  res.json({
    printers: printers.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      type: p.type,
      status: p.status,
      isDefault: p.isDefault,
      source: p.source,
      lastSeenAt: p.lastSeenAt,
    })),
  });
});

export const createPrinter = asyncHandler(async (req: AuthedRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(120),
    type: z.enum(['usb', 'network', 'virtual']).default('usb'),
    isDefault: z.boolean().optional(),
  });
  const body = schema.parse(req.body);
  const exists = await Printer.findOne({ shopId: req.shop!._id, name: body.name });
  if (exists) throw new HttpError(409, 'PRINTER_EXISTS', 'A printer with this name already exists');

  const printer = await Printer.create({
    shopId: req.shop!._id,
    name: body.name,
    type: body.type,
    status: 'unknown',
    source: 'manual',
    isDefault: body.isDefault ?? false,
  });
  if (body.isDefault) await makeDefault(req, printer);
  res.status(201).json({ printer: { id: printer._id.toString(), name: printer.name, type: printer.type, status: printer.status, isDefault: printer.isDefault, source: printer.source } });
});

async function makeDefault(req: AuthedRequest, printer: { _id: unknown; shopId: unknown }): Promise<void> {
  await Printer.updateMany({ shopId: req.shop!._id }, { $set: { isDefault: false } });
  await Printer.updateOne({ _id: printer._id }, { $set: { isDefault: true } });
  const shop = await Shop.findById(req.shop!._id);
  if (shop) {
    shop.settings.defaultPrinterId = printer._id as import('mongoose').Types.ObjectId;
    await shop.save();
  }
}

export const updatePrinter = asyncHandler(async (req: AuthedRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(120).optional(),
    type: z.enum(['usb', 'network', 'virtual']).optional(),
    isDefault: z.boolean().optional(),
  });
  const body = schema.parse(req.body);
  const printer = await Printer.findOne({ _id: req.params.id, shopId: req.shop!._id });
  if (!printer) throw new HttpError(404, 'NOT_FOUND', 'Printer not found');
  if (body.name) printer.name = body.name;
  if (body.type) printer.type = body.type;
  if (body.isDefault === true) await makeDefault(req, printer);
  else if (body.isDefault === false) printer.isDefault = false;
  await printer.save();
  res.json({ printer: { id: printer._id.toString(), name: printer.name, type: printer.type, status: printer.status, isDefault: printer.isDefault, source: printer.source } });
});

export const deletePrinter = asyncHandler(async (req: AuthedRequest, res) => {
  const printer = await Printer.findOneAndDelete({ _id: req.params.id, shopId: req.shop!._id });
  if (!printer) throw new HttpError(404, 'NOT_FOUND', 'Printer not found');
  if (printer.isDefault) {
    const shop = await Shop.findById(req.shop!._id);
    if (shop && shop.settings.defaultPrinterId?.toString() === printer._id.toString()) {
      shop.settings.defaultPrinterId = null;
      await shop.save();
    }
  }
  res.json({ ok: true });
});
