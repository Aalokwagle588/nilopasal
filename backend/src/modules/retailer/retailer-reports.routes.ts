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
  productPerformanceQuerySchema,
  reportDateRangeQuerySchema,
} from './retailer-reports.schemas.js';
import { retailerReportsService } from './retailer-reports.service.js';

export const retailerReportsRouter = Router();

const reportsGuard = [
  requireAuth,
  requireRetailerMembership,
  requireVerifiedRetailer,
  requireActiveSubscription,
  requireRetailerRole(
    RetailerMembershipRole.OWNER,
    RetailerMembershipRole.ADMIN,
    RetailerMembershipRole.MANAGER,
  ),
];

retailerReportsRouter.use('/reports', ...reportsGuard);

// 1. GET /api/retailer/reports/overview (P&L, KPI summary, Payments breakdown, Receivables/Payables)
retailerReportsRouter.get(
  '/reports/overview',
  asyncHandler(async (req, res) => {
    const query = reportDateRangeQuerySchema.parse(req.query);
    const result = await retailerReportsService.getFinancialOverview(
      req.retailerAccess!.retailerBusinessId,
      query,
    );
    return sendSuccess(res, result);
  }),
);

// 2. GET /api/retailer/reports/tax (IRD 13% VAT and Tax Exempt breakdown + Invoices register)
retailerReportsRouter.get(
  '/reports/tax',
  asyncHandler(async (req, res) => {
    const query = reportDateRangeQuerySchema.parse(req.query);
    const result = await retailerReportsService.getTaxVatReport(
      req.retailerAccess!.retailerBusinessId,
      query,
    );
    return sendSuccess(res, result);
  }),
);

// 3. GET /api/retailer/reports/products (Top performing products by revenue, units, gross profit)
retailerReportsRouter.get(
  '/reports/products',
  asyncHandler(async (req, res) => {
    const query = productPerformanceQuerySchema.parse(req.query);
    const result = await retailerReportsService.getProductPerformance(
      req.retailerAccess!.retailerBusinessId,
      query,
    );
    return sendSuccess(res, result);
  }),
);
