import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.config import settings
from app.errors import AppError
from app.utils.response import success
from app.utils.security import (
    hash_password, new_session_token, hash_session_token,
    normalize_email, normalize_phone, clean_optional, slugify, generate_sku
)
from app.models import (
    User, Role, UserRole, AuthSession, Cart, Wishlist,
    RetailerBusiness, RetailerMembership, RetailerSubscription, SubscriptionPlan,
    RecordStatus, RoleCode, UserStatus, CartStatus,
    RetailerVerificationStatus, RetailerSubscriptionStatus, RetailerMembershipRole,
    RetailerBusinessType
)
from app.middleware.auth import get_current_user, get_current_user_optional, get_retailer_access

router = APIRouter(prefix="/api/retailer", tags=["retailer"])

MS_PER_DAY = 24 * 60 * 60


def is_subscription_usable(status: RetailerSubscriptionStatus, expires_at=None, trial_ends_at=None) -> bool:
    now = datetime.now(timezone.utc)
    if status == RetailerSubscriptionStatus.ACTIVE:
        return not expires_at or (expires_at.replace(tzinfo=timezone.utc) if expires_at.tzinfo is None else expires_at) > now
    if status == RetailerSubscriptionStatus.TRIAL:
        return not trial_ends_at or (trial_ends_at.replace(tzinfo=timezone.utc) if trial_ends_at.tzinfo is None else trial_ends_at) > now
    return False


def business_code(business_name: str, owner_user_id: str) -> str:
    import time
    slug = slugify(business_name) or "retailer"
    digest = hashlib.sha1(f"{business_name}:{owner_user_id}:{int(time.time()*1000)}".encode()).hexdigest()[:8]
    return f"{slug}-{digest}"[:100]


# ── Schemas ────────────────────────────────────────────────────────────────────

class OwnerInfo(BaseModel):
    firstName: str = Field(..., min_length=1, max_length=80)
    lastName: str = Field(..., min_length=1, max_length=80)
    email: EmailStr
    phone: Optional[str] = None
    password: str = Field(..., min_length=8, max_length=128)


class BusinessInfo(BaseModel):
    businessName: str = Field(..., min_length=1, max_length=200)
    legalName: Optional[str] = None
    businessType: Optional[RetailerBusinessType] = RetailerBusinessType.RETAILER
    contactNumber: str = Field(..., min_length=7, max_length=30)
    alternatePhone: Optional[str] = None
    email: Optional[str] = None
    panNumber: Optional[str] = None
    vatNumber: Optional[str] = None
    province: str = Field(..., min_length=1)
    district: str = Field(..., min_length=1)
    municipality: str = Field(..., min_length=1)
    ward: Optional[str] = None
    addressLine: str = Field(..., min_length=1)
    landmark: Optional[str] = None


class RetailerRegisterBody(BaseModel):
    owner: Optional[OwnerInfo] = None
    business: BusinessInfo


class UpdateBusinessBody(BaseModel):
    businessName: Optional[str] = None
    legalName: Optional[str] = None
    panNumber: Optional[str] = None
    vatNumber: Optional[str] = None
    province: Optional[str] = None
    district: Optional[str] = None
    municipality: Optional[str] = None
    ward: Optional[str] = None
    addressLine: Optional[str] = None
    landmark: Optional[str] = None
    phone: Optional[str] = None
    alternatePhone: Optional[str] = None
    email: Optional[str] = None
    logo: Optional[str] = None
    coverImage: Optional[str] = None


class StartTrialBody(BaseModel):
    planSlug: str = "retailer-starter-trial"


# ── Helpers ───────────────────────────────────────────────────────────────────

async def ensure_role(db: AsyncSession, code: RoleCode) -> Role:
    result = await db.execute(select(Role).where(Role.code == code))
    role = result.scalar_one_or_none()
    if not role:
        role = Role(code=code, name=code.value.lower().replace("_", " "))
        db.add(role)
        await db.flush()
    return role


