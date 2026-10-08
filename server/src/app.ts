import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env';
import { api } from './routes';
import { generalLimiter } from './middleware/rateLimiters';
import { notFoundHandler, errorHandler } from './middleware/error';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  if (env.isProd) app.set('trust proxy', 1);

  app.use(
    helmet({
      // File previews are served cross-origin to the Vite dev server / frontend domain.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
      exposedHeaders: ['Content-Disposition'],
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', generalLimiter, api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
