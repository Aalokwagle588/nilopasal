import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import {
  KhataTransactionType,
  RetailerMembershipRole,
  RetailerPaymentMethod,
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
  const email = `retailer-r4-${suffix}@example.com`;

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
        businessName: `Pasal Store ${suffix}`,
        panNumber: '600987654',
        vatNumber: '600987654',
        province: 'Bagmati',
        district: 'Kathmandu',
        municipality: 'Kathmandu Metro',
        addressLine: 'New Road, Kathmandu',
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

describe('Nilopasal Phase R4 — Digital Khata & Customer Ledgers', () => {
  it('1. registers a new customer with opening balance and generates initial transaction', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);
    const custPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;

    const res = await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', cookie)
      .send({
        name: 'Ram Bahadur Thapa',
        phone: custPhone,
        address: 'Thamel, Kathmandu',
        creditLimit: 15000,
        openingBalance: 2500,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Ram Bahadur Thapa');
    expect(res.body.data.phone).toBe(custPhone);
    expect(Number(res.body.data.currentBalance)).toBe(2500);
    expect(Number(res.body.data.creditLimit)).toBe(15000);

    // Verify Khata transaction created
    const txs = await prisma.khataTransaction.findMany({
      where: { customerId: res.body.data.id },
    });
    expect(txs.length).toBe(1);
    expect(txs[0]!.type).toBe(KhataTransactionType.OPENING_BALANCE);
    expect(Number(txs[0]!.amount)).toBe(2500);
    expect(Number(txs[0]!.balanceAfter)).toBe(2500);
  });

  it('2. strictly rejects duplicate customer phone within the same store', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);
    const sharedPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;

    const res1 = await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', cookie)
      .send({
        name: 'Sita Sharma',
        phone: sharedPhone,
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', cookie)
      .send({
        name: 'Sita Second',
        phone: sharedPhone,
      });

    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('CUSTOMER_PHONE_EXISTS');
  });

  it('3. filters customers by balance status and computes store-wide Khata KPIs', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    // Customer with balance
    await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', cookie)
      .send({
        name: 'Gopal Shrestha',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 3000,
      });

    // Customer with settled / zero balance
    await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', cookie)
      .send({
        name: 'Hari Prasad',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 0,
      });

    // Customer with small debt
    await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', cookie)
      .send({
        name: 'Anita Rai',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 500,
      });

    // List all
    const allRes = await request(app).get('/api/retailer/customers').set('Cookie', cookie);
    expect(allRes.status).toBe(200);
    expect(allRes.body.data.customers.length).toBe(3);
    expect(Number(allRes.body.data.summary.totalReceivables)).toBe(3500); // 3000 + 500
    expect(allRes.body.data.summary.customersWithDebt).toBe(2);

    // Filter WITH_DEBT
    const debtRes = await request(app)
      .get('/api/retailer/customers?balanceStatus=WITH_DEBT')
      .set('Cookie', cookie);
    expect(debtRes.status).toBe(200);
    expect(debtRes.body.data.customers.length).toBe(2);

    // Filter ZERO_BALANCE
    const zeroRes = await request(app)
      .get('/api/retailer/customers?balanceStatus=ZERO_BALANCE')
      .set('Cookie', cookie);
    expect(zeroRes.status).toBe(200);
    expect(zeroRes.body.data.customers.length).toBe(1);
    expect(zeroRes.body.data.customers[0]!.name).toBe('Hari Prasad');

    // Search by name
    const searchRes = await request(app)
      .get('/api/retailer/customers?search=Anita')
      .set('Cookie', cookie);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.customers.length).toBe(1);
    expect(searchRes.body.data.customers[0]!.name).toBe('Anita Rai');
  });

  it('4. retrieves customer profile with credit utilization and lifetime statistics', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    const createRes = await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', cookie)
      .send({
        name: 'Dinesh Joshi',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        creditLimit: 5000,
        openingBalance: 2000,
      });

    const custId = createRes.body.data.id;

    const profileRes = await request(app)
      .get(`/api/retailer/customers/${custId}`)
      .set('Cookie', cookie);

    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data.customer.name).toBe('Dinesh Joshi');
    expect(Number(profileRes.body.data.stats.currentBalance)).toBe(2000);
    expect(Number(profileRes.body.data.stats.creditLimit)).toBe(5000);
    expect(profileRes.body.data.stats.creditUtilizationPercent).toBe(40); // 2000 / 5000 = 40%
  });

  it('5. updates customer basic details and credit limit with audit logging', async () => {
    const id = uniqueId();
    const { cookie, businessId } = await createActiveRetailer(id);

    const createRes = await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', cookie)
      .send({
        name: 'Manoj Gurung',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        creditLimit: 2000,
      });
    const custId = createRes.body.data.id;

    const patchRes = await request(app)
      .patch(`/api/retailer/customers/${custId}`)
      .set('Cookie', cookie)
      .send({
        name: 'Manoj Gurung Updated',
        creditLimit: 8000,
        address: 'Pokhara, Kaski',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.name).toBe('Manoj Gurung Updated');
    expect(Number(patchRes.body.data.creditLimit)).toBe(8000);
    expect(patchRes.body.data.address).toBe('Pokhara, Kaski');

    // Audit log verified
    const audit = await prisma.retailerAuditLog.findFirst({
      where: {
        retailerBusinessId: businessId,
        action: 'UPDATE_CUSTOMER',
        entityId: custId,
      },
    });
    expect(audit).not.toBeNull();
  });

  it('6. records customer payment collection (Cash/eSewa) and atomically decrements debt balance', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    // Customer with 5,000 opening debt
    const createRes = await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', cookie)
      .send({
        name: 'Bikash Tamang',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 5000,
      });
    const custId = createRes.body.data.id;

    // Record partial payment of 2,000 via eSewa
    const payRes = await request(app)
      .post(`/api/retailer/customers/${custId}/payments`)
      .set('Cookie', cookie)
      .send({
        amount: 2000,
        paymentMethod: RetailerPaymentMethod.ESEWA,
        reference: 'ESEWA-TXN-109283',
        notes: 'Partial payment received at counter',
      });

    expect(payRes.status).toBe(201);
    expect(Number(payRes.body.data.customer.currentBalance)).toBe(3000);
    expect(payRes.body.data.transaction.type).toBe(KhataTransactionType.PAYMENT_RECEIVED);
    expect(Number(payRes.body.data.transaction.amount)).toBe(2000);
    expect(Number(payRes.body.data.transaction.balanceAfter)).toBe(3000);
    expect(payRes.body.data.transaction.referenceId).toBe('ESEWA-TXN-109283');

    // Record another payment of 3,000 via Cash (settles to 0)
    const payRes2 = await request(app)
      .post(`/api/retailer/customers/${custId}/payments`)
      .set('Cookie', cookie)
      .send({
        amount: 3000,
        paymentMethod: RetailerPaymentMethod.CASH,
      });

    expect(payRes2.status).toBe(201);
    expect(Number(payRes2.body.data.customer.currentBalance)).toBe(0);
    expect(Number(payRes2.body.data.transaction.balanceAfter)).toBe(0);
  });

  it('7. records manual ledger adjustments (Debit & Credit) with mandatory reasons', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    const createRes = await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', cookie)
      .send({
        name: 'Sunita Basnet',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 1000,
      });
    const custId = createRes.body.data.id;

    // 1. DEBIT adjustment (+500 for unbilled repair/service)
    const debitRes = await request(app)
      .post(`/api/retailer/customers/${custId}/adjustments`)
      .set('Cookie', cookie)
      .send({
        amount: 500,
        direction: 'DEBIT',
        reason: 'Unbilled delivery and packaging charge',
      });

    expect(debitRes.status).toBe(201);
    expect(Number(debitRes.body.data.customer.currentBalance)).toBe(1500);
    expect(Number(debitRes.body.data.transaction.balanceAfter)).toBe(1500);

    // 2. CREDIT adjustment (-100 festive discount waiver)
    const creditRes = await request(app)
      .post(`/api/retailer/customers/${custId}/adjustments`)
      .set('Cookie', cookie)
      .send({
        amount: 100,
        direction: 'CREDIT',
        reason: 'Dashain festival round-off concession',
      });

    expect(creditRes.status).toBe(201);
    expect(Number(creditRes.body.data.customer.currentBalance)).toBe(1400);
    expect(Number(creditRes.body.data.transaction.balanceAfter)).toBe(1400);
  });

  it('8. provides chronologically accurate customer statement ledger history', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    const createRes = await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', cookie)
      .send({
        name: 'Kiran KC',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 1000,
      });
    const custId = createRes.body.data.id;

    // Add payment
    await request(app)
      .post(`/api/retailer/customers/${custId}/payments`)
      .set('Cookie', cookie)
      .send({ amount: 400 });

    // Add debit adjustment
    await request(app)
      .post(`/api/retailer/customers/${custId}/adjustments`)
      .set('Cookie', cookie)
      .send({ amount: 150, direction: 'DEBIT', reason: 'Late interest fee' });

    // Fetch transactions
    const ledgerRes = await request(app)
      .get(`/api/retailer/customers/${custId}/transactions`)
      .set('Cookie', cookie);

    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.body.data.transactions.length).toBe(3);
    expect(ledgerRes.body.data.pagination.total).toBe(3);

    // Newest first
    expect(ledgerRes.body.data.transactions[0]!.type).toBe(KhataTransactionType.ADJUSTMENT);
    expect(Number(ledgerRes.body.data.transactions[0]!.balanceAfter)).toBe(750); // 1000 - 400 + 150 = 750

    expect(ledgerRes.body.data.transactions[1]!.type).toBe(KhataTransactionType.PAYMENT_RECEIVED);
    expect(Number(ledgerRes.body.data.transactions[1]!.balanceAfter)).toBe(600); // 1000 - 400 = 600

    expect(ledgerRes.body.data.transactions[2]!.type).toBe(KhataTransactionType.OPENING_BALANCE);
    expect(Number(ledgerRes.body.data.transactions[2]!.balanceAfter)).toBe(1000);
  });

  it('9. enforces role permissions: CASHIER can record payments but CANNOT perform adjustments', async () => {
    const id = uniqueId();
    const { cookie, businessId } = await createActiveRetailer(id);

    // Create a customer
    const createRes = await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', cookie)
      .send({
        name: 'Pradeep Maharjan',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 1000,
      });
    const custId = createRes.body.data.id;

    // Create Cashier user
    const cashierPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        firstName: 'Cashier',
        lastName: 'Boy',
        phone: cashierPhone,
        email: `cashier-khata-${id}@example.com`,
        password: 'Password123!',
      });
    const cashierCookie = extractCookie(signupRes);
    const cashierUserId = signupRes.body.data.user.id;

    // Add cashier membership
    await prisma.retailerMembership.create({
      data: {
        retailerBusinessId: businessId,
        userId: cashierUserId,
        role: RetailerMembershipRole.CASHIER,
      },
    });

    // Cashier CAN record payment
    const cashierPayRes = await request(app)
      .post(`/api/retailer/customers/${custId}/payments`)
      .set('Cookie', cashierCookie!)
      .send({ amount: 200, paymentMethod: RetailerPaymentMethod.CASH });
    expect(cashierPayRes.status).toBe(201);

    // Cashier CANNOT make manual adjustment
    const cashierAdjRes = await request(app)
      .post(`/api/retailer/customers/${custId}/adjustments`)
      .set('Cookie', cashierCookie!)
      .send({ amount: 100, direction: 'CREDIT', reason: 'Cashier trying unauthorized waiver' });
    expect(cashierAdjRes.status).toBe(403);
    expect(cashierAdjRes.body.error.code).toBe('RETAILER_FORBIDDEN');
  });

  it('10. strictly isolates customers between retailer businesses (multi-tenant boundary)', async () => {
    const idA = uniqueId();
    const idB = uniqueId();
    const retailerA = await createActiveRetailer(idA);
    const retailerB = await createActiveRetailer(idB);

    // Create Customer in Store A
    const custARes = await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', retailerA.cookie)
      .send({
        name: 'Store A Regular Customer',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 4000,
      });
    const custAId = custARes.body.data.id;

    // Store B tries to view Customer A -> 404
    const getRes = await request(app)
      .get(`/api/retailer/customers/${custAId}`)
      .set('Cookie', retailerB.cookie);
    expect(getRes.status).toBe(404);

    // Store B tries to record payment on Customer A -> 404
    const payRes = await request(app)
      .post(`/api/retailer/customers/${custAId}/payments`)
      .set('Cookie', retailerB.cookie)
      .send({ amount: 500 });
    expect(payRes.status).toBe(404);

    // Store B customer listing does NOT include Store A's customer or debt
    const listRes = await request(app)
      .get('/api/retailer/customers')
      .set('Cookie', retailerB.cookie);
    expect(listRes.body.data.customers.length).toBe(0);
    expect(Number(listRes.body.data.summary.totalReceivables)).toBe(0);
  });
});
