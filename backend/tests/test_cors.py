import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.config import settings, Settings


@pytest.mark.asyncio
async def test_cors_preflight_for_register_endpoint():
    """Verify that OPTIONS preflight for /api/v1/auth/register allows port 4173 with proper headers."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.options(
            "/api/v1/auth/register",
            headers={
                "Origin": "http://127.0.0.1:4173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,authorization",
            },
        )
        assert res.status_code == 200
        assert res.headers.get("access-control-allow-origin") == "http://127.0.0.1:4173"
        assert res.headers.get("access-control-allow-credentials") == "true"
        assert "POST" in res.headers.get("access-control-allow-methods", "")
        allowed_headers = res.headers.get("access-control-allow-headers", "").lower()
        assert "content-type" in allowed_headers


@pytest.mark.asyncio
async def test_cors_preflight_for_localhost_4173():
    """Verify that OPTIONS preflight allows http://localhost:4173 as well."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.options(
            "/api/v1/auth/register",
            headers={
                "Origin": "http://localhost:4173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert res.status_code == 200
        assert res.headers.get("access-control-allow-origin") == "http://localhost:4173"
        assert res.headers.get("access-control-allow-credentials") == "true"


@pytest.mark.asyncio
async def test_cors_disallows_unauthorized_origin():
    """Verify that an unauthorized origin is rejected with 400 and no allow-origin header."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.options(
            "/api/v1/auth/register",
            headers={
                "Origin": "http://malicious-attacker.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert res.status_code == 400
        assert "access-control-allow-origin" not in res.headers
        assert "Disallowed CORS origin" in res.text


@pytest.mark.asyncio
async def test_cors_headers_present_on_post_responses():
    """Verify that CORS response headers are attached to actual POST responses (e.g. 422 validation errors)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        res = await client.post(
            "/api/v1/auth/register",
            headers={
                "Origin": "http://127.0.0.1:4173",
                "Content-Type": "application/json",
            },
            json={},
        )
        assert res.status_code == 422
        assert res.headers.get("access-control-allow-origin") == "http://127.0.0.1:4173"
        assert res.headers.get("access-control-allow-credentials") == "true"


def test_cors_origin_list_development_guarantees_preview_and_dev_origins():
    """In development, 4173, 5173, and 8000 are guaranteed even with custom CORS_ORIGINS."""
    dev_settings = Settings(
        APP_ENV="development",
        CORS_ORIGINS="http://custom-dev-host:9000",
    )
    origin_list = dev_settings.cors_origin_list
    assert "http://custom-dev-host:9000" in origin_list
    assert "http://127.0.0.1:4173" in origin_list
    assert "http://localhost:4173" in origin_list
    assert "http://127.0.0.1:5173" in origin_list
    assert "http://127.0.0.1:8000" in origin_list


def test_cors_origin_list_production_strict():
    """In production, only explicitly configured origins are permitted; no dev ports are injected."""
    prod_settings = Settings(
        APP_ENV="production",
        CORS_ORIGINS="https://dpdp-guard-saas.onrender.com",
    )
    origin_list = prod_settings.cors_origin_list
    assert origin_list == ["https://dpdp-guard-saas.onrender.com"]
    assert "http://127.0.0.1:4173" not in origin_list
