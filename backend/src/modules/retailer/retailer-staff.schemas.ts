import { z } from 'zod';
import { RetailerMembershipRole } from '@prisma/client';

export const inviteStaffSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(15)
    .regex(/^[0-9+\s\-()]+$/, 'Invalid phone number format')
    .optional()
    .nullable(),
  role: z.enum([
    RetailerMembershipRole.ADMIN,
    RetailerMembershipRole.MANAGER,
    RetailerMembershipRole.INVENTORY_MANAGER,
    RetailerMembershipRole.CASHIER,
  ]),
});

export const acceptStaffInviteSchema = z.object({
  token: z.string().trim().min(10, 'Valid invitation token is required'),
});

export const updateStaffRoleSchema = z.object({
  role: z.enum([
    RetailerMembershipRole.ADMIN,
    RetailerMembershipRole.MANAGER,
    RetailerMembershipRole.INVENTORY_MANAGER,
    RetailerMembershipRole.CASHIER,
  ]),
});

export const listAuditLogsQuerySchema = z.object({
  action: z.string().optional(),
  entityType: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;
export type AcceptStaffInviteInput = z.infer<typeof acceptStaffInviteSchema>;
export type UpdateStaffRoleInput = z.infer<typeof updateStaffRoleSchema>;
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
