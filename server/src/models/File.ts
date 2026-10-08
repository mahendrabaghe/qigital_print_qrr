import mongoose, { Schema, type Model, type InferSchemaType, type Document } from 'mongoose';

const fileSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    terminalCode: { type: String, default: '' },
    originalName: { type: String, required: true },
    ext: { type: String, required: true },
    mimeType: { type: String, required: true },
    kind: { type: String, enum: ['image', 'pdf'], required: true },
    size: { type: Number, required: true },
    pages: { type: Number, default: 1 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    storageKey: { type: String, required: true },
    savedByAdmin: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'deleted', 'replaced'], default: 'active' },
    editedFrom: { type: Schema.Types.ObjectId, ref: 'File', default: null },
    // null when the admin explicitly saved the file (kept forever)
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

fileSchema.methods.toPublic = function () {
  return {
    id: this._id.toString(),
    sessionId: this.sessionId.toString(),
    originalName: this.originalName,
    ext: this.ext,
    mimeType: this.mimeType,
    kind: this.kind,
    size: this.size,
    pages: this.pages,
    width: this.width,
    height: this.height,
    savedByAdmin: this.savedByAdmin,
    status: this.status,
    edited: Boolean(this.editedFrom),
    createdAt: this.createdAt,
    expiresAt: this.expiresAt,
  };
};

export type FileDoc = InferSchemaType<typeof fileSchema> &
  Document & {
    toPublic: () => Record<string, unknown>;
  };

export const File = (mongoose.models.File || mongoose.model('File', fileSchema)) as Model<FileDoc>;
