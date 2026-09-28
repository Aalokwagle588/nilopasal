# Nilopasal Production Deployment Guide

This guide details the steps to deploy the Nilopasal Backend and connect it permanently to **`https://nilopasal.com`**.

---

## Architecture Overview

```
User visits nilopasal.com/account
             │
             ▼
      Cloudflare Edge (nilopasal.com)
      ├── /api/* & /health ──► Cloudflare Worker / Origin Rule ──► Render Backend (https://nilopasal-api.onrender.com)
      │                                                                    │
      │                                                                    ▼
      │                                                           PostgreSQL 16 Database
      └── All other pages (HTML, CSS, JS) ──► Static Hosting
```

---

## Step 1: Push Project to GitHub

A single command publishes your repository to GitHub:

```bash
cd /Users/aalok/Nilopasal
git init
git add .
git commit -m "feat: complete Nilopasal Retailer ERP and deployment infrastructure"
gh repo create nilopasal --public --source=. --remote=origin --push
```

---

## Step 2: Deploy on Render.com (Recommended — 1-Click Setup)

Render provides a managed PostgreSQL database and a Python FastAPI web service in a single dashboard:

1. Go to [https://dashboard.render.com](https://dashboard.render.com) and log in with your GitHub account (`Aalokwagle588`).
2. Click **New +** -> **Blueprint**.
3. Select the `nilopasal` repository.
4. Render will automatically read `render.yaml` and create two services:
   - **`nilopasal-db`**: Managed PostgreSQL 16 database.
   - **`nilopasal-api`**: Python FastAPI Web Service running Gunicorn + Uvicorn workers.
5. Click **Apply**.
6. Once deployed (typically 2-3 minutes), Render will give you a public URL like:
   `https://nilopasal-api.onrender.com`
7. Test the health endpoint:
   ```bash
   curl -i https://nilopasal-api.onrender.com/health
   ```
   *(Should return `{"success": true, "data": {"status": "ok"}}`)*

---

## Step 3: Link `nilopasal.com` to the Backend in Cloudflare

To ensure same-origin cookies and zero CORS issues, route `/api/*` on `nilopasal.com` directly to your Render backend:

### Option A: Using Cloudflare Worker (Quickest & Free)
1. In your Cloudflare Dashboard, select **`nilopasal.com`**.
2. Go to **Workers & Pages** -> **Create Application** -> **Create Worker**.
3. Name it `nilopasal-api-proxy`.
4. Click **Deploy**, then **Edit Code**.
5. Replace the code with the contents of `deploy/cloudflare-worker.js`.
6. Set `DEFAULT_BACKEND_ORIGIN = 'https://YOUR-RENDER-URL.onrender.com'` (or set it in **Settings** -> **Variables** as `BACKEND_API_ORIGIN`).
7. Save and Deploy.
8. Go to **Workers & Pages** -> **Routes** -> **Add Route**:
   - Route: `nilopasal.com/api/*` -> Worker: `nilopasal-api-proxy`
   - Route: `nilopasal.com/health` -> Worker: `nilopasal-api-proxy`
   - Zone: `nilopasal.com`

### Option B: Using Cloudflare Origin Rules
1. In Cloudflare Dashboard, go to **Rules** -> **Origin Rules** -> **Create Rule**.
2. Rule Name: `API Backend Route`.
3. When incoming requests match: **Custom filter expression**:
   - Field: `URI Path`
   - Operator: `starts with`
   - Value: `/api`
4. Set Host Header: `nilopasal-api.onrender.com`.
5. Set DNS Override: Resolve to `nilopasal-api.onrender.com`.
6. Save and Deploy.

---

## Step 4: Verification

1. Test the live health endpoint through Cloudflare:
   ```bash
   curl -i https://nilopasal.com/health
   ```
2. Open `https://nilopasal.com/account` in Chrome.
3. Register your account.
4. Your account is immediately created in the production PostgreSQL database, and the red error message is gone permanently!
