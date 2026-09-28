"""POS (Point of Sale) router — R3."""
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.errors import AppError
from app.middleware.auth import get_retailer_access
from app.models import (
    KhataTransaction,
    KhataTransactionType,
    RetailSale,
    RetailSaleItem,
    RetailSalePayment,
    RetailerAuditLog,
    RetailerCustomer,
    RetailerInventory,
    RetailerInventoryTransaction,
    RetailerInventoryTransactionType,
    RetailerPaymentMethod,
    RetailerPaymentStatus,
    RetailerProduct,
    RetailerProductVariant,
    RetailerTaxType,
)
from app.utils.response import success

router = APIRouter(prefix="/api/retailer", tags=["pos"])


# ─── Request Schemas ─────────────────────────────────────────────────────────


class SaleItemInput(BaseModel):
    productId: str
    variantId: Optional[str] = None
    quantity: int = Field(..., ge=1)
    unitPrice: Optional[float] = None
    discount: float = 0


class PaymentInput(BaseModel):
    method: RetailerPaymentMethod
    amount: float
    reference: Optional[str] = None


class CreateSaleBody(BaseModel):
    items: List[SaleItemInput]
    payments: List[PaymentInput]
    customerId: Optional[str] = None
    customerPhone: Optional[str] = None
    customerName: Optional[str] = None
    discount: float = 0  # overall bill discount
    notes: Optional[str] = None


# ─── Helper ───────────────────────────────────────────────────────────────────


def _serialize_sale(sale: RetailSale) -> dict:
    """Convert a RetailSale ORM object (with loaded relationships) to a dict."""
    return {
        "id": sale.id,
        "invoiceNumber": sale.invoiceNumber,
        "customerId": sale.customerId,
        "subtotal": float(sale.subtotal),
        "discount": float(sale.discount),
        "tax": float(sale.tax),
        "grandTotal": float(sale.grandTotal),
        "paidAmount": float(sale.paidAmount),
        "paymentStatus": sale.paymentStatus,
        "notes": sale.notes,
        "saleDate": sale.saleDate.isoformat(),
        "createdAt": sale.createdAt.isoformat(),
        "items": [
            {
                "id": i.id,
                "productId": i.productId,
                "variantId": i.variantId,
                "productNameSnapshot": i.productNameSnapshot,
                "skuSnapshot": i.skuSnapshot,
                "quantity": i.quantity,
                "unitPrice": float(i.unitPrice),
                "costPriceSnapshot": float(i.costPriceSnapshot),
                "discount": float(i.discount),
                "tax": float(i.tax),
                "subtotal": float(i.subtotal),
            }
            for i in sale.items
        ],
        "payments": [
            {
                "id": p.id,
                "method": p.method,
                "amount": float(p.amount),
                "reference": p.reference,
            }
            for p in sale.payments
        ],
    }


# ─── Routes ───────────────────────────────────────────────────────────────────


