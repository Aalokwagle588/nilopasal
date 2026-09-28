import { RecordStatus, RetailerSubscriptionStatus, RetailerVerificationStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../errors/app-error.js';
import { serializeRetailerBusiness, type RetailerBusinessRecord } from '../retailer/retailer.service.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function listRetailers(filter?: {
  status?: RecordStatus;
  verificationStatus?: RetailerVerificationStatus;
  search?: string;
}) {
  const where: Record<string, unknown> = {};

  if (filter?.status) where.status = filter.status;
  if (filter?.verificationStatus) where.verificationStatus = filter.verificationStatus;
  if (filter?.search) {
    where.OR = [
      { businessName: { contains: filter.search, mode: 'insensitive' } },
      { phone: { contains: filter.search } },
      { email: { contains: filter.search, mode: 'insensitive' } },
      { panNumber: { contains: filter.search } },
    ];
  }

  const businesses = await prisma.retailerBusiness.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      memberships: { select: { id: true, userId: true, role: true, status: true } },
      subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  return businesses.map((b) => ({
    id: b.id,
    businessName: b.businessName,
    legalName: b.legalName,
    slug: b.slug,
    phone: b.phone,
    email: b.email,
    panNumber: b.panNumber,
    vatNumber: b.vatNumber,
    address: `${b.addressLine}, ${b.municipality}, ${b.district}, ${b.province}`,
    status: b.status,
    verificationStatus: b.verificationStatus,
    verificationSubmittedAt: b.verificationSubmittedAt,
    verifiedAt: b.verifiedAt,
    subscriptionStatus: b.subscriptionStatus,
    createdAt: b.createdAt,
    owner: b.owner,
    memberCount: b.memberships.length,
    activeSubscription: b.subscriptions[0] ? {
      id: b.subscriptions[0].id,
      planName: b.subscriptions[0].plan.name,
      status: b.subscriptions[0].status,
      expiresAt: b.subscriptions[0].expiresAt,
      trialEndsAt: b.subscriptions[0].trialEndsAt,
    } : null,
  }));
}

export async function getRetailerById(id: string) {
  const business = await prisma.retailerBusiness.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      verifiedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      memberships: {
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
      subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
    },
  });

  if (!business) throw new AppError(404, 'RETAILER_NOT_FOUND', 'Retailer business not found');

  return {
    ...serializeRetailerBusiness(business as unknown as RetailerBusinessRecord),
    owner: business.owner,
    verifiedByUser: business.verifiedByUser,
    members: business.memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      status: m.status,
      user: m.user,
    })),
    subscriptionHistory: business.subscriptions.map((s) => ({
      id: s.id,
      planName: s.plan.name,
      status: s.status,
      startsAt: s.startsAt,
      expiresAt: s.expiresAt,
      trialStartsAt: s.trialStartsAt,
      trialEndsAt: s.trialEndsAt,
      createdAt: s.createdAt,
    })),
  };
}

export async function verifyRetailer(id: string, adminUserId: string) {
  return prisma.$transaction(async (tx) => {
    const business = await tx.retailerBusiness.findUnique({ where: { id } });
    if (!business) throw new AppError(404, 'RETAILER_NOT_FOUND', 'Retailer business not found');

    const updated = await tx.retailerBusiness.update({
      where: { id },
      data: {
        verificationStatus: RetailerVerificationStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedBy: adminUserId,
      },
    });

    await tx.retailerAuditLog.create({
      data: {
        retailerBusinessId: id,
        actorId: adminUserId,
        action: 'RETAILER_VERIFIED',
        entityType: 'RetailerBusiness',
        entityId: id,
        before: { verificationStatus: business.verificationStatus },
        after: { verificationStatus: RetailerVerificationStatus.VERIFIED, verifiedBy: adminUserId },
      },
    });

    return updated;
  });
}

export async function rejectRetailer(id: string, adminUserId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const business = await tx.retailerBusiness.findUnique({ where: { id } });
    if (!business) throw new AppError(404, 'RETAILER_NOT_FOUND', 'Retailer business not found');

    const updated = await tx.retailerBusiness.update({
      where: { id },
      data: {
        verificationStatus: RetailerVerificationStatus.REJECTED,
      },
    });

    await tx.retailerAuditLog.create({
      data: {
        retailerBusinessId: id,
        actorId: adminUserId,
        action: 'RETAILER_REJECTED',
        entityType: 'RetailerBusiness',
        entityId: id,
        before: { verificationStatus: business.verificationStatus },
        after: { verificationStatus: RetailerVerificationStatus.REJECTED, reason },
      },
    });

    return updated;
  });
}

export async function suspendRetailer(id: string, adminUserId: string) {
  return prisma.$transaction(async (tx) => {
    const business = await tx.retailerBusiness.findUnique({ where: { id } });
    if (!business) throw new AppError(404, 'RETAILER_NOT_FOUND', 'Retailer business not found');

    const updated = await tx.retailerBusiness.update({
      where: { id },
      data: {
        verificationStatus: RetailerVerificationStatus.SUSPENDED,
        status: RecordStatus.INACTIVE,
      },
    });

    await tx.retailerAuditLog.create({
      data: {
        retailerBusinessId: id,
        actorId: adminUserId,
        action: 'RETAILER_SUSPENDED',
        entityType: 'RetailerBusiness',
        entityId: id,
        before: { verificationStatus: business.verificationStatus, status: business.status },
        after: { verificationStatus: RetailerVerificationStatus.SUSPENDED, status: RecordStatus.INACTIVE },
      },
    });

    return updated;
  });
}

export async function assignRetailerSubscription(
  id: string,
  adminUserId: string,
  planSlug: string,
  status: RetailerSubscriptionStatus,
  durationDays: number,
) {
  return prisma.$transaction(async (tx) => {
    const business = await tx.retailerBusiness.findUnique({ where: { id } });
    if (!business) throw new AppError(404, 'RETAILER_NOT_FOUND', 'Retailer business not found');

    const plan = await tx.subscriptionPlan.findUnique({ where: { slug: planSlug } });
    if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', `Subscription plan '${planSlug}' not found`);

    const now = new Date();
    const isTrial = status === RetailerSubscriptionStatus.TRIAL;
    const expiresAt = new Date(now.getTime() + durationDays * MS_PER_DAY);

    const subscription = await tx.retailerSubscription.create({
      data: {
        retailerBusinessId: id,
        planId: plan.id,
        status,
        startsAt: isTrial ? null : now,
        expiresAt: isTrial ? null : expiresAt,
        trialStartsAt: isTrial ? now : null,
        trialEndsAt: isTrial ? expiresAt : null,
      },
      include: { plan: true },
    });

    await tx.retailerBusiness.update({
      where: { id },
      data: { subscriptionStatus: status },
    });

    await tx.retailerAuditLog.create({
      data: {
        retailerBusinessId: id,
        actorId: adminUserId,
        action: 'SUBSCRIPTION_ASSIGNED_BY_ADMIN',
        entityType: 'RetailerSubscription',
        entityId: subscription.id,
        before: { subscriptionStatus: business.subscriptionStatus },
        after: { planSlug, status, expiresAt },
      },
    });

    return subscription;
  });
}
