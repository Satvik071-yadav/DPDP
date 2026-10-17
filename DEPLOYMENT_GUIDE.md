# DPDP-Guard: Production Deployment Guide (Render)

This guide documents the exact steps to deploy **DPDP-Guard** as a public, secure cybersecurity and privacy auditing SaaS on [Render](https://render.com).

---

## 1. Architecture Overview

DPDP-Guard is configured for high-reliability deployment using a unified multi-stage Docker build:
- **Frontend**: Vite + React 18 + TypeScript compiled to static HTML/JS/CSS assets.
- **Backend**: FastAPI (Python 3.12) running under Uvicorn, serving API endpoints and handling SPA fallback routing.
- **Auditing Engine**: Playwright Headless Chromium with complete Linux graphics and font libraries for live telemetry collection.
- **Database**: Managed PostgreSQL (production) or persistent SQLite (local development and small standalone instances).

```
                      +---------------------------------------+
                      |               Internet                |
                      +---------------------------------------+
                                          |
                                          v (HTTPS)
                      +---------------------------------------+
                      |          Render Web Service           |
                      |   (Docker Container on dynamic $PORT)  |
                      |                                       |
                      |  +---------------------------------+  |
                      |  | Fast API / Uvicorn (0.0.0.0)    |  |
                      |  |                                 |  |
                      |  |  * Static SPA Frontend (/ & *)  |  |
                      |  |  * REST API (/api/v1/*)         |  |
                      |  |  * Health Endpoint (/api/health)| |
                      |  |  * Playwright Engine            |  |
                      |  +---------------------------------+  |
                      +---------------------------------------+
                                          |
                                          v (Internal SSL)
                      +---------------------------------------+
                      |       Render Managed PostgreSQL       |
                      |    (DATABASE_URL with SSL require)    |
                      +---------------------------------------+
```

---

## 2. Option A: One-Click Blueprint Deployment (`render.yaml`)

DPDP-Guard includes a root `render.yaml` blueprint.

1. Push your repository to GitHub or GitLab.
2. In the Render Dashboard, navigate to **Blueprints**.
3. Click **New Blueprint Instance** and select your repository.
4. Render will detect `render.yaml` and provision:
   - **dpdp-guard-postgres**: Managed PostgreSQL database instance.
   - **dpdp-guard-saas**: Docker Web Service linked to the database via `DATABASE_URL`.
5. Click **Apply**. Render will automatically build the container and deploy the service.

---

## 3. Option B: Manual Render Setup

If you prefer configuring services individually in the Render Dashboard:

### Step 3.1: Create Managed PostgreSQL Database
1. Go to **Dashboard** > **New +** > **PostgreSQL**.
2. **Name**: `dpdp-guard-postgres`
3. **Database**: `dpdp_guard`
4. **User**: `dpdp_admin`
5. **Region**: Choose your nearest region (e.g., `Oregon`, `Frankfurt`, or `Singapore`).
6. **Plan**: `Free` or `Starter`.
7. Click **Create Database**.
8. Once provisioned, locate the **Internal Database URL** (e.g., `postgres://dpdp_admin:...@dpg-...-a/dpdp_guard`). Note this for the web service.

### Step 3.2: Create Web Service
1. Go to **Dashboard** > **New +** > **Web Service**.
2. Select **Build and deploy from a Git repository** and pick your repository.
3. Configure the service settings:
   - **Name**: `dpdp-guard-saas`
   - **Region**: Same region as your database.
   - **Branch**: `main`
   - **Runtime**: `Docker`
   - **Dockerfile Path**: `./Dockerfile`
   - **Instance Type**: `Starter` (recommended for running Playwright browser automation with >= 512MB RAM).

### Step 3.3: Configure Environment Variables
Under the **Environment Variables** tab of your Web Service, configure:

| Variable | Recommended Value | Notes |
| :--- | :--- | :--- |
| `APP_ENV` | `production` | Enforces production security checks |
| `DEBUG` | `false` | Prevents leaking debug stack traces |
| `API_V1_PREFIX` | `/api/v1` | Standard API v1 route prefix |
| `SECRET_KEY` | *(Generate a 32+ char secret)* | Cryptographic key for tokens and sessions |
| `DATABASE_URL` | *(Paste Internal Database URL)* | Render `postgres://` URLs are automatically normalized to `postgresql+asyncpg://` |
| `CORS_ORIGINS` | `*` or `https://your-domain.onrender.com` | Allowed browser origins |
| `ALLOWED_LOCAL_DOMAINS` | `paysecure-india.in,apollo-telemed.co.in,retail-bharat.store,localhost,127.0.0.1,demo.dpdpguard.in` | Security boundary for scans |
| `MAX_SCAN_CONCURRENCY` | `3` | Maximum concurrent browser audits |
| `ENABLE_TESTBED` | `false` | Keeps synthetic testbed disabled in production |
| `COPILOT_PROVIDER` | `demo` | AI Copilot provider (`demo`, `openai`, `anthropic`) |

### Step 3.4: Configure Health Check Path
- In **Settings** > **Health Check Path**, enter:
  ```
  /api/health
  ```
- Render will poll this endpoint during deployment before shifting live traffic.

---

## 4. Port Binding & Single Container Operation

- Render automatically injects a dynamic `$PORT` environment variable (typically `10000`).
- The `Dockerfile` entrypoint is configured as:
  ```dockerfile
  CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
  ```
- This ensures the application dynamically binds to whichever port Render assigns, while gracefully defaulting to `8000` when running locally via Docker or Docker Compose.

---

## 5. Schema Migrations & Data Persistence

1. On startup, the backend automatically calls `init_db()` and `run_migrations()`.
2. Safe dialect-agnostic checks inspect existing tables and columns:
   - On PostgreSQL: queries `information_schema.columns`.
   - On SQLite: queries `PRAGMA table_info`.
3. The schema migration version is tracked in `schema_version`.
4. Existing scan history, findings, and verification audit records are **never dropped or purged** on redeployment.

---

## 6. Pre-Flight Verification & Health Checks

Once deployed, verify the service:

1. **Health Check**:
   ```bash
   curl -i https://your-service.onrender.com/api/health
   ```
   Expected response:
   ```json
   {
     "status": "healthy",
     "version": "1.0.0",
     "system": "DPDP-Guard Security & Privacy API"
   }
   ```

2. **Frontend SPA Navigation**:
   Open `https://your-service.onrender.com/` in your browser.
   - Verify that direct navigation and browser refreshes on `/scan`, `/findings`, `/fix-verify`, and `/settings` load the React interface seamlessly without 404 errors.

3. **Production Security Verification**:
   - Accessing `/testbed` in production when `ENABLE_TESTBED=false` returns `403 Forbidden` (`"Controlled testbed endpoints are disabled in production environment."`).
   - The API will refuse to start if `APP_ENV=production` and `SECRET_KEY` is left as the default or shorter than 32 characters.

---

## 7. Local Testing with Docker Compose

You can verify the production container setup locally before deploying:

```bash
# Build and run with SQLite persistent volume
docker compose up --build

# Or run with PostgreSQL
docker compose --profile with-postgres up --build
```