async def build_business_summary(db: AsyncSession, business: RetailerBusiness) -> dict:
    result = await db.execute(
        select(RetailerSubscription, SubscriptionPlan)
        .join(SubscriptionPlan, RetailerSubscription.planId == SubscriptionPlan.id)
        .where(RetailerSubscription.retailerBusinessId == business.id)
        .order_by(RetailerSubscription.createdAt.desc())
    )
    subs = result.all()

    active_sub = None
    for sub, plan in subs:
        if is_subscription_usable(sub.status, sub.expiresAt, sub.trialEndsAt):
            active_sub = (sub, plan)
            break
    if active_sub is None and subs:
        active_sub = subs[0]

    result2 = await db.execute(
        select(RetailerMembership).where(RetailerMembership.retailerBusinessId == business.id)
    )
    memberships = result2.scalars().all()

    return {
        "id": business.id,
        "businessName": business.businessName,
        "legalName": business.legalName,
        "slug": business.slug,
        "businessType": business.businessType,
        "status": business.status,
        "phone": business.phone,
        "alternatePhone": business.alternatePhone,
        "email": business.email,
        "panNumber": business.panNumber,
        "vatNumber": business.vatNumber,
        "province": business.province,
        "district": business.district,
        "municipality": business.municipality,
        "ward": business.ward,
        "addressLine": business.addressLine,
        "landmark": business.landmark,
        "logo": business.logo,
        "coverImage": business.coverImage,
        "verificationStatus": business.verificationStatus,
        "verificationSubmittedAt": business.verificationSubmittedAt.isoformat() if business.verificationSubmittedAt else None,
        "verifiedAt": business.verifiedAt.isoformat() if business.verifiedAt else None,
        "subscriptionStatus": business.subscriptionStatus,
        "createdAt": business.createdAt.isoformat(),
        "memberships": [{"id": m.id, "userId": m.userId, "role": m.role, "status": m.status} for m in memberships],
        "activeSubscription": {
            "id": active_sub[0].id,
            "status": active_sub[0].status,
            "startsAt": active_sub[0].startsAt.isoformat() if active_sub[0].startsAt else None,
            "expiresAt": active_sub[0].expiresAt.isoformat() if active_sub[0].expiresAt else None,
            "trialStartsAt": active_sub[0].trialStartsAt.isoformat() if active_sub[0].trialStartsAt else None,
            "trialEndsAt": active_sub[0].trialEndsAt.isoformat() if active_sub[0].trialEndsAt else None,
            "plan": {
                "id": active_sub[1].id,
                "name": active_sub[1].name,
                "slug": active_sub[1].slug,
                "billingPeriod": active_sub[1].billingPeriod,
                "price": str(active_sub[1].price),
            },
        } if active_sub else None,
    }


