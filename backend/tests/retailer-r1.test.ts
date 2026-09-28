import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';

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

describe('Nilopasal Phase R1 — Access Foundation & ERP Gate', () => {
  it('1. customer signup still works and creates a customer account', async () => {
    const id = uniqueId();
    const res = await request(app)
      .post('/api/auth/signup')
      .send({
        firstName: 'Customer',
        lastName: 'Buyer',
        email: `customer-${id}@example.com`,
        phone: `984100${Math.floor(1000 + Math.random() * 9000)}`,
        password: 'Password123!',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(`customer-${id}@example.com`);
    expect(res.body.data.user.roles).toContain('CUSTOMER');
    expect(res.body.data.user.roles).not.toContain('RETAILER');

    const cookie = extractCookie(res);
    expect(cookie).toBeDefined();

    // Verify /api/auth/me shows NO_RETAILER access
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie!);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.retailer.access.allowed).toBe(false);
    expect(meRes.body.data.retailer.access.reason).toBe('NO_RETAILER');
    expect(meRes.body.data.retailer.access.nextAction).toBe('REGISTER');
  });

  it('2. retailer signup works for unauthenticated new user', async () => {
    const id = uniqueId();
    const phone = `984200${Math.floor(1000 + Math.random() * 9000)}`;
    const email = `retailer-${id}@example.com`;

    const res = await request(app)
      .post('/api/retailer/register')
      .send({
        owner: {
          firstName: 'Hari',
          lastName: 'Shrestha',
          phone,
          email,
          password: 'RetailerPassword123!',
        },
        business: {
          businessName: `Everest Kirana Pasal ${id}`,
          legalName: 'Everest Kirana Pvt. Ltd.',
          panNumber: '123456789',
          vatNumber: '',
          province: 'Bagmati',
          district: 'Kathmandu',
          municipality: 'Kathmandu Metro',
          ward: '10',
          addressLine: 'New Baneshwor, Shankhamul Marg',
          landmark: 'Opposite Bakery Cafe',
          contactNumber: phone,
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.roles).toContain('RETAILER');
    expect(res.body.data.user.roles).toContain('CUSTOMER');

    // Verify session cookie was set
    const cookie = extractCookie(res);
    expect(cookie).toBeDefined();

    // Check retailer business summary in response
    const { retailer } = res.body.data;
    expect(retailer.businessName).toBe(`Everest Kirana Pasal ${id}`);
    expect(retailer.verificationStatus).toBe('SUBMITTED');
    expect(retailer.subscriptionStatus).toBe('NONE');
    expect(retailer.memberships.length).toBe(1);
    expect(retailer.memberships[0].role).toBe('OWNER');
  });

  it('3. duplicate business registration by the same owner account is prevented', async () => {
    const id = uniqueId();
    const phone = `984300${Math.floor(1000 + Math.random() * 9000)}`;
    const email = `owner-dup-${id}@example.com`;

    const first = await request(app)
      .post('/api/retailer/register')
      .send({
        owner: {
          firstName: 'Sita',
          lastName: 'Pradhan',
          phone,
          email,
          password: 'Password123!',
        },
        business: {
          businessName: `Store One ${id}`,
          province: 'Bagmati',
          district: 'Lalitpur',
          municipality: 'Patan',
          addressLine: 'Kumaripati',
          contactNumber: phone,
        },
      });

    expect(first.status).toBe(201);
    const cookie = extractCookie(first);

    // Attempt second registration with the same logged in user
    const second = await request(app)
      .post('/api/retailer/register')
      .set('Cookie', cookie!)
      .send({
        business: {
          businessName: `Store Two ${id}`,
          province: 'Bagmati',
          district: 'Lalitpur',
          municipality: 'Patan',
          addressLine: 'Pulchowk',
          contactNumber: phone,
        },
      });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('RETAILER_EXISTS');
  });

  it('4. existing customer can register a retailer business with their account', async () => {
    const id = uniqueId();
    const phone = `984400${Math.floor(1000 + Math.random() * 9000)}`;
    const email = `existing-cust-${id}@example.com`;

    // 1. Sign up as normal customer
    const custRes = await request(app)
      .post('/api/auth/signup')
      .send({
        firstName: 'Anup',
        lastName: 'Sharma',
        email,
        phone,
        password: 'Password123!',
      });

    expect(custRes.status).toBe(201);
    const cookie = extractCookie(custRes);

    // 2. Register retailer business while signed in (no owner details passed)
    const registerRes = await request(app)
      .post('/api/retailer/register')
      .set('Cookie', cookie!)
      .send({
        business: {
          businessName: `Sharma Provisions ${id}`,
          panNumber: '601234567',
          province: 'Gandaki',
          district: 'Kaski',
          municipality: 'Pokhara',
          addressLine: 'Lakeside Street 3',
          contactNumber: phone,
        },
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.user.roles).toContain('RETAILER');
    expect(registerRes.body.data.retailer.businessName).toBe(`Sharma Provisions ${id}`);

    // Verify /api/retailer/me shows the new business
    const meRes = await request(app)
      .get('/api/retailer/me')
      .set('Cookie', cookie!);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.business.businessName).toBe(`Sharma Provisions ${id}`);
    expect(meRes.body.data.membership.role).toBe('OWNER');
    expect(meRes.body.data.access.reason).toBe('VERIFICATION_REQUIRED');
  });

  it('5. login works and returns retailer context in /api/auth/me', async () => {
    const id = uniqueId();
    const phone = `984500${Math.floor(1000 + Math.random() * 9000)}`;
    const email = `login-test-${id}@example.com`;

    await request(app)
      .post('/api/retailer/register')
      .send({
        owner: {
          firstName: 'Bikash',
          lastName: 'Tamang',
          phone,
          email,
          password: 'Password123!',
        },
        business: {
          businessName: `Tamang Mart ${id}`,
          province: 'Bagmati',
          district: 'Kathmandu',
          municipality: 'Boudha',
          addressLine: 'Boudha Main Road',
          contactNumber: phone,
        },
      });

    // Login via standard POST /api/auth/login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email,
        password: 'Password123!',
      });

    expect(loginRes.status).toBe(200);
    const loginCookie = extractCookie(loginRes);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', loginCookie!);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe(email);
    expect(meRes.body.data.retailer.business.businessName).toBe(`Tamang Mart ${id}`);
    expect(meRes.body.data.retailer.membership.role).toBe('OWNER');
  });

  it('6. unauthenticated access to retailer ERP dashboard is blocked (401)', async () => {
    const res = await request(app).get('/api/retailer/dashboard');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('7. customer without retailer membership is blocked from ERP dashboard (403)', async () => {
    const id = uniqueId();
    const custRes = await request(app)
      .post('/api/auth/signup')
      .send({
        firstName: 'Pure',
        lastName: 'Customer',
        email: `pure-cust-${id}@example.com`,
        password: 'Password123!',
      });

    const cookie = extractCookie(custRes);
    const res = await request(app)
      .get('/api/retailer/dashboard')
      .set('Cookie', cookie!);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NO_RETAILER_MEMBERSHIP');
  });

  it('8. unverified retailer is gated from ERP dashboard (403)', async () => {
    const id = uniqueId();
    const phone = `984600${Math.floor(1000 + Math.random() * 9000)}`;

    const reg = await request(app)
      .post('/api/retailer/register')
      .send({
        owner: {
          firstName: 'Unverified',
          lastName: 'Shop',
          phone,
          email: `unverified-${id}@example.com`,
          password: 'Password123!',
        },
        business: {
          businessName: `Pending Shop ${id}`,
          province: 'Bagmati',
          district: 'Kathmandu',
          municipality: 'Kathmandu',
          addressLine: 'Koteshwor',
          contactNumber: phone,
        },
      });

    const cookie = extractCookie(reg);

    const res = await request(app)
      .get('/api/retailer/dashboard')
      .set('Cookie', cookie!);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('RETAILER_VERIFICATION_REQUIRED');
  });

  it('9. verified retailer without subscription is gated from ERP dashboard (402)', async () => {
    const id = uniqueId();
    const phone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;

    const reg = await request(app)
      .post('/api/retailer/register')
      .send({
        owner: {
          firstName: 'Verified',
          lastName: 'NoSub',
          phone,
          email: `nosub-${id}@example.com`,
          password: 'Password123!',
        },
        business: {
          businessName: `NoSub Shop ${id}`,
          province: 'Bagmati',
          district: 'Kathmandu',
          municipality: 'Kathmandu',
          addressLine: 'Thamel',
          contactNumber: phone,
        },
      });

    const cookie = extractCookie(reg);
    const businessId = reg.body.data.retailer.id;

    // Admin verifies retailer
    await prisma.retailerBusiness.update({
      where: { id: businessId },
      data: { verificationStatus: 'VERIFIED', verifiedAt: new Date() },
    });

    const res = await request(app)
      .get('/api/retailer/dashboard')
      .set('Cookie', cookie!);

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('RETAILER_SUBSCRIPTION_REQUIRED');
  });

  it('10. verified retailer can start 14-day free trial and unlock ERP dashboard', async () => {
    const id = uniqueId();
    const phone = `984800${Math.floor(1000 + Math.random() * 9000)}`;

    const reg = await request(app)
      .post('/api/retailer/register')
      .send({
        owner: {
          firstName: 'Trial',
          lastName: 'User',
          phone,
          email: `trial-${id}@example.com`,
          password: 'Password123!',
        },
        business: {
          businessName: `Trial Store ${id}`,
          province: 'Bagmati',
          district: 'Lalitpur',
          municipality: 'Lalitpur',
          addressLine: 'Jawalakhel',
          contactNumber: phone,
        },
      });

    const cookie = extractCookie(reg);
    const businessId = reg.body.data.retailer.id;

    // Admin verifies retailer
    await prisma.retailerBusiness.update({
      where: { id: businessId },
      data: { verificationStatus: 'VERIFIED', verifiedAt: new Date() },
    });

    // Start trial via API
    const trialRes = await request(app)
      .post('/api/retailer/subscription/start-trial')
      .set('Cookie', cookie!)
      .send({ planSlug: 'retailer-starter-trial' });

    expect(trialRes.status).toBe(200);
    expect(trialRes.body.data.subscription.status).toBe('TRIAL');

    // Access dashboard: now unlocked with real empty operational metrics!
    const dashRes = await request(app)
      .get('/api/retailer/dashboard')
      .set('Cookie', cookie!);

    expect(dashRes.status).toBe(200);
    expect(dashRes.body.success).toBe(true);
    expect(dashRes.body.data.summary).toMatchObject({
      todaySales: '0',
      transactions: 0,
      outstandingKhata: '0',
      lowStockItems: 0,
      recentSales: [],
    });
  });

  it('11. expired subscription is gated from ERP dashboard (402)', async () => {
    const id = uniqueId();
    const phone = `984900${Math.floor(1000 + Math.random() * 9000)}`;

    const reg = await request(app)
      .post('/api/retailer/register')
      .send({
        owner: {
          firstName: 'Expired',
          lastName: 'Plan',
          phone,
          email: `expired-${id}@example.com`,
          password: 'Password123!',
        },
        business: {
          businessName: `Expired Store ${id}`,
          province: 'Bagmati',
          district: 'Bhaktapur',
          municipality: 'Bhaktapur',
          addressLine: 'Suryabinayak',
          contactNumber: phone,
        },
      });

    const cookie = extractCookie(reg);
    const businessId = reg.body.data.retailer.id;

    const plan = await prisma.subscriptionPlan.findFirstOrThrow();

    // Mark as verified but expired subscription
    await prisma.retailerBusiness.update({
      where: { id: businessId },
      data: {
        verificationStatus: 'VERIFIED',
        subscriptionStatus: 'ACTIVE',
      },
    });

    await prisma.retailerSubscription.create({
      data: {
        retailerBusinessId: businessId,
        planId: plan.id,
        status: 'ACTIVE',
        startsAt: new Date(Date.now() - 31 * 86400000),
        expiresAt: new Date(Date.now() - 86400000), // expired yesterday
      },
    });

    const res = await request(app)
      .get('/api/retailer/dashboard')
      .set('Cookie', cookie!);

    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('RETAILER_SUBSCRIPTION_REQUIRED');
  });

  it('12. suspended retailer is blocked from ERP dashboard (403)', async () => {
    const id = uniqueId();
    const phone = `985100${Math.floor(1000 + Math.random() * 9000)}`;

    const reg = await request(app)
      .post('/api/retailer/register')
      .send({
        owner: {
          firstName: 'Suspended',
          lastName: 'Owner',
          phone,
          email: `suspended-${id}@example.com`,
          password: 'Password123!',
        },
        business: {
          businessName: `Suspended Shop ${id}`,
          province: 'Bagmati',
          district: 'Kathmandu',
          municipality: 'Kathmandu',
          addressLine: 'Kalanki',
          contactNumber: phone,
        },
      });

    const cookie = extractCookie(reg);
    const businessId = reg.body.data.retailer.id;

    // Suspend retailer
    await prisma.retailerBusiness.update({
      where: { id: businessId },
      data: {
        verificationStatus: 'SUSPENDED',
      },
    });

    const res = await request(app)
      .get('/api/retailer/dashboard')
      .set('Cookie', cookie!);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('RETAILER_SUSPENDED');
  });

  it('13. multi-tenant boundary: Retailer A cannot access or mutate Retailer B profile', async () => {
    const idA = uniqueId();
    const idB = uniqueId();

    const regA = await request(app)
      .post('/api/retailer/register')
      .send({
        owner: {
          firstName: 'Owner',
          lastName: 'A',
          phone: `985200${Math.floor(1000 + Math.random() * 9000)}`,
          email: `retailer-a-${idA}@example.com`,
          password: 'Password123!',
        },
        business: {
          businessName: `Retailer A Business ${idA}`,
          province: 'Bagmati',
          district: 'Kathmandu',
          municipality: 'Kathmandu',
          addressLine: 'Ason',
          contactNumber: '9852001111',
        },
      });

    const regB = await request(app)
      .post('/api/retailer/register')
      .send({
        owner: {
          firstName: 'Owner',
          lastName: 'B',
          phone: `985300${Math.floor(1000 + Math.random() * 9000)}`,
          email: `retailer-b-${idB}@example.com`,
          password: 'Password123!',
        },
        business: {
          businessName: `Retailer B Business ${idB}`,
          province: 'Bagmati',
          district: 'Kathmandu',
          municipality: 'Kathmandu',
          addressLine: 'Chhetrapati',
          contactNumber: '9853002222',
        },
      });

    const cookieA = extractCookie(regA)!;
    const cookieB = extractCookie(regB)!;

    // 1. Retailer A profile returns Retailer A only
    const profA = await request(app)
      .get('/api/retailer/business')
      .set('Cookie', cookieA);

    expect(profA.status).toBe(200);
    expect(profA.body.data.businessName).toBe(`Retailer A Business ${idA}`);

    // 2. Retailer B profile returns Retailer B only
    const profB = await request(app)
      .get('/api/retailer/business')
      .set('Cookie', cookieB);

    expect(profB.status).toBe(200);
    expect(profB.body.data.businessName).toBe(`Retailer B Business ${idB}`);

    // 3. Mutating with Cookie A only affects Retailer A
    const patchA = await request(app)
      .patch('/api/retailer/business')
      .set('Cookie', cookieA)
      .send({ businessName: `Retailer A Updated ${idA}` });

    expect(patchA.status).toBe(200);
    expect(patchA.body.data.businessName).toBe(`Retailer A Updated ${idA}`);

    // Check that Retailer B was completely untouched
    const checkB = await request(app)
      .get('/api/retailer/business')
      .set('Cookie', cookieB);

    expect(checkB.body.data.businessName).toBe(`Retailer B Business ${idB}`);
  });

  it('14. admin verification flow works', async () => {
    const id = uniqueId();
    const phone = `985400${Math.floor(1000 + Math.random() * 9000)}`;

    const reg = await request(app)
      .post('/api/retailer/register')
      .send({
        owner: {
          firstName: 'AdminVerify',
          lastName: 'Target',
          phone,
          email: `admin-target-${id}@example.com`,
          password: 'Password123!',
        },
        business: {
          businessName: `Target Shop ${id}`,
          province: 'Bagmati',
          district: 'Kathmandu',
          municipality: 'Kathmandu',
          addressLine: 'Dillibazar',
          contactNumber: phone,
        },
      });

    const retailerBusinessId = reg.body.data.retailer.id;

    // Login as admin
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@nilopasal.com',
        password: 'AdminNilopasal2026!',
      });

    const adminCookie = extractCookie(adminLogin)!;

    // Admin verifies the retailer
    const verifyRes = await request(app)
      .post(`/api/admin/retailers/${retailerBusinessId}/verify`)
      .set('Cookie', adminCookie)
      .send({});

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.verificationStatus).toBe('VERIFIED');

    // Admin assigns subscription
    const subRes = await request(app)
      .post(`/api/admin/retailers/${retailerBusinessId}/subscription`)
      .set('Cookie', adminCookie)
      .send({
        planSlug: 'retailer-standard-monthly',
        status: 'ACTIVE',
        durationDays: 30,
      });

    expect(subRes.status).toBe(200);
    expect(subRes.body.data.status).toBe('ACTIVE');

    // Retailer can now access dashboard
    const userCookie = extractCookie(reg)!;
    const dashRes = await request(app)
      .get('/api/retailer/dashboard')
      .set('Cookie', userCookie);

    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.businessName).toBe(`Target Shop ${id}`);
  });

  it('15. logout works and clears session access', async () => {
    const id = uniqueId();
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        firstName: 'Logout',
        lastName: 'Tester',
        email: `logout-${id}@example.com`,
        password: 'Password123!',
      });

    const cookie = extractCookie(signupRes)!;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);
    expect(meRes.status).toBe(200);

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie);

    expect(logoutRes.status).toBe(200);

    const postLogout = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(postLogout.status).toBe(401);
  });
});
