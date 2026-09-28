import { RecordStatus, RetailerSubscriptionStatus, RetailerVerificationStatus, RoleCode } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { sendSuccess } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  adminAssignSubscriptionSchema,
  adminRejectRetailerSchema,
} from '../retailer/retailer.schemas.js';
import {
  assignRetailerSubscription,
  getRetailerById,
  listRetailers,
  rejectRetailer,
  suspendRetailer,
  verifyRetailer,
} from './admin.service.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(RoleCode.ADMIN));

adminRouter.get('/retailers', asyncHandler(async (req, res) => {
  const filter: {
    status?: RecordStatus;
    verificationStatus?: RetailerVerificationStatus;
    search?: string;
  } = {};

  if (typeof req.query.status === 'string' && req.query.status in RecordStatus) {
    filter.status = req.query.status as RecordStatus;
  }
  if (typeof req.query.verificationStatus === 'string' && req.query.verificationStatus in RetailerVerificationStatus) {
    filter.verificationStatus = req.query.verificationStatus as RetailerVerificationStatus;
  }
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    filter.search = req.query.search.trim();
  }

  const retailers = await listRetailers(filter);
  return sendSuccess(res, { retailers });
}));

adminRouter.get('/retailers/:id', asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const retailer = await getRetailerById(id);
  return sendSuccess(res, retailer);
}));

adminRouter.post('/retailers/:id/verify', asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const updated = await verifyRetailer(id, req.auth!.userId);
  return sendSuccess(res, updated, 'Retailer business verified successfully');
}));

adminRouter.post('/retailers/:id/reject', asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const input = adminRejectRetailerSchema.parse(req.body);
  const updated = await rejectRetailer(id, req.auth!.userId, input.reason);
  return sendSuccess(res, updated, 'Retailer business verification rejected');
}));

adminRouter.post('/retailers/:id/suspend', asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const updated = await suspendRetailer(id, req.auth!.userId);
  return sendSuccess(res, updated, 'Retailer business suspended');
}));

adminRouter.post('/retailers/:id/subscription', asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  const input = adminAssignSubscriptionSchema.parse(req.body);
  const subscription = await assignRetailerSubscription(
    id,
    req.auth!.userId,
    input.planSlug,
    input.status as RetailerSubscriptionStatus,
    input.durationDays,
  );
  return sendSuccess(res, subscription, 'Subscription assigned to retailer successfully');
}));
