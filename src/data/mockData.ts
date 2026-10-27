import { Finding, ScanResult, UserSettings, PrivacyFlowNodeData } from '@/types';

export const DEMO_FINDINGS: Finding[] = [
  {
    id: 'DPDP-CRIT-001',
    title: 'Plaintext Aadhaar & Phone Number Transmitted in Telemetry Query',
    severity: 'critical',
    category: 'pii_exposure',
    status: 'open',
    confidence: 98,
    affectedUrl: 'https://paysecure-india.in/kyc/identity-step-2',
    endpoint: 'https://telemetry-collect.analytics-mesh.com/v1/event',
    detectedAt: '2026-10-14T09:12:00Z',
    evidenceAvailable: true,
    dpdpSection: 'Section 8(5) - Reasonable Security Safeguards to Prevent Personal Data Breach',
    summary: 'Aadhaar 12-digit UID numbers and 10-digit Indian mobile numbers are being sent unmasked in client-side telemetry query parameters to a third-party analytics collector.',
    impactExplanation: 'Under DPDP Act 2023 §8(5), Data Fiduciaries must implement reasonable technical safeguards. Leaking unmasked Aadhaar and phone identifiers to external servers carries severe exposure risks and potential regulatory penalties of up to ₹250 Crores.',
    legalRiskScore: 9.6,
    observedEvidence: {
      method: 'GET',
      url: 'https://telemetry-collect.analytics-mesh.com/v1/event?client_id=IN_4491&aadhaar_ref=492019482019&contact_mobile=9876543210&event=step_submit',
      initiatorScript: 'https://paysecure-india.in/static/js/kyc-bundle.chunk.js (Line 412)',
      requestHeaders: {
        'Accept': 'image/avif,image/webp,*/*',
        'Referer': 'https://paysecure-india.in/kyc/identity-step-2',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      responseHeaders: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      },
      sanitizedPayload: '{\n  "event": "kyc_field_completed",\n  "query_params": {\n    "aadhaar_ref": "492019482019",\n    "contact_mobile": "+91 98765 43210",\n    "user_lat": "19.0760",\n    "user_long": "72.8777"\n  }\n}',
      detectedFields: ['aadhaar_number (12 digits)', 'indian_phone_number (+91)', 'user_geo_coordinates']
    },
    remediationSteps: [
      'Implement client-side telemetry sanitization to strip all PII prior to beacon dispatch.',
      'Redact Aadhaar numbers using UIDAI-compliant masking (XXXX-XXXX-XXXX displaying only the last 4 digits).',
      'Route telemetry via a trusted first-party proxy that enforces field-level zero-PII egress filtering.'
    ],
    codeDiff: {
      filePath: 'src/analytics/telemetryTracker.ts',
      language: 'typescript',
      description: 'Filter sensitive KYC identifiers and apply SHA-256 salted pseudonymization before transmitting telemetry beacons.',
      beforeCode: `// VULNERABLE: Direct transmission of user input form fields in analytics beacon
export function trackKycProgress(step: string, formData: Record<string, any>) {
  const params = new URLSearchParams({
    event: 'step_submit',
    step_name: step,
    aadhaar_ref: formData.aadhaarNumber, // Leaks 12-digit UID
    contact_mobile: formData.phoneNumber, // Leaks mobile number
    timestamp: Date.now().toString(),
  });

  const img = new Image();
  img.src = \`https://telemetry-collect.analytics-mesh.com/v1/event?\${params.toString()}\`;
}`,
      afterCode: `// REMEDIATED: Strips PII & complies with DPDP Section 8(5)
import { maskAadhaar, hashIdentifier } from '@/lib/privacyGuard';

export function trackKycProgress(step: string, formData: Record<string, any>) {
  // Never transmit raw personal identifiers to third-party endpoints
  const sanitizedParams = new URLSearchParams({
    event: 'step_submit',
    step_name: step,
    session_pseudonym: hashIdentifier(formData.userId),
    aadhaar_masked_suffix: formData.aadhaarNumber ? maskAadhaar(formData.aadhaarNumber) : '',
    timestamp: Date.now().toString(),
  });

  // Dispatched exclusively via first-party reverse proxy
  navigator.sendBeacon('/api/internal/telemetry', sanitizedParams);
}`
    },
    verificationHistory: [
      {
        id: 'VER-001',
        timestamp: '2026-10-14T09:30:00Z',
        status: 'pending',
        verifiedBy: 'PrivaCraft Automated Sandbox',
        notes: 'Initial finding recorded. Awaiting code patch approval.'
      }
    ]
  },
  {
    id: 'DPDP-HIGH-002',
    title: 'Third-Party Ad Pixel Fires Before Explicit Consent Banner Interaction',
    severity: 'high',
    category: 'tracker_pre_consent',
    status: 'open',
    confidence: 96,
    affectedUrl: 'https://paysecure-india.in/',
    endpoint: 'https://connect.facebook.net/en_US/fbevents.js',
    detectedAt: '2026-10-14T09:12:04Z',
    evidenceAvailable: true,
    dpdpSection: 'Section 6(1) - Unconditional Affirmative Consent Obligation',
    summary: 'Advertising trackers and canvas fingerprinting scripts were loaded on the initial landing page before the user interacted with the DPDP consent notice.',
    impactExplanation: 'DPDP Act §6 mandates that consent must be free, specific, informed, and an unambiguous affirmative action. Loading tracking scripts before the user consents invalidates consent mechanisms and constitutes unauthorized data collection.',
    legalRiskScore: 8.4,
    observedEvidence: {
      method: 'GET',
      url: 'https://connect.facebook.net/en_US/fbevents.js',
      initiatorScript: '<script> tag in HTML <head> (Document parser)',
      requestHeaders: {
        'Accept': '*/*',
        'Referer': 'https://paysecure-india.in/',
        'Sec-Fetch-Dest': 'script'
      },
      responseHeaders: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Set-Cookie': 'datr=...; SameSite=None; Secure'
      },
      sanitizedPayload: '// Pixel loader executed at page load timestamp 1760433124 (Consent state: UNKNOWN/NOT_GIVEN)',
      detectedFields: ['canvas_fingerprint', 'browser_headers', 'client_ip']
    },
    remediationSteps: [
      'Configure Tag Manager / script tags to defer all non-essential third-party scripts until an explicit Opt-In event is emitted by the consent banner.',
      'Ensure cookie blocking is active during initial DOM parsing.'
    ],
    codeDiff: {
      filePath: 'src/components/AnalyticsProvider.tsx',
      language: 'tsx',
      description: 'Wrap marketing pixels in consent guard listeners; prevent script injection until user grants consent.',
      beforeCode: `// VULNERABLE: Scripts injected immediately on component mount
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Executes automatically without waiting for user consent
    window.fbq('init', '109284729104');
    window.fbq('track', 'PageView');
  }, []);

  return <>{children}</>;
}`,
      afterCode: `// REMEDIATED: Adheres to DPDP Section 6 affirmative opt-in
import { useConsentStore } from '@/store/consent';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { consentCategories } = useConsentStore();

  useEffect(() => {
    // Only initialize marketing pixels when explicit user consent is verified
    if (consentCategories.marketing === true) {
      window.fbq('init', '109284729104');
      window.fbq('track', 'PageView');
    }
  }, [consentCategories.marketing]);

  return <>{children}</>;
}`
    }
  },
  {
    id: 'DPDP-HIGH-003',
    title: 'Cross-Border Transfer of Indian User KYC Profile to Restrictive Jurisdiction',
    severity: 'high',
    category: 'unauthorized_export',
    status: 'open',
    confidence: 91,
    affectedUrl: 'https://paysecure-india.in/kyc/verify-address',
    endpoint: 'https://us-east-1.s3.amazonaws.com/customer-kyc-docs-prod/in/',
    detectedAt: '2026-10-14T09:12:12Z',
    evidenceAvailable: true,
    dpdpSection: 'Section 16 - Restriction on Transfer of Personal Data Outside India',
    summary: 'Identity document scans (Voter ID, Electricity Bills) are being uploaded directly to an AWS S3 bucket located in us-east-1 (North Virginia, USA).',
    impactExplanation: 'Section 16 restricts cross-border transfer of specified personal data categories. Critical and sensitive personal data processed by Indian Data Fiduciaries must comply with notified geographical localization regulations.',
    legalRiskScore: 8.8,
    observedEvidence: {
      method: 'PUT',
      url: 'https://us-east-1.s3.amazonaws.com/customer-kyc-docs-prod/in/usr_8821_pan.pdf',
      initiatorScript: 'https://paysecure-india.in/static/js/uploadWorker.js',
      requestHeaders: {
        'Host': 'us-east-1.s3.amazonaws.com',
        'Content-Type': 'application/pdf',
        'x-amz-server-side-encryption': 'AES256'
      },
      responseHeaders: {
        'x-amz-request-id': '7A92FB094A2B',
        'ETag': '"e12fb84209fa84091"'
      },
      sanitizedPayload: '[Binary PDF payload - Aadhaar / Utility Proof document of Indian citizen]',
      detectedFields: ['residential_address', 'full_name', 'government_id_scan']
    },
    remediationSteps: [
      'Reconfigure storage presigned URL generation to target an Indian sovereign cloud region (e.g. AWS ap-south-1 Mumbai / Hyderabad or local data center).',
      'Implement geo-fencing policies in storage bucket IAM.'
    ],
    codeDiff: {
      filePath: 'src/services/storageService.ts',
      language: 'typescript',
      description: 'Switch storage region to India-based sovereign endpoints (ap-south-1).',
      beforeCode: `// VULNERABLE: Direct upload to US bucket location
export const S3_UPLOAD_ENDPOINT = 'https://us-east-1.s3.amazonaws.com/customer-kyc-docs-prod';

export async function uploadKycDocument(file: File, userRef: string) {
  return fetch(\`\${S3_UPLOAD_ENDPOINT}/in/\${userRef}_\${file.name}\`, {
    method: 'PUT',
    body: file,
  });
}`,
      afterCode: `// REMEDIATED: Localized in India cloud region (DPDP Section 16 compliant)
export const S3_UPLOAD_ENDPOINT = 'https://ap-south-1.s3.ap-south-1.amazonaws.com/customer-kyc-india-prod';

export async function uploadKycDocument(file: File, userRef: string) {
  return fetch(\`\${S3_UPLOAD_ENDPOINT}/in/\${userRef}_\${file.name}\`, {
    method: 'PUT',
    headers: { 'x-dpdp-data-locality': 'IN_MUMBAI' },
    body: file,
  });
}`
    }
  },
  {
    id: 'DPDP-MED-004',
    title: 'Unencrypted User Profile & Contact Info Stored in HTML5 localStorage',
    severity: 'medium',
    category: 'insecure_storage',
    status: 'in_review',
    confidence: 94,
    affectedUrl: 'https://paysecure-india.in/dashboard',
    endpoint: 'window.localStorage.getItem("usr_profile")',
    detectedAt: '2026-10-14T09:12:18Z',
    evidenceAvailable: true,
    dpdpSection: 'Section 8(5) - Insecure Client-Side Data Storage',
    summary: 'The web app caches cleartext phone numbers, full names, and bank account last 4 digits in localStorage, exposing it to any XSS or untrusted third-party script.',
    impactExplanation: 'Client storage accessible via window.localStorage has no HTTP-only protections. Any compromised third-party script on the domain can exfiltrate this cached personal data.',
    legalRiskScore: 6.2,
    observedEvidence: {
      method: 'GET',
      url: 'localStorage://paysecure-india.in/usr_profile',
      initiatorScript: 'https://paysecure-india.in/static/js/main.js (Line 189)',
      requestHeaders: {},
      responseHeaders: {},
      sanitizedPayload: '{\n  "name": "Rajesh Kumar Sharma",\n  "phone": "+91 98201 11223",\n  "account_masked": "SBIN0004921 - **** 4491",\n  "session_token": "eyJhbGciOiJIUzI1NiIsIn..."\n}',
      detectedFields: ['full_legal_name', 'phone_number', 'bank_account_hint']
    },
    remediationSteps: [
      'Store sensitive user metadata in memory state (React Context/Zustand) rather than persistent localStorage.',
      'Rely on secure, HttpOnly, SameSite cookies for authentication tokens.'
    ],
    codeDiff: {
      filePath: 'src/utils/userCache.ts',
      language: 'typescript',
      description: 'Migrate plaintext localStorage profile cache to in-memory reactive state.',
      beforeCode: `export function cacheUserProfile(profile: UserProfile) {
  // Exposes sensitive PII to all scripts on origin via localStorage
  window.localStorage.setItem('usr_profile', JSON.stringify(profile));
}`,
      afterCode: `// REMEDIATED: In-memory session store only; no persistent unencrypted storage
import { sessionMemoryStore } from '@/lib/secureMemory';

export function cacheUserProfile(profile: UserProfile) {
  sessionMemoryStore.setProfile(profile);
}`
    }
  },
  {
    id: 'DPDP-MED-005',
    title: 'Deceptive Consent Architecture: Pre-Selected Promotional Checkboxes',
    severity: 'medium',
    category: 'weak_consent_mechanism',
    status: 'open',
    confidence: 89,
    affectedUrl: 'https://paysecure-india.in/signup',
    endpoint: 'https://paysecure-india.in/api/v1/auth/register',
    detectedAt: '2026-10-14T09:12:25Z',
    evidenceAvailable: true,
    dpdpSection: 'Section 6(2) - Prohibition of Consent Bundling and Dark Patterns',
    summary: 'Onboarding form presents pre-checked boxes consenting to third-party telemarketing calls and credit scoring profile sharing.',
    impactExplanation: 'DPDP Act explicitly requires that consent must be given through an affirmative, voluntary act. Pre-ticked checkboxes or deceptive nudges are invalid as affirmative consent under Indian privacy law.',
    legalRiskScore: 5.8,
    observedEvidence: {
      method: 'POST',
      url: 'https://paysecure-india.in/api/v1/auth/register',
      initiatorScript: 'https://paysecure-india.in/signup',
      requestHeaders: { 'Content-Type': 'application/json' },
      responseHeaders: { 'Content-Type': 'application/json' },
      sanitizedPayload: '{\n  "email": "user@example.in",\n  "opt_in_credit_bureau_sharing": true,\n  "opt_in_partner_marketing": true\n}',
      detectedFields: ['pre_ticked_consent_flag']
    },
    remediationSteps: [
      'Uncheck all non-essential consent toggles by default.',
      'Separate service fulfillment consent from marketing partner sharing into distinct, unbundled opt-ins.'
    ]
  },
  {
    id: 'DPDP-LOW-006',
    title: 'Privacy Notice Not Accessible in Scheduled Indian Languages',
    severity: 'low',
    category: 'weak_consent_mechanism',
    status: 'open',
    confidence: 88,
    affectedUrl: 'https://paysecure-india.in/privacy-policy',
    endpoint: 'https://paysecure-india.in/privacy-policy',
    detectedAt: '2026-10-14T09:12:30Z',
    evidenceAvailable: true,
    dpdpSection: 'Section 5(3) - Notice in English or Any Language in the Eighth Schedule',
    summary: 'The privacy policy and consent notice are provided solely in English, with no toggle available for Hindi, Tamil, Telugu, Bengali, or other Eighth Schedule languages.',
    impactExplanation: 'Section 5(3) requires the Data Fiduciary to give data principals the option to access the consent notice in English or any of the 22 languages specified in the Eighth Schedule to the Constitution of India.',
    legalRiskScore: 3.5,
    observedEvidence: {
      method: 'GET',
      url: 'https://paysecure-india.in/privacy-policy',
      initiatorScript: 'Document parser',
      requestHeaders: {},
      responseHeaders: { 'Content-Language': 'en' },
      sanitizedPayload: 'Found 1 language variant (en). 0 8th Schedule Indian languages detected.',
      detectedFields: ['missing_8th_schedule_locales']
    },
    remediationSteps: [
      'Integrate localized consent notices supporting at least Hindi and regional language toggles.',
      'Provide plain-language summaries of data fiduciary contact details and DPO email.'
    ]
  },
  {
    id: 'DPDP-HIGH-007',
    title: 'Broken Object-Level Authorization (BOLA/IDOR) on Customer KYC Profile API',
    severity: 'high',
    category: 'pii_exposure',
    status: 'open',
    confidence: 97,
    affectedUrl: 'https://paysecure-india.in/api/v1/customers/usr_demo_custB/kyc-record',
    endpoint: '/api/v1/customers/{customerId}/kyc-record',
    detectedAt: '2026-10-14T09:12:35Z',
    evidenceAvailable: true,
    dpdpSection: 'Section 8(5) - Reasonable Security Safeguards to Prevent Personal Data Breach',
    summary: 'Endpoint lacks tenant ownership verification. Authenticated user Account A (usr_demo_custA) is permitted to query and receive confidential KYC records and PII belonging to Account B (usr_demo_custB).',
    impactExplanation: 'Broken Object-Level Authorization (BOLA/IDOR) is the #1 API security vulnerability. Permitting cross-tenant access to confidential identity documents, PAN numbers, and masked Aadhaar numbers constitutes an active personal data breach under DPDP Act 2023 §8(5), exposing the Data Fiduciary to statutory investigation and maximum financial penalties.',
    legalRiskScore: 9.2,
    observedEvidence: {
      method: 'GET',
      url: 'https://paysecure-india.in/api/v1/customers/usr_demo_custB/kyc-record',
      initiatorScript: 'API Gateway Route Handler (/api/v1/customers/:customerId/kyc-record)',
      requestHeaders: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfZGVtb19jdXN0QSIsInJvbGUiOiJjdXN0b21lciJ9...',
        'Accept': 'application/json',
        'X-Client-Version': '2.4.1'
      },
      responseHeaders: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Powered-By': 'Express',
        'Access-Control-Allow-Origin': '*'
      },
      sanitizedPayload: '{\n  "customerId": "usr_demo_custB",\n  "fullName": "Priya Patel",\n  "panNumber": "ABCDE1234F",\n  "aadhaarMasked": "XXXX-XXXX-4491",\n  "mobileNumber": "+91 98201 55667",\n  "residentialAddress": "402, Sea Green Heights, Worli, Mumbai 400018",\n  "kycStatus": "VERIFIED"\n}',
      detectedFields: ['pan_card_number', 'masked_aadhaar_ref', 'mobile_number', 'residential_address', 'full_legal_name']
    },
    remediationSteps: [
      'Enforce strict object-level authorization in the route handler: verify req.user.id === req.params.customerId before retrieving records.',
      'Log unauthorized cross-account access attempts to the security audit trail.',
      'Return HTTP 403 Forbidden with zero PII when caller identity mismatches resource owner.'
    ],
    codeDiff: {
      filePath: 'server/controllers/customerKycController.ts',
      language: 'typescript',
      description: 'Enforce object-level ownership check (BOLA safeguard) under DPDP Section 8(5).',
      beforeCode: `// VULNERABLE: Direct database fetch without cross-tenant ownership check
export async function getCustomerKycRecord(req: Request, res: Response) {
  const { customerId } = req.params;
  const authenticatedUserId = req.user.id; // Caller: usr_demo_custA

  // VULNERABILITY: Missing check if authenticatedUserId owns customerId!
  const kycRecord = await db.kycProfiles.findOne({ customerId });
  if (!kycRecord) {
    return res.status(404).json({ error: 'Customer record not found' });
  }

  // Leaks Account B's sensitive KYC data to Account A!
  return res.status(200).json(kycRecord);
}`,
      afterCode: `// REMEDIATED: Strict Object-Level Authorization Guard (DPDP Act §8(5))
import { auditLogAccessViolation } from '@/security/auditLogger';

export async function getCustomerKycRecord(req: Request, res: Response) {
  const { customerId } = req.params;
  const authenticatedUserId = req.user.id;

  // Strict Object-Level Authorization Check
  if (authenticatedUserId !== customerId && !req.user.roles.includes('dpo_admin')) {
    auditLogAccessViolation({
      actor: authenticatedUserId,
      targetResource: customerId,
      violationType: 'DPDP_BOLA_PREVENTED',
      timestamp: new Date().toISOString()
    });
    return res.status(403).json({
      error: 'Forbidden',
      code: 'DPDP_AUTH_OBJECT_MISMATCH',
      message: 'Access Denied: You are not authorized to inspect personal records belonging to other data principals.'
    });
  }

  const kycRecord = await db.kycProfiles.findOne({ customerId });
  return res.status(200).json(kycRecord);
}`
    },
    verificationHistory: [
      {
        id: 'VER-007',
        timestamp: '2026-10-14T09:35:00Z',
        status: 'pending',
        verifiedBy: 'PrivaCraft Automated Sandbox',
        notes: 'BOLA/IDOR vulnerability registered. Pending sandbox authorization verification.'
      }
    ]
  }
];

