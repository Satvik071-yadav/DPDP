import asyncio
import socket
import ipaddress
import base64
import secrets
import logging
from typing import Optional, Tuple, List, Dict
from urllib.parse import urlparse

from app.core.config import settings
from app.core.security import BLOCKED_IP_NETWORKS, is_ip_literal, is_ip_blocked

logger = logging.getLogger("dpdp_guard.scanner.egress_proxy")

BLOCKED_METADATA_HOSTNAMES = {
    "169.254.169.254",
    "metadata.google.internal",
    "instance-data",
    "metadata"
}

ALLOWED_PORTS = {80, 443, 3000, 5173, 8000, 8080}


class EgressProxyServer:
    """
    Dedicated local egress forward proxy for Playwright browser instrumentation.
    Closes the DNS rebinding (TOCTOU) gap by:
    1. Binding strictly to loopback (127.0.0.1) on an ephemeral port.
    2. Requiring Proxy-Authorization credentials (not an open proxy).
    3. Restricting requests to authorized scanning scope, allowed ports, and metadata blocklists.
    4. Resolving DNS in the proxy and inspecting ALL resolved IPv4/IPv6 addresses.
    5. Pinning outbound TCP socket connections directly to the validated IP literal.
    6. Re-evaluating redirect destinations on every subsequent request.
    """

    def __init__(
        self,
        target_domain: Optional[str] = None,
        allow_controlled_local: bool = False,
        bind_host: str = "127.0.0.1"
    ):
        self.target_domain = (target_domain or "").lower()
        self.allow_controlled_local = allow_controlled_local
        self.bind_host = bind_host
        self.username = "dpdp-scanner"
        self.password = secrets.token_urlsafe(24)
        self.server: Optional[asyncio.Server] = None
        self.port: Optional[int] = None
        self._running = False

    @property
    def proxy_url(self) -> str:
        if not self.port:
            raise RuntimeError("Proxy is not started.")
        return f"http://{self.bind_host}:{self.port}"

    @property
    def expected_auth_header(self) -> str:
        raw = f"{self.username}:{self.password}".encode("utf-8")
        return f"Basic {base64.b64encode(raw).decode('utf-8')}"

    async def start(self) -> "EgressProxyServer":
        """Starts the local egress proxy server on an ephemeral loopback port."""
        self.server = await asyncio.start_server(
            self._handle_client,
            host=self.bind_host,
            port=0
        )
        self.port = self.server.sockets[0].getsockname()[1]
        self._running = True
        logger.info(f"Egress proxy started on {self.proxy_url} (restricted to scanner)")
        return self

    async def stop(self) -> None:
        """Stops the egress proxy server and terminates all sockets."""
        self._running = False
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server = None
            logger.info("Egress proxy stopped")

    async def __aenter__(self) -> "EgressProxyServer":
        return await self.start()

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.stop()

    def _check_auth(self, headers: Dict[str, str]) -> bool:
        """Verifies that the incoming request contains the per-session proxy credential."""
        auth_header = headers.get("proxy-authorization", "").strip()
        if not auth_header:
            return False
        return secrets.compare_digest(auth_header, self.expected_auth_header)

    def _validate_destination(self, host: str, port: int) -> Tuple[bool, str, List[str]]:
        """
        Validates target host and port:
        - Rejects cloud metadata and internal domains.
        - Enforces authorized target scope and allowed ports.
        - Resolves DNS and checks ALL resolved addresses against prohibited network CIDRs.
        - Fails closed on mixed public/private answers or resolution failures.
        """
        clean_host = (host or "").strip().lower().strip("[]")
        if not clean_host:
            return False, "Empty destination host", []

        # 1. Reject cloud metadata and internal domains
        if clean_host in BLOCKED_METADATA_HOSTNAMES or clean_host.endswith(".internal"):
            return False, f"Access to cloud metadata destination '{clean_host}' is blocked by security policy.", []

        # 2. Scope & Allowlist check
        is_loopback = clean_host in ("localhost", "127.0.0.1", "::1")
        allowed_list = settings.allowed_domain_list

        is_allowed_scope = False
        if is_loopback and self.allow_controlled_local:
            is_allowed_scope = True
        elif self.target_domain and (clean_host == self.target_domain or clean_host.endswith(f".{self.target_domain}")):
            is_allowed_scope = True
        elif any(clean_host == d or clean_host.endswith(f".{d}") for d in allowed_list):
            is_allowed_scope = True

        if not is_allowed_scope:
            return False, f"Target '{clean_host}' is outside the authorized scanning scope.", []

        # 3. Port restrictions
        if port not in ALLOWED_PORTS:
            if not (is_loopback and self.allow_controlled_local):
                return False, f"Port {port} is not in authorized scanning scope.", []

        # 4. Handle direct IP literals
        if is_ip_literal(clean_host):
            if is_ip_blocked(clean_host):
                if is_loopback and self.allow_controlled_local:
                    return True, "Loopback permitted for controlled testbed.", [clean_host]
                return False, f"Direct connection to prohibited IP literal {clean_host} is blocked.", [clean_host]
            return True, "OK", [clean_host]

        # 5. DNS Resolution and multi-IP validation
        try:
            addr_info = socket.getaddrinfo(clean_host, port, proto=socket.IPPROTO_TCP)
            resolved_ips = list(set(item[4][0] for item in addr_info))
            if not resolved_ips:
                return False, f"DNS resolution returned no records for '{clean_host}'.", []

            for ip_str in resolved_ips:
                if is_ip_blocked(ip_str):
                    ip_obj = ipaddress.ip_address(ip_str)
                    if ip_obj.is_loopback and self.allow_controlled_local:
                        continue
                    return False, f"Destination '{clean_host}' resolved to prohibited IP range ({ip_str}). SSRF blocked.", resolved_ips

            return True, "OK", resolved_ips
        except socket.gaierror as e:
            return False, f"DNS resolution failed for '{clean_host}': {str(e)}", []
        except Exception as e:
            return False, f"Resolution error for '{clean_host}': {str(e)}", []

    async def _handle_client(self, client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter) -> None:
        """Handles incoming proxy requests with socket-level IP pinning and authentication."""
        peername = client_writer.get_extra_info("peername")
        # Restrict incoming connections strictly to loopback
        if not peername or peername[0] != "127.0.0.1":
            client_writer.close()
            await client_writer.wait_closed()
            return

        try:
            req_line_bytes = await client_reader.readline()
            if not req_line_bytes:
                client_writer.close()
                return

            req_line = req_line_bytes.decode("utf-8", errors="replace").strip()
            parts = req_line.split()
            if len(parts) < 3:
                client_writer.close()
                return

            method, target, version = parts[0], parts[1], parts[2]

            # Read headers
            headers: Dict[str, str] = {}
            raw_headers_list: List[str] = []
            while True:
                line_bytes = await client_reader.readline()
                if not line_bytes or line_bytes == b"\r\n":
                    break
                line_str = line_bytes.decode("utf-8", errors="replace").rstrip("\r\n")
                raw_headers_list.append(line_str)
                if ":" in line_str:
                    k, v = line_str.split(":", 1)
                    headers[k.strip().lower()] = v.strip()

            # Enforce Proxy Authentication
            if not self._check_auth(headers):
                resp = (
                    "HTTP/1.1 407 Proxy Authentication Required\r\n"
                    "Proxy-Authenticate: Basic realm=\"DPDP-Scanner-Proxy\"\r\n"
                    "Content-Type: text/plain\r\n"
                    "Content-Length: 35\r\n"
                    "Connection: close\r\n\r\n"
                    "407 Proxy Authentication Required\n"
                )
                client_writer.write(resp.encode("utf-8"))
                await client_writer.drain()
                client_writer.close()
                await client_writer.wait_closed()
                return

            # Determine destination host and port
            if method.upper() == "CONNECT":
                # HTTPS Tunneling
                if ":" in target:
                    dest_host, dest_port_str = target.split(":", 1)
                    dest_port = int(dest_port_str)
                else:
                    dest_host = target
                    dest_port = 443
                is_connect = True
            else:
                # Plain HTTP Proxying
                parsed = urlparse(target)
                dest_host = parsed.hostname or ""
                dest_port = parsed.port or (443 if parsed.scheme == "https" else 80)
                is_connect = False

            # Validate Destination Policy & Resolve DNS
            is_safe, reason, resolved_ips = self._validate_destination(dest_host, dest_port)
            if not is_safe:
                logger.warning(f"Egress proxy blocked request to {dest_host}:{dest_port}: {reason}")
                status_code = "502 Bad Gateway" if "DNS resolution failed" in reason else "403 Forbidden"
                body = f"DPDP-Guard Security Policy Block: {reason}\n"
                resp = (
                    f"HTTP/1.1 {status_code}\r\n"
                    f"Content-Type: text/plain\r\n"
                    f"Content-Length: {len(body)}\r\n"
                    f"Connection: close\r\n\r\n"
                    f"{body}"
                )
                client_writer.write(resp.encode("utf-8"))
                await client_writer.drain()
                client_writer.close()
                await client_writer.wait_closed()
                return

            # Pin outbound connection strictly to the first validated IP address literal
            pinned_ip = resolved_ips[0]

            try:
                remote_reader, remote_writer = await asyncio.wait_for(
                    asyncio.open_connection(pinned_ip, dest_port),
                    timeout=10.0
                )
            except Exception as conn_err:
                logger.error(f"Egress proxy failed to connect to pinned IP {pinned_ip}:{dest_port}: {conn_err}")
                body = f"Failed to connect to destination IP {pinned_ip}:{dest_port}: {conn_err}\n"
                resp = (
                    "HTTP/1.1 502 Bad Gateway\r\n"
                    "Content-Type: text/plain\r\n"
                    f"Content-Length: {len(body)}\r\n"
                    "Connection: close\r\n\r\n"
                    f"{body}"
                )
                client_writer.write(resp.encode("utf-8"))
                await client_writer.drain()
                client_writer.close()
                await client_writer.wait_closed()
                return

            if is_connect:
                # Respond 200 Connection Established and tunnel byte stream
                client_writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                await client_writer.drain()

                async def forward_stream(src: asyncio.StreamReader, dst: asyncio.StreamWriter):
                    try:
                        while self._running:
                            buf = await src.read(65536)
                            if not buf:
                                break
                            dst.write(buf)
                            await dst.drain()
                    except Exception:
                        pass
                    finally:
                        try:
                            dst.close()
                        except Exception:
                            pass

                await asyncio.gather(
                    forward_stream(client_reader, remote_writer),
                    forward_stream(remote_reader, client_writer)
                )

            else:
                # Forward plain HTTP request with rewritten headers
                parsed = urlparse(target)
                path = parsed.path or "/"
                if parsed.query:
                    path = f"{path}?{parsed.query}"

                new_req_line = f"{method} {path} {version}\r\n"
                forward_headers = [new_req_line]
                for h in raw_headers_list:
                    h_lower = h.lower()
                    if h_lower.startswith("proxy-authorization:") or h_lower.startswith("proxy-connection:") or h_lower.startswith("connection:"):
                        continue
                    forward_headers.append(f"{h}\r\n")
                forward_headers.append("Connection: close\r\n\r\n")

                remote_writer.write("".join(forward_headers).encode("utf-8"))
                await remote_writer.drain()

                # Forward request body if present (e.g. POST/PUT)
                content_len_str = headers.get("content-length", "0")
                try:
                    content_len = int(content_len_str)
                except ValueError:
                    content_len = 0

                if content_len > 0:
                    body_bytes = await client_reader.readexactly(content_len)
                    remote_writer.write(body_bytes)
                    await remote_writer.drain()

                # Stream response back to client
                try:
                    while self._running:
                        chunk = await remote_reader.read(65536)
                        if not chunk:
                            break
                        client_writer.write(chunk)
                        await client_writer.drain()
                except Exception:
                    pass
                finally:
                    remote_writer.close()
                    client_writer.close()

        except Exception as e:
            logger.debug(f"Proxy client handling ended: {e}")
            try:
                client_writer.close()
            except Exception:
                pass
