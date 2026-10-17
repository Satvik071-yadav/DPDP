import datetime
import uuid
import logging
from typing import List, Dict, Any, Optional, Tuple
from urllib.parse import urlparse
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError, Error as PlaywrightError
from app.core.redaction import redact_text, redact_headers
from app.core.security import resolve_and_validate_destination, is_ip_blocked
from app.scanner.egress_proxy import EgressProxyServer
from app.models.entities import BrowserObservationModel

logger = logging.getLogger("dpdp_guard.scanner")


class BrowserObservationError(Exception):
    """Raised when browser instrumentation or navigation fails."""
    def __init__(self, message: str, stage: str = "navigation", failure_reason: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.stage = stage
        self.failure_reason = failure_reason


class BrowserObservationService:
    @staticmethod
    def classify_domain(url: str, target_domain: str) -> str:
        """
        Classifies a request URL as 'first_party', 'third_party', or 'unknown'.
        - Controlled testbed: Explicitly identifies '/testbed/api/analytics' or 'source=third_party'
          as third-party telemetry, while other testbed endpoints remain first-party.
        - General targets: Subdomains of target_domain are first-party; outside origins are third-party.
        """
        try:
            parsed = urlparse(url)
            path = parsed.path or ""
            host = (parsed.hostname or "").lower()
            target_host = (target_domain or "").lower()

            # Explicitly identify simulated third-party telemetry on the controlled testbed
            if "/testbed/api/analytics" in path or "source=third_party" in (parsed.query or ""):
                return "third_party"

            if not host:
                return "unknown"

            # Check if matching target host or subdomain of target host
            if host == target_host or host.endswith(f".{target_host}"):
                return "first_party"

            # If target is local testbed (localhost / 127.0.0.1), other local testbed endpoints are first-party
            if target_host in ("localhost", "127.0.0.1") and host in ("localhost", "127.0.0.1"):
                return "first_party"

            return "third_party"
        except Exception:
            return "unknown"

    @staticmethod
    def sanitize_url(raw_url: str) -> str:
        """
        Strips query parameters containing sensitive tokens or personal identifiers.
        """
        try:
            parsed = urlparse(raw_url)
            clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
            if parsed.query:
                clean_query = redact_text(parsed.query)
                clean_url = f"{clean_url}?{clean_query}"
            return clean_url
        except Exception:
            return redact_text(raw_url)

    @classmethod
    async def observe_target(
        cls,
        target_url: str,
        scan_id: str,
        consent_action: Optional[str] = None  # None, "accept", or "reject"
    ) -> List[Dict[str, Any]]:
        """
        Navigates a headless browser to target_url using Playwright.
        Enforces strict network security:
        - Intercepts requests to validate destination IPs against private/metadata blocklists.
        - Never treats hostnames as blocked IPs without resolution.
        - Records request metadata, resource type, timestamps, and redacted headers.
        - Simulates DPDP consent banner interaction if requested.
        - Ensures reliable cleanup of pages, contexts, and browsers in all execution paths.
        """
        observations: List[Dict[str, Any]] = []
        target_domain = urlparse(target_url).hostname or "localhost"
        is_testbed = "/testbed" in target_url or target_domain in ("localhost", "127.0.0.1")
        consent_state = "before_consent" if not consent_action else (
            "consent_accepted" if consent_action == "accept" else "consent_rejected"
        )

        browser = None
        context = None
        page = None

        try:
            async with EgressProxyServer(target_domain=target_domain, allow_controlled_local=is_testbed) as proxy:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(
                        headless=True,
                        args=[
                            "--no-sandbox",
                            "--disable-dev-shm-usage",
                            "--disable-gpu",
                            "--disable-software-rasterizer",
                            "--disable-extensions",
                            "--disable-background-networking",
                            "--disable-default-apps",
                            "--disable-sync",
                            "--disable-translate",
                            "--metrics-recording-only",
                            "--no-first-run",
                            "--js-flags=--max-old-space-size=128",
                            "--proxy-bypass-list=<-loopback>"
                        ],
                        proxy={
                            "server": proxy.proxy_url,
                            "username": proxy.username,
                            "password": proxy.password
                        }
                    )
                    context = await browser.new_context(
                        ignore_https_errors=True,
                        user_agent="DPDP-Guard-Security-Observer/1.0 (Audit Engine)",
                        viewport={"width": 1280, "height": 800}
                    )
                    page = await context.new_page()
                    page.set_default_navigation_timeout(15000)
                    page.set_default_timeout(10000)

                    # Network Route Interceptor: Block SSRF, cloud metadata, and invalid protocols
                    async def handle_route(route):
                        req_url = route.request.url
                        parsed = urlparse(req_url)
                        scheme = (parsed.scheme or "").lower()
                        host = (parsed.hostname or "").lower()
                        port = parsed.port

                        # Protocol validation
                        if scheme not in ("http", "https"):
                            observations.append({
                                "id": f"OBS-{uuid.uuid4().hex[:8].upper()}",
                                "scan_id": scan_id,
                                "timestamp": datetime.datetime.utcnow(),
                                "url": cls.sanitize_url(req_url),
                                "domain": host or "unknown",
                                "method": route.request.method,
                                "status_code": None,
                                "is_failed": True,
                                "failure_reason": f"Prohibited protocol scheme '{scheme}'",
                                "resource_type": route.request.resource_type,
                                "classification": "unknown",
                                "consent_state": consent_state,
                                "headers_redacted": redact_headers(route.request.headers),
                                "provenance": "live_browser_observation"
                            })
                            await route.abort("blockedbyclient")
                            return

                        # Scope & loopback permission
                        is_target_host = host in (target_domain, "localhost", "127.0.0.1")
                        allow_loopback = is_target_host if is_testbed else False

                        # Validate destination via resolver dynamically without unsafe long-lived caching
                        is_safe, reason, _ = resolve_and_validate_destination(
                            host,
                            port=port,
                            allow_loopback=allow_loopback
                        )

                        if not is_safe:
                            observations.append({
                                "id": f"OBS-{uuid.uuid4().hex[:8].upper()}",
                                "scan_id": scan_id,
                                "timestamp": datetime.datetime.utcnow(),
                                "url": cls.sanitize_url(req_url),
                                "domain": host,
                                "method": route.request.method,
                                "status_code": None,
                                "is_failed": True,
                                "failure_reason": reason,
                                "resource_type": route.request.resource_type,
                                "classification": cls.classify_domain(req_url, target_domain),
                                "consent_state": consent_state,
                                "headers_redacted": redact_headers(route.request.headers),
                                "provenance": "live_browser_observation"
                            })
                            await route.abort("blockedbyclient")
                            return

                        await route.continue_()

                    await page.route("**/*", handle_route)

                    # Response listener
                    def on_response(response):
                        try:
                            observations.append({
                                "id": f"OBS-{uuid.uuid4().hex[:8].upper()}",
                                "scan_id": scan_id,
                                "timestamp": datetime.datetime.now(datetime.timezone.utc),
                                "url": cls.sanitize_url(response.url),
                                "domain": urlparse(response.url).hostname or "",
                                "method": response.request.method,
                                "status_code": response.status,
                                "is_failed": not response.ok,
                                "failure_reason": None if response.ok else f"HTTP {response.status}",
                                "resource_type": response.request.resource_type,
                                "classification": cls.classify_domain(response.url, target_domain),
                                "consent_state": consent_state,
                                "headers_redacted": redact_headers(response.headers),
                                "provenance": "live_browser_observation"
                            })
                        except Exception:
                            pass

                    # Request failed listener
                    def on_request_failed(request):
                        try:
                            observations.append({
                                "id": f"OBS-{uuid.uuid4().hex[:8].upper()}",
                                "scan_id": scan_id,
                                "timestamp": datetime.datetime.utcnow(),
                                "url": cls.sanitize_url(request.url),
                                "domain": urlparse(request.url).hostname or "",
                                "method": request.method,
                                "status_code": None,
                                "is_failed": True,
                                "failure_reason": request.failure or "Network request failed",
                                "resource_type": request.resource_type,
                                "classification": cls.classify_domain(request.url, target_domain),
                                "consent_state": consent_state,
                                "headers_redacted": redact_headers(request.headers),
                                "provenance": "live_browser_observation"
                            })
                        except Exception:
                            pass

                    page.on("response", on_response)
                    page.on("requestfailed", on_request_failed)

                    # Navigate to target with fallback for slow networkidle
                    try:
                        nav_res = await page.goto(target_url, wait_until="networkidle", timeout=12000)
                        if nav_res and (not nav_res.ok) and nav_res.status in (403, 407, 502, 503, 504):
                            sanitized_err = f"Target endpoint returned HTTP {nav_res.status}"
                            observations.append({
                                "id": f"OBS-{uuid.uuid4().hex[:8].upper()}",
                                "scan_id": scan_id,
                                "timestamp": datetime.datetime.now(datetime.timezone.utc),
                                "url": cls.sanitize_url(target_url),
                                "domain": target_domain,
                                "method": "GET",
                                "status_code": nav_res.status,
                                "is_failed": True,
                                "failure_reason": f"Navigation error: {sanitized_err}",
                                "resource_type": "document",
                                "classification": "first_party",
                                "consent_state": consent_state,
                                "headers_redacted": {},
                                "provenance": "live_browser_observation"
                            })
                            raise BrowserObservationError(
                                message=f"Navigation to target failed: {sanitized_err}",
                                stage="navigation",
                                failure_reason=sanitized_err
                            )
                    except PlaywrightTimeoutError:
                        logger.warning(f"Network idle timed out for {cls.sanitize_url(target_url)}. Proceeding with DOM content loaded.")
                    except Exception as nav_exc:
                        sanitized_err = redact_text(str(nav_exc))
                        observations.append({
                            "id": f"OBS-{uuid.uuid4().hex[:8].upper()}",
                            "scan_id": scan_id,
                            "timestamp": datetime.datetime.now(datetime.timezone.utc),
                            "url": cls.sanitize_url(target_url),
                            "domain": target_domain,
                            "method": "GET",
                            "status_code": None,
                            "is_failed": True,
                            "failure_reason": f"Navigation error: {sanitized_err}",
                            "resource_type": "document",
                            "classification": "first_party",
                            "consent_state": consent_state,
                            "headers_redacted": {},
                            "provenance": "live_browser_observation"
                        })
                        raise BrowserObservationError(
                            message=f"Navigation to target failed: {sanitized_err}",
                            stage="navigation",
                            failure_reason=sanitized_err
                        )

                    # If consent banner interaction requested, click appropriate element
                    if consent_action == "accept":
                        btn = await page.query_selector("#btn-accept")
                        if btn:
                            await btn.click()
                            await page.wait_for_timeout(1000)
                    elif consent_action == "reject":
                        btn = await page.query_selector("#btn-reject")
                        if btn:
                            await btn.click()
                            await page.wait_for_timeout(1000)

                    await browser.close()
                    browser = None

        except BrowserObservationError:
            raise
        except Exception as general_exc:
            sanitized_err = redact_text(str(general_exc))
            logger.error(f"Browser observation error for {cls.sanitize_url(target_url)}: {sanitized_err}", exc_info=True)
            raise BrowserObservationError(
                message=f"Browser observation failed: {sanitized_err}",
                stage="browser_runtime",
                failure_reason=sanitized_err
            )
        finally:
            if page:
                try:
                    await page.close()
                except Exception:
                    pass
            if context:
                try:
                    await context.close()
                except Exception:
                    pass
            if browser:
                try:
                    await browser.close()
                except Exception:
                    pass

        return observations


browser_observer = BrowserObservationService()

