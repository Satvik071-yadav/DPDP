from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.entities import SettingsModel
from app.schemas.contracts import UserSettingsSchema, NotificationSettingsSchema

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("", response_model=UserSettingsSchema)
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Fetch current platform and DPO settings from database."""
    res = await db.execute(select(SettingsModel).where(SettingsModel.id == "default"))
    settings_obj = res.scalars().first()
    if not settings_obj:
        # Create default row if absent
        settings_obj = SettingsModel(
            id="default",
            organization_name="Bharat Privacy Labs Ltd.",
            dpo_name="Aditi Deshmukh, CISSP",
            dpo_email="dpo@bharatprivacy.in",
            jurisdiction="Republic of India (DPDP Act 2023)",
            demo_mode=True,
            api_url="http://127.0.0.1:8000",
            scan_rate_limit="standard",
            ruleset_version="DPDP-2023.4-IN (Updated Q4 2026)",
            notifications={
                "emailAlerts": True,
                "notifyOnCritical": True,
                "webhookUrl": "https://hooks.slack.com/services/T00/B00/DPDPAlerts"
            }
        )
        db.add(settings_obj)
        await db.commit()
        await db.refresh(settings_obj)

    notifs = settings_obj.notifications or {}
    return UserSettingsSchema(
        organizationName=settings_obj.organization_name,
        dpoName=settings_obj.dpo_name,
        dpoEmail=settings_obj.dpo_email,
        jurisdiction=settings_obj.jurisdiction,
        demoMode=settings_obj.demo_mode,
        apiUrl=settings_obj.api_url,
        scanRateLimit=settings_obj.scan_rate_limit,
        rulesetVersion=settings_obj.ruleset_version,
        notifications=NotificationSettingsSchema(
            emailAlerts=notifs.get("emailAlerts", True),
            notifyOnCritical=notifs.get("notifyOnCritical", True),
            webhookUrl=notifs.get("webhookUrl", "")
        )
    )


@router.put("", response_model=UserSettingsSchema)
async def update_settings(payload: UserSettingsSchema, db: AsyncSession = Depends(get_db)):
    """Persist updated platform and DPO settings in database."""
    res = await db.execute(select(SettingsModel).where(SettingsModel.id == "default"))
    settings_obj = res.scalars().first()
    if not settings_obj:
        settings_obj = SettingsModel(id="default")
        db.add(settings_obj)

    settings_obj.organization_name = payload.organizationName
    settings_obj.dpo_name = payload.dpoName
    settings_obj.dpo_email = payload.dpoEmail
    settings_obj.jurisdiction = payload.jurisdiction
    settings_obj.demo_mode = payload.demoMode
    settings_obj.api_url = payload.apiUrl
    settings_obj.scan_rate_limit = payload.scanRateLimit
    settings_obj.ruleset_version = payload.rulesetVersion
    settings_obj.notifications = {
        "emailAlerts": payload.notifications.emailAlerts,
        "notifyOnCritical": payload.notifications.notifyOnCritical,
        "webhookUrl": payload.notifications.webhookUrl
    }

    await db.commit()
    await db.refresh(settings_obj)

    notifs = settings_obj.notifications or {}
    return UserSettingsSchema(
        organizationName=settings_obj.organization_name,
        dpoName=settings_obj.dpo_name,
        dpoEmail=settings_obj.dpo_email,
        jurisdiction=settings_obj.jurisdiction,
        demoMode=settings_obj.demo_mode,
        apiUrl=settings_obj.api_url,
        scanRateLimit=settings_obj.scan_rate_limit,
        rulesetVersion=settings_obj.ruleset_version,
        notifications=NotificationSettingsSchema(
            emailAlerts=notifs.get("emailAlerts", True),
            notifyOnCritical=notifs.get("notifyOnCritical", True),
            webhookUrl=notifs.get("webhookUrl", "")
        )
    )
