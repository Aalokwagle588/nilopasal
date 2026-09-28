import { RetailerSubscriptionStatus } from '@prisma/client';
import { z } from 'zod';

const requiredText = (max = 120) => z.string().trim().min(1, 'This field is required').max(max);
const optionalText = (max = 120) => z.string().trim().max(max).optional().or(z.literal(''));

export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be 128 characters or fewer')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number');

export const retailerOwnerSchema = z.object({
  firstName: requiredText(80),
  lastName: requiredText(80),
  phone: requiredText(30),
  email: z.string().trim().email('A valid email address is required').max(254),
  password: passwordSchema.optional(),
});

export const retailerBusinessSchema = z.object({
  businessName: requiredText(160),
  legalName: optionalText(180),
  panNumber: optionalText(40),
  vatNumber: optionalText(40),
  province: requiredText(80),
  district: requiredText(80),
  municipality: requiredText(120),
  ward: optionalText(20),
  addressLine: requiredText(220),
  landmark: optionalText(160),
  contactNumber: requiredText(30),
  alternatePhone: optionalText(30),
  email: z.string().trim().email('Invalid business email').max(254).optional().or(z.literal('')),
});

export const retailerRegisterSchema = z.object({
  owner: retailerOwnerSchema.optional(),
  business: retailerBusinessSchema,
});

export const updateRetailerBusinessSchema = z.object({
  businessName: requiredText(160).optional(),
  legalName: optionalText(180),
  panNumber: optionalText(40),
  vatNumber: optionalText(40),
  province: requiredText(80).optional(),
  district: requiredText(80).optional(),
  municipality: requiredText(120).optional(),
  ward: optionalText(20),
  addressLine: requiredText(220).optional(),
  landmark: optionalText(160),
  phone: requiredText(30).optional(),
  alternatePhone: optionalText(30),
  email: z.string().trim().email().max(254).optional().or(z.literal('')),
  logo: optionalText(500),
  coverImage: optionalText(500),
});

export const startTrialSchema = z.object({
  planSlug: z.string().trim().default('retailer-starter-trial'),
});

export const adminVerifyRetailerSchema = z.object({
  notes: optionalText(300),
});

export const adminRejectRetailerSchema = z.object({
  reason: requiredText(300),
});

export const adminAssignSubscriptionSchema = z.object({
  planSlug: requiredText(80),
  status: z.nativeEnum(RetailerSubscriptionStatus).default(RetailerSubscriptionStatus.ACTIVE),
  durationDays: z.coerce.number().int().min(1).max(3650).default(30),
});

export type RetailerRegisterInput = z.infer<typeof retailerRegisterSchema>;
export type UpdateRetailerBusinessInput = z.infer<typeof updateRetailerBusinessSchema>;
export type StartTrialInput = z.infer<typeof startTrialSchema>;
export type AdminAssignSubscriptionInput = z.infer<typeof adminAssignSubscriptionSchema>;
