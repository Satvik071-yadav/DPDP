# DPDP-Guard: Free Hackathon Deployment Guide ($0/Month)

This guide documents how to deploy **DPDP-Guard** as a public cybersecurity and privacy investigation website on **Render's Free Tier** ($0/month) backed by an **external free PostgreSQL database (Neon)** for persistent demo storage.

> [!IMPORTANT]
> **Hackathon Demonstration Notice**: Free tier hosting is intended strictly for live judging, demonstrations, and technical verification. It is not suitable for production storage of real-world personal data or sensitive enterprise telemetry.

---

## 1. Free Tier Architecture & Resource Constraints

```
                      +---------------------------------------+
                      |               Internet                |
                      +---------------------------------------+
                                          |
                                          v (HTTPS)
                      +---------------------------------------+
                      |        Render Free Web Service        |
                      |   (Docker Container, 512MB RAM, $0)   |
                      |                                       |
                      |  +---------------------------------+  |
                      |  | FastAPI + Uvicorn               |  |
                      |  |                                 |  |
                      |  |  * Static SPA Frontend (/ & *)  |  |
                      |  |  * REST API (/api/v1/*)         |  |
                      |  |  * Healthcheck (/api/health)    |  |
                      |  |  * Memory-Optimized Playwright  |  |
                      |  +---------------------------------+  |
                      +---------------------------------------+
                                          |
                                          v (Secure TLS / SSL)
                      +---------------------------------------+
                      |       Neon Free Cloud PostgreSQL      |
                      |     (External Free Tier, Does Not     |
                      |         Expire after 30 days)         |
                      +---------------------------------------+
```

