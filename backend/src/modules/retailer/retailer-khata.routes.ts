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
  createCustomerSchema,
  listCustomersQuerySchema,
  listKhataTransactionsQuerySchema,
  recordKhataAdjustmentSchema,
  recordKhataPaymentSchema,
  updateCustomerSchema,
} from './retailer-khata.schemas.js';
import { retailerKhataService } from './retailer-khata.service.js';

export const retailerKhataRouter = Router();

const khataGuard = [
  requireAuth,
  requireRetailerMembership,
  requireVerifiedRetailer,
  requireActiveSubscription,
];

retailerKhataRouter.use(...khataGuard);

// 1. Create a customer: POST /api/retailer/customers
retailerKhataRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createCustomerSchema.parse(req.body);
    const customer = await retailerKhataService.createCustomer(
      req.retailerAccess!.retailerBusinessId,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res.status(201), customer, 'Customer created successfully');
  }),
);

// 2. List customers with search, status filters & store KPIs: GET /api/retailer/customers
retailerKhataRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listCustomersQuerySchema.parse(req.query);
    const result = await retailerKhataService.listCustomers(
      req.retailerAccess!.retailerBusinessId,
      query,
    );
    return sendSuccess(res, result);
  }),
);

// 3. Get single customer profile & lifetime stats: GET /api/retailer/customers/:id
retailerKhataRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await retailerKhataService.getCustomerById(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
    );
    return sendSuccess(res, result);
  }),
);

// 4. Update customer profile or credit limit: PATCH /api/retailer/customers/:id
retailerKhataRouter.patch(
  '/:id',
  requireRetailerRole(
    RetailerMembershipRole.OWNER,
    RetailerMembershipRole.ADMIN,
    RetailerMembershipRole.MANAGER,
  ),
  asyncHandler(async (req, res) => {
    const input = updateCustomerSchema.parse(req.body);
    const updated = await retailerKhataService.updateCustomer(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res, updated, 'Customer updated successfully');
  }),
);

// 5. Get customer statement ledger transactions: GET /api/retailer/customers/:id/transactions
retailerKhataRouter.get(
  '/:id/transactions',
  asyncHandler(async (req, res) => {
    const query = listKhataTransactionsQuerySchema.parse(req.query);
    const result = await retailerKhataService.listCustomerTransactions(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      query,
    );
    return sendSuccess(res, result);
  }),
);

// 6. Record payment received from customer: POST /api/retailer/customers/:id/payments
retailerKhataRouter.post(
  '/:id/payments',
  asyncHandler(async (req, res) => {
    const input = recordKhataPaymentSchema.parse(req.body);
    const result = await retailerKhataService.recordPayment(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res.status(201), result, 'Payment recorded successfully');
  }),
);

// 7. Record manual ledger adjustment: POST /api/retailer/customers/:id/adjustments
retailerKhataRouter.post(
  '/:id/adjustments',
  requireRetailerRole(
    RetailerMembershipRole.OWNER,
    RetailerMembershipRole.ADMIN,
    RetailerMembershipRole.MANAGER,
  ),
  asyncHandler(async (req, res) => {
    const input = recordKhataAdjustmentSchema.parse(req.body);
    const result = await retailerKhataService.recordAdjustment(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res.status(201), result, 'Adjustment recorded successfully');
  }),
);
