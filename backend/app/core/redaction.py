import re
from typing import Dict, Any, List


UIDAI_AADHAAR_REGEX = re.compile(r'\b(?:\d{4}[ -]?){2}\d{4}\b')
INDIAN_PHONE_REGEX = re.compile(r'(?:\+?91[\s-]?)?[6789]\d{4}[\s-]?\d{5}\b')
INDIAN_PAN_REGEX = re.compile(r'\b[A-Za-z]{5}[0-9]{4}[A-Za-z]\b')
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
JWT_TOKEN_REGEX = re.compile(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+')
CREDENTIAL_KEY_REGEX = re.compile(r'authorization|cookie|token|secret|password|key|session|passwd|auth|pan', re.IGNORECASE)


def redact_headers(headers: Dict[str, Any]) -> Dict[str, str]:
    sanitized = {}
    for k, v in headers.items():
        if CREDENTIAL_KEY_REGEX.search(str(k)):
            sanitized[str(k)] = "[REDACTED_CREDENTIAL]"
        else:
            sanitized[str(k)] = str(v)
    return sanitized


def redact_text(text: str) -> str:
    if not text:
        return ""
    # Mask Aadhaar numbers to show only last 4 digits (XXXX-XXXX-1234)
    def mask_aadhaar(match):
        digits = re.sub(r'\D', '', match.group(0))
        if len(digits) == 12:
            return f"XXXX-XXXX-{digits[-4:]}"
        return "[REDACTED_AADHAAR]"

    # Mask Indian mobile numbers
    def mask_phone(match):
        digits = re.sub(r'\D', '', match.group(0))
        if len(digits) >= 10:
            return f"+91 XXXXX {digits[-5:]}"
        return "[REDACTED_PHONE]"

    # Mask Indian PAN numbers to hide sensitive first 5 letters (XXXXX1234F)
    def mask_pan(match):
        val = match.group(0).upper()
        return f"XXXXX{val[5:]}"

    def mask_email(match):
        parts = match.group(0).split('@')
        user = parts[0]
        domain = parts[1]
        masked_user = user[0] + "***" if len(user) > 1 else "*"
        return f"{masked_user}@{domain}"

    redacted = UIDAI_AADHAAR_REGEX.sub(mask_aadhaar, text)
    redacted = INDIAN_PHONE_REGEX.sub(mask_phone, redacted)
    redacted = INDIAN_PAN_REGEX.sub(mask_pan, redacted)
    redacted = EMAIL_REGEX.sub(mask_email, redacted)
    redacted = JWT_TOKEN_REGEX.sub("[REDACTED_JWT_TOKEN]", redacted)
    return redacted
