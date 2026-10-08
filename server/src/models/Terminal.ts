import mongoose, { Schema, type Model, type InferSchemaType, type Document } from 'mongoose';

/** A physical QR code / counter terminal. The QR encodes <frontend>/upload/<code>. */
const terminalSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    label: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type TerminalDoc = InferSchemaType<typeof terminalSchema> & Document;

export const Terminal =
  (mongoose.models.Terminal || mongoose.model('Terminal', terminalSchema)) as Model<TerminalDoc>;
