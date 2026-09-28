import { Router } from 'express';
import { RetailerMembershipRole } from '@prisma/client';
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
  createPurchaseSchema,
  createSupplierSchema,
  listPurchasesQuerySchema,
  listSuppliersQuerySchema,
  listSupplierTransactionsQuerySchema,
  recordSupplierPaymentSchema,
  updateSupplierSchema,
} from './retailer-purchases.schemas.js';
import { retailerPurchasesService } from './retailer-purchases.service.js';

export const retailerPurchasesRouter = Router();

const suppliersRouter = Router();
const purchasesRouter = Router();

const purchaseGuard = [
  requireAuth,
  requireRetailerMembership,
  requireVerifiedRetailer,
  requireActiveSubscription,
];

suppliersRouter.use(...purchaseGuard);
purchasesRouter.use(...purchaseGuard);

const managerRoles = [
  RetailerMembershipRole.OWNER,
  RetailerMembershipRole.ADMIN,
  RetailerMembershipRole.MANAGER,
];

// ==================== SUPPLIER ROUTES ====================

// 1. Create Supplier: POST /api/retailer/suppliers
suppliersRouter.post(
  '/',
  requireRetailerRole(...managerRoles),
  asyncHandler(async (req, res) => {
    const input = createSupplierSchema.parse(req.body);
    const supplier = await retailerPurchasesService.createSupplier(
      req.retailerAccess!.retailerBusinessId,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res.status(201), supplier, 'Supplier created successfully');
  }),
);

// 2. List Suppliers: GET /api/retailer/suppliers
suppliersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listSuppliersQuerySchema.parse(req.query);
    const result = await retailerPurchasesService.listSuppliers(
      req.retailerAccess!.retailerBusinessId,
      query,
    );
    return sendSuccess(res, result);
  }),
);

// 3. Get Supplier by ID: GET /api/retailer/suppliers/:id
suppliersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await retailerPurchasesService.getSupplierById(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
    );
    return sendSuccess(res, result);
  }),
);

// 4. Update Supplier: PATCH /api/retailer/suppliers/:id
suppliersRouter.patch(
  '/:id',
  requireRetailerRole(...managerRoles),
  asyncHandler(async (req, res) => {
    const input = updateSupplierSchema.parse(req.body);
    const updated = await retailerPurchasesService.updateSupplier(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res, updated, 'Supplier updated successfully');
  }),
);

// 5. Get Supplier Ledger: GET /api/retailer/suppliers/:id/transactions
suppliersRouter.get(
  '/:id/transactions',
  asyncHandler(async (req, res) => {
    const query = listSupplierTransactionsQuerySchema.parse(req.query);
    const result = await retailerPurchasesService.listSupplierTransactions(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      query,
    );
    return sendSuccess(res, result);
  }),
);

// 6. Record Payment to Supplier: POST /api/retailer/suppliers/:id/payments
suppliersRouter.post(
  '/:id/payments',
  requireRetailerRole(...managerRoles),
  asyncHandler(async (req, res) => {
    const input = recordSupplierPaymentSchema.parse(req.body);
    const result = await retailerPurchasesService.recordSupplierPayment(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res.status(201), result, 'Payment to supplier recorded');
  }),
);

// ==================== PURCHASES ROUTES ====================

// 7. Create Purchase Order: POST /api/retailer/purchases
purchasesRouter.post(
  '/',
  requireRetailerRole(...managerRoles),
  asyncHandler(async (req, res) => {
    const input = createPurchaseSchema.parse(req.body);
    const purchase = await retailerPurchasesService.createPurchase(
      req.retailerAccess!.retailerBusinessId,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res.status(201), purchase, 'Purchase order created successfully');
  }),
);

// 8. List Purchases: GET /api/retailer/purchases
purchasesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listPurchasesQuerySchema.parse(req.query);
    const result = await retailerPurchasesService.listPurchases(
      req.retailerAccess!.retailerBusinessId,
      query,
    );
    return sendSuccess(res, result);
  }),
);

// 9. Get Purchase by ID: GET /api/retailer/purchases/:id
purchasesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const purchase = await retailerPurchasesService.getPurchaseById(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
    );
    return sendSuccess(res, purchase);
  }),
);

// 10. Receive Goods for Purchase: POST /api/retailer/purchases/:id/receive
purchasesRouter.post(
  '/:id/receive',
  requireRetailerRole(...managerRoles),
  asyncHandler(async (req, res) => {
    const purchase = await retailerPurchasesService.receivePurchase(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      req.auth?.userId,
    );
    return sendSuccess(res, purchase, 'Purchase order marked as received and inventory updated');
  }),
);

// Mount sub-routers
retailerPurchasesRouter.use('/suppliers', suppliersRouter);
retailerPurchasesRouter.use('/purchases', purchasesRouter);
