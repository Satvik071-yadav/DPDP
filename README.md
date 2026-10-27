# DPDP-Guard 🛡️
### Privacy Intelligence & Automated Compliance Auditing

DPDP-Guard is a privacy-auditing platform designed to help organizations identify potential privacy risks in web applications. It combines browser-based behavioral analysis, consent testing, security controls, and compliance-oriented reporting to support privacy audits relevant to India's Digital Personal Data Protection (DPDP) Act, 2023.

**Live Application:** https://dpdp-guard-saas.onrender.com  
**Repository:** https://github.com/Satvik071-yadav/DPDP

---

## 🚀 Overview

Modern websites rely on cookies, analytics services, browser storage, and third-party integrations. These technologies can introduce privacy risks when personal data is collected or transmitted unexpectedly.

DPDP-Guard aims to automate parts of the privacy-auditing process by examining website behavior and presenting potential issues in an actionable dashboard.

The platform is designed to help teams:

- Investigate tracking activity and consent-related behavior.
- Identify potential personal-data exposure.
- Analyze browser network requests and storage behavior.
- Manage authorized website audits.
- Review findings and remediation guidance.
- Maintain organization-scoped audit records.

> **Disclaimer:** DPDP-Guard is a technical auditing aid. Its findings do not constitute legal advice, a certification of compliance, or definitive proof of a violation of the DPDP Act.

## ✨ Key Features

### 1. Automated Website Scanning
- Browser automation using Playwright and headless Chromium for supported live scans.
- Observation of browser-generated network requests and website behavior.
- Scan profiles designed for different audit requirements.
- Scan history and finding management.

### 2. Consent-Behavior Analysis
- Controlled comparison of consent acceptance and rejection.
- Investigation of potentially unexpected tracking activity.
- Identification of consent-related behavior requiring further review.

### 3. Domain Ownership Verification
- DNS TXT record verification.
- HTTP file challenge verification.
- Domain registration and verification status management.
- Authorization checks before scanning external targets.

### 4. Privacy and Security Findings
- Structured audit findings.
- Severity-based prioritization where supported.
- Evidence-oriented investigation.
- Potential impact and remediation guidance.
- Scan provenance to distinguish live observations from synthetic demonstrations.

### 5. Multi-Tenant Architecture
- Organization-based workspace isolation.
- Authenticated access to protected operations.
- Organization-scoped scan and finding management.
- Subscription entitlements and usage limits.

### 6. Security Controls
- JWT-based authentication.
- Password hashing using bcrypt.
- Server-side authorization checks.
- SSRF protection and destination validation.
- PII redaction in supported processing paths.
- Scan concurrency controls.

### 7. Dashboard and Reporting
- Overview dashboard.
- Domain management.
- Scan lifecycle and history.
- Findings investigation.
- Privacy-flow visualization.
- Fix-and-verify workflow.
- Subscription management and AI Copilot interface.

Feature availability depends on the configured deployment and the implementation of each workflow.

---

## 🏗️ Architecture

```text
                 ┌────────────────────────┐
                 │       User / Team      │
                 └────────────┬───────────┘
                              │
                              ▼
                 ┌────────────────────────┐
                 │ React + TypeScript UI  │
                 │ Dashboard and Reports  │
                 └────────────┬───────────┘
                              │ HTTPS / REST
                              ▼
                 ┌────────────────────────┐
                 │     FastAPI Backend    │
                 │ Auth and Authorization │
                 │ Domain and Scan APIs   │
                 └────────────┬───────────┘
                              │
                 ┌────────────┴─────────────┐
                 ▼                          ▼
       ┌──────────────────┐      ┌──────────────────┐
       │ Playwright +     │      │ PostgreSQL       │
       │ Headless Chromium│      │ Persistent Data  │
       └────────┬─────────┘      └──────────────────┘
                │
                ▼
       ┌──────────────────┐
       │ Website Behavior │
       │ Network Evidence │
       └────────┬─────────┘
                │
                ▼
       ┌──────────────────┐
       │ Detection Logic  │
       │ Audit Findings   │
       └──────────────────┘
```

### Scanning workflow

1. A user submits a target through the dashboard.
2. The backend validates authentication, authorization, target safety, and scan entitlements.
3. The scanner selects the appropriate live or configured demonstration workflow.
4. For eligible live scans, Playwright controls Chromium to load the website and observe its behavior.
5. Detection logic analyzes the available evidence for potential privacy risks.
6. Findings and scan metadata are persisted and presented in the dashboard.

Configured demonstration targets may use synthetic fixtures. A fixture-based report should not be interpreted as proof that a live website was scanned.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Styling | Tailwind CSS |
| Backend | Python, FastAPI |
| Browser automation | Playwright, Chromium |
| Authentication | JWT, bcrypt |
| Database | SQLite for local development; PostgreSQL for production |
| Database access | SQLAlchemy |
| Database migrations | Project migration system |
| Testing | Pytest, frontend test suite |
| Deployment | Docker, Render |
| Managed database | Neon PostgreSQL |

