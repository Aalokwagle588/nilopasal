"""Khata / Customers router — R4."""
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.errors import AppError
from app.middleware.auth import get_retailer_access
from app.models import (
    KhataTransaction,
    KhataTransactionType,
    RecordStatus,
    RetailerAuditLog,
    RetailerCustomer,
    RetailSale,
)
from app.utils.response import success

router = APIRouter(prefix="/api/retailer/customers", tags=["khata"])


# ─── Request Schemas ─────────────────────────────────────────────────────────


class CreateCustomerBody(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    creditLimit: Optional[float] = None
    openingBalance: float = 0


class UpdateCustomerBody(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    creditLimit: Optional[float] = None
    status: Optional[RecordStatus] = None


class RecordPaymentBody(BaseModel):
    amount: float = Field(..., gt=0)
    paymentMethod: str  # e.g. CASH, BANK
    reference: Optional[str] = None
    notes: Optional[str] = None


class RecordAdjustmentBody(BaseModel):
    amount: float = Field(..., gt=0)
    direction: str = Field(..., pattern="^(DEBIT|CREDIT)$")
    reason: str
    notes: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _serialize_customer(c: RetailerCustomer) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "phone": c.phone,
        "email": c.email,
        "address": c.address,
        "creditLimit": float(c.creditLimit) if c.creditLimit is not None else None,
        "openingBalance": float(c.openingBalance),
        "currentBalance": float(c.currentBalance),
        "status": c.status,
        "createdAt": c.createdAt.isoformat(),
        "updatedAt": c.updatedAt.isoformat(),
    }


def _serialize_khata_tx(tx: KhataTransaction) -> dict:
    return {
        "id": tx.id,
        "type": tx.type,
        "amount": float(tx.amount),
        "balanceAfter": float(tx.balanceAfter),
        "referenceType": tx.referenceType,
        "referenceId": tx.referenceId,
        "notes": tx.notes,
        "createdAt": tx.createdAt.isoformat(),
    }


# ─── Routes ───────────────────────────────────────────────────────────────────


@router.get("/")
async def list_customers(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    balanceStatus: Optional[str] = Query(
        None, description="Filter: WITH_BALANCE | NO_BALANCE"
    ),
    customerStatus: Optional[RecordStatus] = Query(None),
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """List customers with KPI summary."""
    business_id: str = access["retailerBusinessId"]

    # ── KPI summary ──────────────────────────────────────────────────────────
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    total_active_result = await db.execute(
        select(func.count(RetailerCustomer.id)).where(
            RetailerCustomer.retailerBusinessId == business_id,
            RetailerCustomer.status == RecordStatus.ACTIVE,
        )
    )
    total_active: int = total_active_result.scalar() or 0

    receivables_result = await db.execute(
        select(func.coalesce(func.sum(RetailerCustomer.currentBalance), 0)).where(
            RetailerCustomer.retailerBusinessId == business_id,
            RetailerCustomer.currentBalance > 0,
        )
    )
    total_receivables: Decimal = receivables_result.scalar() or Decimal("0")

    with_balance_result = await db.execute(
        select(func.count(RetailerCustomer.id)).where(
            RetailerCustomer.retailerBusinessId == business_id,
            RetailerCustomer.currentBalance > 0,
        )
    )
    customers_with_dues: int = with_balance_result.scalar() or 0

    today_collections_result = await db.execute(
        select(func.coalesce(func.sum(KhataTransaction.amount), 0)).where(
            KhataTransaction.retailerBusinessId == business_id,
            KhataTransaction.type == KhataTransactionType.PAYMENT_RECEIVED,
            KhataTransaction.createdAt >= today_start,
        )
    )
    today_collections: Decimal = today_collections_result.scalar() or Decimal("0")

    # ── Filters ──────────────────────────────────────────────────────────────
    filters = [RetailerCustomer.retailerBusinessId == business_id]

    if search:
        filters.append(
            or_(
                RetailerCustomer.name.ilike(f"%{search}%"),
                RetailerCustomer.phone.ilike(f"%{search}%"),
                RetailerCustomer.email.ilike(f"%{search}%"),
            )
        )

    if customerStatus:
        filters.append(RetailerCustomer.status == customerStatus)
    else:
        # Default: only ACTIVE
        filters.append(RetailerCustomer.status == RecordStatus.ACTIVE)

    if balanceStatus == "WITH_BALANCE":
        filters.append(RetailerCustomer.currentBalance > 0)
    elif balanceStatus == "NO_BALANCE":
        filters.append(RetailerCustomer.currentBalance <= 0)

    total_result = await db.execute(
        select(func.count(RetailerCustomer.id)).where(and_(*filters))
    )
    total: int = total_result.scalar() or 0

    offset = (page - 1) * limit
    customers_result = await db.execute(
        select(RetailerCustomer)
        .where(and_(*filters))
        .order_by(RetailerCustomer.name)
        .offset(offset)
        .limit(limit)
    )
    customers = customers_result.scalars().all()

    return success(
        {
            "customers": [_serialize_customer(c) for c in customers],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "pages": (total + limit - 1) // limit,
            },
            "summary": {
                "totalActiveCustomers": total_active,
                "totalReceivables": float(total_receivables),
                "customersWithDues": customers_with_dues,
                "todayCollections": float(today_collections),
            },
        }
    )


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_customer(
    body: CreateCustomerBody,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Create a new customer. If openingBalance > 0, auto-creates an OPENING_BALANCE KhataTransaction."""
    business_id: str = access["retailerBusinessId"]
    user: dict = access["user"]

    # Check phone uniqueness within business
    existing_result = await db.execute(
        select(RetailerCustomer).where(
            RetailerCustomer.retailerBusinessId == business_id,
            RetailerCustomer.phone == body.phone,
        )
    )
    if existing_result.scalar_one_or_none():
        raise AppError(
            409,
            "PHONE_ALREADY_EXISTS",
            f"A customer with phone {body.phone} already exists",
        )

    opening_balance = Decimal(str(body.openingBalance))

    customer = RetailerCustomer(
        retailerBusinessId=business_id,
        name=body.name,
        phone=body.phone,
        email=body.email,
        address=body.address,
        creditLimit=Decimal(str(body.creditLimit)) if body.creditLimit is not None else None,
        openingBalance=opening_balance,
        currentBalance=opening_balance,
    )
    db.add(customer)
    await db.flush()

    # Auto-create OPENING_BALANCE khata transaction if opening > 0
    if opening_balance > 0:
        khata_tx = KhataTransaction(
            retailerBusinessId=business_id,
            customerId=customer.id,
            type=KhataTransactionType.OPENING_BALANCE,
            amount=opening_balance,
            balanceAfter=opening_balance,
            notes="Opening balance on account creation",
            createdBy=user["id"],
        )
        db.add(khata_tx)

    audit = RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=user["id"],
        action="CREATE_CUSTOMER",
        entityType="RetailerCustomer",
        entityId=customer.id,
        after={"name": customer.name, "phone": customer.phone},
    )
    db.add(audit)

    await db.commit()

    return success(
        {"customer": _serialize_customer(customer)},
        message="Customer created successfully",
        status_code=201,
    )


@router.get("/{customer_id}")
async def get_customer(
    customer_id: str,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Get customer details with lifetime stats."""
    business_id: str = access["retailerBusinessId"]

    result = await db.execute(
        select(RetailerCustomer).where(
            RetailerCustomer.id == customer_id,
            RetailerCustomer.retailerBusinessId == business_id,
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found")

    # Lifetime stats
    total_sales_result = await db.execute(
        select(func.count(RetailSale.id)).where(
            RetailSale.retailerBusinessId == business_id,
            RetailSale.customerId == customer_id,
        )
    )
    total_sales: int = total_sales_result.scalar() or 0

    total_revenue_result = await db.execute(
        select(func.coalesce(func.sum(RetailSale.grandTotal), 0)).where(
            RetailSale.retailerBusinessId == business_id,
            RetailSale.customerId == customer_id,
        )
    )
    total_revenue: Decimal = total_revenue_result.scalar() or Decimal("0")

    total_payments_result = await db.execute(
        select(func.coalesce(func.sum(KhataTransaction.amount), 0)).where(
            KhataTransaction.retailerBusinessId == business_id,
            KhataTransaction.customerId == customer_id,
            KhataTransaction.type == KhataTransactionType.PAYMENT_RECEIVED,
        )
    )
    total_payments_received: Decimal = total_payments_result.scalar() or Decimal("0")

    return success(
        {
            "customer": _serialize_customer(customer),
            "stats": {
                "totalSales": total_sales,
                "totalRevenue": float(total_revenue),
                "totalPaymentsReceived": float(total_payments_received),
            },
        }
    )


@router.patch("/{customer_id}")
async def update_customer(
    customer_id: str,
    body: UpdateCustomerBody,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Update customer details."""
    business_id: str = access["retailerBusinessId"]
    user: dict = access["user"]

    result = await db.execute(
        select(RetailerCustomer).where(
            RetailerCustomer.id == customer_id,
            RetailerCustomer.retailerBusinessId == business_id,
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found")

    before = _serialize_customer(customer)

    if body.name is not None:
        customer.name = body.name
    if body.phone is not None:
        # Check phone uniqueness (excluding self)
        existing_result = await db.execute(
            select(RetailerCustomer).where(
                RetailerCustomer.retailerBusinessId == business_id,
                RetailerCustomer.phone == body.phone,
                RetailerCustomer.id != customer_id,
            )
        )
        if existing_result.scalar_one_or_none():
            raise AppError(
                409,
                "PHONE_ALREADY_EXISTS",
                f"A customer with phone {body.phone} already exists",
            )
        customer.phone = body.phone
    if body.email is not None:
        customer.email = body.email
    if body.address is not None:
        customer.address = body.address
    if body.creditLimit is not None:
        customer.creditLimit = Decimal(str(body.creditLimit))
    if body.status is not None:
        customer.status = body.status

    audit = RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=user["id"],
        action="UPDATE_CUSTOMER",
        entityType="RetailerCustomer",
        entityId=customer.id,
        before=before,
        after=_serialize_customer(customer),
    )
    db.add(audit)

    await db.commit()
    return success({"customer": _serialize_customer(customer)}, message="Customer updated")


@router.get("/{customer_id}/transactions")
async def list_customer_transactions(
    customer_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    txType: Optional[KhataTransactionType] = Query(None),
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """List khata ledger transactions for a customer."""
    business_id: str = access["retailerBusinessId"]

    # Verify customer belongs to business
    cust_result = await db.execute(
        select(RetailerCustomer.id).where(
            RetailerCustomer.id == customer_id,
            RetailerCustomer.retailerBusinessId == business_id,
        )
    )
    if not cust_result.scalar_one_or_none():
        raise AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found")

    filters = [
        KhataTransaction.retailerBusinessId == business_id,
        KhataTransaction.customerId == customer_id,
    ]
    if txType:
        filters.append(KhataTransaction.type == txType)

    total_result = await db.execute(
        select(func.count(KhataTransaction.id)).where(and_(*filters))
    )
    total: int = total_result.scalar() or 0

    offset = (page - 1) * limit
    txs_result = await db.execute(
        select(KhataTransaction)
        .where(and_(*filters))
        .order_by(KhataTransaction.createdAt.desc())
        .offset(offset)
        .limit(limit)
    )
    txs = txs_result.scalars().all()

    return success(
        {
            "transactions": [_serialize_khata_tx(tx) for tx in txs],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "pages": (total + limit - 1) // limit,
            },
        }
    )


@router.post("/{customer_id}/payment")
async def record_payment(
    customer_id: str,
    body: RecordPaymentBody,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Record a payment received from the customer (reduces currentBalance)."""
    business_id: str = access["retailerBusinessId"]
    user: dict = access["user"]

    result = await db.execute(
        select(RetailerCustomer).where(
            RetailerCustomer.id == customer_id,
            RetailerCustomer.retailerBusinessId == business_id,
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found")

    amount = Decimal(str(body.amount))
    if customer.currentBalance <= 0:
        raise AppError(400, "NO_OUTSTANDING_BALANCE", "Customer has no outstanding balance")

    prev_balance = customer.currentBalance
    customer.currentBalance = prev_balance - amount

    khata_tx = KhataTransaction(
        retailerBusinessId=business_id,
        customerId=customer.id,
        type=KhataTransactionType.PAYMENT_RECEIVED,
        amount=amount,
        balanceAfter=customer.currentBalance,
        notes=(
            f"Payment via {body.paymentMethod}"
            + (f" | Ref: {body.reference}" if body.reference else "")
            + (f" | {body.notes}" if body.notes else "")
        ),
        createdBy=user["id"],
    )
    db.add(khata_tx)

    audit = RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=user["id"],
        action="RECORD_CUSTOMER_PAYMENT",
        entityType="RetailerCustomer",
        entityId=customer.id,
        before={"currentBalance": float(prev_balance)},
        after={
            "currentBalance": float(customer.currentBalance),
            "paymentAmount": float(amount),
            "paymentMethod": body.paymentMethod,
        },
    )
    db.add(audit)

    await db.commit()
    return success(
        {
            "customer": _serialize_customer(customer),
            "transaction": _serialize_khata_tx(khata_tx),
        },
        message="Payment recorded successfully",
    )


@router.post("/{customer_id}/adjustment")
async def record_adjustment(
    customer_id: str,
    body: RecordAdjustmentBody,
    access: dict = Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    """Record a manual adjustment to customer balance.
    DEBIT  → adds to balance (customer owes more).
    CREDIT → reduces balance (customer owes less).
    """
    business_id: str = access["retailerBusinessId"]
    user: dict = access["user"]

    result = await db.execute(
        select(RetailerCustomer).where(
            RetailerCustomer.id == customer_id,
            RetailerCustomer.retailerBusinessId == business_id,
        )
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found")

    amount = Decimal(str(body.amount))
    prev_balance = customer.currentBalance

    if body.direction == "DEBIT":
        customer.currentBalance = prev_balance + amount
    else:
        # CREDIT — reduces balance
        customer.currentBalance = prev_balance - amount

    khata_tx = KhataTransaction(
        retailerBusinessId=business_id,
        customerId=customer.id,
        type=KhataTransactionType.ADJUSTMENT,
        amount=amount if body.direction == "DEBIT" else -amount,
        balanceAfter=customer.currentBalance,
        notes=(
            f"[{body.direction}] {body.reason}"
            + (f" | {body.notes}" if body.notes else "")
        ),
        createdBy=user["id"],
    )
    db.add(khata_tx)

    audit = RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=user["id"],
        action="CUSTOMER_ADJUSTMENT",
        entityType="RetailerCustomer",
        entityId=customer.id,
        before={"currentBalance": float(prev_balance)},
        after={
            "currentBalance": float(customer.currentBalance),
            "direction": body.direction,
            "amount": float(amount),
            "reason": body.reason,
        },
    )
    db.add(audit)

    await db.commit()
    return success(
        {
            "customer": _serialize_customer(customer),
            "transaction": _serialize_khata_tx(khata_tx),
        },
        message="Adjustment recorded successfully",
    )
