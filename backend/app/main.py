from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from app.core.config import settings
from app.db.init_db import init_db
from app.api.routes.health import router as health_router
from app.api.routes.scans import router as scans_router
from app.api.routes.findings import router as findings_router
from app.api.routes.copilot import router as copilot_router
from app.api.routes.settings import router as settings_router
from app.api.routes.auth import router as auth_router
from app.api.routes.notifications import router as notifications_router


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dpdp_guard")


import os
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Enforce production security constraints
    settings.validate_production_configuration()

    # Startup: Initialize DB tables and seed fixtures
    logger.info("Initializing DPDP-Guard database...")
    await init_db()
    logger.info("Database initialized successfully.")
    yield
    # Shutdown
    logger.info("DPDP-Guard backend shutting down.")


app = FastAPI(
    title="PrivaCraft Security & Privacy API",
    description="Backend services for the India DPDP Act 2023 compliance & privacy investigation SaaS.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response


# CORS setup - mounted after add_security_headers so CORSMiddleware is the outermost ASGI middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global Exception Handler so internal stack traces are never exposed to clients
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error processing {request.method} {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "InternalServerError",
            "message": "An unexpected server error occurred. Details have been logged to the security audit trail."
        }
    )


# Mount health route at root /api/health and /health
app.include_router(health_router, prefix="/api")
app.include_router(health_router)

from app.api.routes.testbed import router as testbed_router

# Mount testbed for controlled local observations
app.include_router(testbed_router)

from app.api.routes.organizations import router as organizations_router
from app.api.routes.websites import router as websites_router
from app.api.routes.subscriptions import router as subscriptions_router

# Mount API v1 routes
app.include_router(scans_router, prefix=settings.API_V1_PREFIX)
app.include_router(findings_router, prefix=settings.API_V1_PREFIX)
app.include_router(copilot_router, prefix=settings.API_V1_PREFIX)
app.include_router(settings_router, prefix=settings.API_V1_PREFIX)
app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(notifications_router, prefix=settings.API_V1_PREFIX)
app.include_router(organizations_router, prefix=settings.API_V1_PREFIX)
app.include_router(websites_router, prefix=settings.API_V1_PREFIX)
app.include_router(subscriptions_router, prefix=settings.API_V1_PREFIX)



# Static frontend SPA serving (when built frontend distribution is available)
STATIC_DIR = os.path.join(os.getcwd(), "static")
if not os.path.isdir(STATIC_DIR):
    potential_static = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
    if os.path.isdir(potential_static):
        STATIC_DIR = potential_static

if os.path.isdir(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="static-assets")

    @app.get("/")
    async def serve_spa_root():
        index_file = os.path.join(STATIC_DIR, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        return {
            "service": "PrivaCraft Backend API",
            "status": "online",
            "documentation": "/docs",
            "health": "/api/health"
        }

    @app.get("/{full_path:path}")
    async def serve_spa_fallback(full_path: str):
        # Let API, docs, and testbed routes 404 naturally
        if (
            full_path.startswith("api/")
            or full_path.startswith("testbed/")
            or full_path in ("docs", "redoc", "openapi.json")
        ):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})

        # Check if requested static asset exists directly (e.g. favicon.svg, robots.txt)
        direct_file = os.path.join(STATIC_DIR, full_path)
        if full_path and os.path.isfile(direct_file):
            return FileResponse(direct_file)

        # Client-side SPA routing fallback
        index_file = os.path.join(STATIC_DIR, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        return JSONResponse(status_code=404, content={"detail": "Frontend assets not found"})
else:
    @app.get("/")
    async def root():
        return {
            "service": "PrivaCraft Backend API",
            "status": "online",
            "documentation": "/docs",
            "health": "/api/health"
        }

