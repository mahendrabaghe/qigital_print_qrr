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

  try {
    await mongoose.connect(env.mongoUri, { autoIndex: true });
  } catch (error) {
    if (error instanceof Error && error.name === 'MongooseServerSelectionError') {
      logger.error(
        'Could not reach MongoDB. For MongoDB Atlas, allow this Render service’s outbound IP ranges in Atlas Network Access, verify the cluster is running, and check that MONGODB_URI uses the correct database user and URL-encoded password.'
      );
    }
    throw error;
  }
  logger.info(`MongoDB connected → ${mongoose.connection.name}`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
