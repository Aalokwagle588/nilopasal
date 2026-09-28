import { createHash, randomBytes } from 'node:crypto';
import {
  CartStatus,
  ProductStatus,
  RecordStatus,
  RetailerMembershipRole,
  RetailerSubscriptionStatus,
  RetailerVerificationStatus,
  RoleCode,
  UserStatus,
  Prisma,
} from '@prisma/client';
import argon2 from 'argon2';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { hashSessionToken, normalizeEmail, toPublicUser, type PublicUser } from '../auth/auth.service.js';
import type { RetailerRegisterInput, UpdateRetailerBusinessInput } from './retailer.schemas.js';

const SESSION_TOKEN_BYTES = 32;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const normalizePhone = (phone?: string) => {
  const value = phone?.replace(/[^\d+]/g, '').trim();
  return value || null;
};

const cleanOptional = (value?: string) => {
  const cleaned = value?.trim();
  return cleaned || null;
};

const slugify = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)+/g, '')
  .slice(0, 72) || 'retailer';

const businessCode = (businessName: string, ownerUserId: string) => {
  const digest = createHash('sha1').update(`${businessName}:${ownerUserId}:${Date.now()}`).digest('hex').slice(0, 8);
  return `${slugify(businessName)}-${digest}`;
};

async function ensureRole(tx: Prisma.TransactionClient, code: RoleCode) {
  return tx.role.upsert({
    where: { code },
    create: { code, name: code.toLowerCase().replaceAll('_', ' ') },
    update: {},
  });
}

async function createOwnerUser(tx: Prisma.TransactionClient, owner: NonNullable<RetailerRegisterInput['owner']>) {
  if (!owner.password) throw new AppError(400, 'PASSWORD_REQUIRED', 'Password is required when creating a new retailer owner account');
  const emailNormalized = normalizeEmail(owner.email);
  const phoneNormalized = normalizePhone(owner.phone);
  const existingUser = await tx.user.findFirst({
    where: { OR: [{ emailNormalized }, ...(phoneNormalized ? [{ phoneNormalized }] : [])] },
    select: { id: true },
  });
  if (existingUser) throw new AppError(409, 'ACCOUNT_EXISTS', 'An account with this email or phone already exists. Please sign in first, then create the retailer business.');

  const [customerRole, retailerRole] = await Promise.all([
    ensureRole(tx, RoleCode.CUSTOMER),
    ensureRole(tx, RoleCode.RETAILER),
  ]);

  return tx.user.create({
    data: {
      firstName: owner.firstName.trim(),
      lastName: owner.lastName.trim(),
      email: owner.email.trim(),
      emailNormalized,
      phone: phoneNormalized,
      phoneNormalized,
      passwordHash: await argon2.hash(owner.password),
      status: UserStatus.ACTIVE,
      roles: { create: [{ roleId: customerRole.id }, { roleId: retailerRole.id }] },
      wishlist: { create: {} },
      carts: { create: { status: CartStatus.ACTIVE } },
    },
    include: { roles: { include: { role: true } } },
  });
}

async function attachRetailerRole(tx: Prisma.TransactionClient, userId: string) {
  const retailerRole = await ensureRole(tx, RoleCode.RETAILER);
  await tx.userRole.upsert({
    where: { userId_roleId: { userId, roleId: retailerRole.id } },
    create: { userId, roleId: retailerRole.id },
    update: {},
  });
}

export function isSubscriptionUsable(status: RetailerSubscriptionStatus, expiresAt?: Date | null, trialEndsAt?: Date | null) {
  const now = new Date();
  if (status === RetailerSubscriptionStatus.ACTIVE) return !expiresAt || expiresAt > now;
  if (status === RetailerSubscriptionStatus.TRIAL) return !trialEndsAt || trialEndsAt > now;
  return false;
}

export type RetailerBusinessSummary = {
  id: string;
  businessName: string;
  legalName: string | null;
  slug: string;
  businessType: string;
  status: RecordStatus;
  phone: string;
  alternatePhone: string | null;
  email: string | null;
  panNumber: string | null;
  vatNumber: string | null;
  province: string;
  district: string;
  municipality: string;
  ward: string | null;
  addressLine: string;
  landmark: string | null;
  logo: string | null;
  coverImage: string | null;
  verificationStatus: RetailerVerificationStatus;
  verificationSubmittedAt: Date | null;
  verifiedAt: Date | null;
  subscriptionStatus: RetailerSubscriptionStatus;
  createdAt: Date;
  memberships: Array<{ id: string; userId: string; role: RetailerMembershipRole; status: RecordStatus }>;
  activeSubscription: {
    id: string;
    status: RetailerSubscriptionStatus;
    startsAt: Date | null;
    expiresAt: Date | null;
    trialStartsAt: Date | null;
    trialEndsAt: Date | null;
    plan: { id: string; name: string; slug: string; billingPeriod: string; price: string };
  } | null;
};