async def get_retailer_context_dict(db: AsyncSession, user_id: str) -> dict:
    result = await db.execute(
        select(RetailerMembership)
        .where(
            RetailerMembership.userId == user_id,
            RetailerMembership.status == RecordStatus.ACTIVE,
        )
        .order_by(RetailerMembership.joinedAt)
        .limit(1)
    )
    membership = result.scalar_one_or_none()

    if not membership:
        return {
            "membership": None,
            "business": None,
            "access": {
                "allowed": False,
                "reason": "NO_RETAILER",
                "nextAction": "REGISTER",
                "message": "No retailer business is connected to this account.",
            },
        }

    result2 = await db.execute(
        select(RetailerBusiness).where(RetailerBusiness.id == membership.retailerBusinessId)
    )
    business = result2.scalar_one_or_none()
    if not business:
        return {
            "membership": None,
            "business": None,
            "access": {
                "allowed": False,
                "reason": "NO_RETAILER",
                "nextAction": "REGISTER",
                "message": "No retailer business is connected to this account.",
            },
        }

    business_data = await build_business_summary(db, business)

    membership_data = {
        "id": membership.id,
        "userId": membership.userId,
        "retailerBusinessId": membership.retailerBusinessId,
        "role": membership.role,
        "status": membership.status,
        "joinedAt": membership.joinedAt.isoformat(),
    }

    # Determine access state
    if business.status != RecordStatus.ACTIVE or business.verificationStatus == RetailerVerificationStatus.SUSPENDED:
        return {
            "membership": membership_data,
            "business": business_data,
            "access": {
                "allowed": False,
                "reason": "SUSPENDED",
                "nextAction": "CONTACT_SUPPORT",
                "message": "Your retailer business has been suspended. Please contact Nilopasal support.",
            },
        }

    if business.verificationStatus == RetailerVerificationStatus.REJECTED:
        return {
            "membership": membership_data,
            "business": business_data,
            "access": {
                "allowed": False,
                "reason": "REJECTED",
                "nextAction": "CONTACT_SUPPORT",
                "message": "Your retailer verification application was rejected.",
            },
        }

    if business.verificationStatus != RetailerVerificationStatus.VERIFIED:
        return {
            "membership": membership_data,
            "business": business_data,
            "access": {
                "allowed": False,
                "reason": "VERIFICATION_REQUIRED",
                "nextAction": "VERIFICATION",
                "message": "Store verification is under review by Nilopasal administrators.",
            },
        }

    active_sub = business_data.get("activeSubscription")
    sub_usable = False
    if active_sub:
        from app.models import RetailerSubscriptionStatus as RSS
        sub_status = RSS(active_sub["status"])
        from datetime import datetime
        expires = datetime.fromisoformat(active_sub["expiresAt"]) if active_sub.get("expiresAt") else None
        trial_ends = datetime.fromisoformat(active_sub["trialEndsAt"]) if active_sub.get("trialEndsAt") else None
        sub_usable = is_subscription_usable(sub_status, expires, trial_ends)

    if not sub_usable:
        return {
            "membership": membership_data,
            "business": business_data,
            "access": {
                "allowed": False,
                "reason": "SUBSCRIPTION_REQUIRED",
                "nextAction": "SUBSCRIPTION",
                "message": "Choose a subscription plan or activate your 14-day trial to unlock ERP tools.",
            },
        }

    return {
        "membership": membership_data,
        "business": business_data,
        "access": {
            "allowed": True,
            "reason": "READY",
            "nextAction": "DASHBOARD",
            "message": "Retailer ERP is active and operational data is connected.",
        },
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/register", status_code=201)
async def register_retailer(
    body: RetailerRegisterBody,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    auth=Depends(get_current_user_optional),
):
    current_user, session_id = auth
    now = datetime.now(timezone.utc)
    session_token = None

    if current_user:
        # Already logged in — link business to existing account
        result = await db.execute(select(User).where(User.id == current_user["id"]))
        owner_user = result.scalar_one_or_none()
        if not owner_user:
            raise AppError(401, "AUTH_REQUIRED", "Please sign in to register a retailer business")
    else:
        if not body.owner:
            raise AppError(400, "OWNER_INFO_REQUIRED", "Owner details are required when registering a new account")

        # Create new user
        email_norm = normalize_email(body.owner.email)
        phone_norm = normalize_phone(body.owner.phone)

        # Check existing
        query = select(User).where(User.emailNormalized == email_norm)
        result = await db.execute(query)
        existing = result.scalar_one_or_none()
        if existing:
            raise AppError(409, "ACCOUNT_EXISTS", "An account with this email or phone already exists. Please sign in first, then create the retailer business.")

        customer_role = await ensure_role(db, RoleCode.CUSTOMER)
        retailer_role = await ensure_role(db, RoleCode.RETAILER)

        owner_user = User(
            firstName=body.owner.firstName.strip(),
            lastName=body.owner.lastName.strip(),
            email=body.owner.email.strip(),
            emailNormalized=email_norm,
            phone=phone_norm,
            phoneNormalized=phone_norm,
            passwordHash=hash_password(body.owner.password),
            status=UserStatus.ACTIVE,
        )
        db.add(owner_user)
        await db.flush()
        db.add(UserRole(userId=owner_user.id, roleId=customer_role.id))
        db.add(UserRole(userId=owner_user.id, roleId=retailer_role.id))
        db.add(Wishlist(userId=owner_user.id))
        db.add(Cart(userId=owner_user.id, status=CartStatus.ACTIVE))
        await db.flush()

        # Create session for new user
        raw_token = new_session_token()
        expires_at = now + timedelta(days=settings.SESSION_TTL_DAYS)
        db.add(AuthSession(
            userId=owner_user.id,
            tokenHash=hash_session_token(raw_token),
            userAgent=request.headers.get("user-agent"),
            ipAddress=request.client.host if request.client else None,
            expiresAt=expires_at,
        ))
        session_token = raw_token

    # Check existing retailer business
    result = await db.execute(
        select(RetailerBusiness).where(
            RetailerBusiness.ownerUserId == owner_user.id,
            RetailerBusiness.status != RecordStatus.ARCHIVED,
        )
    )
    existing_biz = result.scalar_one_or_none()
    if existing_biz:
        raise AppError(409, "RETAILER_EXISTS", "This account already owns a registered retailer business")

    # Attach RETAILER role if not present
    retailer_role = await ensure_role(db, RoleCode.RETAILER)
    result = await db.execute(
        select(UserRole).where(UserRole.userId == owner_user.id, UserRole.roleId == retailer_role.id)
    )
    if not result.scalar_one_or_none():
        db.add(UserRole(userId=owner_user.id, roleId=retailer_role.id))

    slug = business_code(body.business.businessName, owner_user.id)
    business = RetailerBusiness(
        businessName=body.business.businessName.strip(),
        legalName=clean_optional(body.business.legalName),
        slug=slug,
        ownerUserId=owner_user.id,
        businessType=body.business.businessType or RetailerBusinessType.RETAILER,
        phone=body.business.contactNumber.strip(),
        alternatePhone=clean_optional(body.business.alternatePhone),
        email=clean_optional(body.business.email),
        panNumber=clean_optional(body.business.panNumber),
        vatNumber=clean_optional(body.business.vatNumber),
        province=body.business.province.strip(),
        district=body.business.district.strip(),
        municipality=body.business.municipality.strip(),
        ward=clean_optional(body.business.ward),
        addressLine=body.business.addressLine.strip(),
        landmark=clean_optional(body.business.landmark),
        verificationStatus=RetailerVerificationStatus.SUBMITTED,
        verificationSubmittedAt=now,
        subscriptionStatus=RetailerSubscriptionStatus.NONE,
    )
    db.add(business)
    await db.flush()

    db.add(RetailerMembership(
        retailerBusinessId=business.id,
        userId=owner_user.id,
        role=RetailerMembershipRole.OWNER,
        status=RecordStatus.ACTIVE,
    ))
    await db.commit()
    await db.refresh(owner_user)
    await db.refresh(business)

    # Load roles
    result = await db.execute(
        select(Role.code).join(UserRole, UserRole.roleId == Role.id).where(UserRole.userId == owner_user.id)
    )
    roles = [r[0] for r in result.all()]

    user_data = {
        "id": owner_user.id,
        "firstName": owner_user.firstName,
        "lastName": owner_user.lastName,
        "email": owner_user.email,
        "phone": owner_user.phone,
        "status": owner_user.status,
        "emailVerified": owner_user.emailVerified,
        "roles": roles,
    }

    business_data = await build_business_summary(db, business)

    if session_token:
        response.set_cookie(
            key=settings.SESSION_COOKIE_NAME,
            value=session_token,
            httponly=True,
            samesite="lax",
            secure=settings.COOKIE_SECURE,
            max_age=settings.SESSION_TTL_DAYS * 86400,
        )

    return success({"user": user_data, "retailer": business_data}, "Retailer business registered", 201)


@router.get("/me")
async def get_my_retailer_context(
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, session_id = auth
    context = await get_retailer_context_dict(db, user["id"])
    return success(context)


@router.get("/business")
async def get_business_profile(
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    business = retailer_access["business"]
    data = await build_business_summary(db, business)
    return success(data)


@router.patch("/business")
async def update_business(
    body: UpdateBusinessBody,
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    if retailer_access["role"] not in (RetailerMembershipRole.OWNER, RetailerMembershipRole.ADMIN):
        raise AppError(403, "RETAILER_FORBIDDEN", "Only owners and admins can update business details")

    business = retailer_access["business"]
    if body.businessName: business.businessName = body.businessName.strip()
    if body.legalName is not None: business.legalName = clean_optional(body.legalName)
    if body.panNumber is not None: business.panNumber = clean_optional(body.panNumber)
    if body.vatNumber is not None: business.vatNumber = clean_optional(body.vatNumber)
    if body.province: business.province = body.province.strip()
    if body.district: business.district = body.district.strip()
    if body.municipality: business.municipality = body.municipality.strip()
    if body.ward is not None: business.ward = clean_optional(body.ward)
    if body.addressLine: business.addressLine = body.addressLine.strip()
    if body.landmark is not None: business.landmark = clean_optional(body.landmark)
    if body.phone: business.phone = body.phone.strip()
    if body.alternatePhone is not None: business.alternatePhone = clean_optional(body.alternatePhone)
    if body.email is not None: business.email = clean_optional(body.email)
    if body.logo is not None: business.logo = clean_optional(body.logo)
    if body.coverImage is not None: business.coverImage = clean_optional(body.coverImage)

    await db.commit()
    await db.refresh(business)
    data = await build_business_summary(db, business)
    return success(data, "Business details updated")


@router.get("/subscription/plans")
async def get_subscription_plans(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SubscriptionPlan)
        .where(SubscriptionPlan.status == "ACTIVE")
        .order_by(SubscriptionPlan.price, SubscriptionPlan.name)
    )
    plans = result.scalars().all()
    return success({"plans": [
        {"id": p.id, "name": p.name, "slug": p.slug, "description": p.description,
         "price": str(p.price), "billingPeriod": p.billingPeriod, "features": p.features}
        for p in plans
    ]})


@router.get("/subscription/current")
async def get_current_subscription(
    auth=Depends(get_current_user),
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    context = await get_retailer_context_dict(db, auth[0]["id"])
    return success({
        "subscriptionStatus": context["business"]["subscriptionStatus"] if context["business"] else None,
        "activeSubscription": context["business"]["activeSubscription"] if context["business"] else None,
        "verificationStatus": context["business"]["verificationStatus"] if context["business"] else None,
        "access": context["access"],
    })


@router.post("/subscription/start-trial")
async def start_trial(
    body: StartTrialBody,
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    if retailer_access["role"] not in (RetailerMembershipRole.OWNER, RetailerMembershipRole.ADMIN):
        raise AppError(403, "RETAILER_FORBIDDEN", "Only owners and admins can start a trial")

    business = retailer_access["business"]
    if business.verificationStatus != RetailerVerificationStatus.VERIFIED:
        raise AppError(403, "RETAILER_VERIFICATION_REQUIRED", "Store verification is required before starting a trial")

    result = await db.execute(
        select(RetailerSubscription).where(
            RetailerSubscription.retailerBusinessId == business.id,
            RetailerSubscription.status.in_([RetailerSubscriptionStatus.TRIAL, RetailerSubscriptionStatus.ACTIVE]),
        )
    )
    if result.scalar_one_or_none():
        raise AppError(409, "SUBSCRIPTION_ALREADY_ACTIVE", "This retailer business already has an active subscription or has used its trial")

    result = await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.slug == body.planSlug))
    plan = result.scalar_one_or_none()
    if not plan or plan.status != "ACTIVE":
        raise AppError(404, "PLAN_NOT_FOUND", f"Trial plan '{body.planSlug}' is not available")

    now = datetime.now(timezone.utc)
    trial_ends_at = now + timedelta(days=14)

    sub = RetailerSubscription(
        retailerBusinessId=business.id,
        planId=plan.id,
        status=RetailerSubscriptionStatus.TRIAL,
        trialStartsAt=now,
        trialEndsAt=trial_ends_at,
    )
    db.add(sub)
    business.subscriptionStatus = RetailerSubscriptionStatus.TRIAL
    await db.commit()

    return success({
        "subscription": {
            "id": sub.id,
            "status": sub.status,
            "planName": plan.name,
            "trialEndsAt": trial_ends_at.isoformat(),
        }
    }, "14-day free trial started successfully")


@router.get("/dashboard")
async def get_dashboard(
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func, and_
    from app.models import RetailSale, RetailerCustomer, RetailerProduct, RetailerInventory, ProductStatus

    business_id = retailer_access["retailerBusinessId"]
    business = retailer_access["business"]

    # Check subscription
    context = await get_retailer_context_dict(db, retailer_access["user"]["id"])
    if not context["access"]["allowed"]:
        raise AppError(402, "RETAILER_SUBSCRIPTION_REQUIRED", "An active retailer subscription is required to unlock ERP tools")

    # Parallel queries
    from sqlalchemy import select
    sales_sum = await db.execute(
        select(func.sum(RetailSale.grandTotal)).where(RetailSale.retailerBusinessId == business_id)
    )
    sales_count = await db.execute(
        select(func.count(RetailSale.id)).where(RetailSale.retailerBusinessId == business_id)
    )
    khata_sum = await db.execute(
        select(func.sum(RetailerCustomer.currentBalance)).where(RetailerCustomer.retailerBusinessId == business_id)
    )
    products_count = await db.execute(
        select(func.count(RetailerProduct.id)).where(
            RetailerProduct.retailerBusinessId == business_id,
            RetailerProduct.status != ProductStatus.ARCHIVED,
        )
    )
    inventories_result = await db.execute(
        select(RetailerInventory).where(RetailerInventory.retailerBusinessId == business_id)
    )
    inventories = inventories_result.scalars().all()

    total_units = sum(i.quantityAvailable for i in inventories)
    low_stock = sum(1 for i in inventories if 0 < i.quantityAvailable <= i.lowStockThreshold)
    out_of_stock = sum(1 for i in inventories if i.quantityAvailable <= 0)

    recent_result = await db.execute(
        select(RetailSale)
        .where(RetailSale.retailerBusinessId == business_id)
        .order_by(RetailSale.createdAt.desc())
        .limit(5)
    )
    recent_sales = [
        {"id": s.id, "invoiceNumber": s.invoiceNumber,
         "grandTotal": str(s.grandTotal), "paymentStatus": s.paymentStatus,
         "createdAt": s.createdAt.isoformat()}
        for s in recent_result.scalars().all()
    ]

    return success({
        "retailerBusinessId": business_id,
        "businessName": business.businessName,
        "verificationStatus": business.verificationStatus,
        "subscriptionStatus": business.subscriptionStatus,
        "summary": {
            "todaySales": str(sales_sum.scalar() or 0),
            "transactions": sales_count.scalar() or 0,
            "outstandingKhata": str(khata_sum.scalar() or 0),
            "lowStockItems": low_stock,
            "outOfStockItems": out_of_stock,
            "totalProducts": products_count.scalar() or 0,
            "totalUnits": total_units,
            "recentSales": recent_sales,
        },
    })