---

## 📋 Prerequisites

Install the following before running the project locally:

- Python compatible with the project's pinned dependencies.
- Node.js and npm.
- Git.
- Chromium dependencies required by Playwright.
- SQLite for local development, or PostgreSQL for a database-backed deployment.

Use the repository's existing dependency files to determine the exact supported versions.

## ⚙️ Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/Satvik071-yadav/DPDP.git
cd DPDP
```

### 2. Configure the backend

Create and activate a Python virtual environment.

**Windows PowerShell:**

```powershell
python -m venv backend/venv
.\backend\venv\Scripts\Activate.ps1
```

Install dependencies using the dependency file present in the repository. For example, if the project uses `backend/requirements.txt`:

```powershell
pip install -r backend/requirements.txt
```

Configure the required environment variables using the project's configuration files and documentation.

Never commit `.env` files, database credentials, JWT signing secrets, or API keys.

### 3. Configure the frontend

```bash
npm install
```

Review the existing frontend environment configuration and set the API base URL to your local backend when necessary.

### 4. Install browser dependencies

Install the Playwright Chromium browser and required operating-system dependencies according to the project's Playwright configuration.

```bash
playwright install chromium
```

If the Python executable is required explicitly, run the equivalent command through the configured virtual environment.

### 5. Start the backend

Use the FastAPI application entry point and environment configuration defined by the repository. The interactive API documentation is typically available at:

```text
http://localhost:8000/docs
```

The actual port may differ depending on your local configuration.

### 6. Start the frontend

```bash
npm run dev
```

Vite commonly serves the frontend at:

```text
http://localhost:5173
```

Open the displayed local URL in your browser.

---

## 🧪 Testing

Run the frontend production build:

```bash
npm run build
```

Run the frontend tests:

```bash
npm test
```

Run the backend tests using the project's virtual environment:

```powershell
.\backend\venv\Scripts\pytest.exe backend\tests -v
```

The project previously reported 87 passing frontend tests and 67 passing backend tests. These results should be regenerated against the current commit before being treated as the latest verification.

### Recommended integration tests

- Registration, login, and logout.
- Authenticated scan initiation.
- Domain ownership verification.
- SSRF and destination-validation checks.
- Organization-level data isolation.
- Scan failure handling.
- Live browser execution and evidence collection.
- Finding persistence and scan history.
- Database migrations.

---

## 🔐 Security

DPDP-Guard is designed with security controls appropriate for a website-auditing platform.

### Authorization
Only scan targets that you own or have explicit permission to test. Domain verification and backend authorization should remain enabled in production.

### SSRF protection
Target validation should reject prohibited destinations, including loopback, private network ranges, and cloud metadata endpoints where applicable.

### Authentication
Protected API operations require valid authentication and appropriate authorization.

### Sensitive information
Do not commit secrets or production database connection strings. Redact personal information and credentials from logs and reports.

### Controlled testbed
The project includes a synthetic testbed for demonstrating selected consent and security scenarios. Keep it disabled on the public production service unless an appropriately isolated, reviewed configuration explicitly enables it.

---

## 🌐 Deployment

The application is deployed using Render, with Neon PostgreSQL used for managed database hosting.

**Production URL:** https://dpdp-guard-saas.onrender.com

The deployment configuration uses environment variables for application settings, authentication secrets, database connectivity, CORS, scan concurrency, and testbed controls.

For production deployments:

1. Configure a PostgreSQL connection string securely.
2. Generate a strong, unique JWT signing secret.
3. Set production mode and disable debug output.
4. Configure CORS for the actual frontend origin.
5. Keep controlled testbed routes disabled on production.
6. Verify database migrations and health checks.
7. Test authentication and scan execution after deployment.

Do not expose credentials in source code or documentation.

---

## 🗺️ Future Improvements

Potential areas for further development include:

- Expanded privacy detection rules.
- Better differentiation of first-party and third-party requests.
- More robust consent-state detection.
- Improved evidence reproducibility.
- Enhanced audit report exports.
- Additional integration and end-to-end testing.
- Clearer finding provenance and confidence indicators.
- Improved performance for resource-intensive browser scans.

These are development opportunities, not claims that every item is already implemented.

---

## 🤝 Contributing

Contributions and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make a focused change.
4. Run the relevant tests.
5. Submit a pull request describing the change and its verification.

Please avoid including real personal data, credentials, or unauthorized target information in test fixtures.

## 📄 License

Add the project's actual license before redistributing this software. If no license file exists, all rights remain with the copyright holder by default.

## ⚖️ Responsible Use

DPDP-Guard is intended to support authorized privacy auditing, security testing, and compliance investigations.
