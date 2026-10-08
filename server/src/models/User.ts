import mongoose, { Schema, type Model, type InferSchemaType, type Document } from 'mongoose';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'staff'], default: 'admin' },
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function () {
  return { id: this._id.toString(), name: this.name, email: this.email, role: this.role };
};

export type UserDoc = InferSchemaType<typeof userSchema> &
  Document & {
    toPublic: () => { id: string; name: string; email: string; role: string };
  };

export const User = (mongoose.models.User || mongoose.model('User', userSchema)) as Model<UserDoc>;
