import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.config import Settings
from app.db.migrations import run_migrations
from app.db.session import engine


def test_database_url_normalization():
    # Render postgres:// format
    s1 = Settings(DATABASE_URL="postgres://user:pass@dpg-abcdef-a.oregon-postgres.render.com/dpdp_guard")
    assert s1.async_database_url.startswith("postgresql+asyncpg://")
    assert s1.is_postgres is True
    assert s1.is_sqlite is False

    # Standard postgresql:// with SSL mode query parameter
    s2 = Settings(DATABASE_URL="postgresql://dpdp_admin:secret@host:5432/dpdp_guard?sslmode=require")
    assert s2.async_database_url.startswith("postgresql+asyncpg://")
    assert "sslmode=require" in s2.async_database_url
    assert s2.is_postgres is True

    # Standard sqlite:// format
    s3 = Settings(DATABASE_URL="sqlite:///./data/dpdp_guard.db")
    assert s3.async_database_url.startswith("sqlite+aiosqlite://")
    assert s3.is_sqlite is True
    assert s3.is_postgres is False

    # Already qualified async SQLite format
    s4 = Settings(DATABASE_URL="sqlite+aiosqlite:///./dpdp_guard.db")
    assert s4.async_database_url == "sqlite+aiosqlite:///./dpdp_guard.db"
    assert s4.is_sqlite is True


def test_production_security_validation():
    # 1. Rejects default development secret key in production
    s_default = Settings(
        APP_ENV="production",
        SECRET_KEY="dpdp_guard_dev_secret_key_change_in_production_8891024",
        DEBUG=False
    )
    with pytest.raises(RuntimeError, match="Do not use the development default"):
        s_default.validate_production_configuration()

    # 2. Rejects short secret keys in production
    s_short = Settings(
        APP_ENV="production",
        SECRET_KEY="too_short_secret",
        DEBUG=False
    )
    with pytest.raises(RuntimeError, match="at least 32 characters"):
        s_short.validate_production_configuration()

    # 3. Rejects DEBUG=True in production
    s_debug = Settings(
        APP_ENV="production",
        SECRET_KEY="a_valid_cryptographic_secret_key_longer_than_32_characters",
        DEBUG=True
    )
    with pytest.raises(RuntimeError, match="DEBUG cannot be True"):
        s_debug.validate_production_configuration()

    # 4. Accepts valid production configuration
    s_valid = Settings(
        APP_ENV="production",
        SECRET_KEY="a_valid_cryptographic_secret_key_longer_than_32_characters",
        DEBUG=False
    )
    s_valid.validate_production_configuration()


def test_testbed_enabled_logic():
    # Enabled in development
    s_dev = Settings(APP_ENV="development", ENABLE_TESTBED=False)
    assert s_dev.is_testbed_enabled is True

    # Disabled in production by default
    s_prod = Settings(APP_ENV="production", ENABLE_TESTBED=False)
    assert s_prod.is_testbed_enabled is False

    # Explicitly enabled in production if configured
    s_prod_optin = Settings(APP_ENV="production", ENABLE_TESTBED=True)
    assert s_prod_optin.is_testbed_enabled is True


@pytest.mark.asyncio
async def test_testbed_route_protection_in_production(monkeypatch):
    from app.core import config
    monkeypatch.setattr(config.settings, "APP_ENV", "production")
    monkeypatch.setattr(config.settings, "ENABLE_TESTBED", False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/testbed")
        assert res.status_code == 403
        assert "disabled in production" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_dialect_safe_migrations():
    # Ensure current migrations run cleanly against the active test engine
    version = await run_migrations(engine)
    assert version >= 3
