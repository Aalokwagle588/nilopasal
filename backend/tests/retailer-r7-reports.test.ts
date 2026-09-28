import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import {
  KhataTransactionType,
  RetailerMembershipRole,
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
  const email = `retailer-r7-${suffix}@example.com`;

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
        businessName: `Store Reports ERP ${suffix}`,
        panNumber: '600778899',
        vatNumber: '600778899',
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

  // Start trial subscription
  await request(app)
    .post('/api/retailer/subscription/start-trial')
    .set('Cookie', cookie!)
    .send({ planCode: 'GROWTH' });

  return { cookie: cookie!, businessId, ownerUserId, email, phone };
}

describe('Nilopasal Phase R7 — Business Reports & Financial Analytics', () => {
  it('1. calculates real-time P&L (Gross Profit = Net Sales - COGS), AOV, and margin % with 0 mock data', async () => {
    const store = await createActiveRetailer(`pl-${uniqueId()}`);

    // Create Category
    const catRes = await request(app)
      .post('/api/retailer/categories')
      .set('Cookie', store.cookie)
      .send({ name: 'Electronics', slug: `elec-${uniqueId()}` });
    const catId = catRes.body.data.id;

    // Create Product 1 (Taxable 13%): Price 1000, Cost 600, Stock 50
    const p1Res = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', store.cookie)
      .send({
        categoryId: catId,
        name: 'Wireless Bluetooth Earbuds',
        sku: `SKU-EAR-${uniqueId()}`,
        costPrice: 600,
        sellingPrice: 1000,
        taxType: 'TAXABLE',
        taxRate: 13,
        initialStock: 50,
      });
    const p1Id = p1Res.body.data.id;

    // Create Product 2 (Tax Exempt 0%): Price 500, Cost 300, Stock 50
    const p2Res = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', store.cookie)
      .send({
        categoryId: catId,
        name: 'Cotton Cleaning Cloth',
        sku: `SKU-CLOTH-${uniqueId()}`,
        costPrice: 300,
        sellingPrice: 500,
        taxType: 'EXEMPT',
        taxRate: 0,
        initialStock: 50,
      });
    const p2Id = p2Res.body.data.id;

    // Make POS Sale 1: 2x Earbuds (Unit 1000, Gross 2000, VAT 13% = 260, Total 2260, COGS = 2*600 = 1200)
    const sale1 = await request(app)
      .post('/api/retailer/sales')
      .set('Cookie', store.cookie)
      .send({
        items: [{ productId: p1Id, quantity: 2 }],
        payments: [{ method: 'CASH', amount: 2260 }],
      });
    expect(sale1.status).toBe(201);

    // Make POS Sale 2: 3x Cotton Cloth (Unit 500, Gross 1500, VAT 0% = 0, Total 1500, COGS = 3*300 = 900)
    const sale2 = await request(app)
      .post('/api/retailer/sales')
      .set('Cookie', store.cookie)
      .send({
        items: [{ productId: p2Id, quantity: 3 }],
        payments: [{ method: 'ESEWA', amount: 1500, reference: 'ESW-998877' }],
      });
    expect(sale2.status).toBe(201);

    // Query Financial Overview
    const reportRes = await request(app)
      .get('/api/retailer/reports/overview?period=this_month')
      .set('Cookie', store.cookie);

    expect(reportRes.status).toBe(200);
    const data = reportRes.body.data;

    // Total Invoices
    expect(data.summary.totalInvoices).toBe(2);

    // Net Sales = 2000 + 1500 = 3500.00
    expect(Number(data.summary.netSales)).toBe(3500);

    // Total Tax (13% on earbuds = 260.00)
    expect(Number(data.summary.totalTax)).toBe(260);

    // Grand Total Revenue = 2260 + 1500 = 3760.00
    expect(Number(data.summary.grandTotalRevenue)).toBe(3760);

    // Cost of Goods Sold = (2 * 600) + (3 * 300) = 1200 + 900 = 2100.00
    expect(Number(data.summary.costOfGoodsSold)).toBe(2100);

    // Gross Profit = Net Sales (3500) - COGS (2100) = 1400.00
    expect(Number(data.summary.grossProfit)).toBe(1400);

    // Gross Margin % = (1400 / 3500) * 100 = 40%
    expect(data.summary.grossMarginPercentage).toBe(40);

    // Average Order Value = 3760 / 2 = 1880.00
    expect(data.summary.averageOrderValue).toBe(1880);
  });

  it('2. computes Nepal 13% VAT collected vs Tax-exempt sales accurately for IRD compliance', async () => {
    const store = await createActiveRetailer(`vat-${uniqueId()}`);

    const catRes = await request(app)
      .post('/api/retailer/categories')
      .set('Cookie', store.cookie)
      .send({ name: 'Groceries', slug: `groc-${uniqueId()}` });
    const catId = catRes.body.data.id;

    // Product 1: Taxable 13%
    const p1 = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', store.cookie)
      .send({
        categoryId: catId,
        name: 'Imported Coffee Beans',
        sku: `SKU-COF-${uniqueId()}`,
        costPrice: 400,
        sellingPrice: 1000,
        taxType: 'TAXABLE',
        taxRate: 13,
        initialStock: 20,
      });

    // Product 2: Exempt 0%
    const p2 = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', store.cookie)
      .send({
        categoryId: catId,
        name: 'Fresh Rice Bag 25kg',
        sku: `SKU-RICE-${uniqueId()}`,
        costPrice: 2000,
        sellingPrice: 2500,
        taxType: 'EXEMPT',
        taxRate: 0,
        initialStock: 20,
      });

    // Sale with both items
    const saleRes = await request(app)
      .post('/api/retailer/sales')
      .set('Cookie', store.cookie)
      .send({
        items: [
          { productId: p1.body.data.id, quantity: 1 }, // 1000 + 130 VAT = 1130
          { productId: p2.body.data.id, quantity: 2 }, // 5000 + 0 VAT = 5000
        ],
        payments: [{ method: 'BANK', amount: 6130, reference: 'NABIL-TX-1002' }],
      });
    expect(saleRes.status).toBe(201);

    // Query Tax Report
    const taxRes = await request(app)
      .get('/api/retailer/reports/tax?period=this_month')
      .set('Cookie', store.cookie);

    expect(taxRes.status).toBe(200);
    const taxData = taxRes.body.data;

    expect(taxData.business.panNumber).toBe('600778899');
    expect(Number(taxData.vatSummary.totalTaxableSales)).toBe(1000);
    expect(Number(taxData.vatSummary.totalVatCollected)).toBe(130);
    expect(Number(taxData.vatSummary.totalExemptSales)).toBe(5000);
    expect(Number(taxData.vatSummary.totalSalesGross)).toBe(6130);
    expect(taxData.vatSummary.effectiveVatRate).toBe('13%');
    expect(taxData.invoiceRegisters.length).toBe(1);
    expect(Number(taxData.invoiceRegisters[0].taxableAmount)).toBe(1000);
    expect(Number(taxData.invoiceRegisters[0].vatAmount)).toBe(130);
    expect(Number(taxData.invoiceRegisters[0].exemptAmount)).toBe(5000);
  });

  it('3. breaks down sales by digital & cash payment methods and aggregates balance sheet snapshots', async () => {
    const store = await createActiveRetailer(`pay-${uniqueId()}`);

    const cat = await request(app)
      .post('/api/retailer/categories')
      .set('Cookie', store.cookie)
      .send({ name: 'Stationery', slug: `stat-${uniqueId()}` });

    const p = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', store.cookie)
      .send({
        categoryId: cat.body.data.id,
        name: 'Notebook A4',
        sku: `SKU-NB-${uniqueId()}`,
        costPrice: 50,
        sellingPrice: 100,
        taxType: 'EXEMPT',
        taxRate: 0,
        initialStock: 100,
      });

    // Sale 1: CASH Rs. 200
    await request(app)
      .post('/api/retailer/sales')
      .set('Cookie', store.cookie)
      .send({
        items: [{ productId: p.body.data.id, quantity: 2 }],
        payments: [{ method: 'CASH', amount: 200 }],
      });

    // Sale 2: KHALTI Rs. 300
    await request(app)
      .post('/api/retailer/sales')
      .set('Cookie', store.cookie)
      .send({
        items: [{ productId: p.body.data.id, quantity: 3 }],
        payments: [{ method: 'KHALTI', amount: 300, reference: 'KHLT-443322' }],
      });

    // Create a Khata customer with debit balance (receivable)
    const custPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const cust = await request(app)
      .post('/api/retailer/customers')
      .set('Cookie', store.cookie)
      .send({
        name: 'Udharo Ram',
        phone: custPhone,
        creditLimit: 10000,
        openingBalance: 4500,
      });
    expect(cust.status).toBe(201);

    // Create a Supplier with payable balance
    const supPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const sup = await request(app)
      .post('/api/retailer/suppliers')
      .set('Cookie', store.cookie)
      .send({
        name: 'Wholesaler Krishna',
        phone: supPhone,
        openingBalance: 7500,
      });
    expect(sup.status).toBe(201);

    // Check financial overview
    const res = await request(app)
      .get('/api/retailer/reports/overview?period=this_month')
      .set('Cookie', store.cookie);

    expect(res.status).toBe(200);
    const data = res.body.data;

    // Check payments breakdown
    const cashEntry = data.paymentsBreakdown.find((pb: any) => pb.method === 'CASH');
    const khaltiEntry = data.paymentsBreakdown.find((pb: any) => pb.method === 'KHALTI');

    expect(cashEntry).toBeDefined();
    expect(Number(cashEntry.totalAmount)).toBe(200);
    expect(cashEntry.count).toBe(1);

    expect(khaltiEntry).toBeDefined();
    expect(Number(khaltiEntry.totalAmount)).toBe(300);
    expect(khaltiEntry.count).toBe(1);

    // Check Balance Snapshot
    expect(Number(data.balanceSnapshot.outstandingKhataReceivables)).toBe(4500);
    expect(data.balanceSnapshot.debtorCount).toBe(1);
    expect(Number(data.balanceSnapshot.outstandingSupplierPayables)).toBe(7500);
    expect(data.balanceSnapshot.creditorCount).toBe(1);
  });

  it('4. aggregates product performance and ranks top selling products by volume and revenue', async () => {
    const store = await createActiveRetailer(`prod-${uniqueId()}`);

    const cat = await request(app)
      .post('/api/retailer/categories')
      .set('Cookie', store.cookie)
      .send({ name: 'Bakery', slug: `bak-${uniqueId()}` });

    const pA = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', store.cookie)
      .send({
        categoryId: cat.body.data.id,
        name: 'Premium Chocolate Cake',
        sku: `CAKE-${uniqueId()}`,
        costPrice: 500,
        sellingPrice: 1200,
        taxType: 'EXEMPT',
        taxRate: 0,
        initialStock: 20,
      });

    const pB = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', store.cookie)
      .send({
        categoryId: cat.body.data.id,
        name: 'Fresh Bread Loaf',
        sku: `BREAD-${uniqueId()}`,
        costPrice: 40,
        sellingPrice: 80,
        taxType: 'EXEMPT',
        taxRate: 0,
        initialStock: 100,
      });

    // Sale: 1x Cake (1200 revenue) + 10x Bread (800 revenue)
    await request(app)
      .post('/api/retailer/sales')
      .set('Cookie', store.cookie)
      .send({
        items: [
          { productId: pA.body.data.id, quantity: 1 },
          { productId: pB.body.data.id, quantity: 10 },
        ],
        payments: [{ method: 'CASH', amount: 2000 }],
      });

    // Query Products sorted by revenue (default)
    const resRev = await request(app)
      .get('/api/retailer/reports/products?sortBy=revenue')
      .set('Cookie', store.cookie);

    expect(resRev.status).toBe(200);
    const prodRev = resRev.body.data.products;
    expect(prodRev.length).toBe(2);
    // Cake should be first by revenue (1200 vs 800)
    expect(prodRev[0].name).toBe('Premium Chocolate Cake');
    expect(Number(prodRev[0].revenue)).toBe(1200);
    expect(Number(prodRev[0].grossProfit)).toBe(700); // 1200 - 500

    // Query Products sorted by units sold
    const resUnits = await request(app)
      .get('/api/retailer/reports/products?sortBy=units')
      .set('Cookie', store.cookie);

    expect(resUnits.status).toBe(200);
    const prodUnits = resUnits.body.data.products;
    // Bread should be first by units (10 vs 1)
    expect(prodUnits[0].name).toBe('Fresh Bread Loaf');
    expect(prodUnits[0].unitsSold).toBe(10);
  });

  it('5. filters reports by date ranges accurately', async () => {
    const store = await createActiveRetailer(`filter-${uniqueId()}`);

    // Overview with today
    const resToday = await request(app)
      .get('/api/retailer/reports/overview?period=today')
      .set('Cookie', store.cookie);
    expect(resToday.status).toBe(200);
    expect(resToday.body.data.period.label).toBe('today');

    // Overview with custom dates
    const resCustom = await request(app)
      .get('/api/retailer/reports/overview?period=custom&startDate=2026-01-01&endDate=2026-12-31')
      .set('Cookie', store.cookie);
    expect(resCustom.status).toBe(200);
    expect(resCustom.body.data.period.label).toBe('custom');
  });

  it('6. strictly restricts CASHIER role from viewing financial reports and tax data (403 Forbidden)', async () => {
    const store = await createActiveRetailer(`rbac-${uniqueId()}`);

    // Invite Cashier
    const cashierEmail = `cashier-${uniqueId()}@example.com`;
    const invRes = await request(app)
      .post('/api/retailer/staff/invite')
      .set('Cookie', store.cookie)
      .send({ email: cashierEmail, role: 'CASHIER' });
    const token = invRes.body.data.token;

    // Cashier signs up
    const cashierPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({
        firstName: 'Counter',
        lastName: 'Cashier',
        email: cashierEmail,
        phone: cashierPhone,
        password: 'Password123!',
      });
    const cashierCookie = extractCookie(signup);

    // Accept invite
    await request(app)
      .post('/api/retailer/staff/invites/accept')
      .set('Cookie', cashierCookie!)
      .send({ token });

    // Attempt to access financial overview as Cashier
    const forbiddenOverview = await request(app)
      .get('/api/retailer/reports/overview')
      .set('Cookie', cashierCookie!);
    expect(forbiddenOverview.status).toBe(403);
    expect(forbiddenOverview.body.error.code).toBe('RETAILER_FORBIDDEN');

    // Attempt to access tax reports as Cashier
    const forbiddenTax = await request(app)
      .get('/api/retailer/reports/tax')
      .set('Cookie', cashierCookie!);
    expect(forbiddenTax.status).toBe(403);
    expect(forbiddenTax.body.error.code).toBe('RETAILER_FORBIDDEN');
  });

  it('7. strictly isolates financial figures between retailer stores (multi-tenant boundary)', async () => {
    const storeA = await createActiveRetailer(`storeA-${uniqueId()}`);
    const storeB = await createActiveRetailer(`storeB-${uniqueId()}`);

    // Create product and sale in Store A
    const catA = await request(app)
      .post('/api/retailer/categories')
      .set('Cookie', storeA.cookie)
      .send({ name: 'General', slug: `gen-${uniqueId()}` });

    const pA = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', storeA.cookie)
      .send({
        categoryId: catA.body.data.id,
        name: 'Store A Exclusive Item',
        sku: `SKU-A-${uniqueId()}`,
        costPrice: 500,
        sellingPrice: 1500,
        taxType: 'EXEMPT',
        taxRate: 0,
        initialStock: 50,
      });

    await request(app)
      .post('/api/retailer/sales')
      .set('Cookie', storeA.cookie)
      .send({
        items: [{ productId: pA.body.data.id, quantity: 5 }],
        payments: [{ method: 'CASH', amount: 7500 }],
      });

    // Store A reports should show 7500 revenue
    const repA = await request(app)
      .get('/api/retailer/reports/overview')
      .set('Cookie', storeA.cookie);
    expect(Number(repA.body.data.summary.grandTotalRevenue)).toBe(7500);

    // Store B reports MUST be 0
    const repB = await request(app)
      .get('/api/retailer/reports/overview')
      .set('Cookie', storeB.cookie);
    expect(repB.body.data.summary.totalInvoices).toBe(0);
    expect(Number(repB.body.data.summary.grandTotalRevenue)).toBe(0);
    expect(Number(repB.body.data.summary.grossProfit)).toBe(0);
  });
});
