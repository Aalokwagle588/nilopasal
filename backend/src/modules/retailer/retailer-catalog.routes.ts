import { RetailerMembershipRole } from '@prisma/client';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { sendSuccess } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  requireActiveSubscription,
  requireRetailerMembership,
  requireRetailerRole,
  requireVerifiedRetailer,
} from './retailer.middleware.js';
import {
  adjustStockSchema,
  createCategorySchema,
  createProductSchema,
  createVariantInputSchema,
  listProductsQuerySchema,
  listTransactionsQuerySchema,
  updateCategorySchema,
  updateProductSchema,
  updateVariantSchema,
} from './retailer-catalog.schemas.js';
import {
  addVariant,
  adjustStock,
  archiveProduct,
  createCategory,
  createProduct,
  deleteCategory,
  getCategoryById,
  getLowStockItems,
  getProductById,
  listCategories,
  listInventory,
  listProducts,
  listStockTransactions,
  updateCategory,
  updateProduct,
  updateVariant,
} from './retailer-catalog.service.js';

export const retailerCatalogRouter = Router();

const categoryRouter = Router();
const productRouter = Router();
const inventoryRouter = Router();

// Base middleware for all catalog and inventory operations
const erpGuard = [
  requireAuth,
  requireRetailerMembership,
  requireVerifiedRetailer,
  requireActiveSubscription,
];

categoryRouter.use(...erpGuard);
productRouter.use(...erpGuard);
inventoryRouter.use(...erpGuard);

// Allowed roles for inventory and catalog mutations
const CATALOG_MANAGERS = [
  RetailerMembershipRole.OWNER,
  RetailerMembershipRole.ADMIN,
  RetailerMembershipRole.MANAGER,
  RetailerMembershipRole.INVENTORY_MANAGER,
];

const SENIOR_MANAGERS = [
  RetailerMembershipRole.OWNER,
  RetailerMembershipRole.ADMIN,
  RetailerMembershipRole.MANAGER,
];

// ==========================================
// CATEGORIES
// ==========================================

categoryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const categories = await listCategories(req.retailerAccess!.retailerBusinessId);
    return sendSuccess(res, { categories });
  }),
);

categoryRouter.post(
  '/',
  requireRetailerRole(...CATALOG_MANAGERS),
  asyncHandler(async (req, res) => {
    const input = createCategorySchema.parse(req.body);
    const category = await createCategory(
      req.retailerAccess!.retailerBusinessId,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res.status(201), category, 'Category created');
  }),
);

categoryRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const category = await getCategoryById(req.retailerAccess!.retailerBusinessId, req.params.id as string);
    return sendSuccess(res, category);
  }),
);

categoryRouter.patch(
  '/:id',
  requireRetailerRole(...CATALOG_MANAGERS),
  asyncHandler(async (req, res) => {
    const input = updateCategorySchema.parse(req.body);
    const updated = await updateCategory(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res, updated, 'Category updated');
  }),
);

categoryRouter.delete(
  '/:id',
  requireRetailerRole(...SENIOR_MANAGERS),
  asyncHandler(async (req, res) => {
    const result = await deleteCategory(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      req.auth?.userId,
    );
    return sendSuccess(res, result, 'Category deleted');
  }),
);

// ==========================================
// PRODUCTS
// ==========================================

productRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listProductsQuerySchema.parse(req.query);
    const result = await listProducts(req.retailerAccess!.retailerBusinessId, query);
    return sendSuccess(res, result);
  }),
);

productRouter.post(
  '/',
  requireRetailerRole(...CATALOG_MANAGERS),
  asyncHandler(async (req, res) => {
    const input = createProductSchema.parse(req.body);
    const product = await createProduct(
      req.retailerAccess!.retailerBusinessId,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res.status(201), product, 'Product created successfully');
  }),
);

productRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await getProductById(req.retailerAccess!.retailerBusinessId, req.params.id as string);
    return sendSuccess(res, product);
  }),
);

productRouter.patch(
  '/:id',
  requireRetailerRole(...CATALOG_MANAGERS),
  asyncHandler(async (req, res) => {
    const input = updateProductSchema.parse(req.body);
    const updated = await updateProduct(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res, updated, 'Product updated successfully');
  }),
);

productRouter.delete(
  '/:id',
  requireRetailerRole(...SENIOR_MANAGERS),
  asyncHandler(async (req, res) => {
    const result = await archiveProduct(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      req.auth?.userId,
    );
    return sendSuccess(res, result, 'Product archived');
  }),
);

productRouter.post(
  '/:id/variants',
  requireRetailerRole(...CATALOG_MANAGERS),
  asyncHandler(async (req, res) => {
    const input = createVariantInputSchema.parse(req.body);
    const variant = await addVariant(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res.status(201), variant, 'Product variant created');
  }),
);

productRouter.patch(
  '/:id/variants/:variantId',
  requireRetailerRole(...CATALOG_MANAGERS),
  asyncHandler(async (req, res) => {
    const input = updateVariantSchema.parse(req.body);
    const variant = await updateVariant(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      req.params.variantId as string,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res, variant, 'Product variant updated');
  }),
);

// ==========================================
// INVENTORY & STOCK ADJUSTMENTS
// ==========================================

inventoryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const data = await listInventory(req.retailerAccess!.retailerBusinessId, {
      ...(search !== undefined ? { search } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(page !== undefined ? { page } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    return sendSuccess(res, data);
  }),
);

inventoryRouter.get(
  '/low-stock',
  asyncHandler(async (req, res) => {
    const items = await getLowStockItems(req.retailerAccess!.retailerBusinessId);
    return sendSuccess(res, { items, count: items.length });
  }),
);

inventoryRouter.post(
  '/adjust',
  requireRetailerRole(...CATALOG_MANAGERS),
  asyncHandler(async (req, res) => {
    const input = adjustStockSchema.parse(req.body);
    const result = await adjustStock(
      req.retailerAccess!.retailerBusinessId,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res, result, 'Stock adjusted successfully');
  }),
);

inventoryRouter.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const query = listTransactionsQuerySchema.parse(req.query);
    const result = await listStockTransactions(req.retailerAccess!.retailerBusinessId, query);
    return sendSuccess(res, result);
  }),
);

// Mount scoped routers
retailerCatalogRouter.use('/categories', categoryRouter);
retailerCatalogRouter.use('/products', productRouter);
retailerCatalogRouter.use('/inventory', inventoryRouter);
