import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendSuccess } from '../../utils/api-response.js';
import { clearSessionCookie, setSessionCookie } from './auth.cookies.js';
import { getSessionUser, login, revokeSession, signup } from './auth.service.js';
import { loginSchema, signupSchema } from './auth.schemas.js';
import { getRetailerContext } from '../retailer/retailer.service.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many auth attempts. Please try again shortly.' } },
});

authRouter.post('/signup', authLimiter, asyncHandler(async (req, res) => {
  const input = signupSchema.parse(req.body);
  const result = await signup(input, req.get('user-agent'), req.ip);
  setSessionCookie(res, result.token, result.expiresAt);
  return sendSuccess(res.status(201), { user: result.user }, 'Account created');
}));

authRouter.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await login(input, req.get('user-agent'), req.ip);
  setSessionCookie(res, result.token, result.expiresAt);
  return sendSuccess(res, { user: result.user }, 'Signed in');
}));

authRouter.get('/me', asyncHandler(async (req, res) => {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
  const session = await getSessionUser(token);
  if (!session) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue');
  const retailer = await getRetailerContext(session.user.id);
  return sendSuccess(res, { user: session.user, retailer });
}));

authRouter.post('/logout', requireAuth, asyncHandler(async (req, res) => {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
  await revokeSession(token);
  clearSessionCookie(res);
  return sendSuccess(res, null, 'Signed out');
}));
