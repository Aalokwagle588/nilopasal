import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'nilopasal-api', environment: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]',
      '*.password', '*.passwordHash', '*.token', '*.resetToken', '*.providerResponse',
    ],
    censor: '[REDACTED]',
  },
});
