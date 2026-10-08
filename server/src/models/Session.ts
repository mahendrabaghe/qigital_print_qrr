import mongoose, { Schema, type Model, type InferSchemaType, type Document } from 'mongoose';

/** A temporary customer print session created when a QR is scanned. */
const sessionSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    terminalCode: { type: String, required: true, index: true },
    status: { type: String, enum: ['active', 'expired'], default: 'active' },
    expiresAt: { type: Date, required: true },
    lastActivityAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export type SessionDoc = InferSchemaType<typeof sessionSchema> & Document;

export const Session =
  (mongoose.models.Session || mongoose.model('Session', sessionSchema)) as Model<SessionDoc>;