export type RetailerAccessState =
  | { allowed: false; reason: 'NO_RETAILER'; nextAction: 'REGISTER'; message: string }
  | { allowed: false; reason: 'SUSPENDED'; nextAction: 'CONTACT_SUPPORT'; message: string }
  | { allowed: false; reason: 'REJECTED'; nextAction: 'CONTACT_SUPPORT'; message: string }
  | { allowed: false; reason: 'VERIFICATION_REQUIRED'; nextAction: 'VERIFICATION'; message: string }
  | { allowed: false; reason: 'SUBSCRIPTION_REQUIRED'; nextAction: 'SUBSCRIPTION'; message: string }
  | { allowed: true; reason: 'READY'; nextAction: 'DASHBOARD'; message: string };

export type RetailerContext = {
  membership: {
    id: string;
    userId: string;
    retailerBusinessId: string;
    role: RetailerMembershipRole;
    status: RecordStatus;
    joinedAt: Date;
  } | null;
  business: RetailerBusinessSummary | null;
  access: RetailerAccessState;
};

export function canAccessRetailerErp(retailer: RetailerBusinessSummary | null) {
  if (!retailer) return false;
  return retailer.verificationStatus === RetailerVerificationStatus.VERIFIED
    && isSubscriptionUsable(retailer.subscriptionStatus, retailer.activeSubscription?.expiresAt, retailer.activeSubscription?.trialEndsAt);
}

export type RetailerBusinessRecord = {
  id: string;
  businessName: string;
  legalName: string | null;
  slug: string;
  businessType: string;
  status: RecordStatus;
  phone: string;
  alternatePhone: string | null;
  email: string | null;
  panNumber: string | null;
  vatNumber: string | null;
  province: string;
  district: string;
  municipality: string;
  ward: string | null;
  addressLine: string;
  landmark: string | null;
  logo: string | null;
  coverImage: string | null;
  verificationStatus: RetailerVerificationStatus;
  verificationSubmittedAt: Date | null;
  verifiedAt: Date | null;
  subscriptionStatus: RetailerSubscriptionStatus;
  createdAt: Date;
  subscriptions?: Array<{
    id: string;
    status: RetailerSubscriptionStatus;
    startsAt: Date | null;
    expiresAt: Date | null;
    trialStartsAt: Date | null;
    trialEndsAt: Date | null;
    plan: { id: string; name: string; slug: string; billingPeriod: string; price: Prisma.Decimal | number | string };
  }>;
  memberships?: Array<{ id: string; userId: string; role: RetailerMembershipRole; status: RecordStatus }>;
};

export function serializeRetailerBusiness(business: RetailerBusinessRecord): RetailerBusinessSummary {
  const activeSubscription = business.subscriptions?.find((sub) => isSubscriptionUsable(sub.status, sub.expiresAt, sub.trialEndsAt))
    ?? business.subscriptions?.[0]
    ?? null;

  return {
    id: business.id,
    businessName: business.businessName,
    legalName: business.legalName,
    slug: business.slug,
    businessType: business.businessType,
    status: business.status,
    phone: business.phone,
    alternatePhone: business.alternatePhone,
    email: business.email,
    panNumber: business.panNumber,
    vatNumber: business.vatNumber,
    province: business.province,
    district: business.district,
    municipality: business.municipality,
    ward: business.ward,
    addressLine: business.addressLine,
    landmark: business.landmark,
    logo: business.logo,
    coverImage: business.coverImage,
    verificationStatus: business.verificationStatus,
    verificationSubmittedAt: business.verificationSubmittedAt,
    verifiedAt: business.verifiedAt,
    subscriptionStatus: business.subscriptionStatus,
    createdAt: business.createdAt,
    memberships: business.memberships?.map((membership) => ({
      id: membership.id,
      userId: membership.userId,
      role: membership.role,
      status: membership.status,
    })) ?? [],
    activeSubscription: activeSubscription ? {
      id: activeSubscription.id,
      status: activeSubscription.status,
      startsAt: activeSubscription.startsAt,
      expiresAt: activeSubscription.expiresAt,
      trialStartsAt: activeSubscription.trialStartsAt,
      trialEndsAt: activeSubscription.trialEndsAt,
      plan: {
        id: activeSubscription.plan.id,
        name: activeSubscription.plan.name,
        slug: activeSubscription.plan.slug,
        billingPeriod: activeSubscription.plan.billingPeriod,
        price: activeSubscription.plan.price.toString(),
      },
    } : null,
  };
}

