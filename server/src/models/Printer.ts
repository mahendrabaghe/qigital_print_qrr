import mongoose, { Schema, type Model, type InferSchemaType, type Document } from 'mongoose';

const printerSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['usb', 'network', 'virtual'], default: 'usb' },
    status: { type: String, enum: ['online', 'offline', 'unknown'], default: 'unknown' },
    isDefault: { type: Boolean, default: false },
    source: { type: String, enum: ['agent', 'manual', 'demo'], default: 'manual' },
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

printerSchema.index({ shopId: 1, name: 1 }, { unique: true });

export type PrinterDoc = InferSchemaType<typeof printerSchema> & Document;

export const Printer =
  (mongoose.models.Printer || mongoose.model('Printer', printerSchema)) as Model<PrinterDoc>;
