import {
  RetailerPaymentMethod,
  RetailerPaymentStatus,
} from '@prisma/client';
import { z } from 'zod';

const optionalText = (max = 200) => z.string().trim().max(max).optional().or(z.literal(''));

export const posSaleItemInputSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  unitPrice: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).default(0),
});

export const posPaymentInputSchema = z.object({
  method: z.nativeEnum(RetailerPaymentMethod),
  amount: z.coerce.number().min(0.01, 'Payment amount must be greater than zero'),
  reference: optionalText(100),
});

export const createPosSaleSchema = z.object({
  customerId: z.string().uuid().optional(),
  customerName: optionalText(120),
  customerPhone: optionalText(30),
  items: z.array(posSaleItemInputSchema).min(1, 'Sale must include at least one item'),
  discount: z.coerce.number().min(0).default(0),
  payments: z.array(posPaymentInputSchema).min(1, 'At least one payment record is required'),
  notes: optionalText(500),
});

export const listSalesQuerySchema = z.object({
  search: optionalText(120),
  paymentStatus: z.nativeEnum(RetailerPaymentStatus).optional(),
  customerId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const posLookupQuerySchema = z.object({
  query: z.string().trim().min(1, 'Lookup query cannot be empty'),
});

export type PosSaleItemInput = z.infer<typeof posSaleItemInputSchema>;
export type PosPaymentInput = z.infer<typeof posPaymentInputSchema>;
export type CreatePosSaleInput = z.infer<typeof createPosSaleSchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;
export type PosLookupQuery = z.infer<typeof posLookupQuerySchema>;
