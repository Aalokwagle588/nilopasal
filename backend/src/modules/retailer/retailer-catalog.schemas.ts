import {
  ProductStatus,
  RecordStatus,
  RetailerInventoryTransactionType,
  RetailerTaxType,
  RetailerUnit,
  VariantStatus,
} from '@prisma/client';
import { z } from 'zod';

const requiredText = (max = 120) => z.string().trim().min(1, 'This field is required').max(max);
const optionalText = (max = 120) => z.string().trim().max(max).optional().or(z.literal(''));

export const createCategorySchema = z.object({
  name: requiredText(100),
  slug: optionalText(120),
  description: optionalText(500),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const updateCategorySchema = z.object({
  name: requiredText(100).optional(),
  slug: optionalText(120),
  description: optionalText(500),
  sortOrder: z.coerce.number().int().min(0).optional(),
  status: z.nativeEnum(RecordStatus).optional(),
});

export const createVariantInputSchema = z.object({
  title: requiredText(100),
  sku: optionalText(80),
  barcode: optionalText(80),
  costPrice: z.coerce.number().min(0).default(0),
  sellingPrice: z.coerce.number().min(0).default(0),
  initialStock: z.coerce.number().int().min(0).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(5),
});

export const updateVariantSchema = z.object({
  title: requiredText(100).optional(),
  sku: optionalText(80),
  barcode: optionalText(80),
  costPrice: z.coerce.number().min(0).optional(),
  sellingPrice: z.coerce.number().min(0).optional(),
  status: z.nativeEnum(VariantStatus).optional(),
});

export const createProductSchema = z.object({
  name: requiredText(200),
  slug: optionalText(220),
  sku: optionalText(80),
  barcode: optionalText(80),
  categoryId: z.string().uuid().optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
  description: optionalText(2000),
  costPrice: z.coerce.number().min(0, 'Cost price cannot be negative').default(0),
  sellingPrice: z.coerce.number().min(0, 'Selling price cannot be negative').default(0),
  mrp: z.coerce.number().min(0).optional(),
  unit: z.nativeEnum(RetailerUnit).default(RetailerUnit.PCS),
  customUnit: optionalText(40),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  taxType: z.nativeEnum(RetailerTaxType).default(RetailerTaxType.NON_TAXABLE),
  trackInventory: z.boolean().default(true),
  status: z.nativeEnum(ProductStatus).default(ProductStatus.ACTIVE),
  initialStock: z.coerce.number().int().min(0, 'Initial stock cannot be negative').default(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(5),
  variants: z.array(createVariantInputSchema).optional(),
});

export const updateProductSchema = z.object({
  name: requiredText(200).optional(),
  slug: optionalText(220),
  sku: optionalText(80),
  barcode: optionalText(80),
  categoryId: z.string().uuid().nullable().optional().or(z.literal('')).transform((v) => (v === '' ? null : v)),
  description: optionalText(2000),
  costPrice: z.coerce.number().min(0).optional(),
  sellingPrice: z.coerce.number().min(0).optional(),
  mrp: z.coerce.number().min(0).nullable().optional(),
  unit: z.nativeEnum(RetailerUnit).optional(),
  customUnit: optionalText(40),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  taxType: z.nativeEnum(RetailerTaxType).optional(),
  trackInventory: z.boolean().optional(),
  status: z.nativeEnum(ProductStatus).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
});

export const manualAdjustmentTypes = [
  RetailerInventoryTransactionType.STOCK_IN,
  RetailerInventoryTransactionType.ADJUSTMENT_IN,
  RetailerInventoryTransactionType.ADJUSTMENT_OUT,
  RetailerInventoryTransactionType.DAMAGED,
  RetailerInventoryTransactionType.EXPIRED,
  RetailerInventoryTransactionType.TRANSFER,
] as const;

export const adjustStockSchema = z.object({
  inventoryId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  type: z.enum([
    RetailerInventoryTransactionType.STOCK_IN,
    RetailerInventoryTransactionType.ADJUSTMENT_IN,
    RetailerInventoryTransactionType.ADJUSTMENT_OUT,
    RetailerInventoryTransactionType.DAMAGED,
    RetailerInventoryTransactionType.EXPIRED,
    RetailerInventoryTransactionType.TRANSFER,
  ]),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  reason: z.string().trim().min(3, 'A reason for adjustment is required (at least 3 characters)').max(300),
  referenceType: optionalText(80),
  referenceId: optionalText(120),
}).refine((data) => data.inventoryId || data.productId, {
  message: 'Either inventoryId or productId is required',
  path: ['inventoryId'],
});

export const listProductsQuerySchema = z.object({
  search: optionalText(120),
  categoryId: z.string().uuid().optional().or(z.literal('')),
  stockStatus: z.enum(['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).default('ALL'),
  status: z.nativeEnum(ProductStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'sellingPrice', 'costPrice', 'createdAt', 'stock']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const listTransactionsQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  inventoryId: z.string().uuid().optional(),
  type: z.nativeEnum(RetailerInventoryTransactionType).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateVariantInput = z.infer<typeof createVariantInputSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
