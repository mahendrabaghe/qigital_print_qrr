import mongoose, { Schema, type Model, type InferSchemaType, type Document } from 'mongoose';
import type { PrintSettings } from '../types/print';

export type RequestStatus =
  | 'waiting'
  | 'processing'
  | 'printing'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export interface RequestFileEntry {
  fileId: mongoose.Types.ObjectId;
  name: string;
  kind: 'image' | 'pdf';
  size: number;
  pages: number; // selected logical pages
  pageRange?: string;
}

const printRequestSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    sessionCode: { type: String, required: true },
    accessToken: { type: String, required: true },
    files: { type: [Object], default: [] },
    settings: { type: Object, required: true },
    estPages: { type: Number, default: 0 },
    estSheets: { type: Number, default: 0 },
    estPrice: { type: Number, default: 0 },
    finalPrice: { type: Number, default: null },
    status: { type: String, enum: ['waiting', 'processing', 'printing', 'completed', 'rejected', 'cancelled'], default: 'waiting', index: true },
    rejectReason: { type: String, default: '' },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

printRequestSchema.index({ createdAt: -1 });
printRequestSchema.index({ code: 'text', 'files.name': 'text' });

printRequestSchema.methods.toPublic = function (opts?: { includeToken?: boolean }) {
  const obj: Record<string, unknown> = {
    id: this._id.toString(),
    code: this.code,
    sessionId: this.sessionId.toString(),
    sessionCode: this.sessionCode,
    files: this.files,
    settings: this.settings as PrintSettings,
    estPages: this.estPages,
    estSheets: this.estSheets,
    estPrice: this.estPrice,
    finalPrice: this.finalPrice,
    status: this.status,
    rejectReason: this.rejectReason,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    completedAt: this.completedAt,
  };
  if (opts?.includeToken) obj.accessToken = this.accessToken;
  return obj;
};

export type PrintRequestDoc = Omit<InferSchemaType<typeof printRequestSchema>, 'settings' | 'files'> &
  Document & {
    files: RequestFileEntry[];
    settings: PrintSettings;
    toPublic: (opts?: { includeToken?: boolean }) => Record<string, unknown>;
  };

export const PrintRequest =
  (mongoose.models.PrintRequest ||
    mongoose.model('PrintRequest', printRequestSchema)) as Model<PrintRequestDoc>;