export async function registerRetailer(
  input: RetailerRegisterInput,
  currentUserId?: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<{ user: PublicUser; retailer: RetailerBusinessSummary; token?: string; expiresAt?: Date }> {
  return prisma.$transaction(async (tx) => {
    let ownerUser;
    let sessionToken: string | undefined;
    let sessionExpiresAt: Date | undefined;

    if (currentUserId) {
      ownerUser = await tx.user.findUnique({
        where: { id: currentUserId },
        include: { roles: { include: { role: true } } },
      });
      if (!ownerUser) throw new AppError(401, 'AUTH_REQUIRED', 'Please sign in to register a retailer business');
    } else {
      if (!input.owner) {
        throw new AppError(400, 'OWNER_INFO_REQUIRED', 'Owner details are required when registering a new account');
      }
      ownerUser = await createOwnerUser(tx, input.owner);

      const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
      const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * MS_PER_DAY);
      await tx.authSession.create({
        data: {
          userId: ownerUser.id,
          tokenHash: hashSessionToken(token),
          userAgent: userAgent ?? null,
          ipAddress: ipAddress ?? null,
          expiresAt,
        },
      });
      sessionToken = token;
      sessionExpiresAt = expiresAt;
    }

    const existingOwnedBusiness = await tx.retailerBusiness.findFirst({
      where: { ownerUserId: ownerUser.id, status: { not: RecordStatus.ARCHIVED } },
      select: { id: true },
    });
    if (existingOwnedBusiness) {
      throw new AppError(409, 'RETAILER_EXISTS', 'This account already owns a registered retailer business');
    }

    await attachRetailerRole(tx, ownerUser.id);

    const slug = businessCode(input.business.businessName, ownerUser.id);
    const retailer = await tx.retailerBusiness.create({
      data: {
        businessName: input.business.businessName.trim(),
        legalName: cleanOptional(input.business.legalName),
        slug,
        ownerUserId: ownerUser.id,
        phone: input.business.contactNumber.trim(),
        alternatePhone: cleanOptional(input.business.alternatePhone),
        email: cleanOptional(input.business.email),
        panNumber: cleanOptional(input.business.panNumber),
        vatNumber: cleanOptional(input.business.vatNumber),
        province: input.business.province.trim(),
        district: input.business.district.trim(),
        municipality: input.business.municipality.trim(),
        ward: cleanOptional(input.business.ward),
        addressLine: input.business.addressLine.trim(),
        landmark: cleanOptional(input.business.landmark),
        verificationStatus: RetailerVerificationStatus.SUBMITTED,
        verificationSubmittedAt: new Date(),
        subscriptionStatus: RetailerSubscriptionStatus.NONE,
        memberships: {
          create: {
            userId: ownerUser.id,
            role: RetailerMembershipRole.OWNER,
            status: RecordStatus.ACTIVE,
          },
        },
      },
      include: {
        memberships: true,
        subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const reloadedUser = await tx.user.findUniqueOrThrow({
      where: { id: ownerUser.id },
      include: { roles: { include: { role: true } } },
    });

    return {
      user: toPublicUser(reloadedUser),
      retailer: serializeRetailerBusiness(retailer as unknown as RetailerBusinessRecord),
      ...(sessionToken && sessionExpiresAt ? { token: sessionToken, expiresAt: sessionExpiresAt } : {}),
    };
  });
}

export async function getRetailerContext(userId: string): Promise<RetailerContext> {
  const membership = await prisma.retailerMembership.findFirst({
    where: { userId, status: RecordStatus.ACTIVE },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    include: {
      retailerBusiness: {
        include: {
          memberships: true,
          subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
        },
      },
    },
  });

  if (!membership) {
    return {
      membership: null,
      business: null,
      access: {
        allowed: false,
        reason: 'NO_RETAILER',
        nextAction: 'REGISTER',
        message: 'No retailer business is connected to this account.',
      },
    };
  }

  const business = serializeRetailerBusiness(membership.retailerBusiness as unknown as RetailerBusinessRecord);

  if (business.status !== RecordStatus.ACTIVE || business.verificationStatus === RetailerVerificationStatus.SUSPENDED) {
    return {
      membership: {
        id: membership.id,
        userId: membership.userId,
        retailerBusinessId: membership.retailerBusinessId,
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt,
      },
      business,
      access: {
        allowed: false,
        reason: 'SUSPENDED',
        nextAction: 'CONTACT_SUPPORT',
        message: 'Your retailer business has been suspended. Please contact Nilopasal support.',
      },
    };
  }

  if (business.verificationStatus === RetailerVerificationStatus.REJECTED) {
    return {
      membership: {
        id: membership.id,
        userId: membership.userId,
        retailerBusinessId: membership.retailerBusinessId,
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt,
      },
      business,
      access: {
        allowed: false,
        reason: 'REJECTED',
        nextAction: 'CONTACT_SUPPORT',
        message: 'Your retailer verification application was rejected.',
      },
    };
  }

  if (business.verificationStatus !== RetailerVerificationStatus.VERIFIED) {
    return {
      membership: {
        id: membership.id,
        userId: membership.userId,
        retailerBusinessId: membership.retailerBusinessId,
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt,
      },
      business,
      access: {
        allowed: false,
        reason: 'VERIFICATION_REQUIRED',
        nextAction: 'VERIFICATION',
        message: 'Store verification is under review by Nilopasal administrators.',
      },
    };
  }

  if (!canAccessRetailerErp(business)) {
    return {
      membership: {
        id: membership.id,
        userId: membership.userId,
        retailerBusinessId: membership.retailerBusinessId,
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt,
      },
      business,
      access: {
        allowed: false,
        reason: 'SUBSCRIPTION_REQUIRED',
        nextAction: 'SUBSCRIPTION',
        message: 'Choose a subscription plan or activate your 14-day trial to unlock ERP tools.',
      },
    };
  }

  return {
    membership: {
      id: membership.id,
      userId: membership.userId,
      retailerBusinessId: membership.retailerBusinessId,
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt,
    },
    business,
    access: {
      allowed: true,
      reason: 'READY',
      nextAction: 'DASHBOARD',
      message: 'Retailer ERP is active and operational data is connected.',
    },
  };
}

export async function getRetailerPlans() {
  return prisma.subscriptionPlan.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ price: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, slug: true, description: true, price: true, billingPeriod: true, features: true },
  });
}

