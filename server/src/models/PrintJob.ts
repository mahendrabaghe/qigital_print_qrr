import mongoose, { Schema, type Model, type InferSchemaType, type Document } from 'mongoose';
import type { PrintSettings } from '../types/print';

export type JobStatus = 'queued' | 'assigned' | 'printing' | 'completed' | 'failed' | 'cancelled' | 'paused';

const printJobSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    requestId: { type: Schema.Types.ObjectId, ref: 'PrintRequest', required: true, index: true },
    requestCode: { type: String, required: true },
    fileId: { type: Schema.Types.ObjectId, ref: 'File', required: true },
    fileName: { type: String, required: true },
    printerId: { type: Schema.Types.ObjectId, ref: 'Printer', default: null },
    printerName: { type: String, required: true },
    settings: { type: Object, required: true },
    pages: { type: Number, default: 0 }, // logical pages selected
    sheets: { type: Number, default: 0 }, // sheets per copy (pages of the print-ready PDF)
    storageKey: { type: String, default: '' }, // print-ready PDF
    sumatraArgs: { type: String, default: '' },
    status: { type: String, enum: ['queued', 'assigned', 'printing', 'completed', 'failed', 'cancelled', 'paused'], default: 'queued', index: true },
    position: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    demo: { type: Boolean, default: false },
    error: { type: String, default: '' },
    assignedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

printJobSchema.index({ shopId: 1, status: 1, position: 1 });

printJobSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    code: this.code,
    requestId: this.requestId.toString(),
    requestCode: this.requestCode,
    fileId: this.fileId.toString(),
    fileName: this.fileName,
    printerId: this.printerId?.toString() ?? null,
    printerName: this.printerName,
    settings: this.settings as PrintSettings,
    pages: this.pages,
    sheets: this.sheets,
    status: this.status,
    position: this.position,
    attempts: this.attempts,
    demo: this.demo,
    error: this.error,
    createdAt: this.createdAt,
    startedAt: this.startedAt,
    completedAt: this.completedAt,
  };
};

export type PrintJobDoc = Omit<InferSchemaType<typeof printJobSchema>, 'settings'> &
  Document & {
    settings: PrintSettings;
    toPublic: () => Record<string, unknown>;
  };

export const PrintJob =
  (mongoose.models.PrintJob || mongoose.model('PrintJob', printJobSchema)) as Model<PrintJobDoc>;
