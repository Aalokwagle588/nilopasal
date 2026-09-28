import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import {
  RecordStatus,
  RetailerMembershipRole,
  StaffInviteStatus,
} from '@prisma/client';

const app = createApp();

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

function extractCookie(res: request.Response, cookieName = 'nilopasal_session'): string | undefined {
  const headers = res.headers['set-cookie'];
  if (!headers) return undefined;
  const list = Array.isArray(headers) ? headers : [headers];
  const found = list.find((c) => c.startsWith(`${cookieName}=`));
  if (!found) return undefined;
  return found.split(';')[0];
}

async function createActiveRetailer(suffix: string) {
  const phone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const email = `retailer-r6-${suffix}@example.com`;

  const reg = await request(app)
    .post('/api/retailer/register')
    .send({
      owner: {
        firstName: 'Owner',
        lastName: suffix,
        phone,
        email,
        password: 'Password123!',
      },
      business: {
        businessName: `Store Staff ERP ${suffix}`,
        panNumber: '600334455',
        vatNumber: '600334455',
        province: 'Bagmati',
        district: 'Kathmandu',
        municipality: 'Kathmandu Metro',
        addressLine: 'Baneshwor, Kathmandu',
        contactNumber: phone,
      },
    });

  if (reg.status !== 201) {
    throw new Error(`Failed to register retailer: ${JSON.stringify(reg.body)}`);
  }

  const cookie = extractCookie(reg);
  const businessId = reg.body.data.retailer.id;
  const ownerUserId = reg.body.data.user.id;

  // Set business as VERIFIED
  await prisma.retailerBusiness.update({
    where: { id: businessId },
    data: { verificationStatus: 'VERIFIED', verifiedAt: new Date() },
  });

  // Start trial to unlock ERP
  const trialRes = await request(app)
    .post('/api/retailer/subscription/start-trial')
    .set('Cookie', cookie!)
    .send({ planSlug: 'retailer-starter-trial' });

  if (trialRes.status !== 200) {
    throw new Error(`Failed to start trial: ${JSON.stringify(trialRes.body)}`);
  }

  return { cookie: cookie!, businessId, ownerUserId, email, phone };
}

