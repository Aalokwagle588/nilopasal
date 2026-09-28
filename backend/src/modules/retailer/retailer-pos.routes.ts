import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { sendSuccess } from '../../utils/api-response.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  requireActiveSubscription,
  requireRetailerMembership,
  requireVerifiedRetailer,
} from './retailer.middleware.js';
import {
  createPosSaleSchema,
  listSalesQuerySchema,
  posLookupQuerySchema,
} from './retailer-pos.schemas.js';
import {
  createPosSale,
  getSaleById,
  listSales,
  lookupProducts,
} from './retailer-pos.service.js';

export const retailerPosRouter = Router();

const posRouter = Router();
const salesRouter = Router();

// Base middleware for all POS and sales operations
const posGuard = [
  requireAuth,
  requireRetailerMembership,
  requireVerifiedRetailer,
  requireActiveSubscription,
];

posRouter.use(...posGuard);
salesRouter.use(...posGuard);

// Fast barcode / product lookup for POS counter: GET /api/retailer/pos/lookup
posRouter.get(
  '/lookup',
  asyncHandler(async (req, res) => {
    const { query } = posLookupQuerySchema.parse(req.query);
    const results = await lookupProducts(req.retailerAccess!.retailerBusinessId, query);
    return sendSuccess(res, { items: results });
  }),
);

// Create POS sale / invoice: POST /api/retailer/sales
salesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createPosSaleSchema.parse(req.body);
    const sale = await createPosSale(
      req.retailerAccess!.retailerBusinessId,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res.status(201), sale, 'Sale completed successfully');
  }),
);

// List past sales / invoices: GET /api/retailer/sales
salesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listSalesQuerySchema.parse(req.query);
    const result = await listSales(req.retailerAccess!.retailerBusinessId, query);
    return sendSuccess(res, result);
  }),
);

// Get single sale invoice by ID: GET /api/retailer/sales/:id
salesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const sale = await getSaleById(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
    );
    return sendSuccess(res, sale);
  }),
);

retailerPosRouter.use('/pos', posRouter);
retailerPosRouter.use('/sales', salesRouter);
