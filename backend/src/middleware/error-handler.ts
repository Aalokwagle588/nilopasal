import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/app-error.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} was not found`));

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  void next;
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: unknown;

  if (error instanceof AppError) ({ statusCode, code, message, details } = error);
  else if (error instanceof ZodError) {
    statusCode = 400; code = 'VALIDATION_ERROR'; message = 'The request contains invalid data'; details = error.flatten();
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') { statusCode = 409; code = 'CONFLICT'; message = 'A record with this value already exists'; }
    if (error.code === 'P2025') { statusCode = 404; code = 'NOT_FOUND'; message = 'The requested record was not found'; }
  }

  if (statusCode >= 500) logger.error({ err: error, requestId: req.requestId, path: req.path }, 'Unhandled request error');
  res.status(statusCode).json({ success: false, error: { code, message, ...(details ? { details } : {}), ...(env.NODE_ENV !== 'production' && statusCode >= 500 ? { requestId: req.requestId } : {}) } });
};
