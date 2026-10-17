import re
import secrets
import hashlib
import hmac
import datetime
import inspect
import logging
from typing import Optional, Tuple, List
from urllib.parse import urlparse
import httpx
import httpcore
from fastapi import HTTPException, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import WebsiteModel, OrganizationMemberModel, ScanJob
from app.core.security import resolve_and_validate_destination, is_ip_literal, is_ip_blocked

logger = logging.getLogger("dpdp_guard.domain_verification")

MAX_VERIFY_ATTEMPTS_PER_HOUR = 10
TOKEN_VALIDITY_HOURS = 72


class PinnedIPBackend(httpcore.AnyIOBackend):
    """
    Custom AnyIO backend that overrides the destination TCP host with a pre-validated IP address,
    preventing DNS rebinding (TOCTOU) attacks while retaining TLS SNI and certificate verification.
    """
    def __init__(self, pinned_ip: str):
        super().__init__()
        self.pinned_ip = pinned_ip

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: Optional[float] = None,
        local_address: Optional[str] = None,
        socket_options = None,
    ):
        return await super().connect_tcp(
            host=self.pinned_ip,
            port=port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )


class PinnedIPTransport(httpx.AsyncHTTPTransport):
    """
    HTTPX AsyncHTTPTransport that binds to a PinnedIPBackend.
    """
    def __init__(self, pinned_ip: str, verify: bool = True, **kwargs):
        super().__init__(verify=verify, **kwargs)
        backend = PinnedIPBackend(pinned_ip)
        self._pool = httpcore.AsyncConnectionPool(
            ssl_context=self._pool._ssl_context,
            network_backend=backend,
            retries=0,
        )


def get_now_utc() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def normalize_hostname(raw_url: str) -> str:
    """
    Normalizes a domain input to a canonical hostname:
    - Strips protocol scheme (http/https), port, paths, queries, and fragments.
    - Rejects embedded user credentials (e.g. user:pass@host).
    - Rejects IP address literals (127.0.0.1, 192.168.1.1, etc.).
    - Validates RFC-compliant DNS hostname syntax.
    """
    if not raw_url or not raw_url.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Domain name cannot be empty."
        )

    clean = raw_url.strip().lower()

    # Prepend scheme if absent for robust URL parsing
    if not (clean.startswith("http://") or clean.startswith("https://")):
        clean = f"https://{clean}"

    try:
        parsed = urlparse(clean)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid domain format."
        )

    if parsed.username or parsed.password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Domain cannot contain embedded credentials or userinfo."
        )

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract a valid hostname from the input."
        )

    # Reject direct IP literals
    if is_ip_literal(hostname):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Domain must be a DNS hostname, not an IP address literal."
        )

    # Cloud metadata / internal names
    blocked_hosts = {"metadata.google.internal", "instance-data", "metadata"}
    if hostname in blocked_hosts or hostname.endswith(".internal"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Prohibited internal or cloud metadata hostname."
        )

    # Syntax check
    pattern = r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$"
    if not re.match(pattern, hostname) and hostname != "localhost":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid domain syntax '{hostname}'. Please provide a valid FQDN (e.g. company.in or app.company.com)."
        )

    return hostname


def generate_verification_token() -> Tuple[str, str, datetime.datetime]:
    """Generates an unguessable verification token, its SHA-256 hash, and expiry."""
    raw_secret = secrets.token_urlsafe(32)
    raw_token = f"dpdp-verify-{raw_secret}"
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expiry = get_now_utc() + datetime.timedelta(hours=TOKEN_VALIDITY_HOURS)
    return raw_token, token_hash, expiry


def verify_token_hash(raw_token: str, expected_hash: str) -> bool:
    """Verifies that a raw token matches the stored SHA-256 hash in constant time."""
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return hmac.compare_digest(token_hash, expected_hash)



async def query_dns_txt_records(record_name: str) -> List[str]:
    """Queries DNS TXT records using dnspython with fallback to nslookup."""
    records: List[str] = []
    try:
        import dns.resolver
        answers = dns.resolver.resolve(record_name, "TXT", lifetime=5)
        for rdata in answers:
            txt_string = "".join(b.decode("utf-8", errors="ignore") for b in rdata.strings)
            records.append(txt_string.strip())
        return records
    except Exception as dns_err:
        logger.debug(f"dnspython query failed for {record_name}: {str(dns_err)}; falling back to system nslookup.")

    # Fallback to system nslookup if dnspython resolution throws or is blocked locally
    try:
        import asyncio
        proc = await asyncio.create_subprocess_exec(
            "nslookup", "-type=TXT", record_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=6.0)
        output = stdout.decode("utf-8", errors="ignore")
        for line in output.splitlines():
            line_str = line.strip()
            if 'text = "' in line_str:
                txt_val = line_str.split('text = "')[-1].rstrip('"')
                records.append(txt_val.strip())
            elif line_str.startswith('"') and line_str.endswith('"'):
                records.append(line_str.strip('"'))
    except Exception as sub_err:
        logger.error(f"System nslookup fallback failed for {record_name}: {str(sub_err)}")

    return records


