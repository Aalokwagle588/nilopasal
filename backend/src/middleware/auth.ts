import type { RequestHandler } from 'express';
import { RoleCode } from '@prisma/client';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { getSessionUser } from '../modules/auth/auth.service.js';

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
  const session = await getSessionUser(token);
  if (session) req.auth = { userId: session.user.id, sessionId: session.sessionId, roles: session.roles };
  next();
};

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
  const session = await getSessionUser(token);
  if (!session) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue'));
  req.auth = { userId: session.user.id, sessionId: session.sessionId, roles: session.roles };
  next();
};

export const requireRole = (...roles: RoleCode[]): RequestHandler => (req, _res, next) => {
  if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue'));
  if (!roles.some((role) => req.auth?.roles.includes(role))) return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to access this resource'));
  return next();
};
