import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import {
  RetailerInventoryTransactionType,
  RetailerMembershipRole,
  RetailerPaymentMethod,
  RetailerPurchaseStatus,
  SupplierTransactionType,
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
  const email = `retailer-r5-${suffix}@example.com`;

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
        businessName: `Kirana Wholesales ${suffix}`,
        panNumber: '600112233',
        vatNumber: '600112233',
        province: 'Bagmati',
        district: 'Kathmandu',
        municipality: 'Kathmandu Metro',
        addressLine: 'Kalimati, Kathmandu',
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

describe('Nilopasal Phase R5 — Supplier Purchasing & Inbound ERP', () => {
  it('1. registers a supplier with opening balance and logs initial transaction', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);
    const supPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;

    const res = await request(app)
      .post('/api/retailer/suppliers')
      .set('Cookie', cookie)
      .send({
        name: 'Himalayan Distributors',
        companyName: 'Himalayan Beverages Pvt. Ltd.',
        phone: supPhone,
        panNumber: '300123456',
        address: 'Balkhu, Kathmandu',
        openingBalance: 12500,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Himalayan Distributors');
    expect(res.body.data.companyName).toBe('Himalayan Beverages Pvt. Ltd.');
    expect(Number(res.body.data.currentBalance)).toBe(12500);

    // Verify transaction created
    const txs = await prisma.supplierTransaction.findMany({
      where: { supplierId: res.body.data.id },
    });
    expect(txs.length).toBe(1);
    expect(txs[0]!.type).toBe(SupplierTransactionType.OPENING_BALANCE);
    expect(Number(txs[0]!.amount)).toBe(12500);
    expect(Number(txs[0]!.balanceAfter)).toBe(12500);
  });

  it('2. strictly rejects duplicate supplier phone within the same store', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);
    const sharedPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;

    const res1 = await request(app)
      .post('/api/retailer/suppliers')
      .set('Cookie', cookie)
      .send({
        name: 'Supplier One',
        phone: sharedPhone,
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post('/api/retailer/suppliers')
      .set('Cookie', cookie)
      .send({
        name: 'Supplier Duplicate',
        phone: sharedPhone,
      });
    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('SUPPLIER_PHONE_EXISTS');
  });

  it('3. lists suppliers with search and calculates store accounts payable summary', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    // Supplier A with payable due
    await request(app)
      .post('/api/retailer/suppliers')
      .set('Cookie', cookie)
      .send({
        name: 'Gorkha Brewery Supplier',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 45000,
      });

    // Supplier B settled
    await request(app)
      .post('/api/retailer/suppliers')
      .set('Cookie', cookie)
      .send({
        name: 'Patan Dairy Supply',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 0,
      });

    // List all
    const allRes = await request(app).get('/api/retailer/suppliers').set('Cookie', cookie);
    expect(allRes.status).toBe(200);
    expect(allRes.body.data.suppliers.length).toBe(2);
    expect(Number(allRes.body.data.summary.totalPayables)).toBe(45000);
    expect(allRes.body.data.summary.suppliersWithDues).toBe(1);

    // Filter DUE
    const dueRes = await request(app)
      .get('/api/retailer/suppliers?hasBalance=DUE')
      .set('Cookie', cookie);
    expect(dueRes.status).toBe(200);
    expect(dueRes.body.data.suppliers.length).toBe(1);
    expect(dueRes.body.data.suppliers[0]!.name).toBe('Gorkha Brewery Supplier');
  });

  it('4. purchase order with immediate stock receipt atomically increments warehouse stock', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    // 1. Create Supplier
    const supRes = await request(app)
      .post('/api/retailer/suppliers')
      .set('Cookie', cookie)
      .send({
        name: 'Surya Nepal Distributors',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 0,
      });
    const supplierId = supRes.body.data.id;

    // 2. Create Product with initial stock 10
    const prodRes = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', cookie)
      .send({
        name: 'Real Mixed Fruit Juice 1L',
        sku: `REAL-1L-${id}`,
        costPrice: 200,
        sellingPrice: 260,
        initialStock: 10,
      });
    const productId = prodRes.body.data.id;

    // 3. Create Purchase Order with status RECEIVED (purchasing 20 units @ Rs. 190, paid Rs. 1000 upfront)
    const poRes = await request(app)
      .post('/api/retailer/purchases')
      .set('Cookie', cookie)
      .send({
        supplierId,
        status: 'RECEIVED',
        items: [
          {
            productId,
            quantity: 20,
            unitCost: 190,
          },
        ],
        paidAmount: 1000,
        updateCostPrice: true,
      });

    expect(poRes.status).toBe(201);
    expect(poRes.body.data.status).toBe(RetailerPurchaseStatus.RECEIVED);
    expect(Number(poRes.body.data.totalAmount)).toBe(3800); // 20 * 190 = 3800
    expect(Number(poRes.body.data.paidAmount)).toBe(1000);

    // 4. Verify Inventory stock incremented: 10 initial + 20 received = 30
    const inv = await prisma.retailerInventory.findFirst({
      where: { productId },
    });
    expect(inv).not.toBeNull();
    expect(inv!.quantityAvailable).toBe(30);

    // 5. Verify immutable STOCK_IN transaction
    const invTx = await prisma.retailerInventoryTransaction.findFirst({
      where: {
        inventoryId: inv!.id,
        type: RetailerInventoryTransactionType.STOCK_IN,
        referenceId: poRes.body.data.id,
      },
    });
    expect(invTx).not.toBeNull();
    expect(invTx!.quantity).toBe(20);
    expect(invTx!.previousQuantity).toBe(10);
    expect(invTx!.newQuantity).toBe(30);

    // 6. Verify Supplier Balance incremented by unpaid amount: 3800 - 1000 = 2800
    const updatedSup = await prisma.retailerSupplier.findUnique({
      where: { id: supplierId },
    });
    expect(Number(updatedSup!.currentBalance)).toBe(2800);

    // 7. Verify Product Catalog cost price updated to 190
    const updatedProd = await prisma.retailerProduct.findUnique({
      where: { id: productId },
    });
    expect(Number(updatedProd!.costPrice)).toBe(190);
  });

  it('5. transitions ORDERED purchase order to RECEIVED and increments inventory', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    const supRes = await request(app)
      .post('/api/retailer/suppliers')
      .set('Cookie', cookie)
      .send({
        name: 'Wai Wai Distributor',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
      });
    const supplierId = supRes.body.data.id;

    const prodRes = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', cookie)
      .send({
        name: 'Wai Wai Quick 75g',
        sku: `WAIWAI-${id}`,
        costPrice: 20,
        sellingPrice: 25,
        initialStock: 5,
      });
    const productId = prodRes.body.data.id;

    // Create PO as ORDERED (Draft/Pending)
    const poRes = await request(app)
      .post('/api/retailer/purchases')
      .set('Cookie', cookie)
      .send({
        supplierId,
        status: 'ORDERED',
        items: [{ productId, quantity: 50, unitCost: 18 }],
      });

    expect(poRes.status).toBe(201);
    expect(poRes.body.data.status).toBe(RetailerPurchaseStatus.ORDERED);

    // Stock should NOT be incremented yet
    const invBefore = await prisma.retailerInventory.findFirst({ where: { productId } });
    expect(invBefore!.quantityAvailable).toBe(5);

    // Receive goods
    const receiveRes = await request(app)
      .post(`/api/retailer/purchases/${poRes.body.data.id}/receive`)
      .set('Cookie', cookie);

    expect(receiveRes.status).toBe(200);
    expect(receiveRes.body.data.status).toBe(RetailerPurchaseStatus.RECEIVED);

    // Stock should now be 5 + 50 = 55
    const invAfter = await prisma.retailerInventory.findFirst({ where: { productId } });
    expect(invAfter!.quantityAvailable).toBe(55);
  });

  it('6. records payment to supplier and decrements accounts payable balance', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    const supRes = await request(app)
      .post('/api/retailer/suppliers')
      .set('Cookie', cookie)
      .send({
        name: 'Dabur Nepal Wholesaler',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 20000,
      });
    const supplierId = supRes.body.data.id;

    // Record payment of 15,000 via Bank
    const payRes = await request(app)
      .post(`/api/retailer/suppliers/${supplierId}/payments`)
      .set('Cookie', cookie)
      .send({
        amount: 15000,
        paymentMethod: RetailerPaymentMethod.BANK,
        reference: 'NABIL-CHQ-449102',
        notes: 'Cheque payment against past invoices',
      });

    expect(payRes.status).toBe(201);
    expect(Number(payRes.body.data.supplier.currentBalance)).toBe(5000);
    expect(payRes.body.data.transaction.type).toBe(SupplierTransactionType.PAYMENT);
    expect(Number(payRes.body.data.transaction.amount)).toBe(15000);
    expect(Number(payRes.body.data.transaction.balanceAfter)).toBe(5000);
    expect(payRes.body.data.transaction.referenceId).toBe('NABIL-CHQ-449102');
  });

  it('7. provides chronologically accurate supplier statement ledger', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    const supRes = await request(app)
      .post('/api/retailer/suppliers')
      .set('Cookie', cookie)
      .send({
        name: 'Chaudhary Group Supply',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 10000,
      });
    const supplierId = supRes.body.data.id;

    // Record payment of 4,000
    await request(app)
      .post(`/api/retailer/suppliers/${supplierId}/payments`)
      .set('Cookie', cookie)
      .send({ amount: 4000 });

    // Fetch transactions
    const ledgerRes = await request(app)
      .get(`/api/retailer/suppliers/${supplierId}/transactions`)
      .set('Cookie', cookie);

    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.body.data.transactions.length).toBe(2);

    // Newest first
    expect(ledgerRes.body.data.transactions[0]!.type).toBe(SupplierTransactionType.PAYMENT);
    expect(Number(ledgerRes.body.data.transactions[0]!.balanceAfter)).toBe(6000); // 10000 - 4000 = 6000

    expect(ledgerRes.body.data.transactions[1]!.type).toBe(SupplierTransactionType.OPENING_BALANCE);
    expect(Number(ledgerRes.body.data.transactions[1]!.balanceAfter)).toBe(10000);
  });

  it('8. restricts CASHIER role from creating purchases or recording supplier payments', async () => {
    const id = uniqueId();
    const { cookie, businessId } = await createActiveRetailer(id);

    const supRes = await request(app)
      .post('/api/retailer/suppliers')
      .set('Cookie', cookie)
      .send({
        name: 'Restricted Supplier',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 5000,
      });
    const supplierId = supRes.body.data.id;

    // Create Cashier
    const cashierPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        firstName: 'Cashier',
        lastName: 'Member',
        phone: cashierPhone,
        email: `cashier-sup-${id}@example.com`,
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

    // Cashier cannot create purchase
    const poRes = await request(app)
      .post('/api/retailer/purchases')
      .set('Cookie', cashierCookie!)
      .send({
        supplierId,
        items: [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1, unitCost: 10 }],
      });
    expect(poRes.status).toBe(403);
    expect(poRes.body.error.code).toBe('RETAILER_FORBIDDEN');

    // Cashier cannot pay supplier
    const payRes = await request(app)
      .post(`/api/retailer/suppliers/${supplierId}/payments`)
      .set('Cookie', cashierCookie!)
      .send({ amount: 1000 });
    expect(payRes.status).toBe(403);
    expect(payRes.body.error.code).toBe('RETAILER_FORBIDDEN');
  });

  it('9. strictly isolates suppliers and purchases between stores (multi-tenant boundary)', async () => {
    const idA = uniqueId();
    const idB = uniqueId();
    const retailerA = await createActiveRetailer(idA);
    const retailerB = await createActiveRetailer(idB);

    const supARes = await request(app)
      .post('/api/retailer/suppliers')
      .set('Cookie', retailerA.cookie)
      .send({
        name: 'Store A Supplier Only',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        openingBalance: 30000,
      });
    const supAId = supARes.body.data.id;

    // Store B tries to view Store A's supplier -> 404
    const getRes = await request(app)
      .get(`/api/retailer/suppliers/${supAId}`)
      .set('Cookie', retailerB.cookie);
    expect(getRes.status).toBe(404);

    // Store B tries to record payment to Store A's supplier -> 404
    const payRes = await request(app)
      .post(`/api/retailer/suppliers/${supAId}/payments`)
      .set('Cookie', retailerB.cookie)
      .send({ amount: 1000 });
    expect(payRes.status).toBe(404);

    // Store B's supplier list does NOT show Store A's payables
    const listRes = await request(app)
      .get('/api/retailer/suppliers')
      .set('Cookie', retailerB.cookie);
    expect(listRes.body.data.suppliers.length).toBe(0);
    expect(Number(listRes.body.data.summary.totalPayables)).toBe(0);
  });
});
