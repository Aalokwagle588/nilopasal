from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.errors import AppError
from app.utils.response import success
from app.models import (
    RetailSale, RetailSaleItem, RetailSalePayment,
    RetailerCustomer, RetailerSupplier, RetailerBusiness, KhataTransaction,
    KhataTransactionType,
)
from app.middleware.auth import get_retailer_access

router = APIRouter(prefix="/api/retailer/reports", tags=["reports"])

VALID_PERIODS = {"today", "yesterday", "this_week", "this_month", "last_month", "custom"}


def resolve_date_range(period: str = "this_month", start_date: str = None, end_date: str = None):
    now = datetime.now(timezone.utc)

    if period == "custom" and (start_date or end_date):
        frm = datetime.fromisoformat(start_date) if start_date else datetime.min.replace(tzinfo=timezone.utc)
        to = datetime.fromisoformat(end_date) if end_date else now
        return frm, to

    if period == "today":
        frm = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return frm, now

    if period == "yesterday":
        from datetime import timedelta
        yesterday = now.replace(hour=0, minute=0, second=0, microsecond=0)
        frm = yesterday - timedelta(days=1)
        to = yesterday.replace(hour=23, minute=59, second=59, microsecond=999999)
        return frm, to

    if period == "this_week":
        from datetime import timedelta
        frm = now - timedelta(days=7)
        frm = frm.replace(hour=0, minute=0, second=0, microsecond=0)
        return frm, now

    if period == "last_month":
        from datetime import timedelta
        first_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_of_prev = first_of_month - timedelta(days=1)
        frm = last_of_prev.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        to = last_of_prev.replace(hour=23, minute=59, second=59, microsecond=999999)
        return frm, to

    # Default: this_month
    frm = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return frm, now


@router.get("/financial")
async def get_financial_overview(
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
    period: str = Query("this_month"),
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
):
    business_id = retailer_access["retailerBusinessId"]
    frm, to = resolve_date_range(period, startDate, endDate)

    sales_result = await db.execute(
        select(RetailSale)
        .where(
            RetailSale.retailerBusinessId == business_id,
            RetailSale.saleDate >= frm,
            RetailSale.saleDate <= to,
        )
        .order_by(RetailSale.saleDate)
    )
    sales = sales_result.scalars().all()

    total_subtotal = Decimal("0")
    total_discount = Decimal("0")
    total_tax = Decimal("0")
    total_revenue = Decimal("0")
    total_cogs = Decimal("0")
    payment_map = {}
    trend_map = {}

    for sale in sales:
        total_subtotal += sale.subtotal
        total_discount += sale.discount
        total_tax += sale.tax
        total_revenue += sale.grandTotal

        items_result = await db.execute(
            select(RetailSaleItem).where(RetailSaleItem.saleId == sale.id)
        )
        for item in items_result.scalars().all():
            total_cogs += item.costPriceSnapshot * item.quantity

        payments_result = await db.execute(
            select(RetailSalePayment).where(RetailSalePayment.saleId == sale.id)
        )
        for p in payments_result.scalars().all():
            key = str(p.method)
            if key not in payment_map:
                payment_map[key] = {"count": 0, "total": Decimal("0")}
            payment_map[key]["count"] += 1
            payment_map[key]["total"] += p.amount

        day_key = sale.saleDate.strftime("%Y-%m-%d")
        if day_key not in trend_map:
            trend_map[day_key] = {"revenue": Decimal("0"), "count": 0}
        trend_map[day_key]["revenue"] += sale.grandTotal
        trend_map[day_key]["count"] += 1

    net_sales = total_subtotal
    gross_profit = net_sales - total_cogs
    gross_margin_pct = float(gross_profit / net_sales * 100) if net_sales > 0 else 0
    total_invoices = len(sales)
    avg_order = float(total_revenue / total_invoices) if total_invoices > 0 else 0

    payments_breakdown = [
        {
            "method": method,
            "count": data["count"],
            "totalAmount": str(data["total"]),
            "percentage": float(data["total"] / total_revenue * 100) if total_revenue > 0 else 0,
        }
        for method, data in payment_map.items()
    ]

    receivables = await db.execute(
        select(func.sum(RetailerCustomer.currentBalance), func.count(RetailerCustomer.id))
        .where(RetailerCustomer.retailerBusinessId == business_id, RetailerCustomer.currentBalance > 0)
    )
    rec_row = receivables.one()

    payables = await db.execute(
        select(func.sum(RetailerSupplier.currentBalance), func.count(RetailerSupplier.id))
        .where(RetailerSupplier.retailerBusinessId == business_id, RetailerSupplier.currentBalance > 0)
    )
    pay_row = payables.one()

    daily_trends = [
        {"date": date, "revenue": str(data["revenue"]), "invoices": data["count"]}
        for date, data in sorted(trend_map.items())
    ]

    return success({
        "period": {"from": frm.isoformat(), "to": to.isoformat(), "label": period},
        "summary": {
            "totalInvoices": total_invoices,
            "grossSales": str(total_subtotal + total_discount),
            "totalDiscount": str(total_discount),
            "netSales": str(net_sales),
            "totalTax": str(total_tax),
            "grandTotalRevenue": str(total_revenue),
            "costOfGoodsSold": str(total_cogs),
            "grossProfit": str(gross_profit),
            "grossMarginPercentage": round(gross_margin_pct, 2),
            "averageOrderValue": round(avg_order, 2),
        },
        "balanceSnapshot": {
            "outstandingKhataReceivables": str(rec_row[0] or 0),
            "debtorCount": rec_row[1] or 0,
            "outstandingSupplierPayables": str(pay_row[0] or 0),
            "creditorCount": pay_row[1] or 0,
        },
        "paymentsBreakdown": payments_breakdown,
        "dailyTrends": daily_trends,
    })