class DomainVerificationService:

    @staticmethod
    async def add_website(
        org_id: str,
        user_id: str,
        raw_url: str,
        verification_method: str,
        session: AsyncSession
    ) -> Tuple[WebsiteModel, str]:
        """Registers a new website for an organization and generates ownership verification token."""
        hostname = normalize_hostname(raw_url)

        # Check for existing website in this organization
        dup_res = await session.execute(
            select(WebsiteModel).where(
                and_(WebsiteModel.organization_id == org_id, WebsiteModel.hostname == hostname)
            )
        )
        existing = dup_res.scalars().first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Domain '{hostname}' is already registered in this organization."
            )

        raw_token, token_hash, expiry = generate_verification_token()
        website_id = f"web_{secrets.token_hex(6)}"

        method = verification_method.lower()
        if method not in ("dns_txt", "http_file"):
            method = "dns_txt"

        new_website = WebsiteModel(
            id=website_id,
            organization_id=org_id,
            hostname=hostname,
            verification_status="pending",
            verification_method=method,
            verification_token_hash=token_hash,
            verification_token_expiry=expiry,
            verification_attempts=0,
            is_active=True
        )
        session.add(new_website)
        await session.commit()
        await session.refresh(new_website)

        return new_website, raw_token

    @staticmethod
    async def _verify_dns_txt(challenge_host: str, hostname: str, expected_hash: str) -> Tuple[bool, str]:
        txt_records = await query_dns_txt_records(challenge_host)
        if not txt_records:
            txt_records = await query_dns_txt_records(hostname)

        verified = False
        for rec in txt_records:
            cand_hash = hashlib.sha256(rec.strip().encode("utf-8")).hexdigest()
            if hmac.compare_digest(cand_hash, expected_hash):
                verified = True
                break

        if verified:
            return True, f"DNS TXT ownership record verified successfully on {challenge_host}."
        return False, (
            f"No matching TXT record found for '{challenge_host}' or '{hostname}'. "
            f"Found {len(txt_records)} record(s). DNS propagation may take a few minutes."
        )

    @staticmethod
    async def _verify_http_file(hostname: str, expected_hash: str) -> Tuple[bool, str]:
        """
        Verifies HTTPS file challenge with TOCTOU DNS rebinding protection:
        - Resolves destination IP and validates against blocked/private/metadata ranges.
        - Pins the TCP connection directly to the validated IP via PinnedIPTransport.
        - Preserves TLS SNI and server certificate verification for the hostname.
        - Disables redirects (follow_redirects=False).
        """
        safe, reason, resolved_ips = resolve_and_validate_destination(hostname, port=443, allow_loopback=False)
        if not safe or not resolved_ips:
            return False, f"Verification aborted for security reasons: {reason}"

        pinned_ip = resolved_ips[0]
        verify_url = f"https://{hostname}/.well-known/dpdp-verification.txt"
        try:
            transport = PinnedIPTransport(pinned_ip=pinned_ip, verify=True)
            async with httpx.AsyncClient(transport=transport, timeout=8.0, follow_redirects=False) as client:
                resp = await client.get(
                    verify_url,
                    headers={"User-Agent": "DPDP-Guard-Domain-Verifier/1.0"}
                )
                if resp.status_code == 200:
                    content = resp.text.strip()
                    cand_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
                    if hmac.compare_digest(cand_hash, expected_hash):
                        return True, f"HTTPS verification file verified at {verify_url}."
                    else:
                        return False, f"Verification file at {verify_url} did not contain the expected token."
                else:
                    return False, f"Verification file at {verify_url} returned HTTP {resp.status_code}."
        except Exception as http_err:
            return False, f"Failed to connect to verification path {verify_url}: {str(http_err)}"

    @staticmethod
    async def verify_domain_ownership(
        website_id: str,
        org_id: str,
        user_id: str,
        session: AsyncSession,
        method_override: Optional[str] = None
    ) -> Tuple[bool, str, WebsiteModel]:
        """
        Executes domain ownership verification:
        - Rate limits verification checks.
        - Checks token expiration.
        - Disallows private/loopback/cloud metadata destinations.
        - Executes DNS TXT query or HTTPS verification file check.
        """
        res = await session.execute(
            select(WebsiteModel).where(
                and_(WebsiteModel.id == website_id, WebsiteModel.organization_id == org_id)
            )
        )
        website = res.scalars().first()
        if not website:
            raise HTTPException(status_code=404, detail="Website not found.")

        now = get_now_utc()

        # Check rate limit
        if website.last_verification_attempt:
            last_att = website.last_verification_attempt
            if last_att.tzinfo is None:
                last_att = last_att.replace(tzinfo=datetime.timezone.utc)
            if (now - last_att).total_seconds() < 3600 and website.verification_attempts >= MAX_VERIFY_ATTEMPTS_PER_HOUR:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Verification rate limit exceeded. Too many verification attempts for this domain (max 10/hour). Please wait an hour or regenerate a fresh token."
                )
            elif (now - last_att).total_seconds() >= 3600:
                website.verification_attempts = 0

        # Check token expiration
        expiry = website.verification_token_expiry
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=datetime.timezone.utc)
        if now > expiry:
            website.verification_status = "expired"
            await session.commit()
            return False, "Verification token has expired. Please regenerate a new token.", website

        website.verification_attempts = (website.verification_attempts or 0) + 1
        website.last_verification_attempt = now

        method = method_override or website.verification_method or "dns_txt"
        expected_hash = website.verification_token_hash
        verified = False
        message = ""

        # --- Method 1: DNS TXT Verification ---
        if method == "dns_txt":
            challenge_host = f"_dpdp-challenge.{website.hostname}"
            verify_res = DomainVerificationService._verify_dns_txt(challenge_host, website.hostname, expected_hash)
            if inspect.isawaitable(verify_res):
                verified, message = await verify_res
            else:
                verified, message = verify_res

        # --- Method 2: HTTPS Verification File ---
        elif method == "http_file":
            verify_res = DomainVerificationService._verify_http_file(website.hostname, expected_hash)
            if inspect.isawaitable(verify_res):
                verified, message = await verify_res
            else:
                verified, message = verify_res
            if not verified and "Verification aborted for security reasons" in message:
                website.verification_status = "failed"
                await session.commit()
                return False, message, website

        if verified:
            website.verification_status = "verified"
            website.verified_at = now
            website.verification_method = method
            website.verification_attempts = 0
            if "verified" not in message.lower():
                message = f"Domain ownership verified successfully: {message}"
        else:
            website.verification_status = "failed"

        await session.commit()
        await session.refresh(website)
        return verified, message, website

    @staticmethod
    async def regenerate_token(
        website_id: str,
        org_id: str,
        session: AsyncSession
    ) -> Tuple[WebsiteModel, str]:
        """Issues a new token with fresh 72-hour validity and resets attempts."""
        res = await session.execute(
            select(WebsiteModel).where(
                and_(WebsiteModel.id == website_id, WebsiteModel.organization_id == org_id)
            )
        )
        website = res.scalars().first()
        if not website:
            raise HTTPException(status_code=404, detail="Website not found.")

        raw_token, token_hash, expiry = generate_verification_token()
        website.verification_token_hash = token_hash
        website.verification_token_expiry = expiry
        website.verification_status = "pending"
        website.verification_attempts = 0
        website.last_verification_attempt = None

        await session.commit()
        await session.refresh(website)
        return website, raw_token

    @staticmethod
    async def delete_website(
        website_id: str,
        org_id: str,
        session: AsyncSession
    ) -> bool:
        """Deletes a website if no scans are actively in-flight."""
        res = await session.execute(
            select(WebsiteModel).where(
                and_(WebsiteModel.id == website_id, WebsiteModel.organization_id == org_id)
            )
        )
        website = res.scalars().first()
        if not website:
            raise HTTPException(status_code=404, detail="Website not found.")

        # Check for active scans
        active_res = await session.execute(
            select(ScanJob).where(
                and_(
                    ScanJob.website_id == website_id,
                    ScanJob.status.in_(["queued", "running"])
                )
            )
        )
        if active_res.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot remove website while an active scan is running."
            )

        await session.delete(website)
        await session.commit()
        return True


domain_verification_service = DomainVerificationService()
