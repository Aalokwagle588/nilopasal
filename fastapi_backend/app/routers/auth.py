"""Auth router — POST /signup, POST /login, GET /me, POST /logout.

All endpoints live under the /api/auth prefix.
Sessions are cookie-based (httponly, samesite=lax).
Rate limit: 20 requests per 15 minutes on auth endpoints.
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Request, Response, Body
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.errors import AppError
from app.middleware.auth import get_current_user, get_current_user_optional
from app.models import (
    AuthSession,
    Cart,
    CartStatus,
    RecordStatus,
    RetailerBusiness,
    RetailerMembership,
    RetailerSubscriptionStatus,
    Role,
    RoleCode,
    User,
    UserRole,
    UserStatus,
    Wishlist,
    RetailerVerificationStatus,
)
from app.utils.response import success
from app.utils.security import (
    hash_password,
    hash_session_token,
    new_session_token,
    normalize_email,
    normalize_phone,
    verify_password,
)

# ── slowapi rate limiter ──────────────────────────────────────────────────────
from slowapi import Limiter
from slowapi.util import get_remote_address

_limiter = Limiter(key_func=get_remote_address)

# ── Router ────────────────────────────────────────────────────────────────────
auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SignupBody(BaseModel):
    firstName: str
    lastName: str
    email: EmailStr
    phone: Optional[str] = None
    password: str

    @field_validator("firstName")
    @classmethod
    def validate_first_name(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 80):
            raise ValueError("First name must be between 1 and 80 characters")
        return v

    @field_validator("lastName")
    @classmethod
    def validate_last_name(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 80):
            raise ValueError("Last name must be between 1 and 80 characters")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        if stripped == "":
            return None
        if not (7 <= len(stripped) <= 30):
            raise ValueError("Phone must be between 7 and 30 characters")
        return stripped

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not (8 <= len(v) <= 128):
            raise ValueError("Password must be between 8 and 128 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v


class LoginBody(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not (1 <= len(v) <= 128):
            raise ValueError("Password must be between 1 and 128 characters")
        return v


# ── Helpers ───────────────────────────────────────────────────────────────────

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _cookie_max_age() -> int:
    return settings.SESSION_TTL_DAYS * 24 * 60 * 60


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        max_age=_cookie_max_age(),
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
    )


async def _upsert_customer_role(db: AsyncSession) -> Role:
    """Return the CUSTOMER role, creating it if it doesn't exist."""
    result = await db.execute(
        select(Role).where(Role.code == RoleCode.CUSTOMER)
    )
    role = result.scalar_one_or_none()
    if role is None:
        role = Role(
            code=RoleCode.CUSTOMER,
            name="Customer",
            description="Default customer role",
        )
        db.add(role)
        await db.flush()  # get the generated id without committing
    return role


def _user_to_dict(user: User, roles: list[str]) -> dict:
    return {
        "id": user.id,
        "firstName": user.firstName,
        "lastName": user.lastName,
        "email": user.email,
        "phone": user.phone,
        "status": user.status,
        "emailVerified": user.emailVerified,
        "roles": roles,
    }


async def _create_session(
    db: AsyncSession,
    user_id: str,
    token: str,
    request: Request,
) -> AuthSession:
    expires_at = _utcnow() + timedelta(days=settings.SESSION_TTL_DAYS)
    session = AuthSession(
        userId=user_id,
        tokenHash=hash_session_token(token),
        userAgent=request.headers.get("user-agent"),
        ipAddress=request.client.host if request.client else None,
        expiresAt=expires_at,
    )
    db.add(session)
    return session


# ── Retailer context logic ────────────────────────────────────────────────────

def _is_subscription_usable(business: RetailerBusiness) -> bool:
    """True if the business has a currently valid subscription or trial."""
    now = _utcnow()
    status = business.subscriptionStatus
    if status == RetailerSubscriptionStatus.ACTIVE:
        # We rely on the business-level subscriptionStatus field; if the
        # caller needs fine-grained expiry it should check RetailerSubscription
        # rows.  Here we trust the denormalised column.
        return True
    if status == RetailerSubscriptionStatus.TRIAL:
        return True
    return False