export const DEMO_SCANS: ScanResult[] = [
  {
    id: 'SCAN-2026-1014-01',
    targetUrl: 'https://paysecure-india.in',
    profile: 'deep_audit',
    initiatedAt: '2026-10-14T09:11:45Z',
    completedAt: '2026-10-14T09:12:42Z',
    durationSeconds: 57,
    status: 'completed',
    riskScore: 78,
    complianceScore: 42,
    consentModeEnabled: true,
    findingsCount: {
      critical: 1,
      high: 2,
      medium: 2,
      low: 1,
      info: 0,
      total: 6,
    },
    findings: DEMO_FINDINGS
  },
  {
    id: 'SCAN-2026-1012-04',
    targetUrl: 'https://apollo-telemed.co.in',
    profile: 'pii_leakage',
    initiatedAt: '2026-10-12T14:20:10Z',
    completedAt: '2026-10-12T14:21:02Z',
    durationSeconds: 52,
    status: 'completed',
    riskScore: 34,
    complianceScore: 79,
    consentModeEnabled: true,
    findingsCount: {
      critical: 0,
      high: 1,
      medium: 1,
      low: 2,
      info: 1,
      total: 5,
    },
    findings: DEMO_FINDINGS.slice(1, 4)
  },
  {
    id: 'SCAN-2026-1008-02',
    targetUrl: 'https://retail-bharat.store',
    profile: 'cookie_tracker',
    initiatedAt: '2026-10-08T11:05:00Z',
    completedAt: '2026-10-08T11:05:44Z',
    durationSeconds: 44,
    status: 'completed',
    riskScore: 52,
    complianceScore: 61,
    consentModeEnabled: false,
    findingsCount: {
      critical: 0,
      high: 1,
      medium: 2,
      low: 1,
      info: 0,
      total: 4,
    },
    findings: DEMO_FINDINGS.slice(1, 5)
  }
];

