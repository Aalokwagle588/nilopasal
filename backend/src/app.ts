import crypto from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { retailerRouter } from './modules/retailer/retailer.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { sendSuccess } from './utils/api-response.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', env.TRUST_PROXY);
  app.use((req, _res, next) => {
    req.requestId = req.get('x-request-id') || crypto.randomUUID();
    next();
  });
  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    credentials: true,
  }));

  app.get('/health', (_req, res) => sendSuccess(res, { status: 'ok' }));
  app.use('/api/auth', authRouter);
  app.use('/api/retailer', retailerRouter);
  app.use('/api/admin', adminRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
