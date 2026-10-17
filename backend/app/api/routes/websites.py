from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.auth import get_current_user
from app.models.entities import WebsiteModel, SubscriptionModel
from app.services.organization_service import OrganizationService
from app.services.subscription_service import SubscriptionService
from app.services.domain_verification_service import DomainVerificationService, get_now_utc
from app.core.plans import get_plan
from app.schemas.contracts import (
    AddWebsiteRequest,
    WebsiteResponseSchema,
    VerifyWebsiteRequest,
    VerifyWebsiteResponse,
    RegenerateTokenResponse
)

router = APIRouter(prefix="/organizations/{org_id}/websites", tags=["Websites & Domains"])


def format_website_response(w: WebsiteModel, raw_token: Optional[str] = None) -> dict:
    txt_host = f"_dpdp-challenge.{w.hostname}"
    http_path = f"https://{w.hostname}/.well-known/dpdp-verification.txt"
    expiry_iso = w.verification_token_expiry.isoformat() if w.verification_token_expiry else get_now_utc().isoformat()
    return {
        "id": w.id,
        "organizationId": w.organization_id,
        "hostname": w.hostname,
        "verificationStatus": w.verification_status,
        "verificationMethod": w.verification_method,
        "verificationToken": raw_token,
        "dnsRecordName": txt_host,
        "dnsRecordType": "TXT",
        "dnsTxtHost": txt_host,
        "dnsTxtExpectedValue": raw_token,
        "httpPath": http_path,
        "httpFilePath": http_path,
        "httpExpectedContent": raw_token,
        "verificationTokenExpiry": expiry_iso,
        "tokenExpiresAt": expiry_iso,
        "verificationAttempts": w.verification_attempts or 0,
        "verifiedAt": w.verified_at.isoformat() if w.verified_at else None,
        "lastScannedAt": w.last_scanned_at.isoformat() if w.last_scanned_at else None,
        "isActive": w.is_active,
        "createdAt": w.created_at.isoformat() if w.created_at else get_now_utc().isoformat()
    }


@router.get("", response_model=List[WebsiteResponseSchema])
async def list_websites(
    org_id: str,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all websites and their verification status for the organization."""
    user_id = claims.get("sub")
    await OrganizationService.require_membership(org_id, user_id, db)

    res = await db.execute(
        select(WebsiteModel)
        .where(WebsiteModel.organization_id == org_id)
        .order_by(WebsiteModel.created_at.desc())
    )
    websites = res.scalars().all()
    return [format_website_response(w) for w in websites]


@router.post("", response_model=WebsiteResponseSchema, status_code=status.HTTP_201_CREATED)
async def add_website(
    org_id: str,
    payload: AddWebsiteRequest,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Registers a new website under the organization and enforces subscription domain limits."""
    user_id = claims.get("sub")
    await OrganizationService.require_membership(org_id, user_id, db, ["owner", "admin"])

    # Check plan limit for websites
    sub = await SubscriptionService.get_or_create_subscription(org_id, db)
    plan = get_plan(sub.plan_id)

    cur_count_res = await db.execute(
        select(WebsiteModel).where(
            and_(WebsiteModel.organization_id == org_id, WebsiteModel.is_active == True)
        )
    )
    cur_websites = len(cur_count_res.scalars().all())
    if cur_websites >= plan.max_websites:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Website limit reached for {plan.name} plan ({cur_websites}/{plan.max_websites} domains). "
                f"Upgrade to a higher plan in Subscription Settings to add more websites."
            )
        )

    target_host = payload.target_url
    if not target_host:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Domain name / URL is required."
        )

    website, raw_token = await DomainVerificationService.add_website(
        org_id=org_id,
        user_id=user_id,
        raw_url=target_host,
        verification_method=payload.verificationMethod,
        session=db
    )

    return format_website_response(website, raw_token=raw_token)


@router.post("/{website_id}/verify", response_model=VerifyWebsiteResponse)
async def verify_website(
    org_id: str,
    website_id: str,
    payload: Optional[VerifyWebsiteRequest] = None,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Executes live DNS TXT record or HTTPS verification file check."""
    user_id = claims.get("sub")
    await OrganizationService.require_membership(org_id, user_id, db, ["owner", "admin"])

    method_override = payload.method if payload else None
    verified, message, website = await DomainVerificationService.verify_domain_ownership(
        website_id=website_id,
        org_id=org_id,
        user_id=user_id,
        session=db,
        method_override=method_override
    )
    return {
        "success": verified,
        "verified": verified,
        "verificationStatus": website.verification_status,
        "message": message,
        "website": format_website_response(website),
        "verifiedAt": website.verified_at.isoformat() if website.verified_at else None,
        "diagnostic": message
    }


@router.post("/{website_id}/regenerate-token", response_model=WebsiteResponseSchema)
async def regenerate_token(
    org_id: str,
    website_id: str,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Regenerates an expired or lost domain verification token with a fresh 72-hour window."""
    user_id = claims.get("sub")
    await OrganizationService.require_membership(org_id, user_id, db, ["owner", "admin"])

    website, raw_token = await DomainVerificationService.regenerate_token(
        website_id=website_id,
        org_id=org_id,
        session=db
    )
    return format_website_response(website, raw_token=raw_token)


@router.delete("/{website_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_website(
    org_id: str,
    website_id: str,
    claims: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Removes a website from the organization after confirming no active scan jobs are running."""
    user_id = claims.get("sub")
    await OrganizationService.require_membership(org_id, user_id, db, ["owner", "admin"])

    await DomainVerificationService.delete_website(website_id=website_id, org_id=org_id, session=db)
    return None
