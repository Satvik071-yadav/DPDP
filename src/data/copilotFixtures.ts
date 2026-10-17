import { CopilotStructuredResponse, SanitizedFindingContext } from '@/types/copilot';

const STANDARD_DISCLAIMER = 
  'Statutory Notice: This evaluation explains technical evidence captured in a controlled demonstration environment. It does not constitute formal legal counsel or official regulatory certification under the Digital Personal Data Protection Act, 2023.';

/**
 * Deterministic responses for specific suggested questions and findings.
 */
export const DETERMINISTIC_COPILOT_RESPONSES: Record<
  string, // findingId
  Record<
    string, // questionKey or normalized prompt
    CopilotStructuredResponse
  >
> = {
  'DPDP-HIGH-007': {
    'explain_simple': {
      summary: 'A security check is missing on the customer KYC profile endpoint. A customer can view another person\'s private identity documents simply by changing the ID in the request.',
      whatWeObserved: [
        'Account A (usr_demo_custA) sent a GET request to /api/v1/customers/usr_demo_custB/kyc-record with their own valid session token.',
        'The server responded with HTTP 200 OK containing Account B\'s (Priya Patel) full KYC profile, including PAN card number, masked Aadhaar reference, and residential address.',
        'No object-level ownership validation (tenant boundary check) was executed by the API handler.'
      ],
      whyItMatters: 'Broken Object-Level Authorization (BOLA/IDOR) allows horizontal privilege escalation. Under DPDP Act 2023 Section 8(5), Data Fiduciaries must implement reasonable technical safeguards to protect personal data from unauthorized access or disclosure.',
      whatRemainsUncertain: 'We have confirmed the vulnerability in our controlled test environment. Whether administrative roles (such as compliance auditors) require legitimate cross-account access has not been evaluated.',
      recommendedActions: [
        'Add an authorization check in the route handler to ensure req.user.id matches req.params.customerId before querying the database.',
        'Log all unauthorized cross-account access attempts to the security audit log with an actor timestamp and resource ID.',
        'Return HTTP 403 Forbidden with zero personal data whenever caller identity mismatches.'
      ],
      howToVerify: [
        'Open the Fix & Verify tab for finding DPDP-HIGH-007.',
        'Apply the recommended authorization check code patch in the sandbox.',
        'Run the verification probe: confirm HTTP 403 Forbidden and 0 leaked PII fields.'
      ],
      evidenceReferences: [
        { id: 'EVID-AUTH-001', label: 'GET /api/v1/customers/usr_demo_custB/kyc-record', snippet: 'HTTP 200 OK with Priya Patel KYC Record', sourceType: 'auth_probe' }
      ],
      disclaimer: STANDARD_DISCLAIMER
    },

    'evidence_support': {
      summary: 'The finding is supported by a reproducible test probe demonstrating cross-account personal data retrieval.',
      whatWeObserved: [
        'Caller session: usr_demo_custA (Rajesh Kumar Sharma) with valid Bearer token.',
        'Requested resource: /api/v1/customers/usr_demo_custB/kyc-record (Priya Patel).',
        'Returned payload: PAN number "ABCDE1234F", masked Aadhaar "XXXX-XXXX-4491", mobile "+91 98201 55667", and residential address in Mumbai.',
        'Zero authorization challenge or access denial occurred.'
      ],
      whyItMatters: 'The test proves that the application database returns another customer\'s identity record without verifying whether the requesting user owns the record.',
      whatRemainsUncertain: 'Whether any web application firewall (WAF) or API gateway rules exist in production that were not active during this localized probe.',
      recommendedActions: [
        'Enforce object-level authorization at the application logic layer, not just at the network perimeter.',
        'Audit all other customer profile endpoints (/documents, /bank-details) for identical missing checks.'
      ],
      howToVerify: [
        'Re-run the automated BOLA verification probe in Fix & Verify to confirm reproducible failure before patching.'
      ],
      evidenceReferences: [
        { id: 'EVID-AUTH-001', label: 'HTTP Response Trace', snippet: 'Status: 200 OK | Payload: { customerId: "usr_demo_custB", pan: "ABCDE1234F" }', sourceType: 'auth_probe' }
      ],
      disclaimer: STANDARD_DISCLAIMER
    },

    'what_happens_not_fixed': {
      summary: 'If unresolved, any registered user or attacker can enumerate customer IDs to bulk-scrape the identity documents of all Indian users on the platform.',
      whatWeObserved: [
        'Endpoint accepts sequential or predictable customer IDs in the URL path.',
        'Customer records contain government identity identifiers (PAN, masked Aadhaar) and home addresses.'
      ],
      whyItMatters: 'Mass exfiltration of KYC records constitutes a reportable personal data breach under DPDP Act Section 8(6). The Data Protection Board of India may impose severe financial penalties under the Schedule (up to ₹250 Crores) for failure to take reasonable security safeguards under Section 8(5).',
      whatRemainsUncertain: 'Whether existing rate limits would slow down automated enumeration attacks in a live production deployment.',
      recommendedActions: [
        'Treat this finding as a Priority 1 (High) security remediation item.',
        'Implement an authorization middleware guard on all /api/v1/customers/* routes.'
      ],
      howToVerify: [
        'Verify with Fix & Verify sandbox test suite: test case TC-BOLA-AUTH-001.'
      ],
      evidenceReferences: [
        { id: 'EVID-AUTH-001', label: 'Target Route', snippet: '/api/v1/customers/{customerId}/kyc-record', sourceType: 'network_packet' }
      ],
      disclaimer: STANDARD_DISCLAIMER
    },

    'how_developer_fix': {
      summary: 'Developers must add an ownership check verifying authenticated user ID equals requested resource customer ID before database lookup.',
      whatWeObserved: [
        'The current controller directly queries db.kycProfiles.findOne({ customerId }) without comparing authenticatedUserId.',
      ],
      whyItMatters: 'Authorization checks must be performed in code prior to record lookup and serialization.',
      whatRemainsUncertain: 'Whether administrative customer support staff need delegated access via explicit RBAC roles.',
      recommendedActions: [
        'Check: if (req.user.id !== customerId && !req.user.roles.includes("dpo_admin")) return res.status(403).json(...)',
        'Audit log the rejected request with actor ID and target ID for DPDP incident tracking.',
        'Ensure 403 responses return zero personal data.'
      ],
      howToVerify: [
        'Inspect the before/after code diff in Fix & Verify.',
        'Deploy the patch to the sandbox and run the automated test probe.'
      ],
      evidenceReferences: [
        { id: 'EVID-CODE-007', label: 'customerKycController.ts', snippet: 'if (authenticatedUserId !== customerId) return res.status(403)', sourceType: 'auth_probe' }
      ],
      disclaimer: STANDARD_DISCLAIMER
    },

    'how_verify_fix': {
      summary: 'Execute the deterministic verification probe in the Fix & Verify workbench under both unpatched and patched conditions.',
      whatWeObserved: [
        'Unpatched probe returns HTTP 200 with 5 PII fields exposed (Outcome: FAIL).',
        'Patched probe returns HTTP 403 Forbidden with 0 PII fields exposed (Outcome: PASS).'
      ],
      whyItMatters: 'Statutory compliance cannot be assumed; it must be empirically validated against reproducible test cases.',
      whatRemainsUncertain: 'Whether client-side single page app (SPA) handles the HTTP 403 error gracefully without crashing.',
      recommendedActions: [
        'Navigate to Fix & Verify tab, select DPDP-HIGH-007.',
        'Click "Run Verification Probe (Patched)" to execute the test suite.',
        'Confirm the audit record is written to local verification history.'
      ],
      howToVerify: [
        'Test both the pass path and the failure path (using the "Test Failure Path" button).'
      ],
      evidenceReferences: [
        { id: 'EVID-VER-007', label: 'Test Case TC-BOLA-AUTH-001', snippet: 'Assert: res.status === 403 && res.body.leakedPii.length === 0', sourceType: 'auth_probe' }
      ],
      disclaimer: STANDARD_DISCLAIMER
    },

    'what_business_owner_do': {
      summary: 'Business owners should instruct the engineering lead to apply the authorization fix immediately and verify that customer records are protected.',
      whatWeObserved: [
        'A technical access-control gap exists on the customer verification portal.',
      ],
      whyItMatters: 'Under the DPDP Act 2023, the Data Fiduciary (the business entity) bears legal accountability for data breaches, not third-party developers or vendors.',
      whatRemainsUncertain: 'Whether any historical unauthorized access has occurred in production logs prior to this scan.',
      recommendedActions: [
        'Require the development team to sign off on the Fix & Verify audit pass.',
        'Review application access logs for past unexpected GET requests to /customers/*/kyc-record from mismatched session tokens.',
        'Record the remediation in your internal DPDP compliance register.'
      ],
      howToVerify: [
        'Request the compliance audit export certificate from the Scan History tab.'
      ],
      evidenceReferences: [
        { id: 'EVID-STAT-007', label: 'DPDP Act §8(5)', snippet: 'Mandatory reasonable security safeguards', sourceType: 'auth_probe' }
      ],
      disclaimer: STANDARD_DISCLAIMER
    }
  },

  'DPDP-CRIT-001': {
    'explain_simple': {
      summary: 'When users enter their 12-digit Aadhaar number or phone number during onboarding, the web app accidentally transmits those unmasked numbers to an external third-party analytics company.',
      whatWeObserved: [
        'Outgoing GET request observed to telemetry-collect.analytics-mesh.com/v1/event.',
        'Query string contained: aadhaar_ref=492019482019 and contact_mobile=9876543210 in cleartext.',
        'Transmitted without UIDAI-compliant masking or user knowledge.'
      ],
      whyItMatters: 'Aadhaar numbers and mobile numbers are protected personal data. Under DPDP Act §8(5) and Aadhaar regulations, unmasked UID transmission to unauthorized third parties is strictly prohibited.',
      whatRemainsUncertain: 'Whether Analytics Mesh permanently stores these query parameters in their log files or automatically discards them.',
      recommendedActions: [
        'Sanitize client-side telemetry payloads before dispatch.',
        'Apply UIDAI masking (XXXX-XXXX-1234 displaying only the last 4 digits).',
        'Route analytics through a first-party proxy that filters all personal data.'
      ],
      howToVerify: [
        'Use Fix & Verify workbench for DPDP-CRIT-001: verify 0 unmasked identifiers in beacon egress.'
      ],
      evidenceReferences: [
        { id: 'EVID-NET-001', label: 'Telemetry Query Beacon', snippet: 'GET /v1/event?aadhaar_ref=492019482019', sourceType: 'network_packet' }
      ],
      disclaimer: STANDARD_DISCLAIMER
    },

    'evidence_support': {
      summary: 'Network inspection intercepted an HTTP image beacon containing plaintext Aadhaar and mobile parameters.',
      whatWeObserved: [
        'URL: https://telemetry-collect.analytics-mesh.com/v1/event?client_id=IN_4491&aadhaar_ref=492019482019&contact_mobile=9876543210',
        'Initiator: kyc-bundle.chunk.js (Line 412).',
        'Identified fields: aadhaar_number (12 digits), indian_phone_number (+91).'
      ],
      whyItMatters: 'Third-party analytics networks are not authorized Aadhaar repositories.',
      whatRemainsUncertain: 'Whether client browsers with ad blockers installed had this beacon blocked automatically.',
      recommendedActions: [
        'Remove formData.aadhaarNumber and formData.phoneNumber from the analytics payload bundle.'
      ],
      howToVerify: [
        'Re-test in Fix & Verify sandbox.'
      ],
      evidenceReferences: [
        { id: 'EVID-NET-001', label: 'Packet Trace', snippet: 'aadhaar_ref=492019482019&contact_mobile=9876543210', sourceType: 'network_packet' }
      ],
      disclaimer: STANDARD_DISCLAIMER
    }
  }
};