describe('Nilopasal Phase R6 — Staff Multi-Role RBAC & Audit Trails', () => {
  it('1. Owner invites a staff member and generates an invite token with 7-day expiration', async () => {
    const id = uniqueId();
    const { cookie, businessId } = await createActiveRetailer(id);
    const inviteEmail = `cashier-invite-${id}@example.com`;

    const res = await request(app)
      .post('/api/retailer/staff/invite')
      .set('Cookie', cookie)
      .send({
        email: inviteEmail,
        role: RetailerMembershipRole.CASHIER,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.invite.email).toBe(inviteEmail);
    expect(res.body.data.invite.role).toBe(RetailerMembershipRole.CASHIER);
    expect(res.body.data.rawToken).toBeDefined();

    // Verify database record
    const dbInvite = await prisma.retailerStaffInvite.findUnique({
      where: { id: res.body.data.invite.id },
    });
    expect(dbInvite).not.toBeNull();
    expect(dbInvite!.status).toBe(StaffInviteStatus.PENDING);
    expect(dbInvite!.retailerBusinessId).toBe(businessId);
  });

  it('2. Invited user accepts token and gains store membership with assigned role', async () => {
    const id = uniqueId();
    const { cookie, businessId } = await createActiveRetailer(id);
    const inviteEmail = `accept-staff-${id}@example.com`;

    // 1. Owner invites staff as MANAGER
    const inviteRes = await request(app)
      .post('/api/retailer/staff/invite')
      .set('Cookie', cookie)
      .send({
        email: inviteEmail,
        role: RetailerMembershipRole.MANAGER,
      });
    const rawToken = inviteRes.body.data.rawToken;

    // 2. User signs up
    const newStaffPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        firstName: 'Subash',
        lastName: 'Rana',
        phone: newStaffPhone,
        email: inviteEmail,
        password: 'Password123!',
      });
    const staffCookie = extractCookie(signupRes);
    const staffUserId = signupRes.body.data.user.id;

    // 3. User accepts invite
    const acceptRes = await request(app)
      .post('/api/retailer/staff/invites/accept')
      .set('Cookie', staffCookie!)
      .send({ token: rawToken });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.retailerBusinessId).toBe(businessId);
    expect(acceptRes.body.data.role).toBe(RetailerMembershipRole.MANAGER);

    // 4. Verify membership in database
    const membership = await prisma.retailerMembership.findUnique({
      where: {
        retailerBusinessId_userId: {
          retailerBusinessId: businessId,
          userId: staffUserId,
        },
      },
    });
    expect(membership).not.toBeNull();
    expect(membership!.role).toBe(RetailerMembershipRole.MANAGER);
    expect(membership!.status).toBe(RecordStatus.ACTIVE);
  });

  it('3. strictly protects the store OWNER from role changes or member removal', async () => {
    const id = uniqueId();
    const { cookie, businessId, ownerUserId } = await createActiveRetailer(id);

    // Find Owner's membership ID
    const ownerMember = await prisma.retailerMembership.findUnique({
      where: {
        retailerBusinessId_userId: {
          retailerBusinessId: businessId,
          userId: ownerUserId,
        },
      },
    });
    expect(ownerMember).not.toBeNull();

    // Attempt to demote Owner to CASHIER
    const patchRes = await request(app)
      .patch(`/api/retailer/staff/members/${ownerMember!.id}/role`)
      .set('Cookie', cookie)
      .send({ role: RetailerMembershipRole.CASHIER });

    expect(patchRes.status).toBe(400);
    expect(patchRes.body.error.code).toBe('CANNOT_MODIFY_OWNER');

    // Attempt to delete / remove Owner
    const deleteRes = await request(app)
      .delete(`/api/retailer/staff/members/${ownerMember!.id}`)
      .set('Cookie', cookie);

    expect(deleteRes.status).toBe(400);
    expect(deleteRes.body.error.code).toBe('CANNOT_MODIFY_OWNER');
  });

  it('4. updates staff role and writes an audit log record', async () => {
    const id = uniqueId();
    const { cookie, businessId } = await createActiveRetailer(id);

    // Create staff member as CASHIER
    const staffPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        firstName: 'Staff',
        lastName: 'Member',
        phone: staffPhone,
        email: `staff-role-${id}@example.com`,
        password: 'Password123!',
      });
    const staffUserId = signupRes.body.data.user.id;

    const member = await prisma.retailerMembership.create({
      data: {
        retailerBusinessId: businessId,
        userId: staffUserId,
        role: RetailerMembershipRole.CASHIER,
      },
    });

    // Update role to INVENTORY_MANAGER
    const updateRes = await request(app)
      .patch(`/api/retailer/staff/members/${member.id}/role`)
      .set('Cookie', cookie)
      .send({ role: RetailerMembershipRole.INVENTORY_MANAGER });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.role).toBe(RetailerMembershipRole.INVENTORY_MANAGER);

    // Verify audit log
    const audit = await prisma.retailerAuditLog.findFirst({
      where: {
        retailerBusinessId: businessId,
        action: 'UPDATE_STAFF_ROLE',
        entityId: member.id,
      },
    });
    expect(audit).not.toBeNull();
  });

  it('5. deactivates staff member upon removal', async () => {
    const id = uniqueId();
    const { cookie, businessId } = await createActiveRetailer(id);

    const staffPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        firstName: 'Temp',
        lastName: 'Worker',
        phone: staffPhone,
        email: `temp-staff-${id}@example.com`,
        password: 'Password123!',
      });

    const member = await prisma.retailerMembership.create({
      data: {
        retailerBusinessId: businessId,
        userId: signupRes.body.data.user.id,
        role: RetailerMembershipRole.CASHIER,
      },
    });

    const deleteRes = await request(app)
      .delete(`/api/retailer/staff/members/${member.id}`)
      .set('Cookie', cookie);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.status).toBe(RecordStatus.INACTIVE);
  });

  it('6. restricts CASHIER role from managing staff or viewing administrative audit logs', async () => {
    const id = uniqueId();
    const { businessId } = await createActiveRetailer(id);

    const cashierPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        firstName: 'Cashier',
        lastName: 'Only',
        phone: cashierPhone,
        email: `cashier-restricted-${id}@example.com`,
        password: 'Password123!',
      });
    const cashierCookie = extractCookie(signupRes);

    await prisma.retailerMembership.create({
      data: {
        retailerBusinessId: businessId,
        userId: signupRes.body.data.user.id,
        role: RetailerMembershipRole.CASHIER,
      },
    });

    // Cashier cannot invite staff
    const inviteRes = await request(app)
      .post('/api/retailer/staff/invite')
      .set('Cookie', cashierCookie!)
      .send({
        email: 'anyone@example.com',
        role: RetailerMembershipRole.CASHIER,
      });
    expect(inviteRes.status).toBe(403);
    expect(inviteRes.body.error.code).toBe('RETAILER_FORBIDDEN');

    // Cashier cannot view audit logs
    const auditRes = await request(app)
      .get('/api/retailer/staff/audit-logs')
      .set('Cookie', cashierCookie!);
    expect(auditRes.status).toBe(403);
    expect(auditRes.body.error.code).toBe('RETAILER_FORBIDDEN');
  });

  it('7. lists store audit logs with actor and pagination', async () => {
    const id = uniqueId();
    const { cookie, businessId } = await createActiveRetailer(id);

    // Trigger an audited action (create product)
    await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Audited Product Test',
      sku: `AUDIT-PROD-${id}`,
      costPrice: 50,
      sellingPrice: 75,
      initialStock: 10,
    });

    // Query audit logs
    const logsRes = await request(app)
      .get('/api/retailer/staff/audit-logs')
      .set('Cookie', cookie);

    expect(logsRes.status).toBe(200);
    expect(logsRes.body.data.logs.length).toBeGreaterThanOrEqual(1);
    expect(logsRes.body.data.logs[0]!.actor).toBeDefined();
    expect(logsRes.body.data.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('8. strictly isolates staff and audit logs between retailer stores (multi-tenant boundary)', async () => {
    const idA = uniqueId();
    const idB = uniqueId();
    const retailerA = await createActiveRetailer(idA);
    const retailerB = await createActiveRetailer(idB);

    // Store A staff list does not show Store B members
    const listRes = await request(app)
      .get('/api/retailer/staff/members')
      .set('Cookie', retailerA.cookie);
    expect(listRes.body.data.members.length).toBe(1); // Only Store A owner

    // Store B tries to view Store A's audit logs -> isolated by retailer business ID
    const auditB = await request(app)
      .get('/api/retailer/staff/audit-logs')
      .set('Cookie', retailerB.cookie);
    for (const log of auditB.body.data.logs) {
      expect(log.retailerBusinessId).toBe(retailerB.businessId);
      expect(log.retailerBusinessId).not.toBe(retailerA.businessId);
    }
  });
});