export const DEMO_PRESET_TARGETS = [
  {
    label: 'PaySecure India (FinTech / KYC)',
    url: 'https://paysecure-india.in',
    description: 'High-volume payment gateway testing for Aadhaar leakage, unconsented pixels, and cross-border data transfer.',
    profile: 'privacy_audit' as const,
  },
  {
    label: 'Apollo Telemed (HealthTech)',
    url: 'https://apollo-telemed.co.in',
    description: 'Patient records & e-prescription portal testing for health data confidentiality and DPDP Section 8 adherence.',
    profile: 'auth_tests' as const,
  },
  {
    label: 'Retail Bharat (Consumer E-Commerce)',
    url: 'https://retail-bharat.store',
    description: 'Shopping checkout flow audit for deceptive dark patterns, cookie consent banners, and tracker scripts.',
    profile: 'quick_scan' as const,
  }
];

export const DEMO_ACTIVITIES = [
  {
    id: 'ACT-01',
    type: 'scan_completed',
    title: 'Audit scan completed for paysecure-india.in',
    description: '6 potential privacy exposures detected across 42 visited endpoints.',
    timestamp: '12 minutes ago',
    icon: 'ShieldAlert',
    severity: 'critical' as const,
  },
  {
    id: 'ACT-02',
    type: 'finding_detected',
    title: 'High-risk PII beacon observed on identity-step-2',
    description: 'Detected unmasked Aadhaar and phone number in query parameter string.',
    timestamp: '28 minutes ago',
    icon: 'AlertTriangle',
    severity: 'critical' as const,
  },
  {
    id: 'ACT-03',
    type: 'fix_verified',
    title: 'Remediation patch validated for apollo-telemed.co.in',
    description: 'Cookie banner script deferral successfully verified in sandbox runner.',
    timestamp: '2 hours ago',
    icon: 'CheckCircle2',
    severity: 'info' as const,
  },
  {
    id: 'ACT-04',
    type: 'policy_update',
    title: 'DPDP 2026 Ruleset synchronization active',
    description: 'Regulatory ruleset updated to reflect the latest DPAI notification guidelines.',
    timestamp: 'Yesterday',
    icon: 'FileText',
    severity: 'info' as const,
  }
];

export const DEFAULT_USER_SETTINGS: UserSettings = {
  organizationName: 'Bharat Privacy Labs Ltd.',
  dpoName: 'Aditi Deshmukh, CISSP',
  dpoEmail: 'dpo@bharatprivacy.in',
  jurisdiction: 'Republic of India (DPDP Act 2023)',
  demoMode: true,
  apiUrl: 'http://127.0.0.1:8000',
  scanRateLimit: 'standard',
  rulesetVersion: 'DPDP-2023.4-IN (Updated Q4 2026)',
  notifications: {
    emailAlerts: true,
    notifyOnCritical: true,
    webhookUrl: 'https://hooks.slack.com/services/T00/B00/DPDPAlerts',
  }
};
