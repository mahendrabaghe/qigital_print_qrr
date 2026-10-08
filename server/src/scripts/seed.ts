import { connectDatabase } from '../db/connect';
import { seed } from '../services/seed.service';
import { disconnect } from 'mongoose';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/** npm run seed — idempotent: creates shop + admin (+ demo printer) if missing. */
async function main(): Promise<void> {
  await connectDatabase();
  await seed();
  await disconnect();
  logger.info('Seed complete.');
  logger.info(`Admin login: ${env.adminEmail} (password: ADMIN_PASSWORD from your .env — never stored in code)`);
}

main().catch((err) => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
