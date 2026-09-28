import type { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, message = '', meta?: Record<string, unknown>) {
  return res.json({ success: true, data, message, ...(meta ? { meta } : {}) });
}
