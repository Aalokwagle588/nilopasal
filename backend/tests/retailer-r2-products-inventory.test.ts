import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { RetailerMembershipRole } from '@prisma/client';

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
  const email = `retailer-r2-${suffix}@example.com`;

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
        businessName: `Store ${suffix}`,
        province: 'Bagmati',
        district: 'Kathmandu',
        municipality: 'Kathmandu Metro',
        addressLine: 'Tripureshwor',
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

describe('Nilopasal Phase R2 — Product & Inventory ERP', () => {
  it('1. category CRUD works with store-scoped slugs and validation', async () => {
    const id = uniqueId();
    const { cookie, businessId } = await createActiveRetailer(id);

    // Create Category 1
    const createRes = await request(app)
      .post('/api/retailer/categories')
      .set('Cookie', cookie)
      .send({
        name: 'Beverages & Drinks',
        description: 'Cold sodas, fruit juices, and mineral water',
        sortOrder: 1,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.name).toBe('Beverages & Drinks');
    expect(createRes.body.data.slug).toBe('beverages-drinks');
    const catId = createRes.body.data.id;

    // List categories
    const listRes = await request(app)
      .get('/api/retailer/categories')
      .set('Cookie', cookie);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.categories.length).toBe(1);
    expect(listRes.body.data.categories[0].id).toBe(catId);

    // Get single category
    const getRes = await request(app)
      .get(`/api/retailer/categories/${catId}`)
      .set('Cookie', cookie);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.name).toBe('Beverages & Drinks');

    // Update category
    const updateRes = await request(app)
      .patch(`/api/retailer/categories/${catId}`)
      .set('Cookie', cookie)
      .send({
        name: 'Cold Beverages & Juices',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('Cold Beverages & Juices');

    // Create duplicate name: should generate auto-suffixed slug to prevent crash
    const dupRes = await request(app)
      .post('/api/retailer/categories')
      .set('Cookie', cookie)
      .send({
        name: 'Beverages & Drinks',
      });

    expect(dupRes.status).toBe(201);
    expect(dupRes.body.data.slug).toContain('beverages-drinks-');
  });

  it('2. product creation works with price, unit, tax rate, and initial stock', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    // Create Category
    const catRes = await request(app)
      .post('/api/retailer/categories')
      .set('Cookie', cookie)
      .send({ name: 'Dairy & Eggs' });
    const categoryId = catRes.body.data.id;

    // Create Product
    const prodRes = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', cookie)
      .send({
        name: 'DDC Standard Milk 500ml',
        categoryId,
        costPrice: 45.0,
        sellingPrice: 50.0,
        mrp: 50.0,
        unit: 'PACK',
        taxRate: 0,
        taxType: 'NON_TAXABLE',
        initialStock: 20,
        lowStockThreshold: 5,
      });

    expect(prodRes.status).toBe(201);
    expect(prodRes.body.success).toBe(true);
    const prod = prodRes.body.data;
    expect(prod.name).toBe('DDC Standard Milk 500ml');
    expect(prod.sku).toBeDefined();
    expect(Number(prod.costPrice)).toBe(45);
    expect(Number(prod.sellingPrice)).toBe(50);
    expect(prod.inventories.length).toBe(1);
    expect(prod.inventories[0].quantityAvailable).toBe(20);
  });

  it('3. opening stock transaction is logged in audit history on product creation', async () => {
    const id = uniqueId();
    const { cookie, businessId, ownerUserId } = await createActiveRetailer(id);

    const prodRes = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', cookie)
      .send({
        name: 'Wai Wai Noodles 75g',
        costPrice: 20.0,
        sellingPrice: 25.0,
        unit: 'PCS',
        initialStock: 50,
      });

    expect(prodRes.status).toBe(201);
    const productId = prodRes.body.data.id;

    // Check transaction log
    const txRes = await request(app)
      .get(`/api/retailer/inventory/transactions?productId=${productId}`)
      .set('Cookie', cookie);

    expect(txRes.status).toBe(200);
    expect(txRes.body.data.items.length).toBe(1);
    const tx = txRes.body.data.items[0];
    expect(tx.type).toBe('STOCK_IN');
    expect(tx.quantity).toBe(50);
    expect(tx.previousQuantity).toBe(0);
    expect(tx.newQuantity).toBe(50);
    expect(tx.referenceType).toBe('INITIAL_STOCK');
    expect(tx.performedBy).toBe(ownerUserId);
  });

  it('4. product search, filtering, and pagination works correctly', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    const catA = await request(app).post('/api/retailer/categories').set('Cookie', cookie).send({ name: 'Snacks' });
    const catB = await request(app).post('/api/retailer/categories').set('Cookie', cookie).send({ name: 'Spices' });

    await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Lays Classic Salted 50g',
      sku: 'LAYS-SALT-50',
      categoryId: catA.body.data.id,
      costPrice: 40,
      sellingPrice: 50,
      initialStock: 10,
    });

    await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Kurkure Masala Munch 80g',
      sku: 'KURK-MM-80',
      categoryId: catA.body.data.id,
      costPrice: 35,
      sellingPrice: 45,
      initialStock: 0, // out of stock
    });

    await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Everest Turmeric Powder 100g',
      sku: 'EVR-TURM-100',
      barcode: '8901234567890',
      categoryId: catB.body.data.id,
      costPrice: 60,
      sellingPrice: 80,
      initialStock: 3, // low stock (<= 5)
    });

    // 1. Search by name
    const searchRes = await request(app)
      .get('/api/retailer/products?search=Lays')
      .set('Cookie', cookie);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.items.length).toBe(1);
    expect(searchRes.body.data.items[0].name).toBe('Lays Classic Salted 50g');

    // 2. Search by Barcode
    const barcodeRes = await request(app)
      .get('/api/retailer/products?search=8901234567890')
      .set('Cookie', cookie);
    expect(barcodeRes.status).toBe(200);
    expect(barcodeRes.body.data.items.length).toBe(1);
    expect(barcodeRes.body.data.items[0].name).toBe('Everest Turmeric Powder 100g');

    // 3. Filter by Category
    const catFilterRes = await request(app)
      .get(`/api/retailer/products?categoryId=${catB.body.data.id}`)
      .set('Cookie', cookie);
    expect(catFilterRes.status).toBe(200);
    expect(catFilterRes.body.data.items.length).toBe(1);
    expect(catFilterRes.body.data.items[0].sku).toBe('EVR-TURM-100');

    // 4. Filter by stockStatus OUT_OF_STOCK
    const oosRes = await request(app)
      .get('/api/retailer/products?stockStatus=OUT_OF_STOCK')
      .set('Cookie', cookie);
    expect(oosRes.status).toBe(200);
    expect(oosRes.body.data.items.length).toBe(1);
    expect(oosRes.body.data.items[0].sku).toBe('KURK-MM-80');
  });

  it('5. product price and low-stock threshold update persists', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    const prodRes = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', cookie)
      .send({
        name: 'Sunflower Oil 1L',
        costPrice: 220,
        sellingPrice: 250,
        initialStock: 15,
        lowStockThreshold: 4,
      });

    const productId = prodRes.body.data.id;

    // Update sellingPrice and lowStockThreshold
    const updateRes = await request(app)
      .patch(`/api/retailer/products/${productId}`)
      .set('Cookie', cookie)
      .send({
        sellingPrice: 265,
        costPrice: 230,
        lowStockThreshold: 8,
      });

    expect(updateRes.status).toBe(200);
    expect(Number(updateRes.body.data.sellingPrice)).toBe(265);
    expect(Number(updateRes.body.data.costPrice)).toBe(230);

    // Verify lowStockThreshold in inventory
    const getRes = await request(app)
      .get(`/api/retailer/products/${productId}`)
      .set('Cookie', cookie);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.inventories[0].lowStockThreshold).toBe(8);
  });

  it('6. product variants can be added with independent SKUs and inventory tracking', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    // Base product with variants
    const prodRes = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', cookie)
      .send({
        name: 'Himalayan Pink Salt',
        costPrice: 80,
        sellingPrice: 100,
        unit: 'PACK',
        variants: [
          {
            title: '500g Pouch',
            sku: 'HPS-500G',
            costPrice: 45,
            sellingPrice: 60,
            initialStock: 25,
            lowStockThreshold: 5,
          },
          {
            title: '1kg Pouch',
            sku: 'HPS-1KG',
            costPrice: 80,
            sellingPrice: 110,
            initialStock: 15,
            lowStockThreshold: 3,
          },
        ],
      });

    expect(prodRes.status).toBe(201);
    expect(prodRes.body.data.variants.length).toBe(2);
    expect(prodRes.body.data.inventories.length).toBe(2);

    const productId = prodRes.body.data.id;

    // Add a 3rd variant via variant endpoint
    const newVarRes = await request(app)
      .post(`/api/retailer/products/${productId}/variants`)
      .set('Cookie', cookie)
      .send({
        title: '2kg Economy Pack',
        sku: 'HPS-2KG',
        costPrice: 150,
        sellingPrice: 200,
        initialStock: 10,
      });

    expect(newVarRes.status).toBe(201);
    expect(newVarRes.body.data.sku).toBe('HPS-2KG');

    // Verify total product info
    const fullProdRes = await request(app)
      .get(`/api/retailer/products/${productId}`)
      .set('Cookie', cookie);

    expect(fullProdRes.status).toBe(200);
    expect(fullProdRes.body.data.variants.length).toBe(3);
    // Total quantity: 25 + 15 + 10 = 50
    expect(fullProdRes.body.data.totalQuantity).toBe(50);
  });

  it('7. manual stock adjustment (STOCK_IN / ADJUSTMENT_IN) increases inventory and logs audit trail', async () => {
    const id = uniqueId();
    const { cookie, ownerUserId } = await createActiveRetailer(id);

    const prodRes = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', cookie)
      .send({
        name: 'Basmati Rice 25kg',
        costPrice: 2800,
        sellingPrice: 3200,
        initialStock: 5,
      });

    const inventoryId = prodRes.body.data.inventories[0].id;

    // Adjust Stock In (+10)
    const adjustRes = await request(app)
      .post('/api/retailer/inventory/adjust')
      .set('Cookie', cookie)
      .send({
        inventoryId,
        type: 'STOCK_IN',
        quantity: 10,
        reason: 'Received supplier delivery from Kalimati wholesale',
      });

    expect(adjustRes.status).toBe(200);
    expect(adjustRes.body.success).toBe(true);
    expect(adjustRes.body.data.inventory.quantityAvailable).toBe(15);
    expect(adjustRes.body.data.transaction.previousQuantity).toBe(5);
    expect(adjustRes.body.data.transaction.quantity).toBe(10);
    expect(adjustRes.body.data.transaction.newQuantity).toBe(15);
    expect(adjustRes.body.data.transaction.performedBy).toBe(ownerUserId);
    expect(adjustRes.body.data.transaction.reason).toBe('Received supplier delivery from Kalimati wholesale');
  });

  it('8. manual stock adjustment (DAMAGED / EXPIRED) decreases inventory and logs audit trail', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    const prodRes = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', cookie)
      .send({
        name: 'Glass Jar Honey 500g',
        costPrice: 350,
        sellingPrice: 420,
        initialStock: 8,
      });

    const inventoryId = prodRes.body.data.inventories[0].id;

    // Write off damaged (-2)
    const adjustRes = await request(app)
      .post('/api/retailer/inventory/adjust')
      .set('Cookie', cookie)
      .send({
        inventoryId,
        type: 'DAMAGED',
        quantity: 2,
        reason: 'Broken jar during unloading from shelf',
      });

    expect(adjustRes.status).toBe(200);
    expect(adjustRes.body.data.inventory.quantityAvailable).toBe(6);
    expect(adjustRes.body.data.transaction.previousQuantity).toBe(8);
    expect(adjustRes.body.data.transaction.quantity).toBe(2);
    expect(adjustRes.body.data.transaction.newQuantity).toBe(6);
    expect(adjustRes.body.data.transaction.type).toBe('DAMAGED');
  });

  it('9. negative stock adjustment is strictly rejected (400)', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    const prodRes = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', cookie)
      .send({
        name: 'Choco Pie 6-pack',
        costPrice: 120,
        sellingPrice: 150,
        initialStock: 3,
      });

    const inventoryId = prodRes.body.data.inventories[0].id;

    // Attempt to write off 5 when only 3 are available
    const adjustRes = await request(app)
      .post('/api/retailer/inventory/adjust')
      .set('Cookie', cookie)
      .send({
        inventoryId,
        type: 'EXPIRED',
        quantity: 5,
        reason: 'Expired batch found in back room',
      });

    expect(adjustRes.status).toBe(400);
    expect(adjustRes.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(adjustRes.body.error.message).toContain('Current stock is only 3 units');
  });

  it('10. low-stock and out-of-stock items endpoint flags accurately', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    // Product 1: In stock (qty 20 > threshold 5)
    await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Item In Stock',
      costPrice: 10,
      sellingPrice: 15,
      initialStock: 20,
      lowStockThreshold: 5,
    });

    // Product 2: Low stock (qty 3 <= threshold 5)
    await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Item Low Stock',
      costPrice: 20,
      sellingPrice: 30,
      initialStock: 3,
      lowStockThreshold: 5,
    });

    // Product 3: Out of stock (qty 0 <= threshold 5)
    await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Item Out Of Stock',
      costPrice: 50,
      sellingPrice: 65,
      initialStock: 0,
      lowStockThreshold: 5,
    });

    const lowStockRes = await request(app)
      .get('/api/retailer/inventory/low-stock')
      .set('Cookie', cookie);

    expect(lowStockRes.status).toBe(200);
    expect(lowStockRes.body.data.count).toBe(2); // Products 2 and 3
    const names = lowStockRes.body.data.items.map((i: any) => i.productName);
    expect(names).toContain('Item Low Stock');
    expect(names).toContain('Item Out Of Stock');
  });

  it('11. inventory listing calculates accurate stock valuation and store KPIs', async () => {
    const id = uniqueId();
    const { cookie } = await createActiveRetailer(id);

    // Product A: 10 units @ 100 NPR = 1000 NPR
    await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Valuation Test A',
      costPrice: 100,
      sellingPrice: 130,
      initialStock: 10,
    });

    // Product B: 5 units @ 200 NPR = 1000 NPR
    await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Valuation Test B',
      costPrice: 200,
      sellingPrice: 250,
      initialStock: 5,
    });

    // Product C: 0 units @ 500 NPR = 0 NPR
    await request(app).post('/api/retailer/products').set('Cookie', cookie).send({
      name: 'Valuation Test C',
      costPrice: 500,
      sellingPrice: 600,
      initialStock: 0,
    });

    const invRes = await request(app)
      .get('/api/retailer/inventory')
      .set('Cookie', cookie);

    expect(invRes.status).toBe(200);
    const { kpis } = invRes.body.data;
    expect(kpis.totalSkus).toBe(3);
    expect(kpis.totalUnits).toBe(15); // 10 + 5 + 0
    expect(kpis.totalValuation).toBe('2000.00'); // 1000 + 1000
    expect(kpis.outOfStockCount).toBe(1);

    // Also verify getRetailerDashboardSummary now returns these real figures!
    const dashRes = await request(app)
      .get('/api/retailer/dashboard')
      .set('Cookie', cookie);

    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.summary.totalProducts).toBe(3);
    expect(dashRes.body.data.summary.totalUnits).toBe(15);
    expect(dashRes.body.data.summary.inventoryValuation).toBe('2000.00');
  });

  it('12. cross-tenant boundary: Retailer A cannot read, edit, or adjust Retailer B products/inventory', async () => {
    const idA = uniqueId();
    const idB = uniqueId();
    const storeA = await createActiveRetailer(idA);
    const storeB = await createActiveRetailer(idB);

    // Retailer A creates a category and product
    const catARes = await request(app)
      .post('/api/retailer/categories')
      .set('Cookie', storeA.cookie)
      .send({ name: 'Private Category A' });
    const catAId = catARes.body.data.id;

    const prodARes = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', storeA.cookie)
      .send({
        name: 'Confidential Recipe Sauce',
        categoryId: catAId,
        costPrice: 500,
        sellingPrice: 750,
        initialStock: 10,
      });
    const prodAId = prodARes.body.data.id;
    const invAId = prodARes.body.data.inventories[0].id;

    // Retailer B attempts to read Retailer A's category -> 404
    const bReadCat = await request(app)
      .get(`/api/retailer/categories/${catAId}`)
      .set('Cookie', storeB.cookie);
    expect(bReadCat.status).toBe(404);

    // Retailer B attempts to read Retailer A's product -> 404
    const bReadProd = await request(app)
      .get(`/api/retailer/products/${prodAId}`)
      .set('Cookie', storeB.cookie);
    expect(bReadProd.status).toBe(404);

    // Retailer B attempts to update Retailer A's product -> 404
    const bUpdateProd = await request(app)
      .patch(`/api/retailer/products/${prodAId}`)
      .set('Cookie', storeB.cookie)
      .send({ sellingPrice: 1 });
    expect(bUpdateProd.status).toBe(404);

    // Retailer B attempts to adjust stock of Retailer A's inventory -> 404
    const bAdjustStock = await request(app)
      .post('/api/retailer/inventory/adjust')
      .set('Cookie', storeB.cookie)
      .send({
        inventoryId: invAId,
        type: 'STOCK_IN',
        quantity: 50,
        reason: 'Illicit stock injection',
      });
    expect(bAdjustStock.status).toBe(404);
  });

  it('13. role permission restriction: CASHIER cannot adjust stock or modify product prices', async () => {
    const id = uniqueId();
    const { cookie: ownerCookie, businessId } = await createActiveRetailer(id);

    // Create a product as Owner
    const prodRes = await request(app)
      .post('/api/retailer/products')
      .set('Cookie', ownerCookie)
      .send({
        name: 'Cashier Test Biscuits',
        costPrice: 15,
        sellingPrice: 20,
        initialStock: 10,
      });
    const productId = prodRes.body.data.id;
    const inventoryId = prodRes.body.data.inventories[0].id;

    // Create active session for Cashier
    const cashierEmail = `cashier-${id}@example.com`;
    const sessionRes = await request(app)
      .post('/api/auth/signup')
      .send({
        firstName: 'Ram',
        lastName: 'Cashier',
        email: cashierEmail,
        password: 'Password123!',
      });
    const cashierCookie = extractCookie(sessionRes);
    const cashierUserId = sessionRes.body.data.user.id;

    // Link CASHIER membership to this user
    await prisma.retailerMembership.create({
      data: {
        userId: cashierUserId,
        retailerBusinessId: businessId,
        role: RetailerMembershipRole.CASHIER,
        status: 'ACTIVE',
      },
    });


    // Cashier can read products
    const readRes = await request(app)
      .get(`/api/retailer/products/${productId}`)
      .set('Cookie', cashierCookie!);
    expect(readRes.status).toBe(200);

    // Cashier CANNOT update product price -> 403 Forbidden
    const patchRes = await request(app)
      .patch(`/api/retailer/products/${productId}`)
      .set('Cookie', cashierCookie!)
      .send({ sellingPrice: 5 });
    expect(patchRes.status).toBe(403);
    expect(patchRes.body.error.code).toBe('RETAILER_FORBIDDEN');

    // Cashier CANNOT adjust inventory -> 403 Forbidden
    const adjustRes = await request(app)
      .post('/api/retailer/inventory/adjust')
      .set('Cookie', cashierCookie!)
      .send({
        inventoryId,
        type: 'STOCK_IN',
        quantity: 10,
        reason: 'Cashier unauthorized adjustment',
      });
    expect(adjustRes.status).toBe(403);
    expect(adjustRes.body.error.code).toBe('RETAILER_FORBIDDEN');
  });
});