def _build_retailer_context(
    membership: Optional[RetailerMembership],
    business: Optional[RetailerBusiness],
) -> dict:
    now = _utcnow()

    if membership is None or business is None:
        return {
            "membership": None,
            "business": None,
            "access": {
                "allowed": False,
                "reason": "NO_RETAILER",
                "nextAction": "REGISTER",
                "message": "You have not registered a retailer business yet.",
            },
        }

    membership_dict = {
        "id": membership.id,
        "role": membership.role,
        "status": membership.status,
        "joinedAt": membership.joinedAt.isoformat(),
    }

    business_dict = {
        "id": business.id,
        "businessName": business.businessName,
        "slug": business.slug,
        "businessType": business.businessType,
        "status": business.status,
        "verificationStatus": business.verificationStatus,
        "subscriptionStatus": business.subscriptionStatus,
    }

    # Membership inactive / business suspended
    if membership.status != RecordStatus.ACTIVE or business.status != RecordStatus.ACTIVE:
        return {
            "membership": membership_dict,
            "business": business_dict,
            "access": {
                "allowed": False,
                "reason": "SUSPENDED",
                "nextAction": "CONTACT_SUPPORT",
                "message": "Your retailer account has been suspended. Please contact support.",
            },
        }

    # Verification checks
    v_status = business.verificationStatus
    if v_status == RetailerVerificationStatus.REJECTED:
        return {
            "membership": membership_dict,
            "business": business_dict,
            "access": {
                "allowed": False,
                "reason": "REJECTED",
                "nextAction": "CONTACT_SUPPORT",
                "message": "Your verification was rejected. Please contact support.",
            },
        }

    if v_status in (
        RetailerVerificationStatus.DRAFT,
        RetailerVerificationStatus.SUBMITTED,
        RetailerVerificationStatus.UNDER_REVIEW,
    ):
        return {
            "membership": membership_dict,
            "business": business_dict,
            "access": {
                "allowed": False,
                "reason": "VERIFICATION_REQUIRED",
                "nextAction": "VERIFICATION",
                "message": "Your business is pending verification. Please complete the verification process.",
            },
        }

    # Verified — check subscription
    if not _is_subscription_usable(business):
        return {
            "membership": membership_dict,
            "business": business_dict,
            "access": {
                "allowed": False,
                "reason": "SUBSCRIPTION_REQUIRED",
                "nextAction": "SUBSCRIPTION",
                "message": "An active subscription is required to access the retailer dashboard.",
            },
        }

    # All good
    return {
        "membership": membership_dict,
        "business": business_dict,
        "access": {
            "allowed": True,
            "reason": "READY",
            "nextAction": "DASHBOARD",
            "message": "Your retailer account is active and ready.",
        },
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@auth_router.post("/signup", status_code=201)
@_limiter.limit("20/15minutes")
async def signup(
    request: Request,
    body: SignupBody = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Register a new customer account."""
    email_normalized = normalize_email(str(body.email))
    phone_normalized = normalize_phone(body.phone)

    # Check for existing account with same email or phone
    stmt = select(User).where(User.emailNormalized == email_normalized)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise AppError(409, "ACCOUNT_EXISTS", "An account with this email already exists")

    if phone_normalized:
        stmt = select(User).where(User.phoneNormalized == phone_normalized)
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing:
            raise AppError(409, "ACCOUNT_EXISTS", "An account with this phone number already exists")

    # Upsert CUSTOMER role
    role = await _upsert_customer_role(db)

    # Create user
    user = User(
        firstName=body.firstName.strip(),
        lastName=body.lastName.strip(),
        email=str(body.email).strip(),
        emailNormalized=email_normalized,
        phone=body.phone.strip() if body.phone and body.phone.strip() else None,
        phoneNormalized=phone_normalized,
        passwordHash=hash_password(body.password),
        status=UserStatus.ACTIVE,
        emailVerified=False,
        phoneVerified=False,
    )
    db.add(user)
    await db.flush()  # populate user.id

    # Assign CUSTOMER role
    user_role = UserRole(userId=user.id, roleId=role.id)
    db.add(user_role)

    # Create Wishlist
    wishlist = Wishlist(userId=user.id)
    db.add(wishlist)

    # Create active Cart
    cart = Cart(userId=user.id, status=CartStatus.ACTIVE)
    db.add(cart)

    # Create AuthSession
    token = new_session_token()
    session = await _create_session(db, user.id, token, request)

    await db.commit()

    response = success(
        data=_user_to_dict(user, [RoleCode.CUSTOMER]),
        message="Account created successfully",
        status_code=201,
    )
    _set_session_cookie(response, token)
    return response


@auth_router.post("/login")
@_limiter.limit("20/15minutes")
async def login(
    request: Request,
    body: LoginBody = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """Authenticate a user and create a session."""
    email_normalized = normalize_email(str(body.email))

    # Find user by normalised email
    result = await db.execute(
        select(User).where(User.emailNormalized == email_normalized)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid email or password")

    # Check status
    if user.status in (UserStatus.SUSPENDED, UserStatus.DISABLED):
        raise AppError(403, "ACCOUNT_DISABLED", "Your account has been disabled. Please contact support.")

    # Verify password
    if not verify_password(body.password, user.passwordHash):
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid email or password")

    # Load roles
    roles_result = await db.execute(
        select(Role.code)
        .join(UserRole, UserRole.roleId == Role.id)
        .where(UserRole.userId == user.id)
    )
    roles = [r[0] for r in roles_result.all()]

    # Create session
    token = new_session_token()
    await _create_session(db, user.id, token, request)
    await db.commit()

    response = success(
        data=_user_to_dict(user, roles),
        message="Logged in successfully",
    )
    _set_session_cookie(response, token)
    return response


@auth_router.get("/me")
@_limiter.limit("20/15minutes")
async def get_me(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: tuple = Depends(get_current_user),
):
    """Return the authenticated user with their retailer context."""
    user_dict, session_id = current

    # Fetch active retailer membership for this user (first one by joinedAt)
    result = await db.execute(
        select(RetailerMembership)
        .where(
            RetailerMembership.userId == user_dict["id"],
            RetailerMembership.status == RecordStatus.ACTIVE,
        )
        .order_by(RetailerMembership.joinedAt)
        .limit(1)
    )
    membership: Optional[RetailerMembership] = result.scalar_one_or_none()

    business: Optional[RetailerBusiness] = None
    if membership:
        biz_result = await db.execute(
            select(RetailerBusiness).where(
                RetailerBusiness.id == membership.retailerBusinessId
            )
        )
        business = biz_result.scalar_one_or_none()

    retailer_context = _build_retailer_context(membership, business)

    return success(
        data={
            "user": user_dict,
            "retailer": retailer_context,
        },
        message="",
    )


@auth_router.post("/logout")
@_limiter.limit("20/15minutes")
async def logout(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current: tuple = Depends(get_current_user_optional),
):
    """Revoke the current session and clear the cookie."""
    user_dict, session_id = current

    if session_id:
        result = await db.execute(
            select(AuthSession).where(AuthSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if session and session.revokedAt is None:
            session.revokedAt = _utcnow()
            await db.commit()

    response = success(data=None, message="Logged out successfully")
    _clear_session_cookie(response)
    return response
