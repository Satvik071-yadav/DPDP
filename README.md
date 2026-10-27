# PrivaCraft 🛡️

> **Crafting trust through privacy.**<br>
> *Privacy Intelligence & Compliance Auditing*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Frontend Tests](https://img.shields.io/badge/Vitest-87%20Passed-22c55e.svg)](package.json)
[![Backend Tests](https://img.shields.io/badge/Pytest-67%20Passed-22c55e.svg)](backend/tests)
[![DPDP Act](https://img.shields.io/badge/Compliance-India%20DPDP%20Act%202023-52796f.svg)](https://www.meity.gov.in/)

PrivaCraft is an automated privacy investigation and technical compliance auditing platform engineered for modern web applications and multi-tenant SaaS environments. It combines headless browser observation, consent auditing, security controls, and forensic reporting to evaluate client-side privacy risks in alignment with India's Digital Personal Data Protection (DPDP) Act, 2023.

- **Live Application:** https://dpdp-guard-saas.onrender.com
- **Repository:** https://github.com/Satvik071-yadav/DPDP

> [!NOTE]
> **Advisory & Technical Disclaimer:** PrivaCraft is an automated technical auditing and exposure detection aid. Its findings, risk scores, and telemetry represent technical evaluations and do not constitute formal legal counsel, official certification of compliance, or binding legal determinations under the DPDP Act.

---

## 🚀 Overview

Modern web applications depend heavily on third-party scripts, tracking beacons, client-side analytics, and browser storage (cookies, localStorage, sessionStorage). When personal data is collected or transmitted prior to valid consent or without adequate notice, organizations face significant compliance and security liabilities.

PrivaCraft automates the technical privacy audit process by instrumenting headless Chromium browsers to monitor real-time network egress, storage operations, and consent mechanisms, surfacing actionable findings in a unified dashboard.

### Core Objectives
- **Pre-Consent Tracking Detection:** Observe and intercept unauthorized third-party trackers transmitting data before user consent.
- **Statutory Notice Validation:** Audit privacy notices for itemized purpose specification and accessibility.
- **Security & Authorization Probing:** Detect Broken Object Level Authorization (BOLA/IDOR) and unencrypted PII transmission.
- **Remediation & Patch Verification:** Test code patches in an isolated sandbox before production deployment.
- **Tenant-Scoped Audit Records:** Maintain cryptographically verifiable, organization-isolated audit logs for Data Protection Officers (DPOs).

---

## ✨ Key Features

### 1. Automated Forensic Scanning
- Containerized headless Chromium execution via Playwright for live target observation.
- Real-time network request interception to identify first-party vs. third-party traffic.
- Detection of tracking pixels, beacon requests, and client-side data egress.
- Configurable scan profiles and deterministic synthetic workflows.

### 2. Statutory DPDP Act 2023 Alignment
- **§5 Notice Compliance:** Verifies itemized notice accessibility, purpose specification, and DPO contact transparency.
- **§6 Consent & Withdrawal:** Audits pre-consent cookie and storage writes, banner controls, and revocation mechanisms.
- **§8 Reasonable Security Safeguards:** Flags broken object-level authorization (BOLA/IDOR), plaintext PII leakage in transit, and insecure storage.
- **§9 Child Data Protection:** Flags behavioral tracking mechanisms, profiling scripts, and targeted advertising on services accessible to children.

### 3. Domain Ownership & Authorization Verification
- Strict verification before external scanning via **DNS TXT** records or **HTTP file challenges**.
- Subdomain isolation and tenant-scoped domain authorization.
- Prevention of unauthorized scanning against arbitrary third-party infrastructure.

### 4. Interactive Remediation & Verification Sandbox
- Ready-to-apply remediation code snippets (JavaScript, TypeScript, Python, React, Next.js).
- Interactive verification workbench allowing developers to simulate patched vs. vulnerable states.
- Automated validation probes verifying HTTP status, authorization headers (X-DPDP-Guard-Enforced), and zero-PII responses.

### 5. Multi-Tenant SaaS Architecture
- Complete organization-level data and audit trail isolation.
- Tiered subscription management (Free, Starter, Professional, Enterprise) with atomic concurrent scan quotas.
- Role-Based Access Control (RBAC) separating Tenant Admins, DPOs, and Compliance Auditors.

### 6. Security & Safe Execution Controls
- JWT authentication with secure secret handling and Argon2 password hashing.
- Strict Server-Side Request Forgery (SSRF) and DNS rebinding protections rejecting private networks, loopback, and cloud metadata endpoints.
- Real-time PII redaction pipeline automatically masking PAN, Aadhaar, email addresses, and phone numbers in telemetry logs and AI Copilot prompts.
- Scan concurrency semaphores to prevent resource exhaustion within container memory constraints.

---

## 🏗️ Architecture

`	ext
                  ┌────────────────────────┐
                  │      User / DPO        │
                  └───────────┬────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │  PrivaCraft Frontend   │
                  │ React, Vite, Tailwind  │
                  └───────────┬────────────┘
                              │ HTTPS / REST
                              ▼
                  ┌────────────────────────┐
                  │  FastAPI REST Gateway  │
                  │  Auth, SSRF Guard, RBAC│
                  └───────────┬────────────┘
                              │
                 ┌────────────┴─────────────┐
                 ▼                          ▼
       ┌──────────────────┐       ┌──────────────────┐
       │ Playwright +     │       │ PostgreSQL       │
       │ Headless Chromium│       │ (Neon Cloud /    │
       │ Network Observer │       │  Local SQLite)   │
       └────────┬─────────┘       └──────────────────┘
                │
                ▼
       ┌──────────────────┐
       │ Traffic Evidence │
       │ & Redacted PII   │
       └────────┬─────────┘
                │
                ▼
       ┌──────────────────┐
       │ Detection Engine │
       │ & Audit Findings │
       └──────────────────┘
`

### Scanning Workflow
1. **Submission & Entitlement:** The user submits a target URL; the backend validates JWT auth, organization scan quotas, and target authorization.
2. **SSRF Pre-flight:** DNS resolution and IP destination validation strictly block loopback, RFC 1918 private ranges, and cloud metadata IP addresses.
3. **Browser Instrumentation:** For verified targets, Playwright launches headless Chromium with memory optimizations (--disable-dev-shm-usage, --js-flags=--max-old-space-size=128).
4. **Behavioral Observation:** The observer records all network requests, cookies, and storage operations across baseline and consent-tested states.
5. **PII Masking & Analysis:** Intercepted requests pass through the redaction engine; rule-based analyzers identify statutory non-compliance.
6. **Persistence & Presentation:** Audit findings and SHA-256 evidence logs are stored in the database and visualized in real time.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide React |
| **Backend API** | FastAPI, Python 3.11+, Pydantic v2, Uvicorn |
| **Browser Automation** | Playwright (Headless Chromium) |
| **Database** | PostgreSQL (Production via Neon) / SQLite (Local dev), SQLAlchemy, AsyncPG |
| **Authentication & Security** | JWT (JOSE), Argon2 / Passlib bcrypt, SSRF & DNS rebinding guards |
| **Testing** | Node Test Runner / Vitest (87 frontend tests), Pytest (67 backend tests) |
| **Deployment & Cloud** | Docker, Render Web Service, Render Blueprint (
ender.yaml) |

---

## 📋 Quickstart & Local Development

### Prerequisites
- Node.js 18+ and npm
- Python 3.11+
- Git
- Playwright Chromium dependencies

### 1. Clone the Repository
`ash
git clone https://github.com/Satvik071-yadav/DPDP.git
cd DPDP
`

### 2. Frontend Setup
`ash
npm install
npm run dev
`
The frontend starts at http://localhost:5173.

### 3. Backend Setup
`ash
cd backend
python -m venv venv

# Windows (PowerShell):
venv\Scripts\Activate.ps1
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
playwright install chromium

# Launch the development API gateway:
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
`
Interactive API documentation is accessible at http://127.0.0.1:8000/docs, and the health check is available at http://127.0.0.1:8000/api/health.

---

## 🧪 Test Suites

PrivaCraft includes comprehensive automated test suites covering authentication, role isolation, SSRF prevention, live Playwright browser observations, and subscription quotas:

### Frontend Unit & Integration Tests (87 tests)
`ash
npm test
`

### Backend Security, Adversarial & API Tests (67 tests)
`ash
cd backend
pytest tests -v
`

### Production Build Verification
`ash
npm run build
`

---

## 🔐 Security & Operational Safeguards

- **Authorized Target Policy:** Scans against public targets require domain ownership verification (DNS TXT or HTTP token file). Demonstrations against the synthetic testbed are isolated.
- **SSRF & DNS Rebinding Protection:** The egress proxy and observer validate all resolved IPs at request time, terminating connections targeting loopback (127.0.0.0/8), private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), or link-local (169.254.169.254).
- **Data Protection & PII Redaction:** Sensitive headers (Authorization, Cookie), URL query parameters, and payload bodies containing credit card numbers (PAN), Aadhaar numbers, or email addresses are automatically redacted before persistence.
- **Controlled Synthetic Testbed:** A dedicated testbed (ackend/app/api/routes/testbed.py) is provided for testing and demonstrations. It remains disabled in production (ENABLE_TESTBED=false).

---

## 🌐 Cloud Deployment

PrivaCraft is configured for turnkey containerized deployment on **Render's Free Tier** backed by **Neon Cloud PostgreSQL**:

- **Production URL:** https://dpdp-guard-saas.onrender.com
- **Blueprint:** [
ender.yaml](./render.yaml)
- **Deployment Guide:** See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for step-by-step instructions.

### Production Configuration Checklist:
1. Set DATABASE_URL to your pooled Neon PostgreSQL connection string.
2. Generate a cryptographically secure 64-character SECRET_KEY.
3. Set APP_ENV=production and DEBUG=false.
4. Configure CORS_ORIGINS to match your production domain.
5. Ensure ENABLE_TESTBED=false on production services.

---

## ⚖️ Responsible Use

PrivaCraft is designed strictly for authorized security assessments, academic research, and organizational compliance auditing. Scanning third-party web properties without explicit authorization is strictly prohibited by platform security policies.

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
