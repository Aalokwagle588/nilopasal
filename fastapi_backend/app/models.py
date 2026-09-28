"""All SQLAlchemy ORM models for Nilopasal — mirrors the PostgreSQL database schema exactly."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, List

from sqlalchemy import (
    String, Boolean, DateTime, ForeignKey, Numeric, Integer,
    Text, JSON, Enum as SAEnum, UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database import Base

UUID_TYPE = PG_UUID(as_uuid=False)


def utcnow():
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


# ─── Enums ────────────────────────────────────────────────────────────────────

class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PENDING = "PENDING"
    SUSPENDED = "SUSPENDED"
    DISABLED = "DISABLED"


class RoleCode(str, enum.Enum):
    CUSTOMER = "CUSTOMER"
    ADMIN = "ADMIN"
    STAFF = "STAFF"
    VENDOR = "VENDOR"
    VENDOR_STAFF = "VENDOR_STAFF"
    RETAILER = "RETAILER"


class RecordStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    ARCHIVED = "ARCHIVED"


class ProductStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    ARCHIVED = "ARCHIVED"


class VariantStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    ARCHIVED = "ARCHIVED"


class CartStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    CONVERTED = "CONVERTED"
    ABANDONED = "ABANDONED"
    EXPIRED = "EXPIRED"


class RetailerBusinessType(str, enum.Enum):
    RETAILER = "RETAILER"
    RESELLER = "RESELLER"
    MANUFACTURER = "MANUFACTURER"
    FARMER = "FARMER"
    WHOLESALER = "WHOLESALER"
    DISTRIBUTOR = "DISTRIBUTOR"


class RetailerVerificationStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    VERIFIED = "VERIFIED"
    REJECTED = "REJECTED"
    SUSPENDED = "SUSPENDED"


class RetailerSubscriptionStatus(str, enum.Enum):
    NONE = "NONE"
    TRIAL = "TRIAL"
    ACTIVE = "ACTIVE"
    PAST_DUE = "PAST_DUE"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"
    SUSPENDED = "SUSPENDED"


class RetailerMembershipRole(str, enum.Enum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    CASHIER = "CASHIER"
    INVENTORY_MANAGER = "INVENTORY_MANAGER"
    ACCOUNTANT = "ACCOUNTANT"
    STAFF = "STAFF"


class BillingPeriod(str, enum.Enum):
    MONTHLY = "MONTHLY"
    YEARLY = "YEARLY"


class SubscriptionPlanStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    ARCHIVED = "ARCHIVED"


class RetailerUnit(str, enum.Enum):
    PCS = "PCS"
    BOX = "BOX"
    PACK = "PACK"
    KG = "KG"
    GRAM = "GRAM"
    LITER = "LITER"
    ML = "ML"
    METER = "METER"
    CUSTOM = "CUSTOM"


class RetailerTaxType(str, enum.Enum):
    NON_TAXABLE = "NON_TAXABLE"
    TAXABLE = "TAXABLE"
    EXEMPT = "EXEMPT"


class RetailerPaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class RetailerPaymentMethod(str, enum.Enum):
    CASH = "CASH"
    BANK = "BANK"
    ESEWA = "ESEWA"
    KHALTI = "KHALTI"
    CARD = "CARD"
    CREDIT_KHATA = "CREDIT_KHATA"
    OTHER = "OTHER"


class RetailerPurchaseStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ORDERED = "ORDERED"
    PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED"
    RECEIVED = "RECEIVED"
    CANCELLED = "CANCELLED"
    RETURNED = "RETURNED"


class KhataTransactionType(str, enum.Enum):
    SALE_CREDIT = "SALE_CREDIT"
    PAYMENT_RECEIVED = "PAYMENT_RECEIVED"
    ADJUSTMENT = "ADJUSTMENT"
    RETURN = "RETURN"
    OPENING_BALANCE = "OPENING_BALANCE"


class SupplierTransactionType(str, enum.Enum):
    PURCHASE = "PURCHASE"
    PAYMENT = "PAYMENT"
    PURCHASE_RETURN = "PURCHASE_RETURN"
    ADJUSTMENT = "ADJUSTMENT"
    OPENING_BALANCE = "OPENING_BALANCE"


class StaffInviteStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"


class RetailerInventoryTransactionType(str, enum.Enum):
    STOCK_IN = "STOCK_IN"
    SALE = "SALE"
    SALE_RETURN = "SALE_RETURN"
    PURCHASE = "PURCHASE"
    PURCHASE_RETURN = "PURCHASE_RETURN"
    ADJUSTMENT_IN = "ADJUSTMENT_IN"
    ADJUSTMENT_OUT = "ADJUSTMENT_OUT"
    DAMAGED = "DAMAGED"
    EXPIRED = "EXPIRED"
    TRANSFER = "TRANSFER"
    OPENING_STOCK = "OPENING_STOCK"


# ─── Core User Models ─────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    firstName: Mapped[str] = mapped_column(String(80))
    lastName: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    emailNormalized: Mapped[str] = mapped_column(String(254), unique=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), unique=True, nullable=True)
    phoneNormalized: Mapped[Optional[str]] = mapped_column(String(30), unique=True, nullable=True)
    passwordHash: Mapped[str] = mapped_column(String)
    status: Mapped[UserStatus] = mapped_column(SAEnum(UserStatus, name="UserStatus", create_type=False), default=UserStatus.PENDING)
    emailVerified: Mapped[bool] = mapped_column(Boolean, default=False)
    phoneVerified: Mapped[bool] = mapped_column(Boolean, default=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    roles: Mapped[List["UserRole"]] = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")
    sessions: Mapped[List["AuthSession"]] = relationship("AuthSession", back_populates="user", cascade="all, delete-orphan")
    retailerMemberships: Mapped[List["RetailerMembership"]] = relationship("RetailerMembership", back_populates="user", cascade="all, delete-orphan")
    ownedRetailers: Mapped[List["RetailerBusiness"]] = relationship("RetailerBusiness", foreign_keys="RetailerBusiness.ownerUserId", back_populates="owner")
    carts: Mapped[List["Cart"]] = relationship("Cart", back_populates="user", cascade="all, delete-orphan")
    wishlist: Mapped[Optional["Wishlist"]] = relationship("Wishlist", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_User_status", "status"),
        Index("ix_User_createdAt", "createdAt"),
    )


class Role(Base):
    __tablename__ = "Role"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    code: Mapped[RoleCode] = mapped_column(SAEnum(RoleCode, name="RoleCode", create_type=False), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    users: Mapped[List["UserRole"]] = relationship("UserRole", back_populates="role")


class UserRole(Base):
    __tablename__ = "UserRole"

    userId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="CASCADE"), primary_key=True)
    roleId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("Role.id", ondelete="CASCADE"), primary_key=True)
    assignedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="roles")
    role: Mapped["Role"] = relationship("Role", back_populates="users")

    __table_args__ = (Index("ix_UserRole_roleId", "roleId"),)


class AuthSession(Base):
    __tablename__ = "AuthSession"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    userId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="CASCADE"))
    tokenHash: Mapped[str] = mapped_column(String, unique=True)
    userAgent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ipAddress: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    expiresAt: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revokedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    lastSeenAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="sessions")

    __table_args__ = (
        Index("ix_AuthSession_userId", "userId"),
        Index("ix_AuthSession_expiresAt", "expiresAt"),
    )


class Cart(Base):
    __tablename__ = "Cart"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    userId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="CASCADE"))
    status: Mapped[CartStatus] = mapped_column(SAEnum(CartStatus, name="CartStatus", create_type=False), default=CartStatus.ACTIVE)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="carts")


class Wishlist(Base):
    __tablename__ = "Wishlist"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    userId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="CASCADE"), unique=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="wishlist")


# ─── Retailer Business ────────────────────────────────────────────────────────

class RetailerBusiness(Base):
    __tablename__ = "RetailerBusiness"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    businessName: Mapped[str] = mapped_column(String(200))
    legalName: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    ownerUserId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="RESTRICT"))
    businessType: Mapped[RetailerBusinessType] = mapped_column(SAEnum(RetailerBusinessType, name="RetailerBusinessType", create_type=False), default=RetailerBusinessType.RETAILER)
    status: Mapped[RecordStatus] = mapped_column(SAEnum(RecordStatus, name="RecordStatus", create_type=False), default=RecordStatus.ACTIVE)
    phone: Mapped[str] = mapped_column(String(30))
    alternatePhone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(254), nullable=True)
    panNumber: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    vatNumber: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    province: Mapped[str] = mapped_column(String(100))
    district: Mapped[str] = mapped_column(String(100))
    municipality: Mapped[str] = mapped_column(String(100))
    ward: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    addressLine: Mapped[str] = mapped_column(String(300))
    landmark: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    logo: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    coverImage: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    verificationStatus: Mapped[RetailerVerificationStatus] = mapped_column(SAEnum(RetailerVerificationStatus, name="RetailerVerificationStatus", create_type=False), default=RetailerVerificationStatus.DRAFT)
    verificationSubmittedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    verifiedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    verifiedBy: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    subscriptionStatus: Mapped[RetailerSubscriptionStatus] = mapped_column(SAEnum(RetailerSubscriptionStatus, name="RetailerSubscriptionStatus", create_type=False), default=RetailerSubscriptionStatus.NONE)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    owner: Mapped["User"] = relationship("User", foreign_keys=[ownerUserId], back_populates="ownedRetailers")
    memberships: Mapped[List["RetailerMembership"]] = relationship("RetailerMembership", back_populates="retailerBusiness", cascade="all, delete-orphan")
    subscriptions: Mapped[List["RetailerSubscription"]] = relationship("RetailerSubscription", back_populates="retailerBusiness", cascade="all, delete-orphan")
    categories: Mapped[List["RetailerCategory"]] = relationship("RetailerCategory", back_populates="retailerBusiness", cascade="all, delete-orphan")
    products: Mapped[List["RetailerProduct"]] = relationship("RetailerProduct", back_populates="retailerBusiness", cascade="all, delete-orphan")
    inventories: Mapped[List["RetailerInventory"]] = relationship("RetailerInventory", back_populates="retailerBusiness", cascade="all, delete-orphan")
    sales: Mapped[List["RetailSale"]] = relationship("RetailSale", back_populates="retailerBusiness", cascade="all, delete-orphan")
    customers: Mapped[List["RetailerCustomer"]] = relationship("RetailerCustomer", back_populates="retailerBusiness", cascade="all, delete-orphan")
    suppliers: Mapped[List["RetailerSupplier"]] = relationship("RetailerSupplier", back_populates="retailerBusiness", cascade="all, delete-orphan")
    purchases: Mapped[List["RetailerPurchase"]] = relationship("RetailerPurchase", back_populates="retailerBusiness", cascade="all, delete-orphan")
    staffInvites: Mapped[List["RetailerStaffInvite"]] = relationship("RetailerStaffInvite", back_populates="retailerBusiness", cascade="all, delete-orphan")
    auditLogs: Mapped[List["RetailerAuditLog"]] = relationship("RetailerAuditLog", back_populates="retailerBusiness", cascade="all, delete-orphan")
    settings: Mapped[List["RetailerSetting"]] = relationship("RetailerSetting", back_populates="retailerBusiness", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_RetailerBusiness_ownerUserId", "ownerUserId"),
        Index("ix_RetailerBusiness_status", "status", "verificationStatus", "subscriptionStatus"),
    )


class RetailerMembership(Base):
    __tablename__ = "RetailerMembership"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    userId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="CASCADE"))
    role: Mapped[RetailerMembershipRole] = mapped_column(SAEnum(RetailerMembershipRole, name="RetailerMembershipRole", create_type=False))
    status: Mapped[RecordStatus] = mapped_column(SAEnum(RecordStatus, name="RecordStatus", create_type=False), default=RecordStatus.ACTIVE)
    joinedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    retailerBusiness: Mapped["RetailerBusiness"] = relationship("RetailerBusiness", back_populates="memberships")
    user: Mapped["User"] = relationship("User", back_populates="retailerMemberships")

    __table_args__ = (
        UniqueConstraint("retailerBusinessId", "userId", name="uq_membership_business_user"),
        Index("ix_RetailerMembership_userId", "userId", "status"),
    )


class SubscriptionPlan(Base):
    __tablename__ = "SubscriptionPlan"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    billingPeriod: Mapped[BillingPeriod] = mapped_column(SAEnum(BillingPeriod, name="BillingPeriod", create_type=False))
    status: Mapped[SubscriptionPlanStatus] = mapped_column(SAEnum(SubscriptionPlanStatus, name="SubscriptionPlanStatus", create_type=False), default=SubscriptionPlanStatus.ACTIVE)
    features: Mapped[dict] = mapped_column(JSON)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    retailerSubscriptions: Mapped[List["RetailerSubscription"]] = relationship("RetailerSubscription", back_populates="plan")


class RetailerSubscription(Base):
    __tablename__ = "RetailerSubscription"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    planId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("SubscriptionPlan.id", ondelete="RESTRICT"))
    status: Mapped[RetailerSubscriptionStatus] = mapped_column(SAEnum(RetailerSubscriptionStatus, name="RetailerSubscriptionStatus", create_type=False))
    startsAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expiresAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelledAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    trialStartsAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    trialEndsAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    retailerBusiness: Mapped["RetailerBusiness"] = relationship("RetailerBusiness", back_populates="subscriptions")
    plan: Mapped["SubscriptionPlan"] = relationship("SubscriptionPlan", back_populates="retailerSubscriptions")


# ─── Catalog ──────────────────────────────────────────────────────────────────

class RetailerCategory(Base):
    __tablename__ = "RetailerCategory"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sortOrder: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[RecordStatus] = mapped_column(SAEnum(RecordStatus, name="RecordStatus", create_type=False), default=RecordStatus.ACTIVE)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    retailerBusiness: Mapped["RetailerBusiness"] = relationship("RetailerBusiness", back_populates="categories")
    products: Mapped[List["RetailerProduct"]] = relationship("RetailerProduct", back_populates="category")

    __table_args__ = (
        UniqueConstraint("retailerBusinessId", "slug", name="uq_category_business_slug"),
        Index("ix_RetailerCategory_business_status", "retailerBusinessId", "status"),
    )


class RetailerProduct(Base):
    __tablename__ = "RetailerProduct"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    categoryId: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("RetailerCategory.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(300))
    slug: Mapped[str] = mapped_column(String(300))
    sku: Mapped[str] = mapped_column(String(100))
    barcode: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    costPrice: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    sellingPrice: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    mrp: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    unit: Mapped[RetailerUnit] = mapped_column(SAEnum(RetailerUnit, name="RetailerUnit", create_type=False), default=RetailerUnit.PCS)
    customUnit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    taxRate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    taxType: Mapped[RetailerTaxType] = mapped_column(SAEnum(RetailerTaxType, name="RetailerTaxType", create_type=False), default=RetailerTaxType.NON_TAXABLE)
    trackInventory: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[ProductStatus] = mapped_column(SAEnum(ProductStatus, name="ProductStatus", create_type=False), default=ProductStatus.ACTIVE)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    retailerBusiness: Mapped["RetailerBusiness"] = relationship("RetailerBusiness", back_populates="products")
    category: Mapped[Optional["RetailerCategory"]] = relationship("RetailerCategory", back_populates="products")
    variants: Mapped[List["RetailerProductVariant"]] = relationship("RetailerProductVariant", back_populates="product", cascade="all, delete-orphan")
    inventories: Mapped[List["RetailerInventory"]] = relationship("RetailerInventory", back_populates="product", cascade="all, delete-orphan")
    saleItems: Mapped[List["RetailSaleItem"]] = relationship("RetailSaleItem", back_populates="product")
    purchaseItems: Mapped[List["RetailerPurchaseItem"]] = relationship("RetailerPurchaseItem", back_populates="product")

    __table_args__ = (
        UniqueConstraint("retailerBusinessId", "sku", name="uq_product_business_sku"),
        UniqueConstraint("retailerBusinessId", "barcode", name="uq_product_business_barcode"),
        Index("ix_RetailerProduct_business_status", "retailerBusinessId", "status"),
    )


class RetailerProductVariant(Base):
    __tablename__ = "RetailerProductVariant"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerProductId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerProduct.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    sku: Mapped[str] = mapped_column(String(100))
    barcode: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    costPrice: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    sellingPrice: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    status: Mapped[VariantStatus] = mapped_column(SAEnum(VariantStatus, name="VariantStatus", create_type=False), default=VariantStatus.ACTIVE)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    product: Mapped["RetailerProduct"] = relationship("RetailerProduct", back_populates="variants")
    inventories: Mapped[List["RetailerInventory"]] = relationship("RetailerInventory", back_populates="variant")
    saleItems: Mapped[List["RetailSaleItem"]] = relationship("RetailSaleItem", back_populates="variant")
    purchaseItems: Mapped[List["RetailerPurchaseItem"]] = relationship("RetailerPurchaseItem", back_populates="variant")


class RetailerInventory(Base):
    __tablename__ = "RetailerInventory"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    productId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerProduct.id", ondelete="CASCADE"))
    variantId: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("RetailerProductVariant.id", ondelete="CASCADE"), nullable=True)
    quantityAvailable: Mapped[int] = mapped_column(Integer, default=0)
    quantityReserved: Mapped[int] = mapped_column(Integer, default=0)
    lowStockThreshold: Mapped[int] = mapped_column(Integer, default=5)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    retailerBusiness: Mapped["RetailerBusiness"] = relationship("RetailerBusiness", back_populates="inventories")
    product: Mapped["RetailerProduct"] = relationship("RetailerProduct", back_populates="inventories")
    variant: Mapped[Optional["RetailerProductVariant"]] = relationship("RetailerProductVariant", back_populates="inventories")
    transactions: Mapped[List["RetailerInventoryTransaction"]] = relationship("RetailerInventoryTransaction", back_populates="inventory", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("retailerBusinessId", "productId", "variantId", name="uq_inventory_business_product_variant"),
        Index("ix_RetailerInventory_business_qty", "retailerBusinessId", "quantityAvailable"),
    )


class RetailerInventoryTransaction(Base):
    __tablename__ = "RetailerInventoryTransaction"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    inventoryId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerInventory.id", ondelete="CASCADE"))
    type: Mapped[RetailerInventoryTransactionType] = mapped_column(SAEnum(RetailerInventoryTransactionType, name="RetailerInventoryTransactionType", create_type=False))
    quantity: Mapped[int] = mapped_column(Integer)
    previousQuantity: Mapped[int] = mapped_column(Integer)
    newQuantity: Mapped[int] = mapped_column(Integer)
    referenceType: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    referenceId: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    performedBy: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    inventory: Mapped["RetailerInventory"] = relationship("RetailerInventory", back_populates="transactions")


# ─── Sales / POS ─────────────────────────────────────────────────────────────

class RetailerCustomer(Base):
    __tablename__ = "RetailerCustomer"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(30))
    email: Mapped[Optional[str]] = mapped_column(String(254), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    creditLimit: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    openingBalance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    currentBalance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    status: Mapped[RecordStatus] = mapped_column(SAEnum(RecordStatus, name="RecordStatus", create_type=False), default=RecordStatus.ACTIVE)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    retailerBusiness: Mapped["RetailerBusiness"] = relationship("RetailerBusiness", back_populates="customers")
    sales: Mapped[List["RetailSale"]] = relationship("RetailSale", back_populates="customer")
    khataTransactions: Mapped[List["KhataTransaction"]] = relationship("KhataTransaction", back_populates="customer", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("retailerBusinessId", "phone", name="uq_customer_business_phone"),
        Index("ix_RetailerCustomer_business_status", "retailerBusinessId", "status"),
    )


class RetailSale(Base):
    __tablename__ = "RetailSale"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    invoiceNumber: Mapped[str] = mapped_column(String(50))
    customerId: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("RetailerCustomer.id", ondelete="SET NULL"), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    tax: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    grandTotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    paidAmount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    paymentStatus: Mapped[RetailerPaymentStatus] = mapped_column(SAEnum(RetailerPaymentStatus, name="RetailerPaymentStatus", create_type=False), default=RetailerPaymentStatus.PENDING)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    createdBy: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    saleDate: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    retailerBusiness: Mapped["RetailerBusiness"] = relationship("RetailerBusiness", back_populates="sales")
    customer: Mapped[Optional["RetailerCustomer"]] = relationship("RetailerCustomer", back_populates="sales")
    items: Mapped[List["RetailSaleItem"]] = relationship("RetailSaleItem", back_populates="sale", cascade="all, delete-orphan")
    payments: Mapped[List["RetailSalePayment"]] = relationship("RetailSalePayment", back_populates="sale", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("retailerBusinessId", "invoiceNumber", name="uq_sale_business_invoice"),
        Index("ix_RetailSale_business_date", "retailerBusinessId", "saleDate"),
        Index("ix_RetailSale_business_status", "retailerBusinessId", "paymentStatus"),
    )


class RetailSaleItem(Base):
    __tablename__ = "RetailSaleItem"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    saleId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailSale.id", ondelete="CASCADE"))
    productId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerProduct.id", ondelete="RESTRICT"))
    variantId: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("RetailerProductVariant.id", ondelete="SET NULL"), nullable=True)
    productNameSnapshot: Mapped[str] = mapped_column(String(300))
    skuSnapshot: Mapped[str] = mapped_column(String(100))
    quantity: Mapped[int] = mapped_column(Integer)
    unitPrice: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    costPriceSnapshot: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    tax: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    sale: Mapped["RetailSale"] = relationship("RetailSale", back_populates="items")
    product: Mapped["RetailerProduct"] = relationship("RetailerProduct", back_populates="saleItems")
    variant: Mapped[Optional["RetailerProductVariant"]] = relationship("RetailerProductVariant", back_populates="saleItems")

    __table_args__ = (
        Index("ix_RetailSaleItem_saleId", "saleId"),
        Index("ix_RetailSaleItem_productId", "productId"),
    )


class RetailSalePayment(Base):
    __tablename__ = "RetailSalePayment"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    saleId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailSale.id", ondelete="CASCADE"))
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    method: Mapped[RetailerPaymentMethod] = mapped_column(SAEnum(RetailerPaymentMethod, name="RetailerPaymentMethod", create_type=False))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    reference: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    recordedBy: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    sale: Mapped["RetailSale"] = relationship("RetailSale", back_populates="payments")


class KhataTransaction(Base):
    __tablename__ = "KhataTransaction"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    customerId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerCustomer.id", ondelete="CASCADE"))
    type: Mapped[KhataTransactionType] = mapped_column(SAEnum(KhataTransactionType, name="KhataTransactionType", create_type=False))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    balanceAfter: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    referenceType: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    referenceId: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    createdBy: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    customer: Mapped["RetailerCustomer"] = relationship("RetailerCustomer", back_populates="khataTransactions")

    __table_args__ = (
        Index("ix_KhataTransaction_business_date", "retailerBusinessId", "createdAt"),
        Index("ix_KhataTransaction_customer_date", "customerId", "createdAt"),
    )


# ─── Suppliers / Purchasing ───────────────────────────────────────────────────

class RetailerSupplier(Base):
    __tablename__ = "RetailerSupplier"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    companyName: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    phone: Mapped[str] = mapped_column(String(30))
    email: Mapped[Optional[str]] = mapped_column(String(254), nullable=True)
    panNumber: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    vatNumber: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    openingBalance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    currentBalance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    status: Mapped[RecordStatus] = mapped_column(SAEnum(RecordStatus, name="RecordStatus", create_type=False), default=RecordStatus.ACTIVE)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    retailerBusiness: Mapped["RetailerBusiness"] = relationship("RetailerBusiness", back_populates="suppliers")
    purchases: Mapped[List["RetailerPurchase"]] = relationship("RetailerPurchase", back_populates="supplier")
    supplierTransactions: Mapped[List["SupplierTransaction"]] = relationship("SupplierTransaction", back_populates="supplier", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_RetailerSupplier_business_status", "retailerBusinessId", "status"),
    )


class RetailerPurchase(Base):
    __tablename__ = "RetailerPurchase"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    supplierId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerSupplier.id", ondelete="RESTRICT"))
    purchaseNumber: Mapped[str] = mapped_column(String(50))
    status: Mapped[RetailerPurchaseStatus] = mapped_column(SAEnum(RetailerPurchaseStatus, name="RetailerPurchaseStatus", create_type=False), default=RetailerPurchaseStatus.DRAFT)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    tax: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    totalAmount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    paidAmount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    createdBy: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    orderedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    receivedAt: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    retailerBusiness: Mapped["RetailerBusiness"] = relationship("RetailerBusiness", back_populates="purchases")
    supplier: Mapped["RetailerSupplier"] = relationship("RetailerSupplier", back_populates="purchases")
    items: Mapped[List["RetailerPurchaseItem"]] = relationship("RetailerPurchaseItem", back_populates="purchase", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("retailerBusinessId", "purchaseNumber", name="uq_purchase_business_number"),
        Index("ix_RetailerPurchase_business_status", "retailerBusinessId", "status"),
    )


class RetailerPurchaseItem(Base):
    __tablename__ = "RetailerPurchaseItem"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    purchaseId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerPurchase.id", ondelete="CASCADE"))
    productId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerProduct.id", ondelete="RESTRICT"))
    variantId: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("RetailerProductVariant.id", ondelete="SET NULL"), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer)
    unitCost: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    tax: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    receivedQuantity: Mapped[int] = mapped_column(Integer, default=0)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    purchase: Mapped["RetailerPurchase"] = relationship("RetailerPurchase", back_populates="items")
    product: Mapped["RetailerProduct"] = relationship("RetailerProduct", back_populates="purchaseItems")
    variant: Mapped[Optional["RetailerProductVariant"]] = relationship("RetailerProductVariant", back_populates="purchaseItems")


class SupplierTransaction(Base):
    __tablename__ = "SupplierTransaction"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    supplierId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerSupplier.id", ondelete="CASCADE"))
    type: Mapped[SupplierTransactionType] = mapped_column(SAEnum(SupplierTransactionType, name="SupplierTransactionType", create_type=False))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    balanceAfter: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    referenceType: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    referenceId: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    createdBy: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    supplier: Mapped["RetailerSupplier"] = relationship("RetailerSupplier", back_populates="supplierTransactions")


# ─── Staff / RBAC ─────────────────────────────────────────────────────────────

class RetailerStaffInvite(Base):
    __tablename__ = "RetailerStaffInvite"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    email: Mapped[str] = mapped_column(String(254))
    role: Mapped[RetailerMembershipRole] = mapped_column(SAEnum(RetailerMembershipRole, name="RetailerMembershipRole", create_type=False))
    tokenHash: Mapped[str] = mapped_column(String, unique=True)
    status: Mapped[StaffInviteStatus] = mapped_column(SAEnum(StaffInviteStatus, name="StaffInviteStatus", create_type=False), default=StaffInviteStatus.PENDING)
    expiresAt: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    invitedBy: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    acceptedBy: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    retailerBusiness: Mapped["RetailerBusiness"] = relationship("RetailerBusiness", back_populates="staffInvites")


class RetailerAuditLog(Base):
    __tablename__ = "RetailerAuditLog"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    actorId: Mapped[Optional[str]] = mapped_column(UUID_TYPE, ForeignKey("User.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(100))
    entityType: Mapped[str] = mapped_column(String(50))
    entityId: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    before: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    after: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ipAddress: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    retailerBusiness: Mapped["RetailerBusiness"] = relationship("RetailerBusiness", back_populates="auditLogs")

    __table_args__ = (
        Index("ix_RetailerAuditLog_business_date", "retailerBusinessId", "createdAt"),
    )


class RetailerSetting(Base):
    __tablename__ = "RetailerSetting"

    id: Mapped[str] = mapped_column(UUID_TYPE, primary_key=True, default=new_uuid)
    retailerBusinessId: Mapped[str] = mapped_column(UUID_TYPE, ForeignKey("RetailerBusiness.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(100))
    value: Mapped[dict] = mapped_column(JSON)
    createdAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updatedAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    retailerBusiness: Mapped["RetailerBusiness"] = relationship("RetailerBusiness", back_populates="settings")

    __table_args__ = (
        UniqueConstraint("retailerBusinessId", "key", name="uq_setting_business_key"),
    )
