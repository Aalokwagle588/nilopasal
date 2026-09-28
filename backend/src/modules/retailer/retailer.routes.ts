import { RetailerMembershipRole } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, optionalAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { sendSuccess } from '../../utils/api-response.js';
import { setSessionCookie } from '../auth/auth.cookies.js';
import {
  requireActiveSubscription,
  requireRetailerMembership,
  requireRetailerRole,
  requireVerifiedRetailer,
} from './retailer.middleware.js';
import {
  retailerRegisterSchema,
  startTrialSchema,
  updateRetailerBusinessSchema,
} from './retailer.schemas.js';
import {
  getRetailerBusinessProfile,
  getRetailerContext,
  getRetailerDashboardSummary,
  getRetailerPlans,
  registerRetailer,
  startRetailerTrial,
  updateRetailerBusiness,
} from './retailer.service.js';

import { retailerCatalogRouter } from './retailer-catalog.routes.js';
import { retailerPosRouter } from './retailer-pos.routes.js';
import { retailerKhataRouter } from './retailer-khata.routes.js';
import { retailerPurchasesRouter } from './retailer-purchases.routes.js';
import { retailerStaffRouter } from './retailer-staff.routes.js';
import { retailerReportsRouter } from './retailer-reports.routes.js';

export const retailerRouter = Router();

// Mount catalog, inventory, POS, Khata, Purchases, Staff, and Reports routes
retailerRouter.use(retailerCatalogRouter);
retailerRouter.use(retailerPosRouter);
retailerRouter.use('/customers', retailerKhataRouter);
retailerRouter.use(retailerPurchasesRouter);
retailerRouter.use(retailerStaffRouter);
retailerRouter.use(retailerReportsRouter);

retailerRouter.post('/register', optionalAuth, asyncHandler(async (req, res) => {
  const input = retailerRegisterSchema.parse(req.body);
  const result = await registerRetailer(input, req.auth?.userId, req.get('user-agent'), req.ip);

  if (result.token && result.expiresAt) {
    setSessionCookie(res, result.token, result.expiresAt);
  }

  return sendSuccess(res.status(201), {
    user: result.user,
    retailer: result.retailer,
  }, 'Retailer business registered');
}));

retailerRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const context = await getRetailerContext(req.auth!.userId);
  return sendSuccess(res, context);
}));

retailerRouter.get('/business', requireAuth, requireRetailerMembership, asyncHandler(async (req, res) => {
  const business = await getRetailerBusinessProfile(req.retailerAccess!.retailerBusinessId);
  return sendSuccess(res, business);
}));

retailerRouter.patch('/business', requireAuth, requireRetailerMembership, requireRetailerRole(RetailerMembershipRole.OWNER, RetailerMembershipRole.ADMIN), asyncHandler(async (req, res) => {
  const input = updateRetailerBusinessSchema.parse(req.body);
  const updated = await updateRetailerBusiness(req.retailerAccess!.retailerBusinessId, input);
  return sendSuccess(res, updated, 'Business details updated');
}));

retailerRouter.get('/subscription/plans', asyncHandler(async (_req, res) => {
  const plans = await getRetailerPlans();
  return sendSuccess(res, { plans });
}));

retailerRouter.get('/subscription/current', requireAuth, requireRetailerMembership, asyncHandler(async (req, res) => {
  const context = await getRetailerContext(req.auth!.userId);
  return sendSuccess(res, {
    subscriptionStatus: context.business?.subscriptionStatus,
    activeSubscription: context.business?.activeSubscription,
    verificationStatus: context.business?.verificationStatus,
    access: context.access,
  });
}));

retailerRouter.post('/subscription/start-trial', requireAuth, requireRetailerMembership, requireVerifiedRetailer, requireRetailerRole(RetailerMembershipRole.OWNER, RetailerMembershipRole.ADMIN), asyncHandler(async (req, res) => {
  const input = startTrialSchema.parse(req.body || {});
  const result = await startRetailerTrial(req.retailerAccess!.retailerBusinessId, input.planSlug);
  return sendSuccess(res, result, '14-day free trial started successfully');
}));

retailerRouter.get('/dashboard', requireAuth, requireRetailerMembership, requireVerifiedRetailer, requireActiveSubscription, asyncHandler(async (req, res) => {
  const data = await getRetailerDashboardSummary(req.retailerAccess!.retailerBusinessId);
  return sendSuccess(res, data);
}));
