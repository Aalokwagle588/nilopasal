# Nilopasal (नीलोपसल) — Modern E-Commerce & Retailer ERP for Nepal

Nilopasal is a full-stack e-commerce marketplace and subscription-based Retailer ERP system built for Nepali retail shops (किराना पसल, डिपार्टमेन्टल स्टोर, कपडा पसल, हार्डवेयर, इलेक्ट्रोनिक्स).

## Architecture

- **Storefront**: Desktop-first responsive UI (HTML5, TailwindCSS, Vanilla JS)
- **Backend API**: Node.js 20, TypeScript, Express.js 5
- **Database**: PostgreSQL 16 managed via Prisma ORM
- **Security**: Strict multi-tenant row-level boundaries, RFC 6265bis `__Host-` session cookies, argon2 password hashing, and role-based access control (RBAC).

## Retailer ERP Modules

1. **POS Counter & Billing**: High-speed barcode/SKU scanner, Cash/eSewa/Khalti/Bank payments, sequential invoices.
2. **Digital Customer Khata (उधारो खाता)**: Real-time customer balances, credit limits, settlement receipts.
3. **Product & Inventory ERP**: Multi-variant SKUs, cost & selling prices, automatic stock in/out movement audit trails.
4. **Supplier Purchasing**: Inbound purchase orders, accounts payable, automatic stock increment on receive.
5. **Multi-Role RBAC & Audit Trails**: Owner, Admin, Manager, and Cashier permission tiers with immutable audit logs.
6. **Business Reports & VAT**: Real-time P&L (Gross Profit = Net Sales - COGS), Nepal IRD 13% VAT reconciliation (Annex 5 register), and product margin analytics.

## Quick Start (Local Development)

```bash
# 1. Start PostgreSQL (e.g. via Docker or local service)
# 2. Setup backend
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
npm start

# 3. Serve storefront
cd ..
python3 -m http.server 3000 -d storefront/dist
```

- Storefront: `http://localhost:3000`
- Retailer ERP: `http://localhost:3000/retailer-dashboard.html`
- Backend API: `http://localhost:4000`

## Production Cloud Deployment (Render.com 1-Click)

1. Open [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Blueprint**.
3. Select this repository: `Aalokwagle588/nilopasal`.
4. Render will read `render.yaml` and provision both:
   - Managed PostgreSQL 16 database (`nilopasal-db`).
   - Node.js API Web Service (`nilopasal-api`).
5. In Cloudflare for `nilopasal.com`, deploy `deploy/cloudflare-worker.js` or add an Origin Rule to proxy `/api/*` to your Render service URL.
