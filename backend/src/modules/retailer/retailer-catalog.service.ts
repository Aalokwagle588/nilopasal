import {
  Prisma,
  ProductStatus,
  RecordStatus,
  RetailerInventoryTransactionType,
  VariantStatus,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../errors/app-error.js';
import type {
  AdjustStockInput,
  CreateCategoryInput,
  CreateProductInput,
  CreateVariantInput,
  ListProductsQuery,
  ListTransactionsQuery,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdateVariantInput,
} from './retailer-catalog.schemas.ts';

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function generateSku(name: string, prefix = 'NP'): string {
  const letters = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'ITEM';
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${letters}-${rand}`;
}

// ==========================================
// CATEGORIES
// ==========================================

export async function listCategories(retailerBusinessId: string) {
  return prisma.retailerCategory.findMany({
    where: {
      retailerBusinessId,
      status: { not: RecordStatus.ARCHIVED },
    },
    orderBy: [
      { sortOrder: 'asc' },
      { name: 'asc' },
    ],
    include: {
      _count: {
        select: {
          products: {
            where: { status: { not: ProductStatus.ARCHIVED } },
          },
        },
      },
    },
  });
}

export async function getCategoryById(retailerBusinessId: string, categoryId: string) {
  const category = await prisma.retailerCategory.findFirst({
    where: {
      id: categoryId,
      retailerBusinessId,
      status: { not: RecordStatus.ARCHIVED },
    },
    include: {
      _count: {
        select: {
          products: {
            where: { status: { not: ProductStatus.ARCHIVED } },
          },
        },
      },
    },
  });

  if (!category) {
    throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category not found or does not belong to your store');
  }

  return category;
}

export async function createCategory(
  retailerBusinessId: string,
  input: CreateCategoryInput,
  actorId?: string,
) {
  const baseSlug = input.slug ? slugify(input.slug) : slugify(input.name);
  let finalSlug = baseSlug || `cat-${Date.now().toString(36)}`;

  // Ensure unique slug per business
  const existing = await prisma.retailerCategory.findUnique({
    where: {
      retailerBusinessId_slug: {
        retailerBusinessId,
        slug: finalSlug,
      },
    },
  });

  if (existing) {
    finalSlug = `${finalSlug}-${Math.random().toString(36).substring(2, 6)}`;
  }

  const category = await prisma.retailerCategory.create({
    data: {
      retailerBusinessId,
      name: input.name,
      slug: finalSlug,
      ...(input.description ? { description: input.description } : {}),
      sortOrder: input.sortOrder ?? 0,
      status: RecordStatus.ACTIVE,
    },
  });

  await prisma.retailerAuditLog.create({
    data: {
      retailerBusinessId,
      actorId: actorId ?? null,
      action: 'CREATE_CATEGORY',
      entityType: 'CATEGORY',
      entityId: category.id,
      after: { name: category.name, slug: category.slug },
    },
  });

  return category;
}

export async function updateCategory(
  retailerBusinessId: string,
  categoryId: string,
  input: UpdateCategoryInput,
  actorId?: string,
) {
  const existing = await getCategoryById(retailerBusinessId, categoryId);

  let newSlug: string | undefined;
  if (input.slug) {
    newSlug = slugify(input.slug);
    if (newSlug !== existing.slug) {
      const conflict = await prisma.retailerCategory.findUnique({
        where: {
          retailerBusinessId_slug: {
            retailerBusinessId,
            slug: newSlug,
          },
        },
      });
      if (conflict) {
        throw new AppError(409, 'SLUG_CONFLICT', 'A category with this slug already exists in your store');
      }
    }
  }

  const updated = await prisma.retailerCategory.update({
    where: { id: categoryId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(newSlug !== undefined ? { slug: newSlug } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  await prisma.retailerAuditLog.create({
    data: {
      retailerBusinessId,
      actorId: actorId ?? null,
      action: 'UPDATE_CATEGORY',
      entityType: 'CATEGORY',
      entityId: categoryId,
      before: { name: existing.name, slug: existing.slug, status: existing.status },
      after: { name: updated.name, slug: updated.slug, status: updated.status },
    },
  });

  return updated;
}

export async function deleteCategory(
  retailerBusinessId: string,
  categoryId: string,
  actorId?: string,
) {
  const existing = await getCategoryById(retailerBusinessId, categoryId);

  // Soft delete category and dissociate active products
  await prisma.$transaction(async (tx) => {
    await tx.retailerProduct.updateMany({
      where: { retailerBusinessId, categoryId },
      data: { categoryId: null },
    });

    await tx.retailerCategory.update({
      where: { id: categoryId },
      data: { status: RecordStatus.ARCHIVED },
    });

    await tx.retailerAuditLog.create({
      data: {
        retailerBusinessId,
        actorId: actorId ?? null,
        action: 'DELETE_CATEGORY',
        entityType: 'CATEGORY',
        entityId: categoryId,
        before: { name: existing.name },
      },
    });
  });

  return { success: true, message: 'Category removed' };
}

// ==========================================
// PRODUCTS
// ==========================================

export async function createProduct(
  retailerBusinessId: string,
  input: CreateProductInput,
  actorId?: string,
) {
  return prisma.$transaction(async (tx) => {
    // 1. Verify category belongs to this retailer if provided
    if (input.categoryId) {
      const cat = await tx.retailerCategory.findFirst({
        where: { id: input.categoryId, retailerBusinessId, status: { not: RecordStatus.ARCHIVED } },
      });
      if (!cat) {
        throw new AppError(400, 'INVALID_CATEGORY', 'Selected category does not exist in your store');
      }
    }

    // 2. Resolve unique SKU
    let finalSku = input.sku?.trim().toUpperCase();
    if (!finalSku) {
      finalSku = generateSku(input.name);
    }

    const skuConflict = await tx.retailerProduct.findUnique({
      where: {
        retailerBusinessId_sku: {
          retailerBusinessId,
          sku: finalSku,
        },
      },
    });
    if (skuConflict) {
      throw new AppError(409, 'SKU_CONFLICT', `A product with SKU "${finalSku}" already exists in your store`);
    }

    // 3. Resolve barcode if provided
    const barcode = input.barcode?.trim() || null;
    if (barcode) {
      const barcodeConflict = await tx.retailerProduct.findUnique({
        where: {
          retailerBusinessId_barcode: {
            retailerBusinessId,
            barcode,
          },
        },
      });
      if (barcodeConflict) {
        throw new AppError(409, 'BARCODE_CONFLICT', `A product with barcode "${barcode}" already exists in your store`);
      }
    }

    // 4. Resolve slug
    const baseSlug = input.slug ? slugify(input.slug) : slugify(input.name);
    let finalSlug = baseSlug || `prod-${Date.now().toString(36)}`;
    const slugSuffix = Math.random().toString(36).substring(2, 6);
    finalSlug = `${finalSlug}-${slugSuffix}`;

    // 5. Create product record
    const product = await tx.retailerProduct.create({
      data: {
        retailerBusinessId,
        categoryId: input.categoryId ?? null,
        name: input.name,
        slug: finalSlug,
        sku: finalSku,
        barcode,
        ...(input.description ? { description: input.description } : {}),
        costPrice: new Prisma.Decimal(input.costPrice),
        sellingPrice: new Prisma.Decimal(input.sellingPrice),
        ...(input.mrp !== undefined && input.mrp !== null ? { mrp: new Prisma.Decimal(input.mrp) } : {}),
        unit: input.unit,
        ...(input.customUnit ? { customUnit: input.customUnit } : {}),
        taxRate: new Prisma.Decimal(input.taxRate),
        taxType: input.taxType,
        trackInventory: input.trackInventory,
        status: input.status,
      },
    });

    // 6. Handle variants or base product inventory
    if (input.variants && input.variants.length > 0) {
      for (const v of input.variants) {
        const vSku = v.sku?.trim().toUpperCase() || `${finalSku}-${slugify(v.title).toUpperCase()}`;
        const vBarcode = v.barcode?.trim() || null;

        const variant = await tx.retailerProductVariant.create({
          data: {
            retailerProductId: product.id,
            title: v.title,
            sku: vSku,
            barcode: vBarcode,
            costPrice: new Prisma.Decimal(v.costPrice ?? input.costPrice),
            sellingPrice: new Prisma.Decimal(v.sellingPrice ?? input.sellingPrice),
            status: VariantStatus.ACTIVE,
          },
        });

        const vInventory = await tx.retailerInventory.create({
          data: {
            retailerBusinessId,
            productId: product.id,
            variantId: variant.id,
            quantityAvailable: v.initialStock ?? 0,
            quantityReserved: 0,
            lowStockThreshold: v.lowStockThreshold ?? input.lowStockThreshold ?? 5,
          },
        });

        if (v.initialStock && v.initialStock > 0) {
          await tx.retailerInventoryTransaction.create({
            data: {
              retailerBusinessId,
              inventoryId: vInventory.id,
              type: RetailerInventoryTransactionType.STOCK_IN,
              quantity: v.initialStock,
              previousQuantity: 0,
              newQuantity: v.initialStock,
              referenceType: 'INITIAL_STOCK',
              reason: 'Opening stock on product creation',
              performedBy: actorId ?? null,
            },
          });
        }
      }
    } else {
      // Base product inventory (single SKU)
      const inventory = await tx.retailerInventory.create({
        data: {
          retailerBusinessId,
          productId: product.id,
          variantId: null,
          quantityAvailable: input.initialStock ?? 0,
          quantityReserved: 0,
          lowStockThreshold: input.lowStockThreshold ?? 5,
        },
      });

      if (input.initialStock && input.initialStock > 0) {
        await tx.retailerInventoryTransaction.create({
          data: {
            retailerBusinessId,
            inventoryId: inventory.id,
            type: RetailerInventoryTransactionType.STOCK_IN,
            quantity: input.initialStock,
            previousQuantity: 0,
            newQuantity: input.initialStock,
            referenceType: 'INITIAL_STOCK',
            reason: 'Opening stock on product creation',
            performedBy: actorId ?? null,
          },
        });
      }
    }

    // 7. Audit log
    await tx.retailerAuditLog.create({
      data: {
        retailerBusinessId,
        actorId: actorId ?? null,
        action: 'CREATE_PRODUCT',
        entityType: 'PRODUCT',
        entityId: product.id,
        after: {
          name: product.name,
          sku: product.sku,
          sellingPrice: product.sellingPrice.toString(),
          initialStock: input.initialStock,
        },
      },
    });

    // 8. Return complete product
    return tx.retailerProduct.findUniqueOrThrow({
      where: { id: product.id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: true,
        inventories: true,
      },
    });
  });
}

export async function listProducts(retailerBusinessId: string, query: ListProductsQuery) {
  const { search, categoryId, stockStatus, status, page, limit, sortBy, sortOrder } = query;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: Prisma.RetailerProductWhereInput = {
    retailerBusinessId,
    status: status ? status : { not: ProductStatus.ARCHIVED },
  };

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { sku: { contains: term, mode: 'insensitive' } },
      { barcode: { contains: term, mode: 'insensitive' } },
    ];
  }

  if (stockStatus && stockStatus !== 'ALL') {
    if (stockStatus === 'OUT_OF_STOCK') {
      where.inventories = {
        every: {
          quantityAvailable: { lte: 0 },
        },
      };
    } else if (stockStatus === 'IN_STOCK') {
      where.inventories = {
        some: {
          quantityAvailable: { gt: 0 },
        },
      };
    } else if (stockStatus === 'LOW_STOCK') {
      // Products with at least one inventory row at or below low stock threshold
      where.inventories = {
        some: {
          quantityAvailable: { lte: 5 }, // Default threshold fallback for Prisma query
        },
      };
    }
  }

  // Determine sorting
  let orderBy: Prisma.RetailerProductOrderByWithRelationInput = { createdAt: sortOrder };
  if (sortBy === 'name') orderBy = { name: sortOrder };
  else if (sortBy === 'sellingPrice') orderBy = { sellingPrice: sortOrder };
  else if (sortBy === 'costPrice') orderBy = { costPrice: sortOrder };
  else if (sortBy === 'createdAt') orderBy = { createdAt: sortOrder };

  const [totalItems, products] = await Promise.all([
    prisma.retailerProduct.count({ where }),
    prisma.retailerProduct.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: {
          select: {
            id: true,
            title: true,
            sku: true,
            barcode: true,
            costPrice: true,
            sellingPrice: true,
            status: true,
          },
        },
        inventories: {
          select: {
            id: true,
            variantId: true,
            quantityAvailable: true,
            quantityReserved: true,
            lowStockThreshold: true,
          },
        },
      },
    }),
  ]);

  const items = products.map((p) => {
    const totalQuantity = p.inventories.reduce((acc, inv) => acc + inv.quantityAvailable, 0);
    const minThreshold = Math.min(...p.inventories.map((inv) => inv.lowStockThreshold), 5);
    let computedStockStatus: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK' = 'IN_STOCK';

    if (totalQuantity <= 0) {
      computedStockStatus = 'OUT_OF_STOCK';
    } else if (totalQuantity <= minThreshold) {
      computedStockStatus = 'LOW_STOCK';
    }

    return {
      ...p,
      costPrice: p.costPrice.toString(),
      sellingPrice: p.sellingPrice.toString(),
      mrp: p.mrp ? p.mrp.toString() : null,
      taxRate: p.taxRate.toString(),
      variants: p.variants.map((v) => ({
        ...v,
        costPrice: v.costPrice.toString(),
        sellingPrice: v.sellingPrice.toString(),
      })),
      totalQuantity,
      stockStatus: computedStockStatus,
    };
  });

  return {
    items,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
}

export async function getProductById(retailerBusinessId: string, productId: string) {
  const product = await prisma.retailerProduct.findFirst({
    where: {
      id: productId,
      retailerBusinessId,
      status: { not: ProductStatus.ARCHIVED },
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: true,
      inventories: {
        include: {
          transactions: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found or does not belong to your store');
  }

  const totalQuantity = product.inventories.reduce((acc, inv) => acc + inv.quantityAvailable, 0);

  return {
    ...product,
    costPrice: product.costPrice.toString(),
    sellingPrice: product.sellingPrice.toString(),
    mrp: product.mrp ? product.mrp.toString() : null,
    taxRate: product.taxRate.toString(),
    variants: product.variants.map((v) => ({
      ...v,
      costPrice: v.costPrice.toString(),
      sellingPrice: v.sellingPrice.toString(),
    })),
    totalQuantity,
  };
}

export async function updateProduct(
  retailerBusinessId: string,
  productId: string,
  input: UpdateProductInput,
  actorId?: string,
) {
  const existing = await prisma.retailerProduct.findFirst({
    where: { id: productId, retailerBusinessId },
  });

  if (!existing) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found or does not belong to your store');
  }

  // Validate category if updating
  if (input.categoryId) {
    const cat = await prisma.retailerCategory.findFirst({
      where: { id: input.categoryId, retailerBusinessId, status: { not: RecordStatus.ARCHIVED } },
    });
    if (!cat) {
      throw new AppError(400, 'INVALID_CATEGORY', 'Selected category does not exist in your store');
    }
  }

  // Validate SKU conflict if changed
  if (input.sku && input.sku.toUpperCase() !== existing.sku) {
    const skuConflict = await prisma.retailerProduct.findUnique({
      where: {
        retailerBusinessId_sku: {
          retailerBusinessId,
          sku: input.sku.toUpperCase(),
        },
      },
    });
    if (skuConflict && skuConflict.id !== productId) {
      throw new AppError(409, 'SKU_CONFLICT', `A product with SKU "${input.sku}" already exists`);
    }
  }

  // Validate Barcode conflict if changed
  if (input.barcode && input.barcode !== existing.barcode) {
    const barcodeConflict = await prisma.retailerProduct.findUnique({
      where: {
        retailerBusinessId_barcode: {
          retailerBusinessId,
          barcode: input.barcode,
        },
      },
    });
    if (barcodeConflict && barcodeConflict.id !== productId) {
      throw new AppError(409, 'BARCODE_CONFLICT', `A product with barcode "${input.barcode}" already exists`);
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.retailerProduct.update({
      where: { id: productId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sku !== undefined ? { sku: input.sku.toUpperCase() } : {}),
        ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.costPrice !== undefined ? { costPrice: new Prisma.Decimal(input.costPrice) } : {}),
        ...(input.sellingPrice !== undefined ? { sellingPrice: new Prisma.Decimal(input.sellingPrice) } : {}),
        ...(input.mrp !== undefined ? { mrp: input.mrp !== null ? new Prisma.Decimal(input.mrp) : null } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.customUnit !== undefined ? { customUnit: input.customUnit } : {}),
        ...(input.taxRate !== undefined ? { taxRate: new Prisma.Decimal(input.taxRate) } : {}),
        ...(input.taxType !== undefined ? { taxType: input.taxType } : {}),
        ...(input.trackInventory !== undefined ? { trackInventory: input.trackInventory } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: true,
        inventories: true,
      },
    });

    if (input.lowStockThreshold !== undefined) {
      await tx.retailerInventory.updateMany({
        where: { retailerBusinessId, productId },
        data: { lowStockThreshold: input.lowStockThreshold },
      });
    }

    await tx.retailerAuditLog.create({
      data: {
        retailerBusinessId,
        actorId: actorId ?? null,
        action: 'UPDATE_PRODUCT',
        entityType: 'PRODUCT',
        entityId: productId,
        before: {
          name: existing.name,
          sellingPrice: existing.sellingPrice.toString(),
          costPrice: existing.costPrice.toString(),
        },
        after: {
          name: updated.name,
          sellingPrice: updated.sellingPrice.toString(),
          costPrice: updated.costPrice.toString(),
        },
      },
    });

    return updated;
  });
}

export async function archiveProduct(
  retailerBusinessId: string,
  productId: string,
  actorId?: string,
) {
  const existing = await prisma.retailerProduct.findFirst({
    where: { id: productId, retailerBusinessId },
  });
  if (!existing) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  }

  await prisma.$transaction(async (tx) => {
    await tx.retailerProduct.update({
      where: { id: productId },
      data: { status: ProductStatus.ARCHIVED },
    });

    await tx.retailerAuditLog.create({
      data: {
        retailerBusinessId,
        actorId: actorId ?? null,
        action: 'ARCHIVE_PRODUCT',
        entityType: 'PRODUCT',
        entityId: productId,
        before: { status: existing.status },
        after: { status: ProductStatus.ARCHIVED },
      },
    });
  });

  return { success: true, message: 'Product archived' };
}

// ==========================================
// VARIANTS
// ==========================================

export async function addVariant(
  retailerBusinessId: string,
  productId: string,
  input: CreateVariantInput,
  actorId?: string,
) {
  const product = await prisma.retailerProduct.findFirst({
    where: { id: productId, retailerBusinessId, status: { not: ProductStatus.ARCHIVED } },
  });

  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  }

  const vSku = input.sku?.trim().toUpperCase() || `${product.sku}-${slugify(input.title).toUpperCase()}`;

  return prisma.$transaction(async (tx) => {
    const variant = await tx.retailerProductVariant.create({
      data: {
        retailerProductId: product.id,
        title: input.title,
        sku: vSku,
        barcode: input.barcode?.trim() || null,
        costPrice: new Prisma.Decimal(input.costPrice ?? product.costPrice),
        sellingPrice: new Prisma.Decimal(input.sellingPrice ?? product.sellingPrice),
        status: VariantStatus.ACTIVE,
      },
    });

    const inventory = await tx.retailerInventory.create({
      data: {
        retailerBusinessId,
        productId: product.id,
        variantId: variant.id,
        quantityAvailable: input.initialStock ?? 0,
        quantityReserved: 0,
        lowStockThreshold: input.lowStockThreshold ?? 5,
      },
    });

    if (input.initialStock && input.initialStock > 0) {
      await tx.retailerInventoryTransaction.create({
        data: {
          retailerBusinessId,
          inventoryId: inventory.id,
          type: RetailerInventoryTransactionType.STOCK_IN,
          quantity: input.initialStock,
          previousQuantity: 0,
          newQuantity: input.initialStock,
          referenceType: 'INITIAL_STOCK',
          reason: 'Initial variant stock',
          performedBy: actorId ?? null,
        },
      });
    }

    await tx.retailerAuditLog.create({
      data: {
        retailerBusinessId,
        actorId: actorId ?? null,
        action: 'CREATE_VARIANT',
        entityType: 'VARIANT',
        entityId: variant.id,
        after: { title: variant.title, sku: variant.sku, initialStock: input.initialStock },
      },
    });

    return variant;
  });
}

export async function updateVariant(
  retailerBusinessId: string,
  productId: string,
  variantId: string,
  input: UpdateVariantInput,
  actorId?: string,
) {
  const product = await prisma.retailerProduct.findFirst({
    where: { id: productId, retailerBusinessId, status: { not: ProductStatus.ARCHIVED } },
  });
  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  }

  const existing = await prisma.retailerProductVariant.findFirst({
    where: { id: variantId, retailerProductId: productId },
  });
  if (!existing) {
    throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
  }

  const updated = await prisma.retailerProductVariant.update({
    where: { id: variantId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.sku !== undefined ? { sku: input.sku.toUpperCase() } : {}),
      ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
      ...(input.costPrice !== undefined ? { costPrice: new Prisma.Decimal(input.costPrice) } : {}),
      ...(input.sellingPrice !== undefined ? { sellingPrice: new Prisma.Decimal(input.sellingPrice) } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  await prisma.retailerAuditLog.create({
    data: {
      retailerBusinessId,
      actorId: actorId ?? null,
      action: 'UPDATE_VARIANT',
      entityType: 'VARIANT',
      entityId: variantId,
      before: { title: existing.title, sku: existing.sku },
      after: { title: updated.title, sku: updated.sku },
    },
  });

  return updated;
}

// ==========================================
// INVENTORY ERP & ADJUSTMENTS
// ==========================================

export async function listInventory(
  retailerBusinessId: string,
  query: { search?: string; status?: string; page?: number; limit?: number },
) {
  const page = query.page && query.page > 0 ? query.page : 1;
  const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 25;
  const skip = (page - 1) * limit;

  const productWhere: Prisma.RetailerProductWhereInput = {
    retailerBusinessId,
    status: { not: ProductStatus.ARCHIVED },
  };

  if (query.search && query.search.trim()) {
    const term = query.search.trim();
    productWhere.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { sku: { contains: term, mode: 'insensitive' } },
      { barcode: { contains: term, mode: 'insensitive' } },
    ];
  }

  const where: Prisma.RetailerInventoryWhereInput = {
    retailerBusinessId,
    product: productWhere,
  };

  if (query.status === 'LOW_STOCK') {
    where.quantityAvailable = { lte: 5, gt: 0 };
  } else if (query.status === 'OUT_OF_STOCK') {
    where.quantityAvailable = { lte: 0 };
  } else if (query.status === 'IN_STOCK') {
    where.quantityAvailable = { gt: 5 };
  }

  const [totalItems, inventories, allInventoriesForKPI] = await Promise.all([
    prisma.retailerInventory.count({ where }),
    prisma.retailerInventory.findMany({
      where,
      skip,
      take: limit,
      orderBy: { quantityAvailable: 'asc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            costPrice: true,
            sellingPrice: true,
            unit: true,
            category: { select: { id: true, name: true } },
          },
        },
        variant: {
          select: {
            id: true,
            title: true,
            sku: true,
            costPrice: true,
            sellingPrice: true,
          },
        },
      },
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

  // Compute KPI metrics across the store
  let totalUnits = 0;
  let totalValuation = new Prisma.Decimal(0);
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const inv of allInventoriesForKPI) {
    totalUnits += inv.quantityAvailable;
    const itemCost = inv.variant?.costPrice ?? inv.product.costPrice;
    if (inv.quantityAvailable > 0) {
      totalValuation = totalValuation.add(itemCost.mul(inv.quantityAvailable));
    }
    if (inv.quantityAvailable <= 0) {
      outOfStockCount++;
    } else if (inv.quantityAvailable <= inv.lowStockThreshold) {
      lowStockCount++;
    }
  }

  const items = inventories.map((inv) => {
    const costPrice = inv.variant?.costPrice ?? inv.product.costPrice;
    const sellingPrice = inv.variant?.sellingPrice ?? inv.product.sellingPrice;
    const valuation = inv.quantityAvailable > 0 ? costPrice.mul(inv.quantityAvailable).toFixed(2) : '0.00';

    let health: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NORMAL' = 'NORMAL';
    if (inv.quantityAvailable <= 0) health = 'OUT_OF_STOCK';
    else if (inv.quantityAvailable <= inv.lowStockThreshold) health = 'LOW_STOCK';

    return {
      id: inv.id,
      productId: inv.productId,
      variantId: inv.variantId,
      productName: inv.product.name,
      variantTitle: inv.variant?.title ?? null,
      sku: inv.variant?.sku ?? inv.product.sku,
      barcode: inv.product.barcode,
      categoryName: inv.product.category?.name ?? 'Uncategorized',
      unit: inv.product.unit,
      costPrice: costPrice.toString(),
      sellingPrice: sellingPrice.toString(),
      quantityAvailable: inv.quantityAvailable,
      quantityReserved: inv.quantityReserved,
      lowStockThreshold: inv.lowStockThreshold,
      valuation,
      health,
    };
  });

  return {
    kpis: {
      totalSkus: allInventoriesForKPI.length,
      totalUnits,
      totalValuation: totalValuation.toFixed(2),
      lowStockCount,
      outOfStockCount,
    },
    items,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
}

export async function getLowStockItems(retailerBusinessId: string) {
  const inventories = await prisma.retailerInventory.findMany({
    where: {
      retailerBusinessId,
      product: { status: { not: ProductStatus.ARCHIVED } },
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          costPrice: true,
          sellingPrice: true,
          category: { select: { id: true, name: true } },
        },
      },
      variant: {
        select: {
          id: true,
          title: true,
          sku: true,
        },
      },
    },
  });

  // Filter column-to-column: quantityAvailable <= lowStockThreshold
  return inventories
    .filter((inv) => inv.quantityAvailable <= inv.lowStockThreshold)
    .map((inv) => ({
      id: inv.id,
      productId: inv.productId,
      productName: inv.product.name,
      variantTitle: inv.variant?.title ?? null,
      sku: inv.variant?.sku ?? inv.product.sku,
      unit: inv.product.unit,
      category: inv.product.category?.name ?? 'General',
      quantityAvailable: inv.quantityAvailable,
      lowStockThreshold: inv.lowStockThreshold,
      isOutOfStock: inv.quantityAvailable <= 0,
    }));
}

export async function adjustStock(
  retailerBusinessId: string,
  input: AdjustStockInput,
  actorId?: string,
) {
  return prisma.$transaction(async (tx) => {
    // 1. Locate the inventory record scoped by retailerBusinessId
    const inventory = await tx.retailerInventory.findFirst({
      where: input.inventoryId
        ? {
            id: input.inventoryId,
            retailerBusinessId,
          }
        : {
            retailerBusinessId,
            productId: input.productId!,
            variantId: input.variantId ?? null,
          },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        variant: { select: { id: true, title: true, sku: true } },
      },
    });

    if (!inventory) {
      throw new AppError(404, 'INVENTORY_NOT_FOUND', 'Inventory record not found in your store');
    }

    const previousQuantity = inventory.quantityAvailable;
    let newQuantity: number;

    const isAddition = input.type === RetailerInventoryTransactionType.STOCK_IN ||
      input.type === RetailerInventoryTransactionType.ADJUSTMENT_IN;

    if (isAddition) {
      newQuantity = previousQuantity + input.quantity;
    } else {
      // Reduction (DAMAGED, EXPIRED, ADJUSTMENT_OUT, TRANSFER)
      newQuantity = previousQuantity - input.quantity;
      if (newQuantity < 0) {
        throw new AppError(
          400,
          'INSUFFICIENT_STOCK',
          `Cannot reduce ${input.quantity} units. Current stock is only ${previousQuantity} units. Negative inventory is not allowed.`,
        );
      }
    }

    // 2. Update inventory balance
    const updatedInventory = await tx.retailerInventory.update({
      where: { id: inventory.id },
      data: { quantityAvailable: newQuantity },
    });

    // 3. Write immutable inventory transaction audit trail
    const transaction = await tx.retailerInventoryTransaction.create({
      data: {
        retailerBusinessId,
        inventoryId: inventory.id,
        type: input.type,
        quantity: input.quantity,
        previousQuantity,
        newQuantity,
        referenceType: input.referenceType ?? 'MANUAL_ADJUSTMENT',
        ...(input.referenceId ? { referenceId: input.referenceId } : {}),
        reason: input.reason,
        performedBy: actorId ?? null,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // 4. Log to RetailerAuditLog
    await tx.retailerAuditLog.create({
      data: {
        retailerBusinessId,
        actorId: actorId ?? null,
        action: 'ADJUST_STOCK',
        entityType: 'INVENTORY',
        entityId: inventory.id,
        before: { quantityAvailable: previousQuantity },
        after: {
          quantityAvailable: newQuantity,
          change: isAddition ? `+${input.quantity}` : `-${input.quantity}`,
          type: input.type,
          reason: input.reason,
        },
      },
    });

    return {
      inventory: updatedInventory,
      transaction,
      itemName: inventory.variant?.title ? `${inventory.product.name} (${inventory.variant.title})` : inventory.product.name,
      sku: inventory.variant?.sku ?? inventory.product.sku,
    };
  });
}

export async function listStockTransactions(
  retailerBusinessId: string,
  query: ListTransactionsQuery,
) {
  const { productId, inventoryId, type, page, limit } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.RetailerInventoryTransactionWhereInput = {
    retailerBusinessId,
  };

  if (inventoryId) {
    where.inventoryId = inventoryId;
  }

  if (type) {
    where.type = type;
  }

  if (productId) {
    where.inventory = {
      productId,
    };
  }

  const [totalItems, transactions] = await Promise.all([
    prisma.retailerInventoryTransaction.count({ where }),
    prisma.retailerInventoryTransaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        inventory: {
          select: {
            id: true,
            productId: true,
            variantId: true,
            product: { select: { id: true, name: true, sku: true, unit: true } },
            variant: { select: { id: true, title: true, sku: true } },
          },
        },
      },
    }),
  ]);

  return {
    items: transactions,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
}