### Critical Free Tier Operational Realities:
1. **Sleep on Inactivity (Cold Starts)**: Render free web services automatically spin down after 15 minutes of inactivity. When a request arrives, the service wakes up; cold starts take **45 to 60 seconds**.
2. **Ephemeral Container Storage**: Render free services do **not** support persistent disks. Any local SQLite database inside the container is wiped when the container restarts or wakes from sleep.
3. **Database Persistence via Neon**: To keep scan history, findings, and verification audit records persistent across sleep cycles, configure an external free PostgreSQL database (e.g. [Neon](https://neon.tech)). Render's built-in free PostgreSQL is **not recommended** because Render deletes it after 30 days.
4. **512 MB RAM Budget**: The Docker container runs within 512 MB RAM. Chromium runs with `--disable-dev-shm-usage`, `--disable-extensions`, `--js-flags=--max-old-space-size=128`, and `MAX_SCAN_CONCURRENCY=1` to guarantee memory stability.

---

## 2. Step 1: Provision Free PostgreSQL on Neon ($0/month)

1. Go to [Neon Console](https://console.neon.tech/) and sign up for a free account.
2. Click **Create Project**:
   - **Name**: `dpdp-guard-demo`
   - **Postgres version**: `16` (or latest)
   - **Region**: Choose closest to your Render service (e.g. `US East (Ohio)` or `Frankfurt`).
3. Once created, copy the **Connection string** from the Dashboard:
   - Select **Pooled connection** or **Direct connection**.
   - Example format:
     ```
     postgresql://dpdp_owner:s3cr3t@ep-cool-flower-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
     ```
   *(DPDP-Guard automatically translates `sslmode=require` to `ssl=require` for asyncpg compatibility).*

---

## 3. Step 2: Deploy to Render via Blueprint ($0/month)

1. Push your repository to your GitHub account (e.g. `https://github.com/Satvik071-yadav/DPDP`).
2. Log in to [Render Dashboard](https://dashboard.render.com).
3. Click **Blueprints** > **New Blueprint Instance**.
4. Connect your `DPDP` GitHub repository.
5. Render will automatically read [`render.yaml`](./render.yaml).
6. When prompted for environment variables:
   - `DATABASE_URL`: Paste your **Neon PostgreSQL connection string**.
   *(If left empty, DPDP-Guard will fall back to local SQLite, which resets on container restart).*
7. Click **Apply**.
8. Render will:
   - Build the unified Docker image (React frontend + FastAPI backend + Playwright Chromium).
   - Generate a cryptographically secure 64-character `SECRET_KEY` automatically.
   - Run database migrations (`run_migrations()`) to set up all tables and indexes.
   - Deploy the service on the **Free** instance type.

---

## 4. Step 3: Manual Render Setup (Alternative to Blueprint)

If you prefer deploying without `render.yaml`:

1. In Render Dashboard, click **New +** > **Web Service**.
2. Select **Build and deploy from a Git repository** and pick your repository.
3. Configure the service settings:
   - **Name**: `dpdp-guard-saas`
   - **Region**: Same region as your Neon database.
   - **Branch**: `master` (or `main`)
   - **Runtime**: `Docker`
   - **Dockerfile Path**: `./Dockerfile`
   - **Instance Type**: **Free** ($0/month)
4. Add the following **Environment Variables**:

| Variable | Value | Purpose |
| :--- | :--- | :--- |
| `APP_ENV` | `production` | Enforces production security constraints |
| `DEBUG` | `false` | Prevents exposing debug stack traces |
| `API_V1_PREFIX` | `/api/v1` | Standard API v1 prefix |
| `SECRET_KEY` | *(Click "Generate" for 64-char string)* | JWT and session token signing |
| `DATABASE_URL` | *(Your Neon PostgreSQL connection string)* | Persistent database connection with SSL |
| `CORS_ORIGINS` | `*` | Allows cross-origin API calls |
| `ALLOWED_LOCAL_DOMAINS` | `paysecure-india.in,apollo-telemed.co.in,retail-bharat.store,localhost,127.0.0.1,demo.dpdpguard.in` | Scan target whitelist boundary |
| `MAX_SCAN_CONCURRENCY` | `1` | Strictly throttles concurrency to 1 to fit 512MB RAM |
| `ENABLE_TESTBED` | `false` | Keeps synthetic testbed disabled in production |
| `COPILOT_PROVIDER` | `demo` | AI Copilot provider (`demo`, `openai`, `anthropic`) |

5. Under **Health Check Path**, enter `/api/health`.
6. Click **Create Web Service**.

---

## 5. Pre-Flight Verification & Live Demo Checks

Once deployed, verify the deployment:

### 1. Healthcheck Verification
```bash
curl -i https://your-app-name.onrender.com/api/health
```
Expected output:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "service": "dpdp-guard-backend",
  "database": "healthy"
}
```

### 2. Frontend SPA Routing
Open `https://your-app-name.onrender.com/` in your browser.
- Verify that navigating between `/`, `/scan`, `/findings`, `/privacy-flow`, `/fix-verify`, `/history`, and `/settings` works smoothly without 404 errors.
- Refreshing the browser on any sub-route (`/findings`) properly re-serves the React SPA.

### 3. Production Security Boundary
- Navigating to `https://your-app-name.onrender.com/testbed` returns `403 Forbidden` (`"Controlled testbed endpoints are disabled in production environment."`).
- The application will refuse to start if `SECRET_KEY` is shorter than 32 characters or left as the development default.

### 4. Database Persistence Check
1. In the live website, run a scan on a demo preset target (e.g. `paysecure-india.in`).
2. Run a verification probe in **Fix & Verify**.
3. Trigger a manual restart of the web service in the Render dashboard.
4. Once the service restarts, navigate to **History** and **Overview** — verify that all scans, findings, and audit history records are intact from Neon PostgreSQL.

---

## 6. Local Docker Testing Before Deployment

You can verify the production Docker image locally:

```bash
# Build the production multi-stage image
docker build -t dpdp-guard:latest .

# Run container locally with ephemeral environment
docker run -p 8000:8000 \
  -e APP_ENV=production \
  -e SECRET_KEY=a_secure_production_secret_key_longer_than_32_characters \
  dpdp-guard:latest
```
