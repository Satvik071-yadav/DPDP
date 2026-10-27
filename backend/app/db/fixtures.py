SYNTHETIC_ACCOUNT_A = {
    "id": "usr_demo_custA",
    "name": "Rajesh Kumar Sharma",
    "email": "rajesh.sharma@fictional-mail.in",
    "role": "customer",
    "sessionToken": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo_token_rajesh"
}

SYNTHETIC_ACCOUNT_B = {
    "id": "usr_demo_custB",
    "name": "Priya Patel",
    "email": "priya.patel@fictional-domain.in",
    "role": "customer",
    "sessionToken": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo_token_priya"
}

SYNTHETIC_KYC_RECORD_B = {
    "customerId": "usr_demo_custB",
    "fullName": "Priya Patel",
    "panNumber": "ABCDE1234F",
    "aadhaarMasked": "XXXX-XXXX-4491",
    "mobileNumber": "+91 98201 55667",
    "residentialAddress": "402, Sea Green Heights, Worli, Mumbai, Maharashtra 400018",
    "kycStatus": "VERIFIED",
    "linkedBank": "HDFC Bank - A/C ending 8812",
    "dpdpConsentId": "CONSENT-IN-2026-90412",
    "consentTimestamp": "2026-09-15T11:45:00Z"
}

