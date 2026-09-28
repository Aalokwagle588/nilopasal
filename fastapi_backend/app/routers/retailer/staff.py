import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.database import get_db
from app.errors import AppError
from app.utils.response import success
from app.models import (
    RetailerMembership, RetailerStaffInvite, RetailerAuditLog, User, UserRole, Role,
    RecordStatus, RetailerMembershipRole, StaffInviteStatus, RoleCode,
)
from app.middleware.auth import get_retailer_access, get_current_user

router = APIRouter(prefix="/api/retailer", tags=["staff"])


class InviteStaffBody(BaseModel):
    email: EmailStr
    role: RetailerMembershipRole
    phone: Optional[str] = None


class UpdateRoleBody(BaseModel):
    role: RetailerMembershipRole


class AcceptInviteBody(BaseModel):
    token: str


class ListAuditLogsQuery(BaseModel):
    action: Optional[str] = None
    entityType: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    page: int = 1
    limit: int = 50


@router.get("/staff")
async def list_staff(
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    business_id = retailer_access["retailerBusinessId"]
    result = await db.execute(
        select(RetailerMembership)
        .where(
            RetailerMembership.retailerBusinessId == business_id,
            RetailerMembership.status != RecordStatus.ARCHIVED,
        )
        .order_by(RetailerMembership.joinedAt)
    )
    members = result.scalars().all()

    data = []
    for m in members:
        user_result = await db.execute(
            select(User.id, User.firstName, User.lastName, User.email, User.phone)
            .where(User.id == m.userId)
        )
        user = user_result.one_or_none()
        data.append({
            "id": m.id,
            "role": m.role,
            "status": m.status,
            "joinedAt": m.joinedAt.isoformat(),
            "user": {"id": user[0], "firstName": user[1], "lastName": user[2], "email": user[3], "phone": user[4]} if user else None,
        })

    return success({"members": data})


@router.get("/staff/invites")
async def list_pending_invites(
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    business_id = retailer_access["retailerBusinessId"]
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(RetailerStaffInvite)
        .where(
            RetailerStaffInvite.retailerBusinessId == business_id,
            RetailerStaffInvite.status == StaffInviteStatus.PENDING,
            RetailerStaffInvite.expiresAt > now,
        )
        .order_by(RetailerStaffInvite.createdAt.desc())
    )
    invites = result.scalars().all()
    return success({"invites": [
        {"id": i.id, "email": i.email, "role": i.role, "expiresAt": i.expiresAt.isoformat(), "createdAt": i.createdAt.isoformat()}
        for i in invites
    ]})


@router.post("/staff/invite", status_code=201)
async def invite_staff(
    body: InviteStaffBody,
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    if retailer_access["role"] not in (RetailerMembershipRole.OWNER, RetailerMembershipRole.ADMIN):
        raise AppError(403, "RETAILER_FORBIDDEN", "Only owners and admins can invite staff")

    business_id = retailer_access["retailerBusinessId"]
    actor_id = retailer_access["user"]["id"]
    normalized_email = body.email.lower()

    # Check if already a member
    existing_result = await db.execute(
        select(RetailerMembership)
        .join(User, User.id == RetailerMembership.userId)
        .where(
            RetailerMembership.retailerBusinessId == business_id,
            RetailerMembership.status == RecordStatus.ACTIVE,
            User.emailNormalized == normalized_email,
        )
    )
    if existing_result.scalar_one_or_none():
        raise AppError(409, "ALREADY_MEMBER", f"User {body.email} is already an active staff member")

    # Invalidate existing pending invites
    old_invites = await db.execute(
        select(RetailerStaffInvite).where(
            RetailerStaffInvite.retailerBusinessId == business_id,
            RetailerStaffInvite.email == normalized_email,
            RetailerStaffInvite.status == StaffInviteStatus.PENDING,
        )
    )
    for inv in old_invites.scalars().all():
        await db.delete(inv)

    raw_token = secrets.token_hex(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    invite = RetailerStaffInvite(
        retailerBusinessId=business_id,
        email=normalized_email,
        role=body.role,
        tokenHash=token_hash,
        invitedBy=actor_id,
        expiresAt=expires_at,
        status=StaffInviteStatus.PENDING,
    )
    db.add(invite)
    db.add(RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=actor_id,
        action="INVITE_STAFF", entityType="STAFF_INVITE", entityId=None,
        after={"email": normalized_email, "role": body.role},
    ))
    await db.commit()
    await db.refresh(invite)

    return success({
        "invite": {"id": invite.id, "email": invite.email, "role": invite.role, "expiresAt": invite.expiresAt.isoformat()},
        "token": raw_token,
        "inviteUrl": f"/retailer-staff-accept.html?token={raw_token}",
    }, "Staff invitation sent", 201)


@router.post("/staff/accept-invite")
async def accept_staff_invite(
    body: AcceptInviteBody,
    auth=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, session_id = auth
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    now = datetime.now(timezone.utc)

    invite_result = await db.execute(
        select(RetailerStaffInvite).where(
            RetailerStaffInvite.tokenHash == token_hash,
            RetailerStaffInvite.status == StaffInviteStatus.PENDING,
            RetailerStaffInvite.expiresAt > now,
        )
    )
    invite = invite_result.scalar_one_or_none()
    if not invite:
        raise AppError(400, "INVALID_OR_EXPIRED_INVITE", "Invitation link is invalid, expired, or has already been accepted.")

    # Check if already a member
    existing_result = await db.execute(
        select(RetailerMembership).where(
            RetailerMembership.retailerBusinessId == invite.retailerBusinessId,
            RetailerMembership.userId == user["id"],
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        existing.role = invite.role
        existing.status = RecordStatus.ACTIVE
        membership = existing
    else:
        membership = RetailerMembership(
            retailerBusinessId=invite.retailerBusinessId,
            userId=user["id"],
            role=invite.role,
            status=RecordStatus.ACTIVE,
        )
        db.add(membership)

    invite.status = StaffInviteStatus.ACCEPTED
    invite.acceptedBy = user["id"]
    await db.commit()

    return success({"membershipId": membership.id, "role": membership.role}, "Invitation accepted")


@router.patch("/staff/{member_id}/role")
async def update_staff_role(
    member_id: str,
    body: UpdateRoleBody,
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    if retailer_access["role"] not in (RetailerMembershipRole.OWNER, RetailerMembershipRole.ADMIN):
        raise AppError(403, "RETAILER_FORBIDDEN", "Only owners and admins can update staff roles")

    business_id = retailer_access["retailerBusinessId"]
    actor_id = retailer_access["user"]["id"]

    result = await db.execute(
        select(RetailerMembership).where(RetailerMembership.id == member_id, RetailerMembership.retailerBusinessId == business_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise AppError(404, "MEMBER_NOT_FOUND", "Staff member not found")
    if member.role == RetailerMembershipRole.OWNER:
        raise AppError(400, "CANNOT_MODIFY_OWNER", "The store Owner role is immutable")

    old_role = member.role
    member.role = body.role
    db.add(RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=actor_id,
        action="UPDATE_STAFF_ROLE", entityType="MEMBERSHIP", entityId=member.id,
        before={"role": old_role}, after={"role": body.role},
    ))
    await db.commit()
    return success({"id": member.id, "role": member.role}, "Staff role updated")


@router.delete("/staff/{member_id}")
async def remove_staff(
    member_id: str,
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
):
    if retailer_access["role"] not in (RetailerMembershipRole.OWNER, RetailerMembershipRole.ADMIN):
        raise AppError(403, "RETAILER_FORBIDDEN", "Only owners and admins can remove staff")

    business_id = retailer_access["retailerBusinessId"]
    actor_id = retailer_access["user"]["id"]

    result = await db.execute(
        select(RetailerMembership).where(RetailerMembership.id == member_id, RetailerMembership.retailerBusinessId == business_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise AppError(404, "MEMBER_NOT_FOUND", "Staff member not found")
    if member.role == RetailerMembershipRole.OWNER:
        raise AppError(400, "CANNOT_MODIFY_OWNER", "The store Owner cannot be removed")

    member.status = RecordStatus.INACTIVE
    db.add(RetailerAuditLog(
        retailerBusinessId=business_id,
        actorId=actor_id,
        action="REMOVE_STAFF", entityType="MEMBERSHIP", entityId=member.id,
        before={"status": member.status, "role": member.role}, after={"status": RecordStatus.INACTIVE},
    ))
    await db.commit()
    return success(None, "Staff member removed")


@router.get("/staff/audit-logs")
async def list_audit_logs(
    retailer_access=Depends(get_retailer_access),
    db: AsyncSession = Depends(get_db),
    action: Optional[str] = None,
    entityType: Optional[str] = None,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
):
    from app.models import RetailerAuditLog
    business_id = retailer_access["retailerBusinessId"]
    filters = [RetailerAuditLog.retailerBusinessId == business_id]
    if action:
        filters.append(RetailerAuditLog.action == action)
    if entityType:
        filters.append(RetailerAuditLog.entityType == entityType)
    if startDate:
        filters.append(RetailerAuditLog.createdAt >= datetime.fromisoformat(startDate))
    if endDate:
        filters.append(RetailerAuditLog.createdAt <= datetime.fromisoformat(endDate))

    total_result = await db.execute(select(func.count(RetailerAuditLog.id)).where(*filters))
    total = total_result.scalar()

    result = await db.execute(
        select(RetailerAuditLog).where(*filters)
        .order_by(RetailerAuditLog.createdAt.desc())
        .offset((page - 1) * limit).limit(limit)
    )
    logs = result.scalars().all()

    return success({
        "logs": [{"id": l.id, "action": l.action, "entityType": l.entityType, "entityId": l.entityId,
                  "before": l.before, "after": l.after, "actorId": l.actorId, "createdAt": l.createdAt.isoformat()} for l in logs],
        "pagination": {"total": total, "page": page, "limit": limit, "totalPages": -(-total // limit)},
    })
