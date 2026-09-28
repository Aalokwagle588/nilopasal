import { BillingPeriod, CartStatus, RoleCode, SubscriptionPlanStatus, UserStatus } from '@prisma/client';
import argon2 from 'argon2';
import { prisma, disconnectDatabase } from '../src/config/database.js';
import { normalizeEmail } from '../src/modules/auth/auth.service.js';

const ROLES: Array<{ code: RoleCode; name: string; description: string }> = [
  { code: RoleCode.CUSTOMER, name: 'Customer', description: 'Nilopasal consumer shopping customer' },
  { code: RoleCode.ADMIN, name: 'Admin', description: 'Platform super administrator' },
  { code: RoleCode.STAFF, name: 'Staff', description: 'Platform operational staff' },
  { code: RoleCode.VENDOR, name: 'Vendor', description: 'Marketplace supplier or brand vendor' },
  { code: RoleCode.VENDOR_STAFF, name: 'Vendor Staff', description: 'Staff member of a vendor organization' },
  { code: RoleCode.RETAILER, name: 'Retailer', description: 'Retailer business owner or staff member' },
];

const PLANS = [
  {
    name: 'Retailer Starter Trial',
    slug: 'retailer-starter-trial',
    description: '14-day full feature trial to experience Nilopasal Retailer ERP.',
    price: '0.00',
    billingPeriod: BillingPeriod.MONTHLY,
    status: SubscriptionPlanStatus.ACTIVE,
    features: [
      'Full POS & Tax Invoices',
      'Digital Khata (up to 50 customers)',
      'Inventory ERP (up to 200 products)',
      'Single staff login',
      '14 days trial duration',
    ],
  },
  {
    name: 'Retailer Standard (Monthly)',
    slug: 'retailer-standard-monthly',
    description: 'Essential ERP for active retail shops and grocers.',
    price: '999.00',
    billingPeriod: BillingPeriod.MONTHLY,
    status: SubscriptionPlanStatus.ACTIVE,
    features: [
      'Unlimited POS & Tax Invoices',
      'Digital Khata Ledger',
      'Inventory tracking & low stock alerts',
      'Up to 3 staff logins (Owner, Cashier, Inventory)',
      'Basic sales & cash breakdown reports',
      'Email & phone support',
    ],
  },
  {
    name: 'Retailer Standard (Yearly)',
    slug: 'retailer-standard-yearly',
    description: 'Annual plan with 2 months free discount for retail stores.',
    price: '9990.00',
    billingPeriod: BillingPeriod.YEARLY,
    status: SubscriptionPlanStatus.ACTIVE,
    features: [
      'Unlimited POS & Tax Invoices',
      'Digital Khata Ledger',
      'Inventory tracking & low stock alerts',
      'Up to 3 staff logins',
      'Basic sales & cash reports',
      'Priority support + 2 months free discount',
    ],
  },
  {
    name: 'Retailer Pro (Monthly)',
    slug: 'retailer-pro-monthly',
    description: 'High-volume ERP with supplier purchasing and multi-role staff.',
    price: '2499.00',
    billingPeriod: BillingPeriod.MONTHLY,
    status: SubscriptionPlanStatus.ACTIVE,
    features: [
      'Everything in Standard',
      'Supplier Purchasing & Payable Ledger',
      'Multi-variant products (size, color, weight)',
      'Unlimited staff members with granular roles',
      'Full profit margin & audit analytics',
      'Dedicated account manager',
    ],
  },
  {
    name: 'Retailer Pro (Yearly)',
    slug: 'retailer-pro-yearly',
    description: 'Annual Pro plan for large retail stores and multi-counter shops.',
    price: '24990.00',
    billingPeriod: BillingPeriod.YEARLY,
    status: SubscriptionPlanStatus.ACTIVE,
    features: [
      'Everything in Standard',
      'Supplier Purchasing & Payable Ledger',
      'Multi-variant products (size, color, weight)',
      'Unlimited staff members with granular roles',
      'Full profit margin & audit analytics',
      'Priority 24/7 dedicated support + 2 months free',
    ],
  },
];

async function seedRoles() {
  console.log('Seeding system roles...');
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      create: { code: role.code, name: role.name, description: role.description },
      update: { name: role.name, description: role.description },
    });
  }
}

async function seedPlans() {
  console.log('Seeding retailer subscription plans...');
  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      create: {
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        price: plan.price,
        billingPeriod: plan.billingPeriod,
        status: plan.status,
        features: plan.features,
      },
      update: {
        name: plan.name,
        description: plan.description,
        price: plan.price,
        billingPeriod: plan.billingPeriod,
        status: plan.status,
        features: plan.features,
      },
    });
  }
}

async function seedAdmin() {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!email || !password) {
    console.log('No ADMIN_SEED_EMAIL or ADMIN_SEED_PASSWORD set; skipping admin user seed.');
    return;
  }

  const emailNormalized = normalizeEmail(email);
  console.log(`Seeding platform administrator: ${emailNormalized}...`);

  const [adminRole, customerRole] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } }),
    prisma.role.findUniqueOrThrow({ where: { code: RoleCode.CUSTOMER } }),
  ]);

  const passwordHash = await argon2.hash(password);

  const user = await prisma.user.upsert({
    where: { emailNormalized },
    create: {
      firstName: process.env.ADMIN_SEED_FIRST_NAME || 'Nilopasal',
      lastName: process.env.ADMIN_SEED_LAST_NAME || 'Admin',
      email: email.trim(),
      emailNormalized,
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      wishlist: { create: {} },
      carts: { create: { status: CartStatus.ACTIVE } },
    },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    create: { userId: user.id, roleId: adminRole.id },
    update: {},
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: customerRole.id } },
    create: { userId: user.id, roleId: customerRole.id },
    update: {},
  });

  console.log(`Administrator user ready: ${user.id}`);
}

async function main() {
  try {
    await seedRoles();
    await seedPlans();
    await seedAdmin();
    console.log('Seeding completed successfully.');
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
