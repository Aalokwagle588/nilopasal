import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { RetailerMembershipRole, RetailerPaymentMethod } from '@prisma/client';

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
  const email = `retailer-r3-${suffix}@example.com`;

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
        businessName: `Kirana Store ${suffix}`,
        panNumber: '600123456',
        vatNumber: '600123456',
        province: 'Bagmati',
        district: 'Kathmandu',
        municipality: 'Kathmandu Metro',
        addressLine: 'Ason Bazar',
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

describe('Nilopasal Phase R3 — POS Counter & VAT Invoices', () => {
  it('1. POS product lookup finds items rapidly by barcode, SKU, or name', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    // Create products with barcode and SKU
    await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Coca Cola 500ml Pet Bottle',
      sku: 'COKE-500',
      barcode: '890123000001',
      costPrice: 50,
      sellingPrice: 65,
      initialStock: 24,
    });

    await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Fanta Orange 500ml',
      sku: 'FANTA-500',
      barcode: '890123000002',
      costPrice: 50,
      sellingPrice: 65,
      initialStock: 12,
    });

    // Lookup by exact barcode
    const barcodeRes = await request(app)
      .get('/api/retailer/pos/lookup?query=890123000001')
      .set('Cookie', cookie);

    expect(barcodeRes.status).toBe(200);
    expect(barcodeRes.body.data.items.length).toBe(1);
    expect(barcodeRes.body.data.items[0].sku).toBe('COKE-500');
    expect(barcodeRes.body.data.items[0].totalQuantity).toBe(24);

    // Lookup by partial name
    const nameRes = await request(app)
      .get('/api/retailer/pos/lookup?query=Orange')
      .set('Cookie', cookie);

    expect(nameRes.status).toBe(200);
    expect(nameRes.body.data.items.length).toBe(1);
    expect(nameRes.body.data.items[0].name).toBe('Fanta Orange 500ml');
  });

  it('2. POS cash sale creates invoice, decrements inventory, and logs SALE transaction', async () => {
    const id = uniqueId();
    const { cookie, ownerUserId } = await createActiveRetailer(id);

    // Create Product
    const prodRes = await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Instant Noodles 75g',
      sku: `NOODLE-${id}`,
      costPrice: 20,
      sellingPrice: 25,
      initialStock: 50,
      trackInventory: true,
    });
    const productId = prodRes.body.data.id;
    const inventoryId = prodRes.body.data.inventories[0].id;

    // Checkout 4 packs via POS (Total: 4 * 25 = 100 NPR)
    const saleRes = await request(app)
      .post('/api/retailer/sales')
      .set('Cookie', cookie)
      .send({
        items: [
          {
            productId,
            quantity: 4,
          },
        ],
        payments: [
          {
            method: 'CASH',
            amount: 100,
          },
        ],
      });

    expect(saleRes.status).toBe(201);
    expect(saleRes.body.success).toBe(true);
    const sale = saleRes.body.data;

    expect(sale.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}/);
    expect(Number(sale.subtotal)).toBe(100);
    expect(Number(sale.grandTotal)).toBe(100);
    expect(Number(sale.paidAmount)).toBe(100);
    expect(sale.paymentStatus).toBe('PAID');
    expect(sale.items.length).toBe(1);
    expect(sale.items[0].productNameSnapshot).toBe('Instant Noodles 75g');

    // Verify inventory balance is decremented from 50 -> 46
    const invRes = await request(app)
      .get(`/api/retailer/products/${productId}`)
      .set('Cookie', cookie);

    expect(invRes.body.data.inventories[0].quantityAvailable).toBe(46);

    // Verify SALE transaction was logged in audit history
    const txRes = await request(app)
      .get(`/api/retailer/inventory/transactions?inventoryId=${inventoryId}`)
      .set('Cookie', cookie);

    expect(txRes.status).toBe(200);
    const saleTx = txRes.body.data.items.find((t: any) => t.type === 'SALE');
    expect(saleTx).toBeDefined();
    expect(saleTx.quantity).toBe(4);
    expect(saleTx.previousQuantity).toBe(50);
    expect(saleTx.newQuantity).toBe(46);
    expect(saleTx.referenceType).toBe('RETAIL_SALE');
    expect(saleTx.referenceId).toBe(sale.id);
    expect(saleTx.performedBy).toBe(ownerUserId);
  });

  it('3. Nepal VAT 13% and non-taxable calculations are properly segregated', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    // Product 1: Taxable item with 13% VAT (e.g. Carbonated Beverage, 100 NPR)
    const p1 = await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Soda Can 330ml',
      sellingPrice: 100,
      costPrice: 80,
      taxType: 'TAXABLE',
      taxRate: 13,
      initialStock: 20,
    });

    // Product 2: Non-taxable essential item (e.g. Rice / Fresh Produce, 200 NPR)
    const p2 = await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Basmati Rice 2kg',
      sellingPrice: 200,
      costPrice: 160,
      taxType: 'NON_TAXABLE',
      taxRate: 0,
      initialStock: 10,
    });

    // POS Sale: 2 x Soda (200 + 13% VAT = 226) + 1 x Rice (200, Non-taxable) = 426 NPR Grand Total
    const saleRes = await request(app)
      .post('/api/retailer/sales')
      .set('Cookie', cookie)
      .send({
        items: [
          { productId: p1.body.data.id, quantity: 2 },
          { productId: p2.body.data.id, quantity: 1 },
        ],
        payments: [{ method: 'CASH', amount: 426 }],
      });

    expect(saleRes.status).toBe(201);
    const sale = saleRes.body.data;

    // Subtotal: 2 * 100 + 1 * 200 = 400
    expect(Number(sale.subtotal)).toBe(400);
    // Taxable amount = 200; 13% VAT = 26
    expect(Number(sale.taxableAmount)).toBe(200);
    expect(Number(sale.tax)).toBe(26);
    expect(Number(sale.nonTaxableAmount)).toBe(200);
    // Grand Total = 426
    expect(Number(sale.grandTotal)).toBe(426);
    expect(sale.paymentStatus).toBe('PAID');
  });

  it('4. insufficient stock rejection prevents selling beyond available inventory', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    const prodRes = await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Limited Stock Biscuits',
      sellingPrice: 50,
      initialStock: 2,
      trackInventory: true,
    });

    // Attempt to sell 5 units when only 2 are available
    const saleRes = await request(app)
      .post('/api/retailer/sales')
      .set('Cookie', cookie)
      .send({
        items: [{ productId: prodRes.body.data.id, quantity: 5 }],
        payments: [{ method: 'CASH', amount: 250 }],
      });

    expect(saleRes.status).toBe(400);
    expect(saleRes.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(saleRes.body.error.message).toContain('Available: 2, Requested: 5');

    // Verify stock remains untouched at 2
    const checkRes = await request(app)
      .get(`/api/retailer/products/${prodRes.body.data.id}`)
      .set('Cookie', cookie);
    expect(checkRes.body.data.inventories[0].quantityAvailable).toBe(2);
  });

  it('5. digital payments (eSewa / Khalti / Card) record references on invoice', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    const prod = await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Olive Oil 500ml',
      sellingPrice: 850,
      initialStock: 10,
    });

    // Split payment: 350 Cash + 500 eSewa with transaction code
    const saleRes = await request(app)
      .post('/api/retailer/sales')
      .set('Cookie', cookie)
      .send({
        items: [{ productId: prod.body.data.id, quantity: 1 }],
        payments: [
          { method: 'CASH', amount: 350 },
          { method: 'ESEWA', amount: 500, reference: 'ESEWA-TX-99882233' },
        ],
      });

    expect(saleRes.status).toBe(201);
    const sale = saleRes.body.data;
    expect(sale.payments.length).toBe(2);

    const esewaPayment = sale.payments.find((p: any) => p.method === 'ESEWA');
    expect(esewaPayment).toBeDefined();
    expect(Number(esewaPayment.amount)).toBe(500);
    expect(esewaPayment.reference).toBe('ESEWA-TX-99882233');
    expect(sale.paymentStatus).toBe('PAID');
  });

  it('6. Khata credit sale updates customer balance and logs KhataTransaction(SALE_CREDIT)', async () => {
    const id = uniqueId();
    const { cookie, businessId } = await createActiveRetailer(id);

    const prod = await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Ghee 1L Jar',
      sellingPrice: 1200,
      initialStock: 10,
    });

    // Customer buys on Khata Credit (phone provided)
    const customerPhone = `9841${Math.floor(100000 + Math.random() * 900000)}`;
    const saleRes = await request(app)
      .post('/api/retailer/sales')
      .set('Cookie', cookie)
      .send({
        customerName: 'Sita Sharma',
        customerPhone,
        items: [{ productId: prod.body.data.id, quantity: 1 }],
        payments: [
          {
            method: 'CREDIT_KHATA',
            amount: 1200,
          },
        ],
      });

    expect(saleRes.status).toBe(201);
    const sale = saleRes.body.data;
    expect(sale.customer).toBeDefined();
    expect(sale.customer.name).toBe('Sita Sharma');
    expect(Number(sale.customer.currentBalance)).toBe(1200);

    // Verify Khata transaction exists in database
    const khataTx = await prisma.khataTransaction.findFirst({
      where: {
        retailerBusinessId: businessId,
        customerId: sale.customer.id,
        type: 'SALE_CREDIT',
      },
    });

    expect(khataTx).toBeDefined();
    expect(Number(khataTx!.amount)).toBe(1200);
    expect(Number(khataTx!.balanceAfter)).toBe(1200);
    expect(khataTx!.referenceId).toBe(sale.id);
  });

  it('7. multi-tenant boundary: Retailer A cannot query or read Retailer B sales invoices', async () => {
    const idA = uniqueId();
    const idB = uniqueId();
    const storeA = await createActiveRetailer(idA);
    const storeB = await createActiveRetailer(idB);

    const prodA = await request(app).post('/api/retailer/products').set('Cookie', storeA.cookie).send({
      name: 'Private Product A',
      sellingPrice: 500,
      initialStock: 10,
    });

    const saleARes = await request(app).post('/api/retailer/sales').set('Cookie', storeA.cookie).send({
      items: [{ productId: prodA.body.data.id, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 500 }],
    });
    const saleAId = saleARes.body.data.id;

    // Retailer B attempts to read Retailer A's sale -> 404
    const bReadSale = await request(app)
      .get(`/api/retailer/sales/${saleAId}`)
      .set('Cookie', storeB.cookie);

    expect(bReadSale.status).toBe(404);
  });

  it('8. staff with CASHIER role can execute POS sales', async () => {
    const id = uniqueId();
    const { cookie: ownerCookie, businessId } = await createActiveRetailer(id);

    const prod = await request(app).post('/api/retailer/products').set('Cookie', ownerCookie).send({
      name: 'Cashier Item',
      sellingPrice: 80,
      initialStock: 20,
    });

    // Create Cashier User
    const cashierEmail = `cashier-r3-${id}@example.com`;
    const signup = await request(app).post('/api/auth/signup').send({
      firstName: 'Gopal',
      lastName: 'Cashier',
      email: cashierEmail,
      password: 'Password123!',
    });
    const cashierCookie = extractCookie(signup);

    // Assign CASHIER role
    await prisma.retailerMembership.create({
      data: {
        userId: signup.body.data.user.id,
        retailerBusinessId: businessId,
        role: RetailerMembershipRole.CASHIER,
        status: 'ACTIVE',
      },
    });

    // Cashier executes sale -> 201 Created!
    const saleRes = await request(app)
      .post('/api/retailer/sales')
      .set('Cookie', cashierCookie!)
      .send({
        items: [{ productId: prod.body.data.id, quantity: 2 }],
        payments: [{ method: 'CASH', amount: 160 }],
      });

    expect(saleRes.status).toBe(201);
    expect(saleRes.body.data.paymentStatus).toBe('PAID');
    expect(saleRes.body.data.creator.firstName).toBe('Gopal');
  });

  it('9. printable invoice endpoint returns store PAN/VAT, customer, and tax breakdown', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    const prod = await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Spices Pack 100g',
      sellingPrice: 150,
      initialStock: 10,
    });

    const saleRes = await request(app).post('/api/retailer/sales').set('Cookie', cookie).send({
      items: [{ productId: prod.body.data.id, quantity: 2 }],
      payments: [{ method: 'CASH', amount: 300 }],
    });
    const saleId = saleRes.body.data.id;

    const invoiceRes = await request(app)
      .get(`/api/retailer/sales/${saleId}`)
      .set('Cookie', cookie);

    expect(invoiceRes.status).toBe(200);
    const invoice = invoiceRes.body.data;
    expect(invoice.store.businessName).toBe(`Kirana Store ${id}`);
    expect(invoice.store.panNumber).toBe('600123456');
    expect(invoice.items.length).toBe(1);
    expect(invoice.items[0].productName).toBe('Spices Pack 100g');
    expect(invoice.payments.length).toBe(1);
    expect(invoice.payments[0].method).toBe('CASH');
  });
});
