import { z } from 'zod';
import {
  RecordStatus,
  RetailerPaymentMethod,
  RetailerPurchaseStatus,
  SupplierTransactionType,
} from '@prisma/client';

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2, 'Supplier name must be at least 2 characters').max(100),
  companyName: z.string().trim().max(100).optional().nullable(),
  phone: z
    .string()
    .trim()
    .min(7, 'Phone number must be at least 7 digits')
    .max(15, 'Phone number too long')
    .regex(/^[0-9+\s\-()]+$/, 'Invalid phone number format'),
  email: z.string().trim().email('Invalid email format').optional().nullable(),
  panNumber: z.string().trim().max(20).optional().nullable(),
  vatNumber: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  openingBalance: z.coerce.number().optional().default(0),
});

export const updateSupplierSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  companyName: z.string().trim().max(100).optional().nullable(),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(15)
    .regex(/^[0-9+\s\-()]+$/, 'Invalid phone number format')
    .optional(),
  email: z.string().trim().email().optional().nullable(),
  panNumber: z.string().trim().max(20).optional().nullable(),
  vatNumber: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  status: z.nativeEnum(RecordStatus).optional(),
});

export const listSuppliersQuerySchema = z.object({
  search: z.string().optional(),
  hasBalance: z.enum(['ALL', 'DUE', 'SETTLED']).optional().default('ALL'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(['name', 'currentBalance', 'createdAt', 'updatedAt']).optional().default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const purchaseItemInputSchema = z.object({
  productId: z.string().uuid('Valid product ID required'),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  unitCost: z.coerce.number().min(0, 'Unit cost cannot be negative'),
  tax: z.coerce.number().min(0).optional().default(0),
  discount: z.coerce.number().min(0).optional().default(0),
});

export const createPurchaseSchema = z.object({
  supplierId: z.string().uuid('Valid supplier ID required'),
  status: z
    .enum(['DRAFT', 'ORDERED', 'RECEIVED'])
    .optional()
    .default('RECEIVED'),
  items: z.array(purchaseItemInputSchema).min(1, 'At least one purchase item is required'),
  discount: z.coerce.number().min(0).optional().default(0),
  tax: z.coerce.number().min(0).optional().default(0),
  paidAmount: z.coerce.number().min(0).optional().default(0),
  notes: z.string().trim().max(500).optional().nullable(),
  updateCostPrice: z.boolean().optional().default(true),
});

export const listPurchasesQuerySchema = z.object({
  search: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  status: z.nativeEnum(RetailerPurchaseStatus).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const recordSupplierPaymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
  paymentMethod: z.nativeEnum(RetailerPaymentMethod).default(RetailerPaymentMethod.CASH),
  reference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const listSupplierTransactionsQuerySchema = z.object({
  type: z.nativeEnum(SupplierTransactionType).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type PurchaseItemInput = z.infer<typeof purchaseItemInputSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
export type RecordSupplierPaymentInput = z.infer<typeof recordSupplierPaymentSchema>;
export type ListSupplierTransactionsQuery = z.infer<typeof listSupplierTransactionsQuerySchema>;
