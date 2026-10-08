import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase } from './db/connect';
import { seed } from './services/seed.service';
import { scheduleCleanup } from './services/cleanup.service';
import { initSockets } from './sockets';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  await connectDatabase();
  await seed();

  const app = createApp();
  const server = http.createServer(app);
  initSockets(server);
  scheduleCleanup();

  server.listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port}`);
    logger.info(
      `PRINT_MODE=${env.printMode}` +
        (env.printMode === 'demo' ? ` (jobs are simulated after ${env.demoDelayMs}ms)` : ' (requires local print agent)')
    );
    if (env.mongoUri.startsWith('memory://')) {
      logger.info('Using in-memory MongoDB (data is lost on restart) — set MONGODB_URI for persistence');
    }
  });
}

main().catch((err) => {
  logger.error('Fatal startup error:', err);
  process.exit(1);
});
