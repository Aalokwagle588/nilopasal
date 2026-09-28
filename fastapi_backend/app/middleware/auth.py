"""Auth middleware — reads session cookie, validates token, attaches user to request state."""
from fastapi import Request, Cookie, Depends
from fastapi.security import APIKeyCookie
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.database import get_db
from app.models import AuthSession, User, UserRole, Role, RetailerMembership, RetailerBusiness, RecordStatus
from app.utils.security import hash_session_token
from app.errors import AppError
from app.config import settings


cookie_scheme = APIKeyCookie(name=settings.SESSION_COOKIE_NAME, auto_error=False)


async def get_current_user_optional(
    request: Request,
    db: AsyncSession = Depends(get_db),
    token: Optional[str] = Depends(cookie_scheme),
):
    """Returns (user_dict, session_id) or (None, None) — never raises."""
    if not token:
        return None, None
    return await _resolve_token(token, db)


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    token: Optional[str] = Depends(cookie_scheme),
):
    """Returns (user_dict, session_id) — raises 401 if not authenticated."""
    if not token:
        raise AppError(401, "UNAUTHENTICATED", "Please sign in to continue")
    user, session_id = await _resolve_token(token, db)
    if not user:
        raise AppError(401, "UNAUTHENTICATED", "Session expired. Please sign in again")
    return user, session_id


async def _resolve_token(token: str, db: AsyncSession):
    token_hash = hash_session_token(token)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(AuthSession).where(AuthSession.tokenHash == token_hash)
    )
    session = result.scalar_one_or_none()

    if not session or session.revokedAt or session.expiresAt.replace(tzinfo=timezone.utc) <= now:
        return None, None

    result = await db.execute(
        select(User).where(User.id == session.userId)
    )
    user = result.scalar_one_or_none()
    if not user or user.status in ("SUSPENDED", "DISABLED"):
        return None, None

    # Load roles
    result = await db.execute(
        select(Role.code).join(UserRole, UserRole.roleId == Role.id).where(UserRole.userId == user.id)
    )
    roles = [r[0] for r in result.all()]

    # Update lastSeenAt
    session.lastSeenAt = now

    user_dict = {
        "id": user.id,
        "firstName": user.firstName,
        "lastName": user.lastName,
        "email": user.email,
        "phone": user.phone,
        "status": user.status,
        "emailVerified": user.emailVerified,
        "roles": roles,
    }
    return user_dict, session.id


async def get_retailer_access(
    current_user_and_session=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns retailer access dict. Raises 403 if user has no active retailer membership."""
    user, session_id = current_user_and_session
    result = await db.execute(
        select(RetailerMembership)
        .where(
            RetailerMembership.userId == user["id"],
            RetailerMembership.status == RecordStatus.ACTIVE,
        )
        .order_by(RetailerMembership.joinedAt)
        .limit(1)
    )
    membership = result.scalar_one_or_none()
    if not membership:
        raise AppError(403, "NO_RETAILER_MEMBERSHIP", "Create or join a retailer business to continue")

    result = await db.execute(
        select(RetailerBusiness).where(RetailerBusiness.id == membership.retailerBusinessId)
    )
    business = result.scalar_one_or_none()
    if not business or business.status != RecordStatus.ACTIVE:
        raise AppError(403, "RETAILER_SUSPENDED", "Your retailer business has been suspended")

    return {
        "user": user,
        "session_id": session_id,
        "retailerBusinessId": business.id,
        "membershipId": membership.id,
        "role": membership.role,
        "business": business,
    }
