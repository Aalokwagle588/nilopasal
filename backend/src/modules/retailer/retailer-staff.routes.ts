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
  acceptStaffInviteSchema,
  inviteStaffSchema,
  listAuditLogsQuerySchema,
  updateStaffRoleSchema,
} from './retailer-staff.schemas.js';
import { retailerStaffService } from './retailer-staff.service.js';

export const retailerStaffRouter = Router();

const staffGuard = [
  requireAuth,
  requireRetailerMembership,
  requireVerifiedRetailer,
  requireActiveSubscription,
];

// 1. Accept Staff Invite (Any authenticated user with a valid invite token)
retailerStaffRouter.post(
  '/staff/invites/accept',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { token } = acceptStaffInviteSchema.parse(req.body);
    const membership = await retailerStaffService.acceptStaffInvite(
      token,
      req.auth!.userId,
    );
    return sendSuccess(res, membership, 'Staff invitation accepted successfully');
  }),
);

// Scoped sub-router for store staff management
const storeStaffRouter = Router();
storeStaffRouter.use(...staffGuard);

// 2. List Store Staff Members: GET /api/retailer/staff/members
storeStaffRouter.get(
  '/members',
  asyncHandler(async (req, res) => {
    const members = await retailerStaffService.listStaffMembers(
      req.retailerAccess!.retailerBusinessId,
    );
    return sendSuccess(res, { members });
  }),
);

// 3. List Pending Invites: GET /api/retailer/staff/invites
storeStaffRouter.get(
  '/invites',
  requireRetailerRole(RetailerMembershipRole.OWNER, RetailerMembershipRole.ADMIN),
  asyncHandler(async (req, res) => {
    const invites = await retailerStaffService.listPendingInvites(
      req.retailerAccess!.retailerBusinessId,
    );
    return sendSuccess(res, { invites });
  }),
);

// 4. Invite New Staff: POST /api/retailer/staff/invite
storeStaffRouter.post(
  '/invite',
  requireRetailerRole(RetailerMembershipRole.OWNER, RetailerMembershipRole.ADMIN),
  asyncHandler(async (req, res) => {
    const input = inviteStaffSchema.parse(req.body);
    const result = await retailerStaffService.inviteStaff(
      req.retailerAccess!.retailerBusinessId,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res.status(201), result, 'Staff member invited successfully');
  }),
);

// 5. Update Staff Role: PATCH /api/retailer/staff/members/:id/role
storeStaffRouter.patch(
  '/members/:id/role',
  requireRetailerRole(RetailerMembershipRole.OWNER, RetailerMembershipRole.ADMIN),
  asyncHandler(async (req, res) => {
    const input = updateStaffRoleSchema.parse(req.body);
    const updated = await retailerStaffService.updateStaffRole(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      input,
      req.auth?.userId,
    );
    return sendSuccess(res, updated, 'Staff role updated successfully');
  }),
);

// 6. Remove Staff Member: DELETE /api/retailer/staff/members/:id
storeStaffRouter.delete(
  '/members/:id',
  requireRetailerRole(RetailerMembershipRole.OWNER, RetailerMembershipRole.ADMIN),
  asyncHandler(async (req, res) => {
    const removed = await retailerStaffService.removeStaffMember(
      req.retailerAccess!.retailerBusinessId,
      req.params.id as string,
      req.auth?.userId,
    );
    return sendSuccess(res, removed, 'Staff member removed successfully');
  }),
);

// 7. Store Audit Trail: GET /api/retailer/staff/audit-logs
storeStaffRouter.get(
  '/audit-logs',
  requireRetailerRole(
    RetailerMembershipRole.OWNER,
    RetailerMembershipRole.ADMIN,
    RetailerMembershipRole.MANAGER,
  ),
  asyncHandler(async (req, res) => {
    const query = listAuditLogsQuerySchema.parse(req.query);
    const result = await retailerStaffService.listAuditLogs(
      req.retailerAccess!.retailerBusinessId,
      query,
    );
    return sendSuccess(res, result);
  }),
);

retailerStaffRouter.use('/staff', storeStaffRouter);