INITIAL_FIXTURE_FINDINGS = [
    {
        "id": "DPDP-CRIT-001",
        "title": "Plaintext Aadhaar & Phone Number Transmitted in Telemetry Query",
        "severity": "critical",
        "category": "pii_exposure",
        "status": "open",
        "confidence": 98,
        "affected_url": "https://paysecure-india.in/kyc/identity-step-2",
        "endpoint": "https://telemetry-collect.analytics-mesh.com/v1/event",
        "dpdp_section": "Section 8(5) - Reasonable Security Safeguards to Prevent Personal Data Breach",
        "summary": "Aadhaar 12-digit UID numbers and 10-digit Indian mobile numbers are being sent unmasked in client-side telemetry query parameters to a third-party analytics collector.",
        "impact_explanation": "Under DPDP Act 2023 §8(5), Data Fiduciaries must implement reasonable technical safeguards. Leaking unmasked Aadhaar and phone identifiers to external servers carries severe exposure risks and potential regulatory penalties of up to ₹250 Crores.",
        "legal_risk_score": 9.6,
        "is_demo": True,
        "observed_evidence": {
            "method": "GET",
            "url": "https://telemetry-collect.analytics-mesh.com/v1/event?client_id=IN_4491&aadhaar_ref=492019482019&contact_mobile=9876543210&event=step_submit",
            "initiatorScript": "https://paysecure-india.in/static/js/kyc-bundle.chunk.js (Line 412)",
            "requestHeaders": {
                "Accept": "image/avif,image/webp,*/*",
                "Referer": "https://paysecure-india.in/kyc/identity-step-2",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            },
            "responseHeaders": {
                "Content-Type": "image/gif",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Access-Control-Allow-Origin": "*"
            },
            "sanitizedPayload": "{\n  \"event\": \"kyc_field_completed\",\n  \"query_params\": {\n    \"aadhaar_ref\": \"XXXX-XXXX-2019\",\n    \"contact_mobile\": \"+91 XXXXX 54321\",\n    \"user_lat\": \"19.0760\",\n    \"user_long\": \"72.8777\"\n  }\n}",
            "detectedFields": ["aadhaar_number (12 digits)", "indian_phone_number (+91)", "user_geo_coordinates"]
        },
        "remediation_steps": [
            "Implement client-side telemetry sanitization to strip all PII prior to beacon dispatch.",
            "Redact Aadhaar numbers using UIDAI-compliant masking (XXXX-XXXX-XXXX displaying only the last 4 digits).",
            "Route telemetry via a trusted first-party proxy that enforces field-level zero-PII egress filtering."
        ],
        "code_diff": {
            "filePath": "src/analytics/telemetryTracker.ts",
            "language": "typescript",
            "description": "Filter sensitive KYC identifiers and apply SHA-256 salted pseudonymization before transmitting telemetry beacons.",
            "beforeCode": "// VULNERABLE: Direct transmission of user input form fields in analytics beacon",
            "afterCode": "// REMEDIATED: Strips PII & complies with DPDP Section 8(5)"
        },
        "verification_history": [
            {
                "id": "VER-001",
                "timestamp": "2026-10-14T09:30:00Z",
                "status": "pending",
                "verifiedBy": "PrivaCraft Automated Sandbox",
                "notes": "Initial finding recorded. Awaiting code patch approval."
            }
        ]
    },
    {
        "id": "DPDP-HIGH-002",
        "title": "Third-Party Ad Pixel Fires Before Explicit Consent Banner Interaction",
        "severity": "high",
        "category": "tracker_pre_consent",
        "status": "open",
        "confidence": 96,
        "affected_url": "https://paysecure-india.in/",
        "endpoint": "https://connect.facebook.net/en_US/fbevents.js",
        "dpdp_section": "Section 6(1) - Unconditional Affirmative Consent Obligation",
        "summary": "Advertising trackers and canvas fingerprinting scripts were loaded on the initial landing page before the user interacted with the DPDP consent notice.",
        "impact_explanation": "DPDP Act §6 mandates that consent must be free, specific, informed, and an unambiguous affirmative action. Loading tracking scripts before the user consents invalidates consent mechanisms.",
        "legal_risk_score": 8.4,
        "is_demo": True,
        "observed_evidence": {
            "method": "GET",
            "url": "https://connect.facebook.net/en_US/fbevents.js",
            "initiatorScript": "<script> tag in HTML <head>",
            "requestHeaders": { "Accept": "*/*" },
            "responseHeaders": { "Content-Type": "application/javascript" },
            "sanitizedPayload": "// Pixel loader executed before consent",
            "detectedFields": ["canvas_fingerprint", "browser_headers", "client_ip"]
        },
        "remediation_steps": [
            "Configure Tag Manager to defer non-essential third-party scripts until an explicit Opt-In event is emitted.",
            "Ensure cookie blocking is active during initial DOM parsing."
        ],
        "code_diff": None,
        "verification_history": []
    },
    {
        "id": "DPDP-HIGH-007",
        "title": "Broken Object-Level Authorization (BOLA/IDOR) on Customer KYC Profile API",
        "severity": "high",
        "category": "pii_exposure",
        "status": "open",
        "confidence": 97,
        "affected_url": "https://paysecure-india.in/api/v1/customers/usr_demo_custB/kyc-record",
        "endpoint": "/api/v1/customers/{customerId}/kyc-record",
        "dpdp_section": "Section 8(5) - Reasonable Security Safeguards to Prevent Personal Data Breach",
        "summary": "Endpoint lacks tenant ownership verification. Authenticated user Account A (usr_demo_custA) is permitted to query and receive confidential KYC records and PII belonging to Account B (usr_demo_custB).",
        "impact_explanation": "Broken Object-Level Authorization (BOLA/IDOR) is the #1 API security vulnerability. Permitting cross-tenant access to confidential identity documents, PAN numbers, and masked Aadhaar numbers constitutes an active personal data breach under DPDP Act 2023 §8(5).",
        "legal_risk_score": 9.2,
        "is_demo": True,
        "observed_evidence": {
            "method": "GET",
            "url": "https://paysecure-india.in/api/v1/customers/usr_demo_custB/kyc-record",
            "initiatorScript": "API Gateway Route Handler",
            "requestHeaders": {
                "Authorization": "[REDACTED_CREDENTIAL]",
                "Accept": "application/json"
            },
            "responseHeaders": {
                "Content-Type": "application/json; charset=utf-8"
            },
            "sanitizedPayload": "{\n  \"customerId\": \"usr_demo_custB\",\n  \"fullName\": \"Priya Patel\",\n  \"panNumber\": \"ABCDE1234F\",\n  \"aadhaarMasked\": \"XXXX-XXXX-4491\",\n  \"mobileNumber\": \"+91 98201 55667\",\n  \"kycStatus\": \"VERIFIED\"\n}",
            "detectedFields": ["pan_card_number", "masked_aadhaar_ref", "mobile_number", "full_legal_name"]
        },
        "remediation_steps": [
            "Enforce strict object-level authorization in the route handler: verify req.user.id === req.params.customerId before retrieving records.",
            "Log unauthorized cross-account access attempts to the security audit trail.",
            "Return HTTP 403 Forbidden with zero PII when caller identity mismatches resource owner."
        ],
        "code_diff": {
            "filePath": "server/controllers/customerKycController.ts",
            "language": "typescript",
            "description": "Enforce object-level ownership check (BOLA safeguard) under DPDP Section 8(5).",
            "beforeCode": "// VULNERABLE: Direct database fetch without cross-tenant ownership check\nconst kycRecord = await db.kycProfiles.findOne({ customerId });\nreturn res.status(200).json(kycRecord);",
            "afterCode": "// REMEDIATED: Strict Object-Level Authorization Guard (DPDP Act §8(5))\nif (authenticatedUserId !== customerId && !req.user.roles.includes('dpo_admin')) {\n  return res.status(403).json({ error: 'Forbidden', code: 'DPDP_AUTH_OBJECT_MISMATCH' });\n}\nreturn res.status(200).json(kycRecord);"
        },
        "verification_history": [
            {
                "id": "VER-007",
                "timestamp": "2026-10-14T09:35:00Z",
                "status": "pending",
                "verifiedBy": "PrivaCraft Automated Sandbox",
                "notes": "BOLA/IDOR vulnerability registered. Pending sandbox authorization verification."
            }
        ]
    }
]