/**
 * Generate a dynamic evidence-grounded response for questions when no exact fixture matches.
 */
export function generateDynamicCopilotResponse(
  finding: SanitizedFindingContext,
  userQuestion: string
): CopilotStructuredResponse {
  const q = userQuestion.toLowerCase();

  if (q.includes('simple') || q.includes('explain') || q.includes('understand')) {
    return {
      summary: `In plain terms: ${finding.title}. ${finding.category.replace('_', ' ')} was detected on ${finding.endpoint || finding.affectedUrl}.`,
      whatWeObserved: [
        `Scanner identified ${finding.observedEvidence.method} interaction with ${finding.observedEvidence.url}.`,
        `Observed data fields include: ${finding.observedEvidence.detectedFields.join(', ') || 'unspecified parameters'}.`,
        `Detection confidence is rated at ${finding.confidence}% based on reproducible evidence.`
      ],
      whyItMatters: `This observation relates to DPDP Act 2023 ${finding.dpdpSection}. Organizations are responsible for ensuring personal data is handled lawfully, transparently, and securely.`,
      whatRemainsUncertain: `We observed this interaction in a scan snapshot. Whether user consent was granted in a separate session or whether backend processing agreements exist cannot be verified from client-side network traffic alone.`,
      recommendedActions: finding.remediationSteps.slice(0, 3),
      howToVerify: [
        `Review the code diff provided in the Fix & Verify workbench for ${finding.findingId}.`,
        `Run the automated sandbox re-test probe to confirm the issue is resolved.`
      ],
      evidenceReferences: [
        { id: `EVID-${finding.findingId}`, label: finding.endpoint, snippet: finding.observedEvidence.sanitizedPayload.slice(0, 80) + '...', sourceType: 'network_packet' }
      ],
      disclaimer: STANDARD_DISCLAIMER
    };
  }

  if (q.includes('evidence') || q.includes('support') || q.includes('proof')) {
    return {
      summary: `The evidence consists of an observed HTTP ${finding.observedEvidence.method} request to ${finding.endpoint}.`,
      whatWeObserved: [
        `Target endpoint: ${finding.observedEvidence.url}`,
        `Initiator script: ${finding.observedEvidence.initiatorScript || 'Direct DOM parser'}`,
        `Detected fields: ${finding.observedEvidence.detectedFields.join(', ')}`
      ],
      whyItMatters: `Observed technical facts serve as the baseline for evaluating compliance against statutory requirements.`,
      whatRemainsUncertain: `Full request body payload was redacted to prevent sensitive data exposure in compliance logs.`,
      recommendedActions: [
        `Inspect the sanitized payload snippet in the Findings Explorer detail drawer.`,
        `Verify whether this endpoint is operated by your organization or a third party.`
      ],
      howToVerify: [
        `Open Findings Explorer and view forensic packet traces for finding ${finding.findingId}.`
      ],
      evidenceReferences: [
        { id: `EVID-${finding.findingId}`, label: finding.observedEvidence.url, snippet: finding.observedEvidence.sanitizedPayload.slice(0, 90), sourceType: 'network_packet' }
      ],
      disclaimer: STANDARD_DISCLAIMER
    };
  }

  if (q.includes('fix') || q.includes('developer') || q.includes('code')) {
    return {
      summary: `Developers should follow the targeted remediation steps outlined for ${finding.findingId}.`,
      whatWeObserved: [
        `Current implementation triggers: ${finding.title}`,
        `Affected component: ${finding.endpoint || finding.affectedUrl}`
      ],
      whyItMatters: `Proactive code-level remediation eliminates the statutory risk at the source.`,
      whatRemainsUncertain: `Whether additional endpoints across your microservice architecture share the same code pattern.`,
      recommendedActions: finding.remediationSteps,
      howToVerify: [
        `Apply the recommended code patch in your local environment.`,
        `Use the Fix & Verify workbench to run the automated sandbox test probe.`
      ],
      evidenceReferences: [
        { id: `EVID-FIX-${finding.findingId}`, label: 'Remediation Steps', snippet: finding.remediationSteps[0], sourceType: 'dom_script' }
      ],
      disclaimer: STANDARD_DISCLAIMER
    };
  }

  // Default structured response
  return {
    summary: `Analysis of ${finding.findingId}: ${finding.title}.`,
    whatWeObserved: [
      `Recorded on target route: ${finding.affectedUrl}`,
      `Observed data categories: ${finding.observedEvidence.detectedFields.join(', ') || 'Standard traffic'}`,
      `Statutory reference: ${finding.dpdpSection}`
    ],
    whyItMatters: `Under the Digital Personal Data Protection Act, 2023, data fiduciaries must satisfy explicit consent and security safeguard standards.`,
    whatRemainsUncertain: `The business context and legitimate processing necessity must be confirmed by your legal or compliance team.`,
    recommendedActions: finding.remediationSteps,
    howToVerify: [
      `Navigate to the Fix & Verify tab to test the remediation diff in a controlled sandbox.`
    ],
    evidenceReferences: [
      { id: `EVID-${finding.findingId}`, label: finding.endpoint, snippet: finding.observedEvidence.sanitizedPayload.slice(0, 80), sourceType: 'network_packet' }
    ],
    disclaimer: STANDARD_DISCLAIMER
  };
}
