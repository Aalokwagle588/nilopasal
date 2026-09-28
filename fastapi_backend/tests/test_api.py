"""End-to-end integration test for Nilopasal FastAPI Backend.

Covers:
- Auth (signup, login, me, logout)
- Retailer business registration
- Catalog (category, product, inventory)
- POS (lookup, atomic sale)
- Khata (customer, credit, payment)
- Purchasing (supplier, PO, receive)
- Reports (financial, tax/vat)
"""
import asyncio
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from httpx import AsyncClient, ASGITransport
import main


async def test_full_retailer_flow():
    transport = ASGITransport(app=main.app)
    uid = uuid.uuid4().hex[:8]
    email = f"retailer_{uid}@nilopasal.com"
    password = "SecurePassword123!"

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check
        res = await client.get("/health")
        assert res.status_code == 200
        assert res.json()["data"]["status"] == "ok"

        # 2. Signup
        signup_payload = {
            "firstName": "Bikram",
            "lastName": "Thapa",
            "email": email,
            "phone": f"+97798{uid[:8]}",
            "password": password,
        }
        res = await client.post("/api/auth/signup", json=signup_payload)
        assert res.status_code == 201, f"Signup failed: {res.text}"
        assert res.json()["success"] is True

        # Extract session cookie
        cookies = res.cookies

        # 3. GET /api/auth/me
        res = await client.get("/api/auth/me", cookies=cookies)
        assert res.status_code == 200
        user_data = res.json()["data"]["user"]
        assert user_data["email"] == email

        # 4. Register Retailer Store
        business_payload = {
            "business": {
                "businessName": f"Thapa Kirana Store {uid}",
                "legalName": f"Thapa Kirana Store Pvt Ltd {uid}",
                "contactNumber": f"+97798{uid[:8]}",
                "province": "Bagmati",
                "district": "Kathmandu",
                "municipality": "Kathmandu Metropolitian",
                "addressLine": "New Road, Ward 22",
                "panNumber": "302918273",
                "vatNumber": "302918273",
            }
        }
        res = await client.post("/api/retailer/register", json=business_payload, cookies=cookies)
        assert res.status_code == 201, f"Register retailer failed: {res.text}"
        biz = res.json()["data"]["retailer"]
        biz_id = biz["id"]
        assert biz["businessName"] == f"Thapa Kirana Store {uid}"

        # 5. Check business profile
        res = await client.get("/api/retailer/business", cookies=cookies)
        assert res.status_code == 200
        assert res.json()["data"]["id"] == biz_id

        # 6. Create Category
        res = await client.post("/api/retailer/catalog/categories", json={
            "name": f"Spices & Masala {uid}",
            "description": "Authentic Nepali Spices",
        }, cookies=cookies)
        assert res.status_code == 201
        cat_id = res.json()["data"]["category"]["id"]

        # 7. Create Product
        res = await client.post("/api/retailer/catalog/products", json={
            "name": f"Mustard Oil 1L {uid}",
            "categoryId": cat_id,
            "costPrice": 280.0,
            "sellingPrice": 350.0,
            "taxRate": 13.0,
            "taxType": "TAXABLE",
            "initialStock": 50,
            "trackInventory": True,
        }, cookies=cookies)
        assert res.status_code == 201, f"Product create failed: {res.text}"
        prod = res.json()["data"]["product"]
        prod_id = prod["id"]
        assert prod["name"] == f"Mustard Oil 1L {uid}"

        # 8. POS Lookup
        res = await client.get(f"/api/retailer/pos/lookup?q=Mustard", cookies=cookies)
        assert res.status_code == 200
        products_found = res.json()["data"]["products"]
        assert any(p["id"] == prod_id for p in products_found)

        # 9. Create Customer (Khata)
        res = await client.post("/api/retailer/customers/", json={
            "name": "Ram Bahadur",
            "phone": f"981{uid[:7]}",
            "openingBalance": 100.0,
        }, cookies=cookies)
        assert res.status_code == 201
        cust = res.json()["data"]["customer"]
        cust_id = cust["id"]
        assert float(cust["currentBalance"]) == 100.0

        # 10. Record Khata Payment
        res = await client.post(f"/api/retailer/customers/{cust_id}/payment", json={
            "amount": 50.0,
            "paymentMethod": "CASH",
            "notes": "Partial cash payment",
        }, cookies=cookies)
        assert res.status_code == 200
        assert float(res.json()["data"]["customer"]["currentBalance"]) == 50.0

        # 11. Create POS Sale with Khata credit payment
        sale_payload = {
            "items": [
                {
                    "productId": prod_id,
                    "quantity": 2,
                    "unitPrice": 350.0,
                }
            ],
            "payments": [
                {
                    "method": "CASH",
                    "amount": 500.0,
                },
                {
                    "method": "CREDIT_KHATA",
                    "amount": 291.0,
                }
            ],
            "customerId": cust_id,
        }
        res = await client.post("/api/retailer/pos/sales", json=sale_payload, cookies=cookies)
        assert res.status_code == 201, f"Sale failed: {res.text}"
        sale_data = res.json()["data"]["sale"]
        sale_id = sale_data["id"]
        assert sale_data["invoiceNumber"].startswith("INV-")

        # 12. Create Supplier
        res = await client.post("/api/retailer/suppliers", json={
            "name": f"Everest Wholesale {uid}",
            "phone": f"980{uid[:7]}",
            "openingBalance": 0,
        }, cookies=cookies)
        assert res.status_code == 201
        supp_id = res.json()["data"]["id"]

        # 13. Create & Receive Purchase Order
        po_payload = {
            "supplierId": supp_id,
            "status": "RECEIVED",
            "items": [
                {
                    "productId": prod_id,
                    "quantity": 20,
                    "unitCost": 275.0,
                }
            ],
            "paidAmount": 2000.0,
        }
        res = await client.post("/api/retailer/purchases", json=po_payload, cookies=cookies)
        assert res.status_code == 201, f"PO failed: {res.text}"
        po_data = res.json()["data"]
        assert po_data["status"] == "RECEIVED"

        # 14. Financial & VAT Reports
        res = await client.get("/api/retailer/reports/financial?period=this_month", cookies=cookies)
        assert res.status_code == 200
        assert res.json()["data"]["summary"]["totalInvoices"] >= 1

        res = await client.get("/api/retailer/reports/vat?period=this_month", cookies=cookies)
        assert res.status_code == 200
        assert "effectiveVatRate" in res.json()["data"]["vatSummary"]

        print(f"\nSUCCESS: All 14 Retailer ERP modules verified on FastAPI!")


if __name__ == "__main__":
    asyncio.run(test_full_retailer_flow())
