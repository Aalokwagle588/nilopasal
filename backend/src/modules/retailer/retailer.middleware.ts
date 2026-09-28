import { RecordStatus, RetailerMembershipRole, RetailerSubscriptionStatus, RetailerVerificationStatus } from '@prisma/client';
import type { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error.js';
import { getRetailerContext, isSubscriptionUsable } from './retailer.service.js';

export const requireRetailerMembership: RequestHandler = async (req, _res, next) => {
  if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue'));
  const context = await getRetailerContext(req.auth.userId);
  if (!context.membership || !context.business) {
    return next(new AppError(403, 'NO_RETAILER_MEMBERSHIP', 'Create or join a retailer business to continue'));
  }
  if (context.membership.status !== RecordStatus.ACTIVE) {
    return next(new AppError(403, 'RETAILER_MEMBERSHIP_INACTIVE', 'Your retailer access is inactive'));
  }
  if (context.business.status !== RecordStatus.ACTIVE || context.business.verificationStatus === RetailerVerificationStatus.SUSPENDED) {
    return next(new AppError(403, 'RETAILER_SUSPENDED', 'Your retailer business has been suspended. Please contact Nilopasal support.'));
  }

  req.retailerAccess = {
    retailerBusinessId: context.business.id,
    membershipId: context.membership.id,
    role: context.membership.role,
  };
  return next();
};

export const requireRetailerRole = (...roles: RetailerMembershipRole[]): RequestHandler => (req, _res, next) => {
  if (!req.retailerAccess) return next(new AppError(401, 'RETAILER_CONTEXT_REQUIRED', 'Retailer context is required'));
  if (!roles.includes(req.retailerAccess.role)) {
    return next(new AppError(403, 'RETAILER_FORBIDDEN', 'You do not have permission for this retailer action'));
  }
  return next();
};

export const requireVerifiedRetailer: RequestHandler = async (req, _res, next) => {
  if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue'));
  const context = await getRetailerContext(req.auth.userId);
  if (!context.business) {
    return next(new AppError(403, 'NO_RETAILER_MEMBERSHIP', 'Retailer business not found'));
  }
  if (context.business.verificationStatus === RetailerVerificationStatus.SUSPENDED) {
    return next(new AppError(403, 'RETAILER_SUSPENDED', 'Your retailer business has been suspended'));
  }
  if (context.business.verificationStatus === RetailerVerificationStatus.REJECTED) {
    return next(new AppError(403, 'RETAILER_VERIFICATION_REJECTED', 'Retailer business verification was rejected. Please contact support.'));
  }
  if (context.business.verificationStatus !== RetailerVerificationStatus.VERIFIED) {
    return next(new AppError(403, 'RETAILER_VERIFICATION_REQUIRED', 'Retailer verification is required to access ERP tools'));
  }
  return next();
};

export const requireActiveSubscription: RequestHandler = async (req, _res, next) => {
  if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue'));
  const context = await getRetailerContext(req.auth.userId);
  const subscription = context.business?.activeSubscription;
  if (!subscription || !isSubscriptionUsable(subscription.status as RetailerSubscriptionStatus, subscription.expiresAt, subscription.trialEndsAt)) {
    return next(new AppError(402, 'RETAILER_SUBSCRIPTION_REQUIRED', 'An active retailer subscription is required to unlock ERP tools'));
  }
  return next();
};
