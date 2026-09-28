import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  return value.toLowerCase() === 'true';
}, z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().min(1).default('nilopasal_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SECURE: booleanFromString.default(false),
  CORS_ORIGINS: z.string().default('http://127.0.0.1:4173,http://localhost:4173'),
  TRUST_PROXY: z.string().default('loopback'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  throw new Error(`Invalid environment configuration: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ')}`);
}

if (result.data.NODE_ENV === 'production') {
  if (!result.data.COOKIE_SECURE) throw new Error('COOKIE_SECURE must be true in production');
  if (!result.data.SESSION_COOKIE_NAME.startsWith('__Host-')) throw new Error('Production SESSION_COOKIE_NAME must use the __Host- prefix');
}

export const env = {
  ...result.data,
  corsOrigins: result.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
};