@router.get("/vat")
async def get_vat_report(
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
    period: str = Query("this_month"),
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
):
    business_id = retailer_access["retailerBusinessId"]
    frm, to = resolve_date_range(period, startDate, endDate)

    biz_result = await db.execute(
        select(RetailerBusiness.businessName, RetailerBusiness.legalName, RetailerBusiness.panNumber, RetailerBusiness.vatNumber)
        .where(RetailerBusiness.id == business_id)
    )
    biz = biz_result.one_or_none()

    sales_result = await db.execute(
        select(RetailSale)
        .where(
            RetailSale.retailerBusinessId == business_id,
            RetailSale.saleDate >= frm,
            RetailSale.saleDate <= to,
        )
        .order_by(RetailSale.saleDate.desc())
    )
    sales = sales_result.scalars().all()

    total_taxable = Decimal("0")
    total_vat = Decimal("0")
    total_exempt = Decimal("0")
    total_gross = Decimal("0")
    registers = []

    for sale in sales:
        items_result = await db.execute(
            select(RetailSaleItem).where(RetailSaleItem.saleId == sale.id)
        )
        items = items_result.scalars().all()

        sale_taxable = Decimal("0")
        sale_vat = Decimal("0")
        sale_exempt = Decimal("0")

        for item in items:
            if item.tax > 0:
                taxable_base = item.subtotal - item.tax
                sale_taxable += taxable_base
                sale_vat += item.tax
            else:
                sale_exempt += item.subtotal

        total_taxable += sale_taxable
        total_vat += sale_vat
        total_exempt += sale_exempt
        total_gross += sale.grandTotal

        registers.append({
            "id": sale.id,
            "invoiceNumber": sale.invoiceNumber,
            "saleDate": sale.saleDate.isoformat(),
            "taxableAmount": str(sale_taxable),
            "vatAmount": str(sale_vat),
            "exemptAmount": str(sale_exempt),
            "grandTotal": str(sale.grandTotal),
        })

    return success({
        "business": {
            "businessName": biz[0] if biz else "",
            "legalName": biz[1] if biz else "",
            "panNumber": biz[2] if biz else None,
            "vatNumber": biz[3] if biz else None,
        },
        "period": {"from": frm.isoformat(), "to": to.isoformat(), "label": period},
        "vatSummary": {
            "totalTaxableSales": str(total_taxable),
            "totalVatCollected": str(total_vat),
            "totalExemptSales": str(total_exempt),
            "totalSalesGross": str(total_gross),
            "effectiveVatRate": "13%",
            "invoiceCount": len(sales),
        },
        "invoiceRegisters": registers,
    })


@router.get("/products")
async def get_product_performance(
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
    period: str = Query("this_month"),
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    sortBy: str = Query("revenue"),  # revenue | units | profit
    limit: int = Query(20, ge=1, le=100),
):
    business_id = retailer_access["retailerBusinessId"]
    frm, to = resolve_date_range(period, startDate, endDate)

    items_result = await db.execute(
        select(RetailSaleItem)
        .join(RetailSale, RetailSale.id == RetailSaleItem.saleId)
        .where(
            RetailSale.retailerBusinessId == business_id,
            RetailSale.saleDate >= frm,
            RetailSale.saleDate <= to,
        )
    )
    items = items_result.scalars().all()

    product_map = {}
    for item in items:
        key = item.productId
        if key not in product_map:
            product_map[key] = {
                "productId": key,
                "name": item.productNameSnapshot,
                "sku": item.skuSnapshot,
                "unitsSold": 0,
                "revenue": Decimal("0"),
                "cost": Decimal("0"),
            }
        product_map[key]["unitsSold"] += item.quantity
        product_map[key]["revenue"] += item.subtotal
        product_map[key]["cost"] += item.costPriceSnapshot * item.quantity

    performance = []
    for p in product_map.values():
        gross_profit = p["revenue"] - p["cost"]
        margin_pct = float(gross_profit / p["revenue"] * 100) if p["revenue"] > 0 else 0
        performance.append({
            "productId": p["productId"],
            "name": p["name"],
            "sku": p["sku"],
            "unitsSold": p["unitsSold"],
            "revenue": str(p["revenue"]),
            "costOfGoodsSold": str(p["cost"]),
            "grossProfit": str(gross_profit),
            "marginPercentage": round(margin_pct, 2),
        })

    if sortBy == "units":
        performance.sort(key=lambda x: x["unitsSold"], reverse=True)
    elif sortBy == "profit":
        performance.sort(key=lambda x: float(x["grossProfit"]), reverse=True)
    else:
        performance.sort(key=lambda x: float(x["revenue"]), reverse=True)

    return success({
        "period": {"from": frm.isoformat(), "to": to.isoformat(), "label": period},
        "products": performance[:limit],
    })
