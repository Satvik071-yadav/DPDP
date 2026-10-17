import os
import ssl
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_ENV: str = "development"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    SECRET_KEY: str = "dpdp_guard_dev_secret_key_change_in_production_8891024"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./dpdp_guard.db"

    # CORS
    CORS_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:4173,http://127.0.0.1:4173,"
        "http://localhost:8000,http://127.0.0.1:8000"
    )

    # Scope & Security
    ALLOWED_LOCAL_DOMAINS: str = "paysecure-india.in,apollo-telemed.co.in,retail-bharat.store,localhost,127.0.0.1,demo.dpdpguard.in"
    MAX_SCAN_CONCURRENCY: int = 3
    ENABLE_TESTBED: bool = False

    # Copilot
    COPILOT_PROVIDER: str = "demo"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def cors_origin_list(self) -> List[str]:
        configured = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        if self.APP_ENV != "production":
            local_dev_origins = [
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://localhost:4173",
                "http://127.0.0.1:4173",
                "http://localhost:8000",
                "http://127.0.0.1:8000",
                "http://localhost:3000",
                "http://127.0.0.1:3000",
            ]
            for origin in local_dev_origins:
                if origin not in configured:
                    configured.append(origin)
        return configured

    @property
    def allowed_domain_list(self) -> List[str]:
        return [domain.strip().lower() for domain in self.ALLOWED_LOCAL_DOMAINS.split(",") if domain.strip()]

    @property
    def async_database_url(self) -> str:
        """
        Normalizes database URLs to ensure async SQLAlchemy compatibility:
        - postgres:// -> postgresql+asyncpg:// (Render default format)
        - postgresql:// -> postgresql+asyncpg://
        - sqlite:// -> sqlite+aiosqlite://
        - Translates sslmode= (Neon / Supabase default) to ssl= for asyncpg driver compatibility
        - Strips unsupported asyncpg driver parameters (e.g. channel_binding) while preserving TLS
        """
        raw_url = self.DATABASE_URL.strip()
        if raw_url.startswith("postgres://"):
            raw_url = "postgresql+asyncpg://" + raw_url[len("postgres://"):]
        elif raw_url.startswith("postgresql://") and not raw_url.startswith("postgresql+"):
            raw_url = "postgresql+asyncpg://" + raw_url[len("postgresql://"):]
        elif raw_url.startswith("sqlite://") and not raw_url.startswith("sqlite+"):
            raw_url = "sqlite+aiosqlite://" + raw_url[len("sqlite://"):]

        if "postgresql+asyncpg://" in raw_url:
            from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
            parts = urlsplit(raw_url)
            if parts.query:
                query_params = parse_qsl(parts.query, keep_blank_values=True)
                filtered_params = []
                seen_ssl = False
                for k, v in query_params:
                    # Strip unsupported parameters that asyncpg.connect() rejects
                    if k in {"channel_binding", "gssencmode", "sslcompression"}:
                        continue
                    elif k == "sslmode":
                        if not seen_ssl:
                            filtered_params.append(("ssl", v))
                            seen_ssl = True
                    elif k == "ssl":
                        if not seen_ssl:
                            filtered_params.append((k, v))
                            seen_ssl = True
                    else:
                        filtered_params.append((k, v))
                new_query = urlencode(filtered_params)
                raw_url = urlunsplit((parts.scheme, parts.netloc, parts.path, new_query, parts.fragment))

        return raw_url

    @property
    def is_sqlite(self) -> bool:
        return "sqlite" in self.async_database_url.lower()

    @property
    def is_postgres(self) -> bool:
        url = self.async_database_url.lower()
        return "postgres" in url or "postgresql" in url

    @property
    def is_testbed_enabled(self) -> bool:
        if self.APP_ENV != "production":
            return True
        return self.ENABLE_TESTBED

    def get_database_ssl_context(self) -> Optional[ssl.SSLContext]:
        """
        Builds a secure, verified TLS SSLContext for PostgreSQL database connections:
        - Strict certificate verification: verify_mode = ssl.CERT_REQUIRED
        - Strict server identity verification: check_hostname = True
        - Loads system CA root certificates by default (compatible with Neon Let's Encrypt / Amazon CAs)
        - Allows custom CA root bundle via PGSSLROOTCERT or DATABASE_SSL_CERT environment variables
        """
        if not self.is_postgres:
            return None

        raw_url = self.DATABASE_URL.lower()
        if "sslmode=disable" in raw_url or "ssl=disable" in raw_url:
            return None

        ssl_requested = any(pattern in raw_url for pattern in ["sslmode=", "ssl=", "neon.tech"])
        if not ssl_requested and self.APP_ENV != "production":
            return None

        ctx = ssl.create_default_context()
        ctx.check_hostname = True
        ctx.verify_mode = ssl.CERT_REQUIRED

        ca_cert = os.getenv("PGSSLROOTCERT") or os.getenv("DATABASE_SSL_CERT")
        if ca_cert:
            if not os.path.exists(ca_cert):
                raise FileNotFoundError(f"Configured CA certificate file does not exist: {ca_cert}")
            ctx.load_verify_locations(cafile=ca_cert)

        return ctx

    def validate_production_configuration(self) -> None:
        """
        Enforces strict production security configuration:
        - Disallows default or short development secrets
        - Disallows DEBUG mode in production
        - Requires an external persistent database (PostgreSQL) rather than ephemeral SQLite
        - Enforces TLS encryption for database connections
        """
        if self.APP_ENV == "production":
            if self.DEBUG:
                raise RuntimeError("Production configuration error: DEBUG cannot be True when APP_ENV=production.")
            
            insecure_keys = {
                "dpdp_guard_dev_secret_key_change_in_production_8891024",
                "secret",
                "changeme",
                "dev",
                "password"
            }
            if not self.SECRET_KEY or self.SECRET_KEY in insecure_keys or len(self.SECRET_KEY) < 32:
                raise RuntimeError(
                    "Production configuration error: SECRET_KEY must be a cryptographically secure random "
                    "string of at least 32 characters. Do not use the development default."
                )

            if self.is_sqlite:
                raise RuntimeError(
                    "Production configuration error: DATABASE_URL must be configured with an external "
                    "persistent database (e.g. Neon PostgreSQL) when APP_ENV=production. Ephemeral SQLite "
                    "cannot be used for persistent records in production."
                )

            if "sslmode=disable" in self.DATABASE_URL.lower() or "ssl=disable" in self.DATABASE_URL.lower():
                raise RuntimeError(
                    "Production configuration error: TLS/SSL encryption cannot be disabled in production. "
                    "DATABASE_URL must require TLS for database connections."
                )

            if "*" in self.cors_origin_list:
                raise RuntimeError(
                    "Production configuration error: Wildcard CORS origin ('*') cannot be used in production "
                    "with credentialed authentication. Specify exact allowed domains in CORS_ORIGINS."
                )


settings = Settings()

