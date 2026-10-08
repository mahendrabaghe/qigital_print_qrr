import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export async function connectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  if (env.mongoUri === 'memory://') {
    if (env.isProd) {
      throw new Error('MONGODB_URI=memory:// is not allowed in production');
    }
    logger.warn('MONGODB_URI=memory:// — using in-memory MongoDB (data is lost on restart).');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri('printshop'));
    logger.info(`In-memory MongoDB started (${mem.getUri('printshop')})`);
    return;
  }

  await mongoose.connect(env.mongoUri, { autoIndex: true });
  logger.info(`MongoDB connected → ${mongoose.connection.name}`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
