import { z } from 'zod';
import { KhataTransactionType, RecordStatus, RetailerPaymentMethod } from '@prisma/client';

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Customer name must be at least 2 characters').max(100),
  phone: z
    .string()
    .trim()
    .min(7, 'Phone number must be at least 7 digits')
    .max(15, 'Phone number too long')
    .regex(/^[0-9+\s\-()]+$/, 'Invalid phone number format'),
  email: z.string().trim().email('Invalid email address').optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  creditLimit: z.coerce.number().min(0, 'Credit limit cannot be negative').optional().nullable(),
  openingBalance: z.coerce.number().optional().default(0),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(15)
    .regex(/^[0-9+\s\-()]+$/, 'Invalid phone number format')
    .optional(),
  email: z.string().trim().email().optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  creditLimit: z.coerce.number().min(0).optional().nullable(),
  status: z.nativeEnum(RecordStatus).optional(),
});

export const listCustomersQuerySchema = z.object({
  search: z.string().optional(),
  balanceStatus: z.enum(['ALL', 'WITH_DEBT', 'ZERO_BALANCE', 'OVER_LIMIT']).optional().default('ALL'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(['name', 'currentBalance', 'createdAt', 'updatedAt']).optional().default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const recordKhataPaymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
  paymentMethod: z.nativeEnum(RetailerPaymentMethod).default(RetailerPaymentMethod.CASH),
  reference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const recordKhataAdjustmentSchema = z.object({
  amount: z.coerce.number().positive('Adjustment amount must be greater than zero'),
  direction: z.enum(['DEBIT', 'CREDIT']), // DEBIT = increases customer debt; CREDIT = decreases customer debt
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(200),
  notes: z.string().trim().max(500).optional(),
});

export const listKhataTransactionsQuerySchema = z.object({
  type: z.nativeEnum(KhataTransactionType).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type RecordKhataPaymentInput = z.infer<typeof recordKhataPaymentSchema>;
export type RecordKhataAdjustmentInput = z.infer<typeof recordKhataAdjustmentSchema>;
export type ListKhataTransactionsQuery = z.infer<typeof listKhataTransactionsQuerySchema>;
