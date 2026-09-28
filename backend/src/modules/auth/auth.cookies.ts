import type { Response } from 'express';
import type { CookieOptions } from 'express';
import { env } from '../../config/env.js';

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.COOKIE_SECURE,
  path: '/',
};

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(env.SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions,
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(env.SESSION_COOKIE_NAME, baseCookieOptions);
}
