import { z } from 'zod';
import { Shop } from '../models/Shop';
import { asyncHandler } from '../utils/errors';
import { genAgentToken } from '../utils/codes';
import type { AuthedRequest } from '../middleware/auth';

const settingsSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  settings: z
    .object({
      address: z.string().max(300).optional(),
      phone: z.string().max(30).optional(),
      logoUrl: z.string().max(500).optional(),
      defaultPaper: z.enum(['a4', 'a3', 'a5', 'letter', 'legal', '4x6', 'custom']).optional(),
      defaultColor: z.enum(['color', 'bw']).optional(),
      defaultOrientation: z.enum(['portrait', 'landscape']).optional(),
      defaultSides: z.enum(['single', 'double']).optional(),
      defaultScaling: z.enum(['actual', 'fit', 'fill']).optional(),
      defaultPagesPerSheet: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6), z.literal(9)]).optional(),
      defaultPrinterId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
      defaultLanguage: z.enum(['en', 'hi']).optional(),
      retentionHours: z.union([z.literal(1), z.literal(6), z.literal(12), z.literal(24), z.literal(168)]).optional(),
      maxFileSizeMb: z.number().int().min(1).max(200).optional(),
      pricing: z.record(z.string(), z.number().min(0)).optional(),
    })
    .optional(),
  rotateAgentToken: z.boolean().optional(),
});

export const getShop = asyncHandler(async (req: AuthedRequest, res) => {
  const shop = req.shop!;
  res.json({
    shop: {
      id: shop._id.toString(),
      name: shop.name,
      agentToken: shop.agentToken,
      settings: shop.settings,
      printMode: process.env.PRINT_MODE || 'demo',
    },
  });
});

export const updateShop = asyncHandler(async (req: AuthedRequest, res) => {
  const body = settingsSchema.parse(req.body);
  const shop = await Shop.findById(req.shop!._id);
  if (!shop) throw new Error('shop disappeared');

  if (body.name) shop.name = body.name;
  if (body.settings) {
    for (const [key, value] of Object.entries(body.settings)) {
      if (key === 'defaultPrinterId' && value === null) {
        (shop.settings as Record<string, unknown>).defaultPrinterId = null;
      } else if (value !== undefined) {
        (shop.settings as Record<string, unknown>)[key] = value;
      }
    }
  }
  if (body.rotateAgentToken) shop.agentToken = genAgentToken();
  await shop.save();
  res.json({ shop: { id: shop._id.toString(), name: shop.name, agentToken: shop.agentToken, settings: shop.settings } });
});
