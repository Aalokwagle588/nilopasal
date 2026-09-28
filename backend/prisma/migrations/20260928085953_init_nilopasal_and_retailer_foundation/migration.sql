-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "public"."RoleCode" AS ENUM ('CUSTOMER', 'ADMIN', 'STAFF', 'VENDOR', 'VENDOR_STAFF', 'RETAILER');

-- CreateEnum
CREATE TYPE "public"."RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."VariantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."InventoryTransactionType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'RESERVATION', 'RELEASE', 'ADJUSTMENT', 'RETURN');

-- CreateEnum
CREATE TYPE "public"."CartStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."PaymentProvider" AS ENUM ('COD', 'ESEWA', 'KHALTI');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'INITIATED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "public"."DeliveryStatus" AS ENUM ('PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED');

-- CreateEnum
CREATE TYPE "public"."CouponType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_DELIVERY');

-- CreateEnum
CREATE TYPE "public"."CouponStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "public"."BannerStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "public"."NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "public"."VendorMemberRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "public"."RetailerBusinessType" AS ENUM ('RETAILER', 'RESELLER', 'MANUFACTURER', 'FARMER', 'WHOLESALER', 'DISTRIBUTOR');

-- CreateEnum
CREATE TYPE "public"."RetailerVerificationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."RetailerSubscriptionStatus" AS ENUM ('NONE', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."RetailerMembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'INVENTORY_MANAGER', 'ACCOUNTANT', 'STAFF');

-- CreateEnum
CREATE TYPE "public"."BillingPeriod" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "public"."SubscriptionPlanStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."RetailerUnit" AS ENUM ('PCS', 'BOX', 'PACK', 'KG', 'GRAM', 'LITER', 'ML', 'METER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."RetailerTaxType" AS ENUM ('NON_TAXABLE', 'TAXABLE', 'EXEMPT');

-- CreateEnum
CREATE TYPE "public"."RetailerPaymentStatus" AS ENUM ('PENDING', 'PAID', 'PARTIALLY_PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."RetailerPaymentMethod" AS ENUM ('CASH', 'BANK', 'ESEWA', 'KHALTI', 'CARD', 'CREDIT_KHATA', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."RetailerPurchaseStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "public"."KhataTransactionType" AS ENUM ('SALE_CREDIT', 'PAYMENT_RECEIVED', 'ADJUSTMENT', 'RETURN', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "public"."SupplierTransactionType" AS ENUM ('PURCHASE', 'PAYMENT', 'PURCHASE_RETURN', 'ADJUSTMENT', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "public"."StaffInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "public"."RetailerInventoryTransactionType" AS ENUM ('STOCK_IN', 'SALE', 'SALE_RETURN', 'PURCHASE', 'PURCHASE_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGED', 'EXPIRED', 'TRANSFER', 'OPENING_STOCK');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "public"."UserStatus" NOT NULL DEFAULT 'PENDING',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Role" (
    "id" UUID NOT NULL,
    "code" "public"."RoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "public"."AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Address" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,
    "area" TEXT,
    "street" TEXT NOT NULL,
    "landmark" TEXT,
    "deliveryNotes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Vendor" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VendorUser" (
    "vendorId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "role" "public"."VendorMemberRole" NOT NULL DEFAULT 'STAFF',
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorUser_pkey" PRIMARY KEY ("vendorId","userId")
);

