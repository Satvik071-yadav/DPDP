import re
import socket
import ipaddress
from urllib.parse import urlparse
from typing import Tuple, Optional, List
from fastapi import HTTPException
from app.core.config import settings


# Prohibited metadata and dangerous network ranges
BLOCKED_IP_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),       # IPv4 loopback
    ipaddress.ip_network("10.0.0.0/8"),        # Private network RFC 1918
    ipaddress.ip_network("172.16.0.0/12"),     # Private network RFC 1918
    ipaddress.ip_network("192.168.0.0/16"),    # Private network RFC 1918
    ipaddress.ip_network("169.254.0.0/16"),    # Link-local / Cloud metadata (e.g. AWS/GCP 169.254.169.254)
    ipaddress.ip_network("0.0.0.0/8"),         # Current network
    ipaddress.ip_network("224.0.0.0/4"),       # Multicast
    ipaddress.ip_network("240.0.0.0/4"),       # Reserved
    ipaddress.ip_network("::1/128"),           # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),          # IPv6 unique local
    ipaddress.ip_network("fe80::/10"),         # IPv6 link-local
]


def is_ip_literal(val: str) -> bool:
    try:
        ipaddress.ip_address(str(val).strip("[]"))
        return True
    except ValueError:
        return False


def is_ip_blocked(ip_str: str) -> bool:
    """
    Evaluates whether an IP address literal is in a blocked/private/metadata/loopback range.
    Returns False if ip_str is not an IP literal.
    """
    try:
        ip = ipaddress.ip_address(str(ip_str).strip("[]"))
        for net in BLOCKED_IP_NETWORKS:
            if ip in net:
                return True
        return False
    except ValueError:
        return False


def resolve_and_validate_destination(
    hostname: str,
    port: Optional[int] = None,
    allow_loopback: bool = False
) -> Tuple[bool, str, List[str]]:
    """
    Validates a destination host (IP literal or DNS domain) for SSRF protection:
    - Rejects cloud metadata hostnames and link-local ranges.
    - If IP literal: validates against BLOCKED_IP_NETWORKS.
    - If domain name: resolves DNS and checks ALL resolved IPs.
    - Fails closed if any resolved IP is blocked or resolution fails.
    """
    if not hostname or not hostname.strip():
        return False, "Destination hostname cannot be empty.", []

    clean_host = hostname.strip().lower().strip("[]")

    # Cloud metadata hostnames & reserved internal names
    blocked_hostnames = {
        "169.254.169.254",
        "metadata.google.internal",
        "instance-data",
        "metadata"
    }
    if clean_host in blocked_hostnames or clean_host.endswith(".internal"):
        return False, f"Access to cloud metadata host '{clean_host}' is prohibited.", []

    # IP literal check
    if is_ip_literal(clean_host):
        ip_obj = ipaddress.ip_address(clean_host)
        if is_ip_blocked(clean_host):
            if allow_loopback and ip_obj.is_loopback:
                return True, "Loopback permitted for controlled target.", [clean_host]
            return False, f"Direct connection to blocked/private IP literal {clean_host} is prohibited.", [clean_host]
        return True, "OK", [clean_host]

    # Hostname: check loopback names
    if clean_host in ("localhost", "127.0.0.1", "::1"):
        if allow_loopback:
            return True, "Loopback permitted for controlled target.", ["127.0.0.1"]
        return False, "Loopback destination prohibited by policy.", ["127.0.0.1"]

    # DNS Resolution: resolve and inspect all resolved addresses
    try:
        target_port = port if port else 80
        addr_info = socket.getaddrinfo(clean_host, target_port, proto=socket.IPPROTO_TCP)
        resolved_ips = list(set(item[4][0] for item in addr_info))
        if not resolved_ips:
            return False, f"DNS resolution returned no addresses for '{clean_host}'.", []

        for ip in resolved_ips:
            if is_ip_blocked(ip):
                ip_obj = ipaddress.ip_address(ip)
                if allow_loopback and ip_obj.is_loopback:
                    continue
                return False, f"Security violation: Target '{clean_host}' resolves to prohibited/private IP range ({ip}). SSRF protection enforced.", resolved_ips

        return True, "OK", resolved_ips
    except socket.gaierror as e:
        return False, f"DNS resolution failed for hostname '{clean_host}': {str(e)}", []
    except Exception as e:
        return False, f"Destination resolution failed for '{clean_host}': {str(e)}", []


def validate_and_resolve_url(raw_url: str, allow_controlled_local: bool = True) -> Tuple[str, str]:
    """
    Validates scan target URL, prevents SSRF, checks domain allowlist,
    and resolves DNS to ensure target cannot hit cloud metadata or private addresses.
    """
    if not raw_url or not raw_url.strip():
        raise HTTPException(status_code=400, detail="Target URL cannot be empty.")

    formatted = raw_url.strip()
    if not (formatted.startswith("http://") or formatted.startswith("https://")):
        formatted = f"https://{formatted}"

    try:
        parsed = urlparse(formatted)
        if not parsed.scheme or parsed.scheme not in ("http", "https"):
            raise ValueError("Invalid protocol scheme.")
        if not parsed.hostname:
            raise ValueError("Missing hostname.")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid target URL format.")

    hostname = parsed.hostname.lower()

    # Scope check: Must belong to permitted demo target domains
    allowed = settings.allowed_domain_list
    is_allowed_domain = any(
        hostname == d or hostname.endswith(f".{d}")
        for d in allowed
    )

    if not is_allowed_domain:
        raise HTTPException(
            status_code=403,
            detail=f"Target '{hostname}' is not in authorized demo scope. Permitted targets: {', '.join(allowed)}"
        )

    # Prevent embedded credentials in URL (e.g. http://user:pass@domain)
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="URLs with user credentials are not permitted.")

    # Prevent arbitrary non-standard ports
    if parsed.port and parsed.port not in (80, 443, 3000, 5173, 8000, 8080):
        is_loopback_host = hostname in ("localhost", "127.0.0.1", "::1")
        if not (is_loopback_host and allow_controlled_local):
            raise HTTPException(status_code=403, detail=f"Port {parsed.port} is not in authorized scanning scope.")

    # DNS Resolution & SSRF check
    # In controlled demo environment, simulated domains (paysecure-india.in, etc.) resolve via mock/fixtures
    if hostname in ("paysecure-india.in", "apollo-telemed.co.in", "retail-bharat.store", "demo.dpdpguard.in"):
        return formatted, "controlled_demo_fixture"

    # For localhost / 127.0.0.1
    if hostname in ("localhost", "127.0.0.1", "::1"):
        if not allow_controlled_local:
            raise HTTPException(status_code=403, detail="Direct loopback testing blocked by policy.")
        return formatted, "127.0.0.1"

    # For external hostnames: Resolve IP and enforce blocked range protection
    safe, reason, resolved_ips = resolve_and_validate_destination(hostname, parsed.port, allow_loopback=False)
    if not safe:
        raise HTTPException(status_code=403, detail=reason)

    return formatted, resolved_ips[0]
