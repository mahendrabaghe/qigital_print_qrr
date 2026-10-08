import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/User';
import { HttpError } from '../utils/errors';
import { asyncHandler } from '../utils/errors';
import { signToken, type AuthedRequest } from '../middleware/auth';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const login = asyncHandler(async (req: AuthedRequest, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  res.json({ token: signToken(user), user: user.toPublic() });
});

export const me = asyncHandler(async (req: AuthedRequest, res) => {
  res.json({ user: req.user!.toPublic(), shop: { id: req.shop!._id.toString(), name: req.shop!.name } });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const changePassword = asyncHandler(async (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = req.user!;
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'INVALID_PASSWORD', 'Current password is incorrect');
  }
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();
  res.json({ ok: true });
});