export async function getRetailerBusinessProfile(retailerBusinessId: string): Promise<RetailerBusinessSummary> {
  const business = await prisma.retailerBusiness.findUnique({
    where: { id: retailerBusinessId },
    include: {
      memberships: true,
      subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!business) throw new AppError(404, 'RETAILER_NOT_FOUND', 'Retailer business not found');
  return serializeRetailerBusiness(business as unknown as RetailerBusinessRecord);
}

export async function updateRetailerBusiness(
  retailerBusinessId: string,
  input: UpdateRetailerBusinessInput,
): Promise<RetailerBusinessSummary> {
  const updated = await prisma.retailerBusiness.update({
    where: { id: retailerBusinessId },
    data: {
      ...(input.businessName ? { businessName: input.businessName.trim() } : {}),
      ...(input.legalName !== undefined ? { legalName: cleanOptional(input.legalName) } : {}),
      ...(input.panNumber !== undefined ? { panNumber: cleanOptional(input.panNumber) } : {}),
      ...(input.vatNumber !== undefined ? { vatNumber: cleanOptional(input.vatNumber) } : {}),
      ...(input.province ? { province: input.province.trim() } : {}),
      ...(input.district ? { district: input.district.trim() } : {}),
      ...(input.municipality ? { municipality: input.municipality.trim() } : {}),
      ...(input.ward !== undefined ? { ward: cleanOptional(input.ward) } : {}),
      ...(input.addressLine ? { addressLine: input.addressLine.trim() } : {}),
      ...(input.landmark !== undefined ? { landmark: cleanOptional(input.landmark) } : {}),
      ...(input.phone ? { phone: input.phone.trim() } : {}),
      ...(input.alternatePhone !== undefined ? { alternatePhone: cleanOptional(input.alternatePhone) } : {}),
      ...(input.email !== undefined ? { email: cleanOptional(input.email) } : {}),
      ...(input.logo !== undefined ? { logo: cleanOptional(input.logo) } : {}),
      ...(input.coverImage !== undefined ? { coverImage: cleanOptional(input.coverImage) } : {}),
    },
    include: {
      memberships: true,
      subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
    },
  });
  return serializeRetailerBusiness(updated as unknown as RetailerBusinessRecord);
}

export async function startRetailerTrial(retailerBusinessId: string, planSlug = 'retailer-starter-trial') {
  return prisma.$transaction(async (tx) => {
    const business = await tx.retailerBusiness.findUnique({
      where: { id: retailerBusinessId },
      include: { subscriptions: true },
    });
    if (!business) throw new AppError(404, 'RETAILER_NOT_FOUND', 'Retailer business not found');

    if (business.verificationStatus !== RetailerVerificationStatus.VERIFIED) {
      throw new AppError(403, 'RETAILER_VERIFICATION_REQUIRED', 'Store verification is required before starting a trial');
    }

    const existingTrialOrActive = business.subscriptions.find(
      (sub) => sub.status === RetailerSubscriptionStatus.TRIAL || sub.status === RetailerSubscriptionStatus.ACTIVE,
    );
    if (existingTrialOrActive) {
      throw new AppError(409, 'SUBSCRIPTION_ALREADY_ACTIVE', 'This retailer business already has an active subscription or has used its trial');
    }

    const plan = await tx.subscriptionPlan.findUnique({
      where: { slug: planSlug },
    });
    if (!plan || plan.status !== 'ACTIVE') {
      throw new AppError(404, 'PLAN_NOT_FOUND', `Trial plan '${planSlug}' is not available`);
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 14 * MS_PER_DAY);

    const subscription = await tx.retailerSubscription.create({
      data: {
        retailerBusinessId,
        planId: plan.id,
        status: RetailerSubscriptionStatus.TRIAL,
        trialStartsAt: now,
        trialEndsAt,
      },
      include: { plan: true },
    });

    await tx.retailerBusiness.update({
      where: { id: retailerBusinessId },
      data: { subscriptionStatus: RetailerSubscriptionStatus.TRIAL },
    });

    return {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        planName: plan.name,
        trialEndsAt: subscription.trialEndsAt,
      },
    };
  });
}

export async function getRetailerDashboardSummary(retailerBusinessId: string) {
  const business = await prisma.retailerBusiness.findUnique({
    where: { id: retailerBusinessId },
    select: { businessName: true, verificationStatus: true, subscriptionStatus: true },
  });
  if (!business) throw new AppError(404, 'RETAILER_NOT_FOUND', 'Retailer business not found');

  const [salesAggregate, transactionsCount, khataAggregate, totalProductsCount, inventories] = await Promise.all([
    prisma.retailSale.aggregate({
      where: { retailerBusinessId },
      _sum: { grandTotal: true },
    }),
    prisma.retailSale.count({
      where: { retailerBusinessId },
    }),
    prisma.retailerCustomer.aggregate({
      where: { retailerBusinessId },
      _sum: { currentBalance: true },
    }),
    prisma.retailerProduct.count({
      where: { retailerBusinessId, status: { not: ProductStatus.ARCHIVED } },
    }),
    prisma.retailerInventory.findMany({
      where: {
        retailerBusinessId,
        product: { status: { not: ProductStatus.ARCHIVED } },
      },
      select: {
        quantityAvailable: true,
        lowStockThreshold: true,
        product: { select: { costPrice: true } },
        variant: { select: { costPrice: true } },
      },
    }),
  ]);

  let totalUnits = 0;
  let totalValuation = new Prisma.Decimal(0);
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const inv of inventories) {
    totalUnits += inv.quantityAvailable;
    const cost = inv.variant?.costPrice ?? inv.product.costPrice;
    if (inv.quantityAvailable > 0) {
      totalValuation = totalValuation.add(cost.mul(inv.quantityAvailable));
    }
    if (inv.quantityAvailable <= 0) {
      outOfStockCount++;
    } else if (inv.quantityAvailable <= inv.lowStockThreshold) {
      lowStockCount++;
    }
  }

  const recentSales = await prisma.retailSale.findMany({
    where: { retailerBusinessId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      invoiceNumber: true,
      grandTotal: true,
      paymentStatus: true,
      createdAt: true,
    },
  });

  return {
    retailerBusinessId,
    businessName: business.businessName,
    verificationStatus: business.verificationStatus,
    subscriptionStatus: business.subscriptionStatus,
    summary: {
      todaySales: salesAggregate._sum.grandTotal ? salesAggregate._sum.grandTotal.toString() : '0',
      transactions: transactionsCount,
      outstandingKhata: khataAggregate._sum.currentBalance ? khataAggregate._sum.currentBalance.toString() : '0',
      lowStockItems: lowStockCount,
      outOfStockItems: outOfStockCount,
      totalProducts: totalProductsCount,
      totalUnits,
      inventoryValuation: totalValuation.toFixed(2),
      recentSales,
    },
  };
}
