import crypto from 'node:crypto';
import {
  Prisma,
  RecordStatus,
  RetailerMembershipRole,
  StaffInviteStatus,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../errors/app-error.js';
import {
  InviteStaffInput,
  ListAuditLogsQuery,
  UpdateStaffRoleInput,
} from './retailer-staff.schemas.js';

export class RetailerStaffService {
  /**
   * List all store members with roles and user details
   */
  async listStaffMembers(retailerBusinessId: string) {
    const members = await prisma.retailerMembership.findMany({
      where: {
        retailerBusinessId,
        status: { not: RecordStatus.ARCHIVED },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return members;
  }

  /**
   * List pending staff invitations
   */
  async listPendingInvites(retailerBusinessId: string) {
    const invites = await prisma.retailerStaffInvite.findMany({
      where: {
        retailerBusinessId,
        status: StaffInviteStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      include: {
        inviter: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invites;
  }

  /**
   * Invite a new staff member to the store
   */
  async inviteStaff(
    retailerBusinessId: string,
    input: InviteStaffInput,
    actorId?: string,
  ) {
    const normalizedEmail = input.email.toLowerCase();

    // Check if user is already an active member of this store
    const existingMember = await prisma.retailerMembership.findFirst({
      where: {
        retailerBusinessId,
        status: RecordStatus.ACTIVE,
        user: { email: normalizedEmail },
      },
    });

    if (existingMember) {
      throw new AppError(
        409,
        'ALREADY_MEMBER',
        `User ${input.email} is already an active staff member in your store.`,
      );
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return prisma.$transaction(async (tx) => {
      // Invalidate existing pending invites for this email
      await tx.retailerStaffInvite.deleteMany({
        where: {
          retailerBusinessId,
          email: normalizedEmail,
          status: StaffInviteStatus.PENDING,
        },
      });

      const invite = await tx.retailerStaffInvite.create({
        data: {
          retailerBusinessId,
          email: normalizedEmail,
          phone: input.phone ?? null,
          role: input.role,
          tokenHash,
          invitedBy: actorId ?? null,
          expiresAt,
          status: StaffInviteStatus.PENDING,
        },
      });

      await tx.retailerAuditLog.create({
        data: {
          retailerBusinessId,
          actorId: actorId ?? null,
          action: 'INVITE_STAFF',
          entityType: 'STAFF_INVITE',
          entityId: invite.id,
          after: {
            email: normalizedEmail,
            role: input.role,
          },
        },
      });

      return {
        invite,
        rawToken,
        token: rawToken,
        inviteUrl: `/retailer-staff-accept.html?token=${rawToken}`,
      };
    });
  }

  /**
   * Accept an invitation and bind membership to current authenticated user
   */
  async acceptStaffInvite(rawToken: string, userId: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const invite = await prisma.retailerStaffInvite.findFirst({
      where: {
        tokenHash,
        status: StaffInviteStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
    });

    if (!invite) {
      throw new AppError(
        400,
        'INVALID_OR_EXPIRED_INVITE',
        'Invitation link is invalid, expired, or has already been accepted.',
      );
    }

    return prisma.$transaction(async (tx) => {
      const existing = await tx.retailerMembership.findUnique({
        where: {
          retailerBusinessId_userId: {
            retailerBusinessId: invite.retailerBusinessId,
            userId,
          },
        },
      });

      let membership;
      if (existing) {
        membership = await tx.retailerMembership.update({
          where: { id: existing.id },
          data: {
            role: invite.role,
            status: RecordStatus.ACTIVE,
          },
        });
      } else {
        membership = await tx.retailerMembership.create({
          data: {
            retailerBusinessId: invite.retailerBusinessId,
            userId,
            role: invite.role,
            status: RecordStatus.ACTIVE,
          },
        });
      }

      await tx.retailerStaffInvite.update({
        where: { id: invite.id },
        data: {
          status: StaffInviteStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });

      await tx.retailerAuditLog.create({
        data: {
          retailerBusinessId: invite.retailerBusinessId,
          actorId: userId,
          action: 'ACCEPT_STAFF_INVITE',
          entityType: 'MEMBERSHIP',
          entityId: membership.id,
          after: { role: invite.role },
        },
      });

      return membership;
    });
  }

  /**
   * Update staff role (Strictly protects store OWNER)
   */
  async updateStaffRole(
    retailerBusinessId: string,
    memberId: string,
    input: UpdateStaffRoleInput,
    actorId?: string,
  ) {
    const member = await prisma.retailerMembership.findFirst({
      where: { id: memberId, retailerBusinessId },
    });

    if (!member) {
      throw new AppError(404, 'MEMBER_NOT_FOUND', 'Staff member not found in your store');
    }

    if (member.role === RetailerMembershipRole.OWNER) {
      throw new AppError(
        400,
        'CANNOT_MODIFY_OWNER',
        'The store Owner role is immutable and cannot be changed.',
      );
    }

    const updated = await prisma.retailerMembership.update({
      where: { id: memberId },
      data: { role: input.role },
    });

    await prisma.retailerAuditLog.create({
      data: {
        retailerBusinessId,
        actorId: actorId ?? null,
        action: 'UPDATE_STAFF_ROLE',
        entityType: 'MEMBERSHIP',
        entityId: member.id,
        before: { role: member.role },
        after: { role: input.role },
      },
    });

    return updated;
  }

  /**
   * Deactivate/remove a staff member from the store (Strictly protects OWNER)
   */
  async removeStaffMember(
    retailerBusinessId: string,
    memberId: string,
    actorId?: string,
  ) {
    const member = await prisma.retailerMembership.findFirst({
      where: { id: memberId, retailerBusinessId },
    });

    if (!member) {
      throw new AppError(404, 'MEMBER_NOT_FOUND', 'Staff member not found in your store');
    }

    if (member.role === RetailerMembershipRole.OWNER) {
      throw new AppError(
        400,
        'CANNOT_MODIFY_OWNER',
        'The store Owner cannot be removed from their own business.',
      );
    }

    const removed = await prisma.retailerMembership.update({
      where: { id: memberId },
      data: { status: RecordStatus.INACTIVE },
    });

    await prisma.retailerAuditLog.create({
      data: {
        retailerBusinessId,
        actorId: actorId ?? null,
        action: 'REMOVE_STAFF',
        entityType: 'MEMBERSHIP',
        entityId: member.id,
        before: { status: member.status, role: member.role },
        after: { status: RecordStatus.INACTIVE },
      },
    });

    return removed;
  }

  /**
   * List paginated store audit logs
   */
  async listAuditLogs(retailerBusinessId: string, query: ListAuditLogsQuery) {
    const where: Prisma.RetailerAuditLogWhereInput = {
      retailerBusinessId,
    };

    if (query.action) {
      where.action = query.action;
    }

    if (query.entityType) {
      where.entityType = query.entityType;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const [total, logs] = await Promise.all([
      prisma.retailerAuditLog.count({ where }),
      prisma.retailerAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const retailerStaffService = new RetailerStaffService();
