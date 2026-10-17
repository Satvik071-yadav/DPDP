import logging
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.entities import CopilotInteractionModel
from app.core.redaction import redact_text

logger = logging.getLogger("dpdp_guard.copilot.cleanup")


def sanitize_json_recursive(data: Any) -> Any:
    """Recursively walks nested JSON structures and applies PII redaction to all strings."""
    if isinstance(data, str):
        return redact_text(data)
    elif isinstance(data, list):
        return [sanitize_json_recursive(item) for item in data]
    elif isinstance(data, dict):
        return {k: sanitize_json_recursive(v) for k, v in data.items()}
    return data


async def sanitize_historical_copilot_interactions(session: AsyncSession) -> int:
    """
    Scans and sanitizes all existing records in copilot_interactions.
    Redacts any sensitive PII (PAN, Aadhaar, Phone, Email, JWTs, etc.)
    from user prompts and structured responses.
    Returns the count of updated records.
    """
    result = await session.execute(select(CopilotInteractionModel))
    interactions = result.scalars().all()
    cleaned_count = 0

    for item in interactions:
        modified = False
        redacted_prompt = redact_text(item.user_prompt or "")
        if redacted_prompt != item.user_prompt:
            item.user_prompt = redacted_prompt
            modified = True

        if item.structured_response:
            sanitized_resp = sanitize_json_recursive(item.structured_response)
            if sanitized_resp != item.structured_response:
                item.structured_response = sanitized_resp
                modified = True

        if modified:
            cleaned_count += 1

    if cleaned_count > 0:
        await session.commit()
        logger.info(f"Sanitized {cleaned_count} historical copilot interaction records.")

    return cleaned_count
