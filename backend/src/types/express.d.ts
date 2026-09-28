import type { RetailerMembershipRole, RoleCode } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; sessionId: string; roles: RoleCode[] };
      retailerAccess?: { retailerBusinessId: string; membershipId: string; role: RetailerMembershipRole };
      requestId?: string;
    }
  }
}

export {};
