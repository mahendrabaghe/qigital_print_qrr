import cron from 'node-cron';
import { Session } from '../models/Session';
import { File } from '../models/File';
import { PrintJob } from '../models/PrintJob';
import { storage } from './storage.service';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/** Expire sessions whose TTL has passed. */
export async function expireSessions(): Promise<number> {
  const res = await Session.updateMany(
    { status: 'active', expiresAt: { $lt: new Date() } },
    { $set: { status: 'expired' } }
  );
  return res.modifiedCount;
}

/** Delete storage objects + mark files deleted once their retention period ends. */
export async function purgeExpiredFiles(): Promise<number> {
  const expired = await File.find({
    status: 'active',
    savedByAdmin: false,
    expiresAt: { $type: 'date', $lt: new Date() },
  }).limit(500);

  let purged = 0;
  for (const file of expired) {
    try {
      await storage.delete(file.storageKey);
    } catch (err) {
      logger.warn(`storage delete failed for ${file.storageKey}:`, err);
    }
    file.status = 'deleted';
    await file.save();
    purged++;
  }
  return purged;
}

/** Remove print-ready job PDFs for jobs that finished more than 24h ago. */
export async function purgeOldJobFiles(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const jobs = await PrintJob.find({
    status: { $in: ['completed', 'failed', 'cancelled'] },
    storageKey: { $ne: '' },
    completedAt: { $lt: cutoff },
  })
    .select('storageKey')
    .limit(500);

  let purged = 0;
  for (const job of jobs) {
    try {
      await storage.delete(job.storageKey);
      job.storageKey = '';
      await job.save();
      purged++;
    } catch (err) {
      logger.warn(`job pdf delete failed for ${job.storageKey}:`, err);
    }
  }
  return purged;
}

export async function runCleanup(): Promise<void> {
  try {
    const sessions = await expireSessions();
    const files = await purgeExpiredFiles();
    const jobPdfs = await purgeOldJobFiles();
    if (sessions || files || jobPdfs) {
      logger.info(
        `cleanup: ${sessions} sessions expired, ${files} files purged, ${jobPdfs} job PDFs removed`
      );
    }
  } catch (err) {
    logger.error('cleanup run failed:', err);
  }
}

/** Schedule the retention cleanup (every 10 minutes). */
export function scheduleCleanup(): void {
  cron.schedule('*/10 * * * *', () => {
    void runCleanup();
  });
  // First run shortly after boot (give startup IO room).
  setTimeout(() => void runCleanup(), 15_000);
  logger.info(`retention cleanup scheduled (default retention: ${env.fileRetentionHours}h)`);
}