@router.get("/pos/lookup")
async def pos_lookup(
    q: str = Query(..., description="Barcode, SKU, or product name to search"),
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Barcode / SKU / name lookup for POS screen."""
    business_id: str = access["retailerBusinessId"]

    # Fetch products matching by barcode (exact), sku (ilike), name (ilike)
    # or any variant barcode/sku matching
    q_lower = f"%{q.lower()}%"

    # First find matching variant IDs so we can include their parent products
    variant_result = await db.execute(
        select(RetailerProductVariant.retailerProductId).where(
            RetailerProductVariant.barcode == q,
        )
    )
    variant_product_ids_barcode = [r[0] for r in variant_result.all()]

    variant_sku_result = await db.execute(
        select(RetailerProductVariant.retailerProductId).where(
            func.lower(RetailerProductVariant.sku).like(q_lower),
        )
    )
    variant_product_ids_sku = [r[0] for r in variant_sku_result.all()]

    combined_via_variant = list(set(variant_product_ids_barcode + variant_product_ids_sku))

    stmt = (
        select(RetailerProduct)
        .where(
            RetailerProduct.retailerBusinessId == business_id,
            or_(
                RetailerProduct.barcode == q,
                func.lower(RetailerProduct.sku).like(q_lower),
                func.lower(RetailerProduct.name).like(q_lower),
                RetailerProduct.id.in_(combined_via_variant),
            ),
        )
        .options(
            selectinload(RetailerProduct.variants),
            selectinload(RetailerProduct.inventories),
        )
        .limit(50)
    )
    result = await db.execute(stmt)
    products = result.scalars().all()

    items = []
    for p in products:
        # Compute total quantity from all inventory records
        total_qty = sum(inv.quantityAvailable for inv in p.inventories)
        items.append(
            {
                "id": p.id,
                "name": p.name,
                "sku": p.sku,
                "barcode": p.barcode,
                "sellingPrice": float(p.sellingPrice),
                "costPrice": float(p.costPrice),
                "taxType": p.taxType,
                "taxRate": float(p.taxRate),
                "trackInventory": p.trackInventory,
                "unit": p.unit,
                "totalQuantity": total_qty,
                "inventories": [
                    {
                        "id": inv.id,
                        "variantId": inv.variantId,
                        "quantityAvailable": inv.quantityAvailable,
                        "lowStockThreshold": inv.lowStockThreshold,
                    }
                    for inv in p.inventories
                ],
                "variants": [
                    {
                        "id": v.id,
                        "title": v.title,
                        "sku": v.sku,
                        "barcode": v.barcode,
                        "sellingPrice": float(v.sellingPrice),
                        "costPrice": float(v.costPrice),
                        "status": v.status,
                    }
                    for v in p.variants
                ],
            }
        )

    return success({"products": items, "count": len(items)})


@router.post("/pos/sales", status_code=status.HTTP_201_CREATED)
async def create_pos_sale(
    body: CreateSaleBody,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Create a POS sale atomically (invoice + inventory deduction + khata)."""
    business_id: str = access["retailerBusinessId"]
    user: dict = access["user"]
    now = datetime.now(timezone.utc)

    # ── 1. Resolve customer ───────────────────────────────────────────────────
    customer: Optional[RetailerCustomer] = None

    if body.customerId:
        result = await db.execute(
            select(RetailerCustomer).where(
                RetailerCustomer.id == body.customerId,
                RetailerCustomer.retailerBusinessId == business_id,
            )
        )
        customer = result.scalar_one_or_none()
        if not customer:
            raise AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found")

    elif body.customerPhone:
        result = await db.execute(
            select(RetailerCustomer).where(
                RetailerCustomer.retailerBusinessId == business_id,
                RetailerCustomer.phone == body.customerPhone,
            )
        )
        customer = result.scalar_one_or_none()
        if not customer:
            # Auto-create customer
            customer = RetailerCustomer(
                retailerBusinessId=business_id,
                name=body.customerName or body.customerPhone,
                phone=body.customerPhone,
            )
            db.add(customer)
            await db.flush()

    # ── 2. Validate: CREDIT_KHATA requires customer ───────────────────────────
    has_khata_payment = any(
        p.method == RetailerPaymentMethod.CREDIT_KHATA for p in body.payments
    )
    if has_khata_payment and not customer:
        raise AppError(
            400,
            "CUSTOMER_REQUIRED_FOR_KHATA",
            "A customer must be assigned for credit (khata) payments",
        )

    # ── 3. Process each line item ─────────────────────────────────────────────
    processed_items: list[dict] = []
    total_subtotal = Decimal("0")
    total_tax = Decimal("0")
    total_line_discount = Decimal("0")

    for item_input in body.items:
        # Load product
        prod_result = await db.execute(
            select(RetailerProduct).where(
                RetailerProduct.id == item_input.productId,
                RetailerProduct.retailerBusinessId == business_id,
            )
        )
        product = prod_result.scalar_one_or_none()
        if not product:
            raise AppError(
                404,
                "PRODUCT_NOT_FOUND",
                f"Product {item_input.productId} not found",
            )

        variant: Optional[RetailerProductVariant] = None
        if item_input.variantId:
            var_result = await db.execute(
                select(RetailerProductVariant).where(
                    RetailerProductVariant.id == item_input.variantId,
                    RetailerProductVariant.retailerProductId == product.id,
                )
            )
            variant = var_result.scalar_one_or_none()
            if not variant:
                raise AppError(
                    404,
                    "VARIANT_NOT_FOUND",
                    f"Variant {item_input.variantId} not found for product {product.name}",
                )

        # Load inventory record
        inv_result = await db.execute(
            select(RetailerInventory).where(
                RetailerInventory.retailerBusinessId == business_id,
                RetailerInventory.productId == product.id,
                RetailerInventory.variantId == item_input.variantId,
            )
        )
        inventory = inv_result.scalar_one_or_none()

        # Validate stock
        if product.trackInventory:
            available = inventory.quantityAvailable if inventory else 0
            if available < item_input.quantity:
                raise AppError(
                    400,
                    "INSUFFICIENT_STOCK",
                    f"Insufficient stock for '{product.name}': "
                    f"available={available}, requested={item_input.quantity}",
                )

        # Determine unit price
        if item_input.unitPrice is not None:
            unit_price = Decimal(str(item_input.unitPrice))
        elif variant:
            unit_price = variant.sellingPrice
        else:
            unit_price = product.sellingPrice

        qty = item_input.quantity
        line_discount = Decimal(str(item_input.discount))
        line_gross = unit_price * qty
        line_taxable_base = line_gross - line_discount

        # Tax calculation
        line_tax = Decimal("0")
        if (
            product.taxType == RetailerTaxType.TAXABLE
            and product.taxRate > 0
        ):
            line_tax = line_taxable_base * product.taxRate / Decimal("100")

        line_subtotal = line_taxable_base + line_tax

        total_subtotal += line_subtotal
        total_tax += line_tax
        total_line_discount += line_discount

        # Cost price snapshot
        cost_price = variant.costPrice if variant else product.costPrice

        processed_items.append(
            {
                "product": product,
                "variant": variant,
                "inventory": inventory,
                "unit_price": unit_price,
                "cost_price": cost_price,
                "quantity": qty,
                "line_discount": line_discount,
                "line_tax": line_tax,
                "line_subtotal": line_subtotal,
            }
        )

    # ── 4. Overall discount & grand total ────────────────────────────────────
    overall_discount = Decimal(str(body.discount))
    grand_total = total_subtotal - overall_discount
    total_discount = total_line_discount + overall_discount

    # ── 5. Payment totals ────────────────────────────────────────────────────
    total_paid = sum(Decimal(str(p.amount)) for p in body.payments)

    payment_status = (
        RetailerPaymentStatus.PAID
        if total_paid >= grand_total
        else RetailerPaymentStatus.PARTIALLY_PAID
    )

    # ── 6. Generate invoice number ────────────────────────────────────────────
    year = now.year
    count_result = await db.execute(
        select(func.count(RetailSale.id)).where(
            RetailSale.retailerBusinessId == business_id,
            func.extract("year", RetailSale.createdAt) == year,
        )
    )
    count = count_result.scalar() or 0
    invoice_number = f"INV-{year}-{(count + 1):04d}"

    # ── 7. Create RetailSale ───────────────────────────────────────────────────
    sale = RetailSale(
        retailerBusinessId=business_id,
        invoiceNumber=invoice_number,
        customerId=customer.id if customer else None,
        subtotal=total_subtotal,
        discount=total_discount,
        tax=total_tax,
        grandTotal=grand_total,
        paidAmount=total_paid,
        paymentStatus=payment_status,
        notes=body.notes,
        createdBy=user["id"],
        saleDate=now,
    )
    db.add(sale)
    await db.flush()  # get sale.id

    # ── 8. Create RetailSaleItems ─────────────────────────────────────────────
    for pi in processed_items:
        product: RetailerProduct = pi["product"]
        variant: Optional[RetailerProductVariant] = pi["variant"]
        sale_item = RetailSaleItem(
            saleId=sale.id,
            productId=product.id,
            variantId=variant.id if variant else None,
            productNameSnapshot=product.name
            + (f" — {variant.title}" if variant else ""),
            skuSnapshot=variant.sku if variant else product.sku,
            quantity=pi["quantity"],
            unitPrice=pi["unit_price"],
            costPriceSnapshot=pi["cost_price"],
            discount=pi["line_discount"],
            tax=pi["line_tax"],
            subtotal=pi["line_subtotal"],
        )
        db.add(sale_item)

    # ── 9. Inventory deduction ────────────────────────────────────────────────
    for pi in processed_items:
        product: RetailerProduct = pi["product"]
        inventory: Optional[RetailerInventory] = pi["inventory"]
        if product.trackInventory and inventory:
            prev_qty = inventory.quantityAvailable
            inventory.quantityAvailable = prev_qty - pi["quantity"]
            inv_tx = RetailerInventoryTransaction(
                retailerBusinessId=business_id,
                inventoryId=inventory.id,
                type=RetailerInventoryTransactionType.SALE,
                quantity=-pi["quantity"],
                previousQuantity=prev_qty,
                newQuantity=inventory.quantityAvailable,
                referenceType="RetailSale",
                referenceId=sale.id,
                performedBy=user["id"],
            )
            db.add(inv_tx)

    # ── 10. Create RetailSalePayment records ──────────────────────────────────
    for payment_input in body.payments:
        sale_payment = RetailSalePayment(
            saleId=sale.id,
            retailerBusinessId=business_id,
            method=payment_input.method,
            amount=Decimal(str(payment_input.amount)),
            reference=payment_input.reference,
            recordedBy=user["id"],
        )
        db.add(sale_payment)

        # ── 11. CREDIT_KHATA: update customer balance + KhataTransaction ───
        if payment_input.method == RetailerPaymentMethod.CREDIT_KHATA and customer:
            khata_amount = Decimal(str(payment_input.amount))
            prev_balance = customer.currentBalance
            customer.currentBalance = prev_balance + khata_amount
            khata_tx = KhataTransaction(
                retailerBusinessId=business_id,
                customerId=customer.id,
                type=KhataTransactionType.SALE_CREDIT,
                amount=khata_amount,
                balanceAfter=customer.currentBalance,
                referenceType="RetailSale",
                referenceId=sale.id,
                notes=body.notes,
                createdBy=user["id"],
            )
            db.add(khata_tx)

    # ── 12. Audit log ─────────────────────────────────────────────────────────
    audit = RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=user["id"],
        action="CREATE_POS_SALE",
        entityType="RetailSale",
        entityId=sale.id,
        after={"invoiceNumber": invoice_number, "grandTotal": str(grand_total)},
    )
    db.add(audit)

    await db.commit()

    # ── 13. Reload sale with relationships ───────────────────────────────────
    reload_result = await db.execute(
        select(RetailSale)
        .where(RetailSale.id == sale.id)
        .options(
            selectinload(RetailSale.items),
            selectinload(RetailSale.payments),
        )
    )
    sale_loaded = reload_result.scalar_one()

    business = access["business"]
    return success(
        {
            "sale": _serialize_sale(sale_loaded),
            "store": {
                "businessName": business.businessName,
                "phone": business.phone,
                "addressLine": business.addressLine,
                "vatNumber": business.vatNumber,
                "panNumber": business.panNumber,
                "logo": business.logo,
            },
        },
        message="Sale created successfully",
        status_code=201,
    )