-- CreateTable
CREATE TABLE "public"."RetailerBusiness" (
    "id" UUID NOT NULL,
    "businessName" TEXT NOT NULL,
    "legalName" TEXT,
    "slug" TEXT NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "businessType" "public"."RetailerBusinessType" NOT NULL DEFAULT 'RETAILER',
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "phone" TEXT NOT NULL,
    "alternatePhone" TEXT,
    "email" TEXT,
    "panNumber" TEXT,
    "vatNumber" TEXT,
    "province" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,
    "ward" TEXT,
    "addressLine" TEXT NOT NULL,
    "landmark" TEXT,
    "logo" TEXT,
    "coverImage" TEXT,
    "verificationStatus" "public"."RetailerVerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "verificationSubmittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" UUID,
    "subscriptionStatus" "public"."RetailerSubscriptionStatus" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerMembership" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "public"."RetailerMembershipRole" NOT NULL,
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SubscriptionPlan" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "billingPeriod" "public"."BillingPeriod" NOT NULL,
    "status" "public"."SubscriptionPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "features" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerSubscription" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "public"."RetailerSubscriptionStatus" NOT NULL,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "trialStartsAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerCategory" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerProduct" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "categoryId" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "description" TEXT,
    "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mrp" DECIMAL(12,2),
    "unit" "public"."RetailerUnit" NOT NULL DEFAULT 'PCS',
    "customUnit" TEXT,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxType" "public"."RetailerTaxType" NOT NULL DEFAULT 'NON_TAXABLE',
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "status" "public"."ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerProductVariant" (
    "id" UUID NOT NULL,
    "retailerProductId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "public"."VariantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerInventory" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "quantityAvailable" INTEGER NOT NULL DEFAULT 0,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerInventoryTransaction" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "inventoryId" UUID NOT NULL,
    "type" "public"."RetailerInventoryTransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousQuantity" INTEGER NOT NULL,
    "newQuantity" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reason" TEXT,
    "performedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailerInventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailSale" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "customerId" UUID,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentStatus" "public"."RetailerPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdBy" UUID,
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailSaleItem" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "productNameSnapshot" TEXT NOT NULL,
    "skuSnapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "costPriceSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailSalePayment" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "method" "public"."RetailerPaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "recordedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailSalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerCustomer" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "creditLimit" DECIMAL(12,2),
    "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."KhataTransaction" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "type" "public"."KhataTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KhataTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerSupplier" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "panNumber" TEXT,
    "vatNumber" TEXT,
    "address" TEXT,
    "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerPurchase" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "purchaseNumber" TEXT NOT NULL,
    "status" "public"."RetailerPurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdBy" UUID,
    "orderedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerPurchaseItem" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailerPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SupplierTransaction" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "type" "public"."SupplierTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerStaffInvite" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "public"."RetailerMembershipRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedBy" UUID,
    "status" "public"."StaffInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailerStaffInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerAuditLog" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailerAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetailerSetting" (
    "id" UUID NOT NULL,
    "retailerBusinessId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Category" (
    "id" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Brand" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "description" TEXT,
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "brandId" UUID,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "compareAtPrice" DECIMAL(12,2),
    "status" "public"."ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "isNewArrival" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductImage" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "url" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductVariant" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT,
    "priceOverride" DECIMAL(12,2),
    "compareAtPrice" DECIMAL(12,2),
    "image" TEXT,
    "status" "public"."VariantStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Attribute" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductAttribute" (
    "productId" UUID NOT NULL,
    "attributeId" UUID NOT NULL,

    CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("productId","attributeId")
);

-- CreateTable
CREATE TABLE "public"."AttributeValue" (
    "id" UUID NOT NULL,
    "attributeId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VariantAttributeValue" (
    "variantId" UUID NOT NULL,
    "attributeValueId" UUID NOT NULL,

    CONSTRAINT "VariantAttributeValue_pkey" PRIMARY KEY ("variantId","attributeValueId")
);

-- CreateTable
CREATE TABLE "public"."Inventory" (
    "id" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "availableQuantity" INTEGER NOT NULL DEFAULT 0,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InventoryTransaction" (
    "id" UUID NOT NULL,
    "inventoryId" UUID NOT NULL,
    "type" "public"."InventoryTransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "note" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Cart" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "guestTokenHash" TEXT,
    "status" "public"."CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CartItem" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Wishlist" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WishlistItem" (
    "id" UUID NOT NULL,
    "wishlistId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Order" (
    "id" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "parentOrderId" UUID,
    "vendorId" UUID,
    "customerId" UUID,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deliveryCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NPR',
    "customerNameSnapshot" TEXT NOT NULL,
    "phoneSnapshot" TEXT NOT NULL,
    "emailSnapshot" TEXT,
    "shippingAddressSnapshot" JSONB NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "vendorId" UUID NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "skuSnapshot" TEXT NOT NULL,
    "variantSnapshot" JSONB,
    "imageSnapshot" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "commissionRateSnapshot" DECIMAL(5,2),
    "commissionAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrderStatusHistory" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "public"."OrderStatus",
    "toStatus" "public"."OrderStatus" NOT NULL,
    "note" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "provider" "public"."PaymentProvider" NOT NULL,
    "transactionId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'NPR',
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "requestReference" TEXT,
    "providerResponse" JSONB,
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeliveryZone" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeliveryRate" (
    "id" UUID NOT NULL,
    "zoneId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "charge" DECIMAL(12,2) NOT NULL,
    "freeDeliveryThreshold" DECIMAL(12,2),
    "estimatedMinDays" INTEGER,
    "estimatedMaxDays" INTEGER,
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Delivery" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "zoneId" UUID,
    "provider" TEXT,
    "trackingNumber" TEXT,
    "status" "public"."DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "shippingCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippedAt" TIMESTAMP(3),
    "estimatedDelivery" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeliveryStatusHistory" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "fromStatus" "public"."DeliveryStatus",
    "toStatus" "public"."DeliveryStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Coupon" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" "public"."CouponType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "minimumOrder" DECIMAL(12,2),
    "maximumDiscount" DECIMAL(12,2),
    "usageLimit" INTEGER,
    "usageLimitPerCustomer" INTEGER,
    "startAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" "public"."CouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CouponUsage" (
    "id" UUID NOT NULL,
    "couponId" UUID NOT NULL,
    "userId" UUID,
    "orderId" UUID NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Review" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "orderItemId" UUID,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "status" "public"."ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Banner" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "image" TEXT NOT NULL,
    "mobileImage" TEXT,
    "ctaText" TEXT,
    "ctaUrl" TEXT,
    "position" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."BannerStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "channel" "public"."NotificationChannel" NOT NULL,
    "status" "public"."NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StoreSetting" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailNormalized_key" ON "public"."User"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "public"."User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNormalized_key" ON "public"."User"("phoneNormalized");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "public"."User"("status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "public"."User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "public"."Role"("code");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "public"."UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "public"."AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "public"."AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "public"."AuthSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "public"."PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "public"."PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "public"."PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Address_userId_isDefault_idx" ON "public"."Address"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "Address_province_district_idx" ON "public"."Address"("province", "district");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_slug_key" ON "public"."Vendor"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_code_key" ON "public"."Vendor"("code");

-- CreateIndex
CREATE INDEX "Vendor_status_idx" ON "public"."Vendor"("status");

-- CreateIndex
CREATE INDEX "VendorUser_userId_idx" ON "public"."VendorUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerBusiness_slug_key" ON "public"."RetailerBusiness"("slug");

-- CreateIndex
CREATE INDEX "RetailerBusiness_ownerUserId_idx" ON "public"."RetailerBusiness"("ownerUserId");

-- CreateIndex
CREATE INDEX "RetailerBusiness_status_verificationStatus_subscriptionStat_idx" ON "public"."RetailerBusiness"("status", "verificationStatus", "subscriptionStatus");

-- CreateIndex
CREATE INDEX "RetailerBusiness_businessType_idx" ON "public"."RetailerBusiness"("businessType");

-- CreateIndex
CREATE INDEX "RetailerMembership_userId_status_idx" ON "public"."RetailerMembership"("userId", "status");

-- CreateIndex
CREATE INDEX "RetailerMembership_retailerBusinessId_role_idx" ON "public"."RetailerMembership"("retailerBusinessId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerMembership_retailerBusinessId_userId_key" ON "public"."RetailerMembership"("retailerBusinessId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "public"."SubscriptionPlan"("slug");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_status_billingPeriod_idx" ON "public"."SubscriptionPlan"("status", "billingPeriod");

-- CreateIndex
CREATE INDEX "RetailerSubscription_retailerBusinessId_status_idx" ON "public"."RetailerSubscription"("retailerBusinessId", "status");

-- CreateIndex
CREATE INDEX "RetailerSubscription_planId_idx" ON "public"."RetailerSubscription"("planId");

-- CreateIndex
CREATE INDEX "RetailerSubscription_expiresAt_idx" ON "public"."RetailerSubscription"("expiresAt");

-- CreateIndex
CREATE INDEX "RetailerCategory_retailerBusinessId_status_idx" ON "public"."RetailerCategory"("retailerBusinessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerCategory_retailerBusinessId_slug_key" ON "public"."RetailerCategory"("retailerBusinessId", "slug");

-- CreateIndex
CREATE INDEX "RetailerProduct_retailerBusinessId_status_idx" ON "public"."RetailerProduct"("retailerBusinessId", "status");

-- CreateIndex
CREATE INDEX "RetailerProduct_retailerBusinessId_categoryId_idx" ON "public"."RetailerProduct"("retailerBusinessId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerProduct_retailerBusinessId_sku_key" ON "public"."RetailerProduct"("retailerBusinessId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerProduct_retailerBusinessId_barcode_key" ON "public"."RetailerProduct"("retailerBusinessId", "barcode");

-- CreateIndex
CREATE INDEX "RetailerProductVariant_retailerProductId_status_idx" ON "public"."RetailerProductVariant"("retailerProductId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerProductVariant_retailerProductId_sku_key" ON "public"."RetailerProductVariant"("retailerProductId", "sku");

-- CreateIndex
CREATE INDEX "RetailerInventory_retailerBusinessId_quantityAvailable_idx" ON "public"."RetailerInventory"("retailerBusinessId", "quantityAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerInventory_retailerBusinessId_productId_variantId_key" ON "public"."RetailerInventory"("retailerBusinessId", "productId", "variantId");

-- CreateIndex
CREATE INDEX "RetailerInventoryTransaction_retailerBusinessId_createdAt_idx" ON "public"."RetailerInventoryTransaction"("retailerBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailerInventoryTransaction_inventoryId_createdAt_idx" ON "public"."RetailerInventoryTransaction"("inventoryId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailSale_retailerBusinessId_saleDate_idx" ON "public"."RetailSale"("retailerBusinessId", "saleDate");

-- CreateIndex
CREATE INDEX "RetailSale_retailerBusinessId_paymentStatus_idx" ON "public"."RetailSale"("retailerBusinessId", "paymentStatus");

-- CreateIndex
CREATE INDEX "RetailSale_customerId_idx" ON "public"."RetailSale"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailSale_retailerBusinessId_invoiceNumber_key" ON "public"."RetailSale"("retailerBusinessId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "RetailSaleItem_saleId_idx" ON "public"."RetailSaleItem"("saleId");

-- CreateIndex
CREATE INDEX "RetailSaleItem_productId_idx" ON "public"."RetailSaleItem"("productId");

-- CreateIndex
CREATE INDEX "RetailSalePayment_retailerBusinessId_createdAt_idx" ON "public"."RetailSalePayment"("retailerBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailSalePayment_saleId_idx" ON "public"."RetailSalePayment"("saleId");

-- CreateIndex
CREATE INDEX "RetailerCustomer_retailerBusinessId_status_idx" ON "public"."RetailerCustomer"("retailerBusinessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerCustomer_retailerBusinessId_phone_key" ON "public"."RetailerCustomer"("retailerBusinessId", "phone");

-- CreateIndex
CREATE INDEX "KhataTransaction_retailerBusinessId_createdAt_idx" ON "public"."KhataTransaction"("retailerBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "KhataTransaction_customerId_createdAt_idx" ON "public"."KhataTransaction"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailerSupplier_retailerBusinessId_status_idx" ON "public"."RetailerSupplier"("retailerBusinessId", "status");

-- CreateIndex
CREATE INDEX "RetailerPurchase_retailerBusinessId_status_idx" ON "public"."RetailerPurchase"("retailerBusinessId", "status");

-- CreateIndex
CREATE INDEX "RetailerPurchase_supplierId_idx" ON "public"."RetailerPurchase"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerPurchase_retailerBusinessId_purchaseNumber_key" ON "public"."RetailerPurchase"("retailerBusinessId", "purchaseNumber");

-- CreateIndex
CREATE INDEX "RetailerPurchaseItem_purchaseId_idx" ON "public"."RetailerPurchaseItem"("purchaseId");

-- CreateIndex
CREATE INDEX "RetailerPurchaseItem_productId_idx" ON "public"."RetailerPurchaseItem"("productId");

-- CreateIndex
CREATE INDEX "SupplierTransaction_retailerBusinessId_createdAt_idx" ON "public"."SupplierTransaction"("retailerBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierTransaction_supplierId_createdAt_idx" ON "public"."SupplierTransaction"("supplierId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerStaffInvite_tokenHash_key" ON "public"."RetailerStaffInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "RetailerStaffInvite_retailerBusinessId_status_idx" ON "public"."RetailerStaffInvite"("retailerBusinessId", "status");

-- CreateIndex
CREATE INDEX "RetailerStaffInvite_email_idx" ON "public"."RetailerStaffInvite"("email");

-- CreateIndex
CREATE INDEX "RetailerAuditLog_retailerBusinessId_createdAt_idx" ON "public"."RetailerAuditLog"("retailerBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailerAuditLog_actorId_createdAt_idx" ON "public"."RetailerAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailerAuditLog_entityType_entityId_idx" ON "public"."RetailerAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "RetailerSetting_retailerBusinessId_idx" ON "public"."RetailerSetting"("retailerBusinessId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerSetting_retailerBusinessId_key_key" ON "public"."RetailerSetting"("retailerBusinessId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "public"."Category"("slug");

-- CreateIndex
CREATE INDEX "Category_parentId_sortOrder_idx" ON "public"."Category"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "Category_status_sortOrder_idx" ON "public"."Category"("status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "public"."Brand"("slug");

-- CreateIndex
CREATE INDEX "Brand_status_name_idx" ON "public"."Brand"("status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "public"."Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "public"."Product"("sku");

-- CreateIndex
CREATE INDEX "Product_vendorId_status_idx" ON "public"."Product"("vendorId", "status");

-- CreateIndex
CREATE INDEX "Product_categoryId_status_idx" ON "public"."Product"("categoryId", "status");

-- CreateIndex
CREATE INDEX "Product_brandId_status_idx" ON "public"."Product"("brandId", "status");

-- CreateIndex
CREATE INDEX "Product_featured_status_idx" ON "public"."Product"("featured", "status");

-- CreateIndex
CREATE INDEX "Product_createdAt_idx" ON "public"."Product"("createdAt");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "public"."Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_vendorId_key" ON "public"."Product"("id", "vendorId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_sortOrder_idx" ON "public"."ProductImage"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductImage_variantId_idx" ON "public"."ProductImage"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "public"."ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_status_idx" ON "public"."ProductVariant"("productId", "status");

-- CreateIndex
CREATE INDEX "ProductVariant_vendorId_status_idx" ON "public"."ProductVariant"("vendorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_id_vendorId_key" ON "public"."ProductVariant"("id", "vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Attribute_slug_key" ON "public"."Attribute"("slug");

-- CreateIndex
CREATE INDEX "ProductAttribute_attributeId_idx" ON "public"."ProductAttribute"("attributeId");

-- CreateIndex
CREATE INDEX "AttributeValue_attributeId_sortOrder_idx" ON "public"."AttributeValue"("attributeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeValue_attributeId_slug_key" ON "public"."AttributeValue"("attributeId", "slug");

-- CreateIndex
CREATE INDEX "VariantAttributeValue_attributeValueId_idx" ON "public"."VariantAttributeValue"("attributeValueId");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_variantId_key" ON "public"."Inventory"("variantId");

-- CreateIndex
CREATE INDEX "Inventory_vendorId_availableQuantity_idx" ON "public"."Inventory"("vendorId", "availableQuantity");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_vendorId_variantId_key" ON "public"."Inventory"("vendorId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_variantId_vendorId_key" ON "public"."Inventory"("variantId", "vendorId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_inventoryId_createdAt_idx" ON "public"."InventoryTransaction"("inventoryId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_referenceType_referenceId_idx" ON "public"."InventoryTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_guestTokenHash_key" ON "public"."Cart"("guestTokenHash");

-- CreateIndex
CREATE INDEX "Cart_userId_status_idx" ON "public"."Cart"("userId", "status");

-- CreateIndex
CREATE INDEX "Cart_expiresAt_idx" ON "public"."Cart"("expiresAt");

-- CreateIndex
CREATE INDEX "CartItem_cartId_idx" ON "public"."CartItem"("cartId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_productId_variantId_key" ON "public"."CartItem"("cartId", "productId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_userId_key" ON "public"."Wishlist"("userId");

-- CreateIndex
CREATE INDEX "WishlistItem_wishlistId_createdAt_idx" ON "public"."WishlistItem"("wishlistId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_wishlistId_productId_variantId_key" ON "public"."WishlistItem"("wishlistId", "productId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "public"."Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "public"."Order"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_vendorId_status_createdAt_idx" ON "public"."Order"("vendorId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_parentOrderId_idx" ON "public"."Order"("parentOrderId");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "public"."Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_createdAt_idx" ON "public"."Order"("paymentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "public"."OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_vendorId_createdAt_idx" ON "public"."OrderItem"("vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "public"."OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "public"."OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "public"."Payment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_requestReference_key" ON "public"."Payment"("requestReference");

-- CreateIndex
CREATE INDEX "Payment_orderId_createdAt_idx" ON "public"."Payment"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_provider_status_createdAt_idx" ON "public"."Payment"("provider", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryZone_code_key" ON "public"."DeliveryZone"("code");

-- CreateIndex
CREATE INDEX "DeliveryRate_zoneId_status_idx" ON "public"."DeliveryRate"("zoneId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_orderId_key" ON "public"."Delivery"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_trackingNumber_key" ON "public"."Delivery"("trackingNumber");

-- CreateIndex
CREATE INDEX "Delivery_status_createdAt_idx" ON "public"."Delivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryStatusHistory_deliveryId_createdAt_idx" ON "public"."DeliveryStatusHistory"("deliveryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "public"."Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_status_startAt_expiresAt_idx" ON "public"."Coupon"("status", "startAt", "expiresAt");

-- CreateIndex
CREATE INDEX "CouponUsage_userId_couponId_idx" ON "public"."CouponUsage"("userId", "couponId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponUsage_couponId_orderId_key" ON "public"."CouponUsage"("couponId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderItemId_key" ON "public"."Review"("orderItemId");

-- CreateIndex
CREATE INDEX "Review_productId_status_createdAt_idx" ON "public"."Review"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Review_customerId_createdAt_idx" ON "public"."Review"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Banner_position_status_sortOrder_idx" ON "public"."Banner"("position", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "Notification_status_createdAt_idx" ON "public"."Notification"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "public"."Notification"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSetting_key_key" ON "public"."StoreSetting"("key");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "public"."AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "public"."AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "public"."AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VendorUser" ADD CONSTRAINT "VendorUser_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VendorUser" ADD CONSTRAINT "VendorUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerBusiness" ADD CONSTRAINT "RetailerBusiness_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerBusiness" ADD CONSTRAINT "RetailerBusiness_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerMembership" ADD CONSTRAINT "RetailerMembership_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerMembership" ADD CONSTRAINT "RetailerMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerSubscription" ADD CONSTRAINT "RetailerSubscription_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerSubscription" ADD CONSTRAINT "RetailerSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerCategory" ADD CONSTRAINT "RetailerCategory_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerProduct" ADD CONSTRAINT "RetailerProduct_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerProduct" ADD CONSTRAINT "RetailerProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."RetailerCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerProductVariant" ADD CONSTRAINT "RetailerProductVariant_retailerProductId_fkey" FOREIGN KEY ("retailerProductId") REFERENCES "public"."RetailerProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerInventory" ADD CONSTRAINT "RetailerInventory_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerInventory" ADD CONSTRAINT "RetailerInventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."RetailerProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerInventory" ADD CONSTRAINT "RetailerInventory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."RetailerProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerInventoryTransaction" ADD CONSTRAINT "RetailerInventoryTransaction_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerInventoryTransaction" ADD CONSTRAINT "RetailerInventoryTransaction_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "public"."RetailerInventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerInventoryTransaction" ADD CONSTRAINT "RetailerInventoryTransaction_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailSale" ADD CONSTRAINT "RetailSale_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailSale" ADD CONSTRAINT "RetailSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."RetailerCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailSale" ADD CONSTRAINT "RetailSale_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailSaleItem" ADD CONSTRAINT "RetailSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."RetailSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailSaleItem" ADD CONSTRAINT "RetailSaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."RetailerProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailSaleItem" ADD CONSTRAINT "RetailSaleItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."RetailerProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailSalePayment" ADD CONSTRAINT "RetailSalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "public"."RetailSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailSalePayment" ADD CONSTRAINT "RetailSalePayment_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailSalePayment" ADD CONSTRAINT "RetailSalePayment_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerCustomer" ADD CONSTRAINT "RetailerCustomer_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KhataTransaction" ADD CONSTRAINT "KhataTransaction_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KhataTransaction" ADD CONSTRAINT "KhataTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."RetailerCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KhataTransaction" ADD CONSTRAINT "KhataTransaction_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerSupplier" ADD CONSTRAINT "RetailerSupplier_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerPurchase" ADD CONSTRAINT "RetailerPurchase_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerPurchase" ADD CONSTRAINT "RetailerPurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."RetailerSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerPurchase" ADD CONSTRAINT "RetailerPurchase_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerPurchaseItem" ADD CONSTRAINT "RetailerPurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "public"."RetailerPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerPurchaseItem" ADD CONSTRAINT "RetailerPurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."RetailerProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerPurchaseItem" ADD CONSTRAINT "RetailerPurchaseItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."RetailerProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierTransaction" ADD CONSTRAINT "SupplierTransaction_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierTransaction" ADD CONSTRAINT "SupplierTransaction_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."RetailerSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SupplierTransaction" ADD CONSTRAINT "SupplierTransaction_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerStaffInvite" ADD CONSTRAINT "RetailerStaffInvite_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerStaffInvite" ADD CONSTRAINT "RetailerStaffInvite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerAuditLog" ADD CONSTRAINT "RetailerAuditLog_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerAuditLog" ADD CONSTRAINT "RetailerAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RetailerSetting" ADD CONSTRAINT "RetailerSetting_retailerBusinessId_fkey" FOREIGN KEY ("retailerBusinessId") REFERENCES "public"."RetailerBusiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "public"."Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductImage" ADD CONSTRAINT "ProductImage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductVariant" ADD CONSTRAINT "ProductVariant_productId_vendorId_fkey" FOREIGN KEY ("productId", "vendorId") REFERENCES "public"."Product"("id", "vendorId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductAttribute" ADD CONSTRAINT "ProductAttribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductAttribute" ADD CONSTRAINT "ProductAttribute_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "public"."Attribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AttributeValue" ADD CONSTRAINT "AttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "public"."Attribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_attributeValueId_fkey" FOREIGN KEY ("attributeValueId") REFERENCES "public"."AttributeValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Inventory" ADD CONSTRAINT "Inventory_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Inventory" ADD CONSTRAINT "Inventory_variantId_vendorId_fkey" FOREIGN KEY ("variantId", "vendorId") REFERENCES "public"."ProductVariant"("id", "vendorId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "public"."Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "public"."Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Wishlist" ADD CONSTRAINT "Wishlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WishlistItem" ADD CONSTRAINT "WishlistItem_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "public"."Wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WishlistItem" ADD CONSTRAINT "WishlistItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_parentOrderId_fkey" FOREIGN KEY ("parentOrderId") REFERENCES "public"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderItem" ADD CONSTRAINT "OrderItem_productId_vendorId_fkey" FOREIGN KEY ("productId", "vendorId") REFERENCES "public"."Product"("id", "vendorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderItem" ADD CONSTRAINT "OrderItem_variantId_vendorId_fkey" FOREIGN KEY ("variantId", "vendorId") REFERENCES "public"."ProductVariant"("id", "vendorId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderItem" ADD CONSTRAINT "OrderItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "public"."Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeliveryRate" ADD CONSTRAINT "DeliveryRate_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "public"."DeliveryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Delivery" ADD CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Delivery" ADD CONSTRAINT "Delivery_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "public"."DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeliveryStatusHistory" ADD CONSTRAINT "DeliveryStatusHistory_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "public"."Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CouponUsage" ADD CONSTRAINT "CouponUsage_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "public"."Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CouponUsage" ADD CONSTRAINT "CouponUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CouponUsage" ADD CONSTRAINT "CouponUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "public"."OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
