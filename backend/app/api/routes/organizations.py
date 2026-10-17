from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.auth import get_current_user
from app.services.organization_service import OrganizationService
from app.schemas.contracts import (
    CreateOrganizationRequest,
    OrganizationResponseSchema,
    OrganizationMemberResponseSchema,
    AddMemberRequest
)

router = APIRouter(prefix="/organizations", tags=["Organizations"])


@router.get("", response_model=List[OrganizationResponseSchema])
async def list_organizations(
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all organizations the authenticated user belongs to. Auto-provisions primary org if none."""
    user_id = claims.get("sub")
    orgs = await OrganizationService.get_user_organizations(user_id, db)
    if not orgs:
        # Auto-provision user's default workspace
        await OrganizationService.get_or_create_primary_organization(user_id, db)
        orgs = await OrganizationService.get_user_organizations(user_id, db)
    return orgs


@router.post("", response_model=OrganizationResponseSchema, status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: CreateOrganizationRequest,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Creates a new organization and assigns the caller as owner."""
    user_id = claims.get("sub")
    org, member, sub = await OrganizationService.create_organization(payload.name, user_id, db)
    orgs = await OrganizationService.get_user_organizations(user_id, db)
    for o in orgs:
        if o["id"] == org.id:
            return o
    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "role": member.role,
        "planId": sub.plan_id,
        "planName": "Starter",
        "subscriptionStatus": sub.status,
        "websiteCount": 0,
        "memberCount": 1,
        "createdAt": org.created_at.isoformat()
    }


@router.get("/{org_id}/members", response_model=List[OrganizationMemberResponseSchema])
async def list_members(
    org_id: str,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all members of the specified organization."""
    user_id = claims.get("sub")
    return await OrganizationService.list_members(org_id, user_id, db)


@router.post("/{org_id}/members", response_model=OrganizationMemberResponseSchema, status_code=status.HTTP_201_CREATED)
async def add_member(
    org_id: str,
    payload: AddMemberRequest,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Invites and adds a registered user to the organization by email."""
    user_id = claims.get("sub")
    return await OrganizationService.add_member_by_email(
        org_id=org_id,
        inviter_user_id=user_id,
        target_email=payload.email,
        role=payload.role,
        session=db
    )
