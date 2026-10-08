import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { Shop } from '../models/Shop';
import { User } from '../models/User';
import { Printer } from '../models/Printer';
import { genAgentToken } from '../utils/codes';
import { logger } from '../utils/logger';

/**
 * Idempotent bootstrap: ensures exactly one shop exists (single-shop deployment;
 * every record carries shopId so multi-shop can be enabled later), the first
 * admin account, and a demo printer when running in demo mode.
 */
export async function seed(): Promise<void> {
  let shop = await Shop.findOne();
  if (!shop) {
    shop = await Shop.create({ name: env.shopName, agentToken: genAgentToken() });
    logger.info(`Seeded shop "${shop.name}"`);
  }

  const admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    await User.create({
      name: env.adminName,
      email: env.adminEmail,
      passwordHash: await bcrypt.hash(env.adminPassword, 12),
      role: 'admin',
      shopId: shop._id,
    });
    logger.info(`Seeded admin account ${env.adminEmail} (password from ADMIN_PASSWORD env)`);
  }

  if (env.printMode === 'demo') {
    const demo = await Printer.findOne({ shopId: shop._id, source: 'demo' });
    if (!demo) {
      await Printer.create({
        shopId: shop._id,
        name: 'Demo Virtual Printer',
        type: 'virtual',
        status: 'online',
        source: 'demo',
        isDefault: true,
      });
      logger.info('Seeded "Demo Virtual Printer" (PRINT_MODE=demo)');
    }
  }
}