@router.get("/pos/sales")
async def list_sales(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    paymentStatus: Optional[RetailerPaymentStatus] = Query(None),
    customerId: Optional[str] = Query(None),
    dateFrom: Optional[str] = Query(None),
    dateTo: Optional[str] = Query(None),
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """List POS sales with pagination, search, and filters."""
    business_id: str = access["retailerBusinessId"]

    filters = [RetailSale.retailerBusinessId == business_id]

    if search:
        filters.append(RetailSale.invoiceNumber.ilike(f"%{search}%"))

    if paymentStatus:
        filters.append(RetailSale.paymentStatus == paymentStatus)

    if customerId:
        filters.append(RetailSale.customerId == customerId)

    if dateFrom:
        try:
            dt_from = datetime.fromisoformat(dateFrom).replace(tzinfo=timezone.utc)
            filters.append(RetailSale.saleDate >= dt_from)
        except ValueError:
            raise AppError(400, "INVALID_DATE", "dateFrom must be a valid ISO date string")

    if dateTo:
        try:
            dt_to = datetime.fromisoformat(dateTo).replace(tzinfo=timezone.utc)
            filters.append(RetailSale.saleDate <= dt_to)
        except ValueError:
            raise AppError(400, "INVALID_DATE", "dateTo must be a valid ISO date string")

    total_result = await db.execute(
        select(func.count(RetailSale.id)).where(and_(*filters))
    )
    total = total_result.scalar() or 0

    offset = (page - 1) * limit
    sales_result = await db.execute(
        select(RetailSale)
        .where(and_(*filters))
        .options(
            selectinload(RetailSale.items),
            selectinload(RetailSale.payments),
        )
        .order_by(RetailSale.saleDate.desc())
        .offset(offset)
        .limit(limit)
    )
    sales = sales_result.scalars().all()

    return success(
        {
            "sales": [_serialize_sale(s) for s in sales],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "pages": (total + limit - 1) // limit,
            },
        }
    )


