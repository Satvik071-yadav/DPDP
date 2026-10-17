import os
import time
import json
import base64
import hmac
import hashlib
from typing import Optional, Dict, Any
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

security_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Secure password hashing using PBKDF2-HMAC-SHA256 with 16-byte random salt."""
    salt = os.urandom(16)
    iterations = 100_000
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2:sha256:{iterations}${salt.hex()}${derived.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against a stored PBKDF2 hash."""
    try:
        parts = hashed_password.split("$")
        if len(parts) != 3:
            return False
        meta, salt_hex, hash_hex = parts
        _, _, iterations_str = meta.split(":")
        iterations = int(iterations_str)
        salt = bytes.fromhex(salt_hex)
        expected_derived = bytes.fromhex(hash_hex)

        actual_derived = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(actual_derived, expected_derived)
    except Exception:
        return False


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _base64url_decode(s: str) -> bytes:
    padding = "=" * (4 - (len(s) % 4)) if len(s) % 4 != 0 else ""
    return base64.urlsafe_b64decode((s + padding).encode("ascii"))


def create_access_token(data: Dict[str, Any], expires_in_minutes: int = 1440) -> str:
    """Creates an HMAC-SHA256 signed JWT token."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = dict(data)
    payload["iat"] = now
    payload["exp"] = now + (expires_in_minutes * 60)

    header_b64 = _base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")

    sig = hmac.new(settings.SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
    sig_b64 = _base64url_encode(sig)

    return f"{header_b64}.{payload_b64}.{sig_b64}"


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates HMAC-SHA256 JWT token signature and expiration."""
    try:
        parts = token.strip().split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts

        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        expected_sig = hmac.new(settings.SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual_sig = _base64url_decode(sig_b64)

        if not hmac.compare_digest(actual_sig, expected_sig):
            return None

        payload_bytes = _base64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode("utf-8"))

        now = int(time.time())
        if "exp" in payload and payload["exp"] < now:
            return None  # Expired

        return payload
    except Exception:
        return None


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer)
) -> Optional[Dict[str, Any]]:
    """Extracts user claims from optional Bearer token."""
    if not credentials or not credentials.credentials:
        return None
    return decode_access_token(credentials.credentials)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer)
) -> Dict[str, Any]:
    """Requires valid Bearer authentication token."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication token required.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    user = decode_access_token(credentials.credentials)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid, malformed, or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return user
