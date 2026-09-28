"""Purchases and Suppliers router — R5."""
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
    RecordStatus,
    RetailerAuditLog,
    RetailerInventory,
    RetailerInventoryTransaction,
    RetailerInventoryTransactionType,
    RetailerMembershipRole,
    RetailerProduct,
    RetailerProductVariant,
    RetailerPurchase,
    RetailerPurchaseItem,
    RetailerPurchaseStatus,
    RetailerSupplier,
    SupplierTransaction,
    SupplierTransactionType,
)
from app.utils.response import success

router = APIRouter(prefix="/api/retailer", tags=["purchases"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class CreateSupplierBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    companyName: Optional[str] = None
    phone: str = Field(..., min_length=7, max_length=30)
    email: Optional[str] = None
    panNumber: Optional[str] = None
    vatNumber: Optional[str] = None
    address: Optional[str] = None
    openingBalance: float = 0


class UpdateSupplierBody(BaseModel):
    name: Optional[str] = None
    companyName: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    panNumber: Optional[str] = None
    vatNumber: Optional[str] = None
    address: Optional[str] = None
    status: Optional[RecordStatus] = None


class PurchaseItemInput(BaseModel):
    productId: str
    variantId: Optional[str] = None
    quantity: int = Field(..., ge=1)
    unitCost: float
    tax: float = 0
    discount: float = 0


class CreatePurchaseBody(BaseModel):
    supplierId: str
    items: List[PurchaseItemInput]
    status: str = "ORDERED"  # DRAFT, ORDERED, RECEIVED
    discount: float = 0
    tax: float = 0
    paidAmount: float = 0
    notes: Optional[str] = None
    updateCostPrice: bool = False


class RecordSupplierPaymentBody(BaseModel):
    amount: float = Field(..., gt=0)
    paymentMethod: str
    reference: Optional[str] = None
    notes: Optional[str] = None


# ─── Serializers ──────────────────────────────────────────────────────────────

def _serialize_supplier(s: RetailerSupplier) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "companyName": s.companyName,
        "phone": s.phone,
        "email": s.email,
        "panNumber": s.panNumber,
        "vatNumber": s.vatNumber,
        "address": s.address,
        "openingBalance": float(s.openingBalance),
        "currentBalance": float(s.currentBalance),
        "status": s.status,
        "createdAt": s.createdAt.isoformat(),
        "updatedAt": s.updatedAt.isoformat(),
    }


def _serialize_purchase(p: RetailerPurchase) -> dict:
    return {
        "id": p.id,
        "supplierId": p.supplierId,
        "purchaseNumber": p.purchaseNumber,
        "status": p.status,
        "subtotal": float(p.subtotal),
        "tax": float(p.tax),
        "discount": float(p.discount),
        "totalAmount": float(p.totalAmount),
        "paidAmount": float(p.paidAmount),
        "notes": p.notes,
        "orderedAt": p.orderedAt.isoformat() if p.orderedAt else None,
        "receivedAt": p.receivedAt.isoformat() if p.receivedAt else None,
        "createdAt": p.createdAt.isoformat(),
        "updatedAt": p.updatedAt.isoformat(),
        "supplier": _serialize_supplier(p.supplier) if getattr(p, "supplier", None) else None,
        "items": [
            {
                "id": item.id,
                "productId": item.productId,
                "variantId": item.variantId,
                "quantity": item.quantity,
                "receivedQuantity": item.receivedQuantity,
                "unitCost": float(item.unitCost),
                "discount": float(item.discount),
                "tax": float(item.tax),
                "total": float(item.total),
            }
            for item in getattr(p, "items", [])
        ],
    }


def _serialize_supplier_tx(tx: SupplierTransaction) -> dict:
    return {
        "id": tx.id,
        "supplierId": tx.supplierId,
        "type": tx.type,
        "amount": float(tx.amount),
        "balanceAfter": float(tx.balanceAfter),
        "referenceType": tx.referenceType,
        "referenceId": tx.referenceId,
        "notes": tx.notes,
        "createdAt": tx.createdAt.isoformat(),
    }


async def _generate_purchase_number(db: AsyncSession, business_id: str) -> str:
    year = datetime.now(timezone.utc).year
    count_res = await db.execute(
        select(func.count(RetailerPurchase.id)).where(
            RetailerPurchase.retailerBusinessId == business_id,
            RetailerPurchase.purchaseNumber.like(f"PO-{year}-%"),
        )
    )
    count = count_res.scalar() or 0
    next_seq = count + 1
    po_num = f"PO-{year}-{str(next_seq).zfill(4)}"

    while True:
        exists_res = await db.execute(
            select(RetailerPurchase.id).where(
                RetailerPurchase.retailerBusinessId == business_id,
                RetailerPurchase.purchaseNumber == po_num,
            )
        )
        if not exists_res.scalar_one_or_none():
            break
        next_seq += 1
        po_num = f"PO-{year}-{str(next_seq).zfill(4)}"

    return po_num


# ─── Supplier Routes ──────────────────────────────────────────────────────────

@router.post("/suppliers", status_code=status.HTTP_201_CREATED)
async def create_supplier(
    body: CreateSupplierBody,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Create a new supplier with optional opening balance."""
    business_id = access["retailerBusinessId"]
    user = access["user"]

    existing = await db.execute(
        select(RetailerSupplier).where(
            RetailerSupplier.retailerBusinessId == business_id,
            RetailerSupplier.phone == body.phone,
            RetailerSupplier.status != RecordStatus.ARCHIVED,
        )
    )
    if existing.scalar_one_or_none():
        raise AppError(409, "SUPPLIER_PHONE_EXISTS", f"A supplier with phone number {body.phone} already exists in your store.")

    opening_bal = Decimal(str(body.openingBalance or 0))
    supplier = RetailerSupplier(
        retailerBusinessId=business_id,
        name=body.name,
        companyName=body.companyName,
        phone=body.phone,
        email=body.email,
        panNumber=body.panNumber,
        vatNumber=body.vatNumber,
        address=body.address,
        openingBalance=opening_bal,
        currentBalance=opening_bal,
        status=RecordStatus.ACTIVE,
    )
    db.add(supplier)
    await db.flush()

    if opening_bal != Decimal(0):
        db.add(SupplierTransaction(
            retailerBusinessId=business_id,
            supplierId=supplier.id,
            type=SupplierTransactionType.OPENING_BALANCE,
            amount=abs(opening_bal),
            balanceAfter=opening_bal,
            referenceType="OPENING_BALANCE",
            notes="Initial opening balance on supplier registration",
            createdBy=user["id"],
        ))

    db.add(RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=user["id"],
        action="CREATE_SUPPLIER",
        entityType="SUPPLIER",
        entityId=supplier.id,
        after={
            "name": supplier.name,
            "companyName": supplier.companyName,
            "phone": supplier.phone,
            "currentBalance": str(supplier.currentBalance),
        },
    ))
    await db.commit()
    await db.refresh(supplier)

    return success(_serialize_supplier(supplier), "Supplier created successfully", 201)


@router.get("/suppliers")
async def list_suppliers(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    hasBalance: Optional[str] = Query(None, description="DUE | SETTLED"),
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """List suppliers with search, balance filter, and store-level payables KPIs."""
    business_id = access["retailerBusinessId"]

    filters = [
        RetailerSupplier.retailerBusinessId == business_id,
        RetailerSupplier.status != RecordStatus.ARCHIVED,
    ]

    if search and search.strip():
        s = f"%{search.strip()}%"
        filters.append(or_(
            RetailerSupplier.name.ilike(s),
            RetailerSupplier.companyName.ilike(s),
            RetailerSupplier.phone.ilike(s),
        ))

    if hasBalance == "DUE":
        filters.append(RetailerSupplier.currentBalance > Decimal(0))
    elif hasBalance == "SETTLED":
        filters.append(RetailerSupplier.currentBalance == Decimal(0))

    total_res = await db.execute(select(func.count(RetailerSupplier.id)).where(and_(*filters)))
    total = total_res.scalar() or 0

    suppliers_res = await db.execute(
        select(RetailerSupplier)
        .where(and_(*filters))
        .order_by(RetailerSupplier.updatedAt.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    suppliers = suppliers_res.scalars().all()

    # Store-level payables KPIs
    all_supps_res = await db.execute(
        select(RetailerSupplier.currentBalance)
        .where(
            RetailerSupplier.retailerBusinessId == business_id,
            RetailerSupplier.status != RecordStatus.ARCHIVED,
        )
    )
    all_balances = all_supps_res.scalars().all()
    total_payables = sum((b for b in all_balances if b > Decimal(0)), Decimal(0))
    suppliers_with_dues = sum(1 for b in all_balances if b > Decimal(0))

    return success({
        "suppliers": [_serialize_supplier(s) for s in suppliers],
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "totalPages": (total + limit - 1) // limit if limit else 1,
        },
        "summary": {
            "totalSuppliers": len(all_balances),
            "totalPayables": str(total_payables),
            "suppliersWithDues": suppliers_with_dues,
        },
    })


@router.get("/suppliers/{supplier_id}")
async def get_supplier_by_id(
    supplier_id: str,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Get single supplier profile and purchase statistics."""
    business_id = access["retailerBusinessId"]

    supp_res = await db.execute(
        select(RetailerSupplier).where(
            RetailerSupplier.id == supplier_id,
            RetailerSupplier.retailerBusinessId == business_id,
        )
    )
    supplier = supp_res.scalar_one_or_none()
    if not supplier:
        raise AppError(404, "SUPPLIER_NOT_FOUND", "Supplier not found in your store")

    purchases_agg = await db.execute(
        select(
            func.count(RetailerPurchase.id),
            func.coalesce(func.sum(RetailerPurchase.totalAmount), Decimal(0)),
            func.coalesce(func.sum(RetailerPurchase.paidAmount), Decimal(0)),
        ).where(
            RetailerPurchase.retailerBusinessId == business_id,
            RetailerPurchase.supplierId == supplier_id,
        )
    )
    row = purchases_agg.one()

    return success({
        "supplier": _serialize_supplier(supplier),
        "stats": {
            "totalPurchasesCount": row[0] or 0,
            "totalPurchasesAmount": str(row[1] or 0),
            "totalPaidAmount": str(row[2] or 0),
            "currentBalance": str(supplier.currentBalance),
        },
    })


@router.patch("/suppliers/{supplier_id}")
async def update_supplier(
    supplier_id: str,
    body: UpdateSupplierBody,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Update supplier details."""
    business_id = access["retailerBusinessId"]
    user = access["user"]

    supp_res = await db.execute(
        select(RetailerSupplier).where(
            RetailerSupplier.id == supplier_id,
            RetailerSupplier.retailerBusinessId == business_id,
        )
    )
    supplier = supp_res.scalar_one_or_none()
    if not supplier:
        raise AppError(404, "SUPPLIER_NOT_FOUND", "Supplier not found in your store")

    if body.name is not None:
        supplier.name = body.name
    if body.companyName is not None:
        supplier.companyName = body.companyName
    if body.phone is not None:
        supplier.phone = body.phone
    if body.email is not None:
        supplier.email = body.email
    if body.panNumber is not None:
        supplier.panNumber = body.panNumber
    if body.vatNumber is not None:
        supplier.vatNumber = body.vatNumber
    if body.address is not None:
        supplier.address = body.address
    if body.status is not None:
        supplier.status = body.status

    db.add(RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=user["id"],
        action="UPDATE_SUPPLIER",
        entityType="SUPPLIER",
        entityId=supplier.id,
        after={"name": supplier.name, "phone": supplier.phone},
    ))
    await db.commit()
    await db.refresh(supplier)

    return success(_serialize_supplier(supplier), "Supplier updated successfully")


@router.get("/suppliers/{supplier_id}/transactions")
async def list_supplier_transactions(
    supplier_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    txType: Optional[SupplierTransactionType] = None,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """List supplier transactions ledger."""
    business_id = access["retailerBusinessId"]

    supp_res = await db.execute(
        select(RetailerSupplier.id).where(
            RetailerSupplier.id == supplier_id,
            RetailerSupplier.retailerBusinessId == business_id,
        )
    )
    if not supp_res.scalar_one_or_none():
        raise AppError(404, "SUPPLIER_NOT_FOUND", "Supplier not found in your store")

    filters = [
        SupplierTransaction.retailerBusinessId == business_id,
        SupplierTransaction.supplierId == supplier_id,
    ]
    if txType:
        filters.append(SupplierTransaction.type == txType)
    if startDate:
        filters.append(SupplierTransaction.createdAt >= datetime.fromisoformat(startDate).replace(tzinfo=timezone.utc))
    if endDate:
        filters.append(SupplierTransaction.createdAt <= datetime.fromisoformat(endDate).replace(tzinfo=timezone.utc))

    total_res = await db.execute(select(func.count(SupplierTransaction.id)).where(and_(*filters)))
    total = total_res.scalar() or 0

    txs_res = await db.execute(
        select(SupplierTransaction)
        .where(and_(*filters))
        .order_by(SupplierTransaction.createdAt.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    txs = txs_res.scalars().all()

    return success({
        "transactions": [_serialize_supplier_tx(t) for t in txs],
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "totalPages": (total + limit - 1) // limit if limit else 1,
        },
    })


@router.post("/suppliers/{supplier_id}/payments", status_code=status.HTTP_201_CREATED)
async def record_supplier_payment(
    supplier_id: str,
    body: RecordSupplierPaymentBody,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Record payment made to a supplier (reduces balance)."""
    business_id = access["retailerBusinessId"]
    user = access["user"]

    supp_res = await db.execute(
        select(RetailerSupplier).where(
            RetailerSupplier.id == supplier_id,
            RetailerSupplier.retailerBusinessId == business_id,
        )
    )
    supplier = supp_res.scalar_one_or_none()
    if not supplier:
        raise AppError(404, "SUPPLIER_NOT_FOUND", "Supplier not found in your store")

    p_amount = Decimal(str(body.amount))
    new_balance = supplier.currentBalance - p_amount
    supplier.currentBalance = new_balance

    tx = SupplierTransaction(
        retailerBusinessId=business_id,
        supplierId=supplier_id,
        type=SupplierTransactionType.PAYMENT,
        amount=p_amount,
        balanceAfter=new_balance,
        referenceType=body.paymentMethod,
        referenceId=body.reference,
        notes=body.notes or f"Payment made via {body.paymentMethod}",
        createdBy=user["id"],
    )
    db.add(tx)

    db.add(RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=user["id"],
        action="RECORD_SUPPLIER_PAYMENT",
        entityType="SUPPLIER",
        entityId=supplier.id,
        before={"currentBalance": str(supplier.currentBalance + p_amount)},
        after={
            "currentBalance": str(new_balance),
            "paidAmount": str(p_amount),
        },
    ))
    await db.commit()
    await db.refresh(supplier)
    await db.refresh(tx)

    return success({
        "supplier": _serialize_supplier(supplier),
        "transaction": _serialize_supplier_tx(tx),
    }, "Payment to supplier recorded", 201)


# ─── Purchase Orders Routes ───────────────────────────────────────────────────

@router.post("/purchases", status_code=status.HTTP_201_CREATED)
async def create_purchase(
    body: CreatePurchaseBody,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Create Purchase Order with optional immediate stock receipt."""
    business_id = access["retailerBusinessId"]
    user = access["user"]
    now = datetime.now(timezone.utc)

    # 1. Verify supplier
    supp_res = await db.execute(
        select(RetailerSupplier).where(
            RetailerSupplier.id == body.supplierId,
            RetailerSupplier.retailerBusinessId == business_id,
        )
    )
    supplier = supp_res.scalar_one_or_none()
    if not supplier:
        raise AppError(404, "SUPPLIER_NOT_FOUND", "Selected supplier does not exist in your store")

    # 2. Validate line items
    gross_subtotal = Decimal(0)
    line_tax_total = Decimal(0)
    line_discount_total = Decimal(0)
    prepared_items = []

    for item_in in body.items:
        prod_res = await db.execute(
            select(RetailerProduct)
            .where(
                RetailerProduct.id == item_in.productId,
                RetailerProduct.retailerBusinessId == business_id,
            )
            .options(selectinload(RetailerProduct.variants))
        )
        product = prod_res.scalar_one_or_none()
        if not product:
            raise AppError(404, "PRODUCT_NOT_FOUND", f"Product {item_in.productId} not found")

        variant = None
        if item_in.variantId:
            variant = next((v for v in product.variants if v.id == item_in.variantId), None)
            if not variant:
                raise AppError(404, "VARIANT_NOT_FOUND", "Product variant not found")

        unit_cost = Decimal(str(item_in.unitCost))
        line_gross = unit_cost * item_in.quantity
        line_tax = Decimal(str(item_in.tax or 0))
        line_disc = Decimal(str(item_in.discount or 0))
        line_total = line_gross + line_tax - line_disc

        gross_subtotal += line_gross
        line_tax_total += line_tax
        line_discount_total += line_disc

        prepared_items.append({
            "productId": product.id,
            "variantId": variant.id if variant else None,
            "quantity": item_in.quantity,
            "unitCost": unit_cost,
            "tax": line_tax,
            "discount": line_disc,
            "total": line_total,
            "productName": f"{product.name} ({variant.title})" if variant else product.name,
            "sku": variant.sku if variant else product.sku,
        })

    overall_discount = Decimal(str(body.discount or 0))
    overall_tax = Decimal(str(body.tax or 0))
    grand_total = max(Decimal(0), gross_subtotal + line_tax_total + overall_tax - line_discount_total - overall_discount)
    paid_amount = Decimal(str(body.paidAmount or 0))

    purchase_number = await _generate_purchase_number(db, business_id)
    is_received = (body.status == "RECEIVED")

    purchase = RetailerPurchase(
        retailerBusinessId=business_id,
        supplierId=body.supplierId,
        purchaseNumber=purchase_number,
        status=RetailerPurchaseStatus.RECEIVED if is_received else RetailerPurchaseStatus.ORDERED,
        subtotal=gross_subtotal,
        tax=line_tax_total + overall_tax,
        discount=line_discount_total + overall_discount,
        totalAmount=grand_total,
        paidAmount=paid_amount,
        notes=body.notes,
        createdBy=user["id"],
        orderedAt=now,
        receivedAt=now if is_received else None,
    )
    db.add(purchase)
    await db.flush()

    for item in prepared_items:
        p_item = RetailerPurchaseItem(
            purchaseId=purchase.id,
            productId=item["productId"],
            variantId=item["variantId"],
            quantity=item["quantity"],
            receivedQuantity=item["quantity"] if is_received else 0,
            unitCost=item["unitCost"],
            discount=item["discount"],
            tax=item["tax"],
            total=item["total"],
        )
        db.add(p_item)

        if is_received:
            # Stock receipt
            inv_filter = [
                RetailerInventory.retailerBusinessId == business_id,
                RetailerInventory.productId == item["productId"],
            ]
            if item["variantId"]:
                inv_filter.append(RetailerInventory.variantId == item["variantId"])
            else:
                inv_filter.append(RetailerInventory.variantId == None)

            inv_res = await db.execute(select(RetailerInventory).where(and_(*inv_filter)))
            existing_inv = inv_res.scalar_one_or_none()

            if existing_inv:
                prev_qty = existing_inv.quantityAvailable
                new_qty = prev_qty + item["quantity"]
                existing_inv.quantityAvailable = new_qty
                inv_id = existing_inv.id
            else:
                prev_qty = 0
                new_qty = item["quantity"]
                new_inv = RetailerInventory(
                    retailerBusinessId=business_id,
                    productId=item["productId"],
                    variantId=item["variantId"],
                    quantityAvailable=new_qty,
                )
                db.add(new_inv)
                await db.flush()
                inv_id = new_inv.id

            db.add(RetailerInventoryTransaction(
                retailerBusinessId=business_id,
                inventoryId=inv_id,
                type=RetailerInventoryTransactionType.STOCK_IN,
                quantity=item["quantity"],
                previousQuantity=prev_qty,
                newQuantity=new_qty,
                referenceType="RETAILER_PURCHASE",
                referenceId=purchase.id,
                reason=f"Inbound purchase order #{purchase_number}",
                performedBy=user["id"],
            ))

            if body.updateCostPrice:
                if item["variantId"]:
                    v_res = await db.execute(select(RetailerProductVariant).where(RetailerProductVariant.id == item["variantId"]))
                    v = v_res.scalar_one_or_none()
                    if v:
                        v.costPrice = item["unitCost"]
                else:
                    p_res = await db.execute(select(RetailerProduct).where(RetailerProduct.id == item["productId"]))
                    p = p_res.scalar_one_or_none()
                    if p:
                        p.costPrice = item["unitCost"]

    if is_received:
        unpaid = grand_total - paid_amount
        supplier.currentBalance += unpaid

        db.add(SupplierTransaction(
            retailerBusinessId=business_id,
            supplierId=supplier.id,
            type=SupplierTransactionType.PURCHASE,
            amount=grand_total,
            balanceAfter=supplier.currentBalance + paid_amount,
            referenceType="PURCHASE_ORDER",
            referenceId=purchase.id,
            notes=f"Purchase order #{purchase_number}",
            createdBy=user["id"],
        ))

        if paid_amount > Decimal(0):
            db.add(SupplierTransaction(
                retailerBusinessId=business_id,
                supplierId=supplier.id,
                type=SupplierTransactionType.PAYMENT,
                amount=paid_amount,
                balanceAfter=supplier.currentBalance,
                referenceType="PURCHASE_PAYMENT",
                referenceId=purchase.id,
                notes=f"Upfront payment for PO #{purchase_number}",
                createdBy=user["id"],
            ))

    db.add(RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=user["id"],
        action="CREATE_PURCHASE",
        entityType="PURCHASE",
        entityId=purchase.id,
        after={
            "purchaseNumber": purchase_number,
            "totalAmount": str(grand_total),
            "paidAmount": str(paid_amount),
            "status": purchase.status,
            "itemCount": len(prepared_items),
        },
    ))

    await db.commit()
    await db.refresh(purchase)

    # Reload relationships for serializer
    reloaded = await db.execute(
        select(RetailerPurchase)
        .where(RetailerPurchase.id == purchase.id)
        .options(
            selectinload(RetailerPurchase.supplier),
            selectinload(RetailerPurchase.items),
        )
    )
    return success(_serialize_purchase(reloaded.scalar_one()), "Purchase order created successfully", 201)


@router.get("/purchases")
async def list_purchases(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    supplierId: Optional[str] = None,
    status: Optional[RetailerPurchaseStatus] = None,
    search: Optional[str] = None,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """List purchase orders with pagination and filters."""
    business_id = access["retailerBusinessId"]

    filters = [RetailerPurchase.retailerBusinessId == business_id]
    if supplierId:
        filters.append(RetailerPurchase.supplierId == supplierId)
    if status:
        filters.append(RetailerPurchase.status == status)
    if search and search.strip():
        s = f"%{search.strip()}%"
        filters.append(RetailerPurchase.purchaseNumber.ilike(s))
    if startDate:
        filters.append(RetailerPurchase.createdAt >= datetime.fromisoformat(startDate).replace(tzinfo=timezone.utc))
    if endDate:
        filters.append(RetailerPurchase.createdAt <= datetime.fromisoformat(endDate).replace(tzinfo=timezone.utc))

    total_res = await db.execute(select(func.count(RetailerPurchase.id)).where(and_(*filters)))
    total = total_res.scalar() or 0

    purchases_res = await db.execute(
        select(RetailerPurchase)
        .where(and_(*filters))
        .options(
            selectinload(RetailerPurchase.supplier),
            selectinload(RetailerPurchase.items),
        )
        .order_by(RetailerPurchase.createdAt.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    purchases = purchases_res.scalars().all()

    return success({
        "purchases": [_serialize_purchase(p) for p in purchases],
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "totalPages": (total + limit - 1) // limit if limit else 1,
        },
    })


@router.get("/purchases/{purchase_id}")
async def get_purchase_by_id(
    purchase_id: str,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Get single purchase order by ID."""
    business_id = access["retailerBusinessId"]

    res = await db.execute(
        select(RetailerPurchase)
        .where(
            RetailerPurchase.id == purchase_id,
            RetailerPurchase.retailerBusinessId == business_id,
        )
        .options(
            selectinload(RetailerPurchase.supplier),
            selectinload(RetailerPurchase.items),
        )
    )
    purchase = res.scalar_one_or_none()
    if not purchase:
        raise AppError(404, "PURCHASE_NOT_FOUND", "Purchase order not found")

    return success(_serialize_purchase(purchase))


@router.post("/purchases/{purchase_id}/receive")
async def receive_purchase(
    purchase_id: str,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Mark purchase order as received, increment inventory, update supplier balance."""
    business_id = access["retailerBusinessId"]
    user = access["user"]
    now = datetime.now(timezone.utc)

    res = await db.execute(
        select(RetailerPurchase)
        .where(
            RetailerPurchase.id == purchase_id,
            RetailerPurchase.retailerBusinessId == business_id,
        )
        .options(
            selectinload(RetailerPurchase.supplier),
            selectinload(RetailerPurchase.items),
        )
    )
    purchase = res.scalar_one_or_none()
    if not purchase:
        raise AppError(404, "PURCHASE_NOT_FOUND", "Purchase order not found")
    if purchase.status == RetailerPurchaseStatus.RECEIVED:
        raise AppError(400, "ALREADY_RECEIVED", "This purchase order has already been received")
    if purchase.status == RetailerPurchaseStatus.CANCELLED:
        raise AppError(400, "PURCHASE_CANCELLED", "Cannot receive a cancelled purchase order")

    # Inbound inventory
    for item in purchase.items:
        inv_filter = [
            RetailerInventory.retailerBusinessId == business_id,
            RetailerInventory.productId == item.productId,
        ]
        if item.variantId:
            inv_filter.append(RetailerInventory.variantId == item.variantId)
        else:
            inv_filter.append(RetailerInventory.variantId == None)

        inv_res = await db.execute(select(RetailerInventory).where(and_(*inv_filter)))
        existing_inv = inv_res.scalar_one_or_none()

        if existing_inv:
            prev_qty = existing_inv.quantityAvailable
            new_qty = prev_qty + item.quantity
            existing_inv.quantityAvailable = new_qty
            inv_id = existing_inv.id
        else:
            prev_qty = 0
            new_qty = item.quantity
            new_inv = RetailerInventory(
                retailerBusinessId=business_id,
                productId=item.productId,
                variantId=item.variantId,
                quantityAvailable=new_qty,
            )
            db.add(new_inv)
            await db.flush()
            inv_id = new_inv.id

        db.add(RetailerInventoryTransaction(
            retailerBusinessId=business_id,
            inventoryId=inv_id,
            type=RetailerInventoryTransactionType.STOCK_IN,
            quantity=item.quantity,
            previousQuantity=prev_qty,
            newQuantity=new_qty,
            referenceType="RETAILER_PURCHASE",
            referenceId=purchase.id,
            reason=f"Inbound receipt for PO #{purchase.purchaseNumber}",
            performedBy=user["id"],
        ))

        item.receivedQuantity = item.quantity

    # Supplier balance
    unpaid = purchase.totalAmount - purchase.paidAmount
    purchase.supplier.currentBalance += unpaid

    db.add(SupplierTransaction(
        retailerBusinessId=business_id,
        supplierId=purchase.supplierId,
        type=SupplierTransactionType.PURCHASE,
        amount=purchase.totalAmount,
        balanceAfter=purchase.supplier.currentBalance + purchase.paidAmount,
        referenceType="PURCHASE_ORDER",
        referenceId=purchase.id,
        notes=f"Purchase order #{purchase.purchaseNumber} received",
        createdBy=user["id"],
    ))

    if purchase.paidAmount > Decimal(0):
        db.add(SupplierTransaction(
            retailerBusinessId=business_id,
            supplierId=purchase.supplierId,
            type=SupplierTransactionType.PAYMENT,
            amount=purchase.paidAmount,
            balanceAfter=purchase.supplier.currentBalance,
            referenceType="PURCHASE_PAYMENT",
            referenceId=purchase.id,
            notes=f"Upfront payment for PO #{purchase.purchaseNumber}",
            createdBy=user["id"],
        ))

    purchase.status = RetailerPurchaseStatus.RECEIVED
    purchase.receivedAt = now

    db.add(RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=user["id"],
        action="RECEIVE_PURCHASE",
        entityType="PURCHASE",
        entityId=purchase.id,
        after={"status": "RECEIVED", "purchaseNumber": purchase.purchaseNumber},
    ))

    await db.commit()
    await db.refresh(purchase)

    return success(_serialize_purchase(purchase), "Purchase order marked as received and inventory updated")