@router.get("/pos/sales/{sale_id}")
async def get_sale(
    sale_id: str,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Get a single sale (printable invoice)."""
    business_id: str = access["retailerBusinessId"]

    result = await db.execute(
        select(RetailSale)
        .where(
            RetailSale.id == sale_id,
            RetailSale.retailerBusinessId == business_id,
        )
        .options(
            selectinload(RetailSale.items),
            selectinload(RetailSale.payments),
            selectinload(RetailSale.customer),
        )
    )
    sale = result.scalar_one_or_none()
    if not sale:
        raise AppError(404, "SALE_NOT_FOUND", "Sale not found")

    business = access["business"]
    data = _serialize_sale(sale)

    # Include customer info for invoice
    if sale.customer:
        data["customer"] = {
            "id": sale.customer.id,
            "name": sale.customer.name,
            "phone": sale.customer.phone,
            "email": sale.customer.email,
            "currentBalance": float(sale.customer.currentBalance),
        }
    else:
        data["customer"] = None

    return success(
        {
            "sale": data,
            "store": {
                "businessName": business.businessName,
                "phone": business.phone,
                "alternatePhone": business.alternatePhone,
                "email": business.email,
                "addressLine": business.addressLine,
                "district": business.district,
                "municipality": business.municipality,
                "vatNumber": business.vatNumber,
                "panNumber": business.panNumber,
                "logo": business.logo,
            },
        }
    )
