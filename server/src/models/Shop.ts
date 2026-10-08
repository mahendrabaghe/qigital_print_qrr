import mongoose, { Schema, type Model, type InferSchemaType, type Document } from 'mongoose';
import { DEFAULT_PRICING } from '../utils/pricing';

const shopSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Token used by the local print-agent to authenticate. */
    agentToken: { type: String, required: true, index: true },
    settings: {
      type: {
        address: { type: String, default: '' },
        phone: { type: String, default: '' },
        logoUrl: { type: String, default: '' },
        defaultPaper: { type: String, default: 'a4' },
        defaultColor: { type: String, default: 'bw' },
        defaultOrientation: { type: String, default: 'portrait' },
        defaultSides: { type: String, default: 'single' },
        defaultScaling: { type: String, default: 'fit' },
        defaultPagesPerSheet: { type: Number, default: 1 },
        defaultPrinterId: { type: Schema.Types.ObjectId, ref: 'Printer', default: null },
        defaultLanguage: { type: String, default: 'en' },
        retentionHours: { type: Number, default: 24 },
        maxFileSizeMb: { type: Number, default: 25 },
        pricing: { type: Object, default: () => ({ ...DEFAULT_PRICING }) },
      },
      default: () => ({}),
    },
  },
  { timestamps: true, minimize: false }
);

export type ShopSettings = NonNullable<InferSchemaType<typeof shopSchema>['settings']>;
export type ShopDoc = InferSchemaType<typeof shopSchema> & { settings: ShopSettings } & Document;

export const Shop = (mongoose.models.Shop || mongoose.model('Shop', shopSchema)) as Model<ShopDoc>;
