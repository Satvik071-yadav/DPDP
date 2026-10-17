import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_ENV: str = "development"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    SECRET_KEY: str = "dpdp_guard_dev_secret_key_change_in_production_8891024"

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./dpdp_guard.db"

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

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
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

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
        """
        raw_url = self.DATABASE_URL.strip()
        if raw_url.startswith("postgres://"):
            raw_url = "postgresql+asyncpg://" + raw_url[len("postgres://"):]
        elif raw_url.startswith("postgresql://") and not raw_url.startswith("postgresql+"):
            raw_url = "postgresql+asyncpg://" + raw_url[len("postgresql://"):]
        elif raw_url.startswith("sqlite://") and not raw_url.startswith("sqlite+"):
            raw_url = "sqlite+aiosqlite://" + raw_url[len("sqlite://"):]

        # asyncpg does not accept 'sslmode' query argument; translate to 'ssl'
        if "sslmode=" in raw_url:
            import re
            raw_url = re.sub(r'([?&])sslmode=', r'\1ssl=', raw_url)

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

    def validate_production_configuration(self) -> None:
        """
        Enforces strict production security configuration:
        - Disallows default or short development secrets
        - Disallows DEBUG mode in production
        - Requires an external persistent database (PostgreSQL) rather than ephemeral SQLite
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


settings = Settings()

