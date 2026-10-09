import 'dotenv/config';
import { resolvePublicBaseUrl } from './publicBaseUrl';

function num(v: string | undefined, def: number): number {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : def;
}

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const env = {
  isProd,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 4000),
  mongoUri: process.env.MONGODB_URI || 'memory://',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@printshop.local').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
  adminName: process.env.ADMIN_NAME || 'Shop Owner',
  shopName: process.env.SHOP_NAME || 'My Digital Print Shop',
  publicBaseUrl: resolvePublicBaseUrl(process.env.PUBLIC_BASE_URL, isProd),
  maxFileSizeMb: num(process.env.MAX_FILE_SIZE_MB, 25),
  fileRetentionHours: num(process.env.FILE_RETENTION_HOURS, 24),
  storageDir: process.env.FILE_STORAGE_DIR || './storage',
  sessionTtlHours: num(process.env.SESSION_TTL_HOURS, 2),
  qrTtlDays: num(process.env.QR_TTL_DAYS, 30),
  printMode: (process.env.PRINT_MODE || 'demo') as 'demo' | 'real',
  demoDelayMs: num(process.env.DEMO_DELAY_MS, 2500),
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

if (isProd && env.adminPassword === 'ChangeMe123!') {
  console.warn('[config] WARNING: default ADMIN_PASSWORD is being used in production. Change it now.');
}
if (isProd && env.corsOrigins.length === 0) {
  console.warn('[config] WARNING: CORS_ORIGINS is empty in production (all origins allowed). Set it to your frontend URL.');
}
