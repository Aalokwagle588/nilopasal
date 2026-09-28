import random
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from app.database import get_db
from app.errors import AppError
from app.utils.response import success
from app.utils.security import slugify, generate_sku
from app.models import (
    RetailerProduct, RetailerProductVariant, RetailerInventory, RetailerInventoryTransaction,
    RetailerCategory, RetailerAuditLog,
    ProductStatus, RecordStatus, VariantStatus, RetailerUnit, RetailerTaxType,
    RetailerInventoryTransactionType,
)
from app.middleware.auth import get_retailer_access

router = APIRouter(prefix="/api/retailer", tags=["catalog"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateCategoryBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    slug: Optional[str] = None
    description: Optional[str] = None
    sortOrder: int = 0


class UpdateCategoryBody(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    sortOrder: Optional[int] = None
    status: Optional[RecordStatus] = None


class VariantInput(BaseModel):
    title: str = Field(..., min_length=1)
    sku: Optional[str] = None
    barcode: Optional[str] = None
    costPrice: Optional[float] = None
    sellingPrice: Optional[float] = None
    initialStock: Optional[int] = 0
    lowStockThreshold: Optional[int] = 5


class CreateProductBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=300)
    slug: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    description: Optional[str] = None
    categoryId: Optional[str] = None
    costPrice: float = 0
    sellingPrice: float = 0
    mrp: Optional[float] = None
    unit: RetailerUnit = RetailerUnit.PCS
    customUnit: Optional[str] = None
    taxRate: float = 0
    taxType: RetailerTaxType = RetailerTaxType.NON_TAXABLE
    trackInventory: bool = True
    status: ProductStatus = ProductStatus.ACTIVE
    initialStock: int = 0
    lowStockThreshold: int = 5
    variants: Optional[List[VariantInput]] = None


class UpdateProductBody(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    categoryId: Optional[str] = None
    description: Optional[str] = None
    costPrice: Optional[float] = None
    sellingPrice: Optional[float] = None
    mrp: Optional[float] = None
    unit: Optional[RetailerUnit] = None
    customUnit: Optional[str] = None
    taxRate: Optional[float] = None
    taxType: Optional[RetailerTaxType] = None
    trackInventory: Optional[bool] = None
    status: Optional[ProductStatus] = None
    lowStockThreshold: Optional[int] = None


class CreateVariantBody(BaseModel):
    title: str = Field(..., min_length=1)
    sku: Optional[str] = None
    barcode: Optional[str] = None
    costPrice: Optional[float] = None
    sellingPrice: Optional[float] = None
    initialStock: int = 0
    lowStockThreshold: int = 5


class AdjustStockBody(BaseModel):
    type: RetailerInventoryTransactionType
    quantity: int = Field(..., gt=0)
    reason: Optional[str] = None
    variantId: Optional[str] = None


def serialize_product(p, inventories=None):
    total_qty = sum(i.quantityAvailable for i in (inventories or p.inventories or []))
    return {
        "id": p.id,
        "name": p.name,
        "slug": p.slug,
        "sku": p.sku,
        "barcode": p.barcode,
        "description": p.description,
        "categoryId": p.categoryId,
        "costPrice": str(p.costPrice),
        "sellingPrice": str(p.sellingPrice),
        "mrp": str(p.mrp) if p.mrp is not None else None,
        "unit": p.unit,
        "customUnit": p.customUnit,
        "taxRate": str(p.taxRate),
        "taxType": p.taxType,
        "trackInventory": p.trackInventory,
        "status": p.status,
        "createdAt": p.createdAt.isoformat(),
        "updatedAt": p.updatedAt.isoformat(),
        "totalQuantity": total_qty,
        "stockStatus": "OUT_OF_STOCK" if total_qty <= 0 else "LOW_STOCK" if total_qty <= 5 else "IN_STOCK",
    }


# ── Category Routes ───────────────────────────────────────────────────────────

@router.get("/catalog/categories")
async def list_categories(
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    business_id = retailer_access["retailerBusinessId"]
    result = await db.execute(
        select(RetailerCategory)
        .where(
            RetailerCategory.retailerBusinessId == business_id,
            RetailerCategory.status != RecordStatus.ARCHIVED,
        )
        .order_by(RetailerCategory.sortOrder, RetailerCategory.name)
    )
    categories = result.scalars().all()
    data = [{"id": c.id, "name": c.name, "slug": c.slug, "description": c.description,
              "sortOrder": c.sortOrder, "status": c.status, "createdAt": c.createdAt.isoformat()} for c in categories]
    return success({"categories": data})


@router.post("/catalog/categories", status_code=201)
async def create_category(
    body: CreateCategoryBody,
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    business_id = retailer_access["retailerBusinessId"]
    base_slug = slugify(body.slug or body.name) or f"cat-{int(datetime.now().timestamp())}"
    final_slug = base_slug

    existing = await db.execute(
        select(RetailerCategory).where(
            RetailerCategory.retailerBusinessId == business_id,
            RetailerCategory.slug == final_slug,
        )
    )
    if existing.scalar_one_or_none():
        suffix = "".join([str(random.randint(0, 9)) for _ in range(4)])
        final_slug = f"{base_slug}-{suffix}"

    cat = RetailerCategory(
        retailerBusinessId=business_id,
        name=body.name,
        slug=final_slug,
        description=body.description,
        sortOrder=body.sortOrder,
        status=RecordStatus.ACTIVE,
    )
    db.add(cat)
    db.add(RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=retailer_access["user"]["id"],
        action="CREATE_CATEGORY", entityType="CATEGORY", entityId=None,
        after={"name": cat.name, "slug": final_slug},
    ))
    await db.commit()
    await db.refresh(cat)
    return success({"category": {"id": cat.id, "name": cat.name, "slug": cat.slug, "status": cat.status}}, "Category created", 201)


@router.patch("/catalog/categories/{category_id}")
async def update_category(
    category_id: str,
    body: UpdateCategoryBody,
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    business_id = retailer_access["retailerBusinessId"]
    result = await db.execute(
        select(RetailerCategory).where(RetailerCategory.id == category_id, RetailerCategory.retailerBusinessId == business_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise AppError(404, "CATEGORY_NOT_FOUND", "Category not found")
    if body.name is not None: cat.name = body.name
    if body.description is not None: cat.description = body.description
    if body.sortOrder is not None: cat.sortOrder = body.sortOrder
    if body.status is not None: cat.status = body.status
    if body.slug is not None:
        new_slug = slugify(body.slug)
        if new_slug != cat.slug:
            conflict = await db.execute(
                select(RetailerCategory).where(
                    RetailerCategory.retailerBusinessId == business_id, RetailerCategory.slug == new_slug
                )
            )
            if conflict.scalar_one_or_none():
                raise AppError(409, "SLUG_CONFLICT", "A category with this slug already exists")
            cat.slug = new_slug
    await db.commit()
    await db.refresh(cat)
    return success({"id": cat.id, "name": cat.name, "slug": cat.slug, "status": cat.status}, "Category updated")


@router.delete("/catalog/categories/{category_id}")
async def delete_category(
    category_id: str,
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    business_id = retailer_access["retailerBusinessId"]
    result = await db.execute(
        select(RetailerCategory).where(RetailerCategory.id == category_id, RetailerCategory.retailerBusinessId == business_id)
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise AppError(404, "CATEGORY_NOT_FOUND", "Category not found")

    # Disassociate products
    products = await db.execute(
        select(RetailerProduct).where(RetailerProduct.categoryId == category_id)
    )
    for p in products.scalars().all():
        p.categoryId = None

    cat.status = RecordStatus.ARCHIVED
    await db.commit()
    return success(None, "Category removed")


# ── Product Routes ─────────────────────────────────────────────────────────────

@router.get("/catalog/products")
async def list_products(
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = None,
    categoryId: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sortBy: str = "createdAt",
    sortOrder: str = "desc",
):
    business_id = retailer_access["retailerBusinessId"]
    filters = [
        RetailerProduct.retailerBusinessId == business_id,
        RetailerProduct.status != ProductStatus.ARCHIVED,
    ]
    if status:
        filters = [RetailerProduct.retailerBusinessId == business_id, RetailerProduct.status == status]
    if categoryId:
        filters.append(RetailerProduct.categoryId == categoryId)
    if search:
        term = f"%{search.strip()}%"
        filters.append(or_(
            RetailerProduct.name.ilike(term),
            RetailerProduct.sku.ilike(term),
            RetailerProduct.barcode.ilike(term),
        ))

    total_result = await db.execute(select(func.count(RetailerProduct.id)).where(*filters))
    total = total_result.scalar()

    sort_col = getattr(RetailerProduct, sortBy if hasattr(RetailerProduct, sortBy) else "createdAt")
    order = sort_col.desc() if sortOrder == "desc" else sort_col.asc()

    products_result = await db.execute(
        select(RetailerProduct).where(*filters)
        .order_by(order)
        .offset((page - 1) * limit)
        .limit(limit)
    )
    products = products_result.scalars().all()

    items = []
    for p in products:
        inv_result = await db.execute(
            select(RetailerInventory).where(RetailerInventory.productId == p.id)
        )
        inventories = inv_result.scalars().all()
        items.append(serialize_product(p, inventories))

    return success({
        "items": items,
        "pagination": {"page": page, "limit": limit, "totalItems": total, "totalPages": -(-total // limit)},
    })


@router.post("/catalog/products", status_code=201)
async def create_product(
    body: CreateProductBody,
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    business_id = retailer_access["retailerBusinessId"]
    actor_id = retailer_access["user"]["id"]

    # Validate category
    if body.categoryId:
        cat_result = await db.execute(
            select(RetailerCategory).where(
                RetailerCategory.id == body.categoryId,
                RetailerCategory.retailerBusinessId == business_id,
                RetailerCategory.status != RecordStatus.ARCHIVED,
            )
        )
        if not cat_result.scalar_one_or_none():
            raise AppError(400, "INVALID_CATEGORY", "Selected category does not exist")

    # Resolve SKU
    final_sku = body.sku.strip().upper() if body.sku else generate_sku(body.name)
    sku_conflict = await db.execute(
        select(RetailerProduct).where(
            RetailerProduct.retailerBusinessId == business_id,
            RetailerProduct.sku == final_sku,
        )
    )
    if sku_conflict.scalar_one_or_none():
        raise AppError(409, "SKU_CONFLICT", f'A product with SKU "{final_sku}" already exists')

    barcode = body.barcode.strip() if body.barcode else None
    if barcode:
        bc_conflict = await db.execute(
            select(RetailerProduct).where(
                RetailerProduct.retailerBusinessId == business_id,
                RetailerProduct.barcode == barcode,
            )
        )
        if bc_conflict.scalar_one_or_none():
            raise AppError(409, "BARCODE_CONFLICT", f'A product with barcode "{barcode}" already exists')

    base_slug = slugify(body.slug or body.name) or f"prod-{int(datetime.now().timestamp())}"
    suffix = "".join([str(random.randint(0, 9)) for _ in range(4)])
    final_slug = f"{base_slug}-{suffix}"

    product = RetailerProduct(
        retailerBusinessId=business_id,
        categoryId=body.categoryId,
        name=body.name,
        slug=final_slug,
        sku=final_sku,
        barcode=barcode,
        description=body.description,
        costPrice=Decimal(str(body.costPrice)),
        sellingPrice=Decimal(str(body.sellingPrice)),
        mrp=Decimal(str(body.mrp)) if body.mrp is not None else None,
        unit=body.unit,
        customUnit=body.customUnit,
        taxRate=Decimal(str(body.taxRate)),
        taxType=body.taxType,
        trackInventory=body.trackInventory,
        status=body.status,
    )
    db.add(product)
    await db.flush()

    # Create inventory
    if body.variants and len(body.variants) > 0:
        for v_input in body.variants:
            v_sku = (v_input.sku.strip().upper() if v_input.sku else None) or f"{final_sku}-{slugify(v_input.title).upper()}"
            variant = RetailerProductVariant(
                retailerProductId=product.id,
                title=v_input.title,
                sku=v_sku,
                barcode=v_input.barcode.strip() if v_input.barcode else None,
                costPrice=Decimal(str(v_input.costPrice)) if v_input.costPrice is not None else Decimal(str(body.costPrice)),
                sellingPrice=Decimal(str(v_input.sellingPrice)) if v_input.sellingPrice is not None else Decimal(str(body.sellingPrice)),
                status=VariantStatus.ACTIVE,
            )
            db.add(variant)
            await db.flush()
            inv = RetailerInventory(
                retailerBusinessId=business_id,
                productId=product.id,
                variantId=variant.id,
                quantityAvailable=v_input.initialStock or 0,
                lowStockThreshold=v_input.lowStockThreshold or 5,
            )
            db.add(inv)
            await db.flush()
            if v_input.initialStock and v_input.initialStock > 0:
                db.add(RetailerInventoryTransaction(
                    retailerBusinessId=business_id,
                    inventoryId=inv.id,
                    type=RetailerInventoryTransactionType.STOCK_IN,
                    quantity=v_input.initialStock,
                    previousQuantity=0,
                    newQuantity=v_input.initialStock,
                    referenceType="INITIAL_STOCK",
                    reason="Opening stock on product creation",
                    performedBy=actor_id,
                ))
    else:
        inv = RetailerInventory(
            retailerBusinessId=business_id,
            productId=product.id,
            quantityAvailable=body.initialStock,
            lowStockThreshold=body.lowStockThreshold,
        )
        db.add(inv)
        await db.flush()
        if body.initialStock > 0:
            db.add(RetailerInventoryTransaction(
                retailerBusinessId=business_id,
                inventoryId=inv.id,
                type=RetailerInventoryTransactionType.STOCK_IN,
                quantity=body.initialStock,
                previousQuantity=0,
                newQuantity=body.initialStock,
                referenceType="INITIAL_STOCK",
                reason="Opening stock on product creation",
                performedBy=actor_id,
            ))

    db.add(RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=actor_id,
        action="CREATE_PRODUCT", entityType="PRODUCT", entityId=product.id,
        after={"name": product.name, "sku": product.sku, "sellingPrice": str(product.sellingPrice)},
    ))

    await db.commit()
    await db.refresh(product)

    inv_result = await db.execute(select(RetailerInventory).where(RetailerInventory.productId == product.id))
    inventories = inv_result.scalars().all()
    return success({"product": serialize_product(product, inventories)}, "Product created", 201)


@router.get("/catalog/products/{product_id}")
async def get_product(
    product_id: str,
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    business_id = retailer_access["retailerBusinessId"]
    result = await db.execute(
        select(RetailerProduct).where(
            RetailerProduct.id == product_id,
            RetailerProduct.retailerBusinessId == business_id,
            RetailerProduct.status != ProductStatus.ARCHIVED,
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        raise AppError(404, "PRODUCT_NOT_FOUND", "Product not found")

    inv_result = await db.execute(select(RetailerInventory).where(RetailerInventory.productId == p.id))
    inventories = inv_result.scalars().all()
    variant_result = await db.execute(select(RetailerProductVariant).where(RetailerProductVariant.retailerProductId == p.id))
    variants = variant_result.scalars().all()

    data = serialize_product(p, inventories)
    data["variants"] = [{"id": v.id, "title": v.title, "sku": v.sku, "barcode": v.barcode,
                          "costPrice": str(v.costPrice), "sellingPrice": str(v.sellingPrice), "status": v.status} for v in variants]
    data["inventories"] = [{"id": i.id, "variantId": i.variantId, "quantityAvailable": i.quantityAvailable,
                             "quantityReserved": i.quantityReserved, "lowStockThreshold": i.lowStockThreshold} for i in inventories]
    return success(data)


@router.patch("/catalog/products/{product_id}")
async def update_product(
    product_id: str,
    body: UpdateProductBody,
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    business_id = retailer_access["retailerBusinessId"]
    result = await db.execute(
        select(RetailerProduct).where(RetailerProduct.id == product_id, RetailerProduct.retailerBusinessId == business_id)
    )
    p = result.scalar_one_or_none()
    if not p:
        raise AppError(404, "PRODUCT_NOT_FOUND", "Product not found")

    if body.name is not None: p.name = body.name
    if body.categoryId is not None: p.categoryId = body.categoryId
    if body.description is not None: p.description = body.description
    if body.costPrice is not None: p.costPrice = Decimal(str(body.costPrice))
    if body.sellingPrice is not None: p.sellingPrice = Decimal(str(body.sellingPrice))
    if body.mrp is not None: p.mrp = Decimal(str(body.mrp))
    if body.unit is not None: p.unit = body.unit
    if body.customUnit is not None: p.customUnit = body.customUnit
    if body.taxRate is not None: p.taxRate = Decimal(str(body.taxRate))
    if body.taxType is not None: p.taxType = body.taxType
    if body.trackInventory is not None: p.trackInventory = body.trackInventory
    if body.status is not None: p.status = body.status

    if body.lowStockThreshold is not None:
        inv_result = await db.execute(select(RetailerInventory).where(RetailerInventory.productId == product_id))
        for inv in inv_result.scalars().all():
            inv.lowStockThreshold = body.lowStockThreshold

    await db.commit()
    await db.refresh(p)
    inv_result = await db.execute(select(RetailerInventory).where(RetailerInventory.productId == p.id))
    inventories = inv_result.scalars().all()
    return success(serialize_product(p, inventories), "Product updated")


@router.delete("/catalog/products/{product_id}")
async def archive_product(
    product_id: str,
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    business_id = retailer_access["retailerBusinessId"]
    result = await db.execute(
        select(RetailerProduct).where(RetailerProduct.id == product_id, RetailerProduct.retailerBusinessId == business_id)
    )
    p = result.scalar_one_or_none()
    if not p:
        raise AppError(404, "PRODUCT_NOT_FOUND", "Product not found")
    p.status = ProductStatus.ARCHIVED
    await db.commit()
    return success(None, "Product archived")


@router.post("/catalog/products/{product_id}/stock-adjust")
async def adjust_stock(
    product_id: str,
    body: AdjustStockBody,
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    business_id = retailer_access["retailerBusinessId"]
    actor_id = retailer_access["user"]["id"]

    # Find inventory
    filters = [RetailerInventory.productId == product_id, RetailerInventory.retailerBusinessId == business_id]
    if body.variantId:
        filters.append(RetailerInventory.variantId == body.variantId)
    else:
        filters.append(RetailerInventory.variantId == None)

    result = await db.execute(select(RetailerInventory).where(*filters))
    inv = result.scalar_one_or_none()
    if not inv:
        raise AppError(404, "INVENTORY_NOT_FOUND", "Inventory record not found")

    prev_qty = inv.quantityAvailable
    if body.type in (RetailerInventoryTransactionType.STOCK_IN, RetailerInventoryTransactionType.ADJUSTMENT_IN,
                     RetailerInventoryTransactionType.OPENING_STOCK):
        new_qty = prev_qty + body.quantity
    else:
        new_qty = max(0, prev_qty - body.quantity)

    inv.quantityAvailable = new_qty
    db.add(RetailerInventoryTransaction(
        retailerBusinessId=business_id,
        inventoryId=inv.id,
        type=body.type,
        quantity=body.quantity,
        previousQuantity=prev_qty,
        newQuantity=new_qty,
        referenceType="MANUAL_ADJUSTMENT",
        reason=body.reason,
        performedBy=actor_id,
    ))
    await db.commit()
    return success({
        "inventoryId": inv.id,
        "previousQuantity": prev_qty,
        "newQuantity": new_qty,
        "type": body.type,
    }, "Stock adjusted")


@router.get("/catalog/inventory")
async def list_inventory(
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    business_id = retailer_access["retailerBusinessId"]
    total_result = await db.execute(
        select(func.count(RetailerInventory.id)).where(RetailerInventory.retailerBusinessId == business_id)
    )
    total = total_result.scalar()
    result = await db.execute(
        select(RetailerInventory)
        .where(RetailerInventory.retailerBusinessId == business_id)
        .offset((page - 1) * limit).limit(limit)
    )
    items = result.scalars().all()
    return success({
        "items": [{"id": i.id, "productId": i.productId, "variantId": i.variantId,
                   "quantityAvailable": i.quantityAvailable, "quantityReserved": i.quantityReserved,
                   "lowStockThreshold": i.lowStockThreshold} for i in items],
        "pagination": {"page": page, "limit": limit, "totalItems": total, "totalPages": -(-total // limit)},
    })
