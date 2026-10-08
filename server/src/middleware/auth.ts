import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User, type UserDoc } from '../models/User';
import { Shop, type ShopDoc } from '../models/Shop';
import { Session, type SessionDoc } from '../models/Session';
import { HttpError, asyncHandler } from '../utils/errors';

export interface AuthedRequest extends Request {
  user?: UserDoc;
  shop?: ShopDoc;
  session?: SessionDoc;
}

export interface JwtPayload {
  sub: string;
  shopId: string;
  role: string;
}

export function signToken(user: UserDoc): string {
  return jwt.sign({ sub: user._id.toString(), shopId: user.shopId.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Verify the admin JWT on a request; throws HttpError(401) when invalid. */
export async function authenticateAdmin(req: Request): Promise<{ user: UserDoc; shop: ShopDoc }> {
  const token = extractToken(req);
  if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
  } catch {
    throw new HttpError(401, 'UNAUTHORIZED', 'Session expired. Please log in again.');
  }
  const user = await User.findById(payload.sub);
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Account no longer exists');
  const shop = await Shop.findById(user.shopId);
  if (!shop) throw new HttpError(401, 'UNAUTHORIZED', 'Shop not found');
  return { user, shop };
}

/** Verify the customer session capability; throws HttpError(401) when invalid. */
export async function authenticateSession(req: Request): Promise<SessionDoc> {
  const code = req.headers['x-session-id'] || (req.body?.sessionId as string) || req.query.sessionId;
  if (!code) throw new HttpError(401, 'SESSION_REQUIRED', 'Print session required');
  const session = await Session.findOne({ code: String(code), status: 'active' });
  if (!session || session.expiresAt < new Date()) {
    if (session && session.expiresAt < new Date()) {
      session.status = 'expired';
      await session.save();
    }
    throw new HttpError(401, 'SESSION_EXPIRED', 'Your print session has expired. Please scan the shop QR code again.');
  }
  return session;
}

/** Requires a valid admin/staff JWT. */
export const requireAdmin = asyncHandler(async (req: AuthedRequest, _res, next) => {
  const { user, shop } = await authenticateAdmin(req);
  req.user = user;
  req.shop = shop;
  next();
});

/** Requires a valid, active session code (customer capability token). */
export const requireSession = asyncHandler(async (req: AuthedRequest, _res, next) => {
  req.session = await authenticateSession(req);
  next();
});

/** Requires the shop's print-agent token (x-agent-token header). */
export const requireAgent = asyncHandler(async (req: AuthedRequest, _res, next) => {
  const token = req.headers['x-agent-token'];
  if (!token || typeof token !== 'string') throw new HttpError(401, 'AGENT_UNAUTHORIZED', 'Agent token required');
  const shop = await Shop.findOne({ agentToken: token });
  if (!shop) throw new HttpError(401, 'AGENT_UNAUTHORIZED', 'Invalid agent token');
  req.shop = shop;
  next();
});
