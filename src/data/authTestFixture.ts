import { VerificationProbeResult } from '@/types';

export interface SyntheticCustomerAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  sessionToken: string;
}

export interface SyntheticCustomerKycRecord {
  customerId: string;
  fullName: string;
  panNumber: string;
  aadhaarMasked: string;
  mobileNumber: string;
  residentialAddress: string;
  kycStatus: 'VERIFIED' | 'PENDING' | 'REJECTED';
  linkedBank: string;
  dpdpConsentId: string;
  consentTimestamp: string;
}

// Synthetic Account A: The Authenticated Caller (Rajesh Kumar Sharma)
export const SYNTHETIC_ACCOUNT_A: SyntheticCustomerAccount = {
  id: 'usr_demo_custA',
  name: 'Rajesh Kumar Sharma',
  email: 'rajesh.sharma@fictional-mail.in',
  role: 'customer',
  sessionToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfZGVtb19jdXN0QSIsInJvbGUiOiJjdXN0b21lciIsImlhdCI6MTc2MDQzMzA4MH0.demo_sig_rajesh'
};

// Synthetic Account B: The Target Customer (Priya Patel) whose confidential PII must be protected
export const SYNTHETIC_ACCOUNT_B: SyntheticCustomerAccount = {
  id: 'usr_demo_custB',
  name: 'Priya Patel',
  email: 'priya.patel@fictional-domain.in',
  role: 'customer',
  sessionToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfZGVtb19jdXN0QiIsInJvbGUiOiJjdXN0b21lciIsImlhdCI6MTc2MDQzMzA4MH0.demo_sig_priya'
};

export const SYNTHETIC_KYC_RECORD_B: SyntheticCustomerKycRecord = {
  customerId: 'usr_demo_custB',
  fullName: 'Priya Patel',
  panNumber: 'ABCDE1234F',
  aadhaarMasked: 'XXXX-XXXX-4491',
  mobileNumber: '+91 98201 55667',
  residentialAddress: '402, Sea Green Heights, Worli, Mumbai, Maharashtra 400018',
  kycStatus: 'VERIFIED',
  linkedBank: 'HDFC Bank - A/C ending 8812',
  dpdpConsentId: 'CONSENT-IN-2026-90412',
  consentTimestamp: '2026-09-15T11:45:00Z'
};

/**
 * Deterministic BOLA/IDOR test probe runner.
 * Simulates Account A attempting to fetch Account B's KYC record.
 */
export function runBolaVerificationProbe(isPatched: boolean): VerificationProbeResult {
  const timestamp = new Date().toISOString();
  const testCaseId = 'TC-BOLA-AUTH-001';
  const findingId = 'DPDP-HIGH-007';

  const request = {
    method: 'GET',
    url: 'https://paysecure-india.in/api/v1/customers/usr_demo_custB/kyc-record',
    headers: {
      'Authorization': SYNTHETIC_ACCOUNT_A.sessionToken,
      'Accept': 'application/json',
      'X-Request-Source': 'dpdp-sandbox-automated-verifier'
    },
    callerId: SYNTHETIC_ACCOUNT_A.id,
    callerName: SYNTHETIC_ACCOUNT_A.name,
    targetResourceId: SYNTHETIC_ACCOUNT_B.id,
    description: `Account A (${SYNTHETIC_ACCOUNT_A.name}) requests confidential record of Account B (${SYNTHETIC_ACCOUNT_B.name})`
  };

  if (!isPatched) {
    // Unpatched: Broken Object-Level Authorization (BOLA/IDOR)
    // Server returns Account B's personal data to Account A!
    return {
      testCaseId,
      findingId,
      timestamp,
      isPatched: false,
      outcome: 'FAIL',
      request,
      response: {
        statusCode: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Powered-By': 'Express',
          'Access-Control-Allow-Origin': '*'
        },
        body: {
          ...SYNTHETIC_KYC_RECORD_B
        },
        durationMs: 84,
        leakedPiiFields: ['panNumber', 'aadhaarMasked', 'mobileNumber', 'residentialAddress', 'fullName']
      },
      explanation: 'BOLA/IDOR vulnerability confirmed: Account A (usr_demo_custA) successfully retrieved the confidential KYC record of Account B (usr_demo_custB) without authorization. This violates DPDP Act §8(5) statutory safeguards.',
      summary: 'Security Probe FAILED: Cross-tenant data isolation broken. 5 personal data fields exposed.',
      complianceDelta: {
        previousComplianceScore: 42,
        newComplianceScore: 42,
        statutoryRiskReductionPercent: 0
      }
    };
  }

  // Patched: Object-level authorization guard intercepts unauthorized tenant request
  return {
    testCaseId,
    findingId,
    timestamp,
    isPatched: true,
    outcome: 'PASS',
    request,
    response: {
      statusCode: 403,
      statusText: 'Forbidden',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-DPDP-Guard-Enforced': 'true',
        'X-Content-Type-Options': 'nosniff'
      },
      body: {
        error: 'Forbidden',
        code: 'DPDP_AUTH_OBJECT_MISMATCH',
        message: "Access Denied: Principal 'usr_demo_custA' is not authorized to access customer record 'usr_demo_custB'. Incident logged to DPDP audit trail.",
        incidentRef: 'INC-DPDP-2026-8819',
        timestamp
      },
      durationMs: 42,
      leakedPiiFields: []
    },
    explanation: 'Object-level authorization safeguard confirmed: Cross-tenant access attempt by Account A to Account B was intercepted and rejected with HTTP 403 Forbidden. Zero personal data leaked.',
    summary: 'Security Probe PASSED: Tenant data boundary strictly enforced. Zero personal data leaked.',
    complianceDelta: {
      previousComplianceScore: 42,
      newComplianceScore: 96,
      statutoryRiskReductionPercent: 54
    }
  };
}

/**
 * Universal deterministic probe runner that dispatches for any finding ID.
 */
export function executeDeterministicProbe(findingId: string, isPatched: boolean): VerificationProbeResult {
  if (findingId === 'DPDP-HIGH-007') {
    return runBolaVerificationProbe(isPatched);
  }

  const timestamp = new Date().toISOString();

  if (findingId === 'DPDP-CRIT-001') {
    const testCaseId = 'TC-PII-LEAK-001';
    const request = {
      method: 'GET',
      url: isPatched 
        ? 'https://paysecure-india.in/api/internal/telemetry'
        : 'https://telemetry-collect.analytics-mesh.com/v1/event?aadhaar_ref=492019482019&contact_mobile=9876543210',
      headers: {
        'Accept': isPatched ? '*/*' : 'image/*',
        'X-Request-Source': 'dpdp-sandbox-verifier'
      },
      callerId: 'usr_demo_custA',
      callerName: 'Rajesh Kumar Sharma',
      targetResourceId: 'telemetry_stream',
      description: 'Audit telemetry beacon transmission for unmasked Aadhaar UID and phone numbers'
    };

    if (!isPatched) {
      return {
        testCaseId,
        findingId,
        timestamp,
        isPatched: false,
        outcome: 'FAIL',
        request,
        response: {
          statusCode: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'image/gif' },
          body: { error: null, query: { aadhaar_ref: '492019482019', contact_mobile: '+91 98765 43210' } },
          durationMs: 65,
          leakedPiiFields: ['aadhaar_number (12 digits)', 'indian_phone_number (+91)']
        },
        explanation: 'Plaintext Aadhaar and phone number transmitted in external query parameters. Violates DPDP Act §8(5).',
        summary: 'Security Probe FAILED: 2 sensitive PII identifiers leaked to third-party host.',
        complianceDelta: {
          previousComplianceScore: 42,
          newComplianceScore: 42,
          statutoryRiskReductionPercent: 0
        }
      };
    }

    return {
      testCaseId,
      findingId,
      timestamp,
      isPatched: true,
      outcome: 'PASS',
      request,
      response: {
        statusCode: 204,
        statusText: 'No Content',
        headers: { 'X-DPDP-Sanitized': 'true' },
        body: { status: 'sanitized', piiFiltered: true, aadhaarMasked: 'XXXX-XXXX-2019' },
        durationMs: 38,
        leakedPiiFields: []
      },
      explanation: 'Aadhaar masking and telemetry sanitization verified: Zero unmasked personal identifiers transmitted outside first-party domain.',
      summary: 'Security Probe PASSED: UIDAI-compliant masking and proxy filtering confirmed.',
      complianceDelta: {
        previousComplianceScore: 42,
        newComplianceScore: 96,
        statutoryRiskReductionPercent: 54
      }
    };
  }

  // Fallback for any other finding
  return {
    testCaseId: `TC-${findingId.replace(/[^A-Za-z0-9]/g, '')}`,
    findingId,
    timestamp,
    isPatched,
    outcome: isPatched ? 'PASS' : 'FAIL',
    request: {
      method: 'GET',
      url: `https://paysecure-india.in/api/v1/audit/${findingId.toLowerCase()}`,
      headers: { 'X-Audit-Sandbox': 'true' },
      callerId: 'usr_demo_custA',
      callerName: 'Rajesh Kumar Sharma',
      targetResourceId: findingId,
      description: `Targeted compliance probe for finding ${findingId}`
    },
    response: {
      statusCode: isPatched ? 200 : 400,
      statusText: isPatched ? 'OK - Verified' : 'Bad Request - Compliance Failure',
      headers: { 'Content-Type': 'application/json' },
      body: isPatched 
        ? { status: 'COMPLIANT', message: 'Remediation patch validated against DPDP test suite.' }
        : { status: 'VIOLATION', message: 'Simulated compliance rule violation detected.' },
      durationMs: 45,
      leakedPiiFields: isPatched ? [] : ['simulated_personal_identifier']
    },
    explanation: isPatched 
      ? 'Remediation successfully verified. Compliance requirements satisfied.'
      : 'Unpatched vulnerability detected. Security requirement failed.',
    summary: isPatched 
      ? 'Security Probe PASSED: Patch confirmed compliant.'
      : 'Security Probe FAILED: Vulnerability reproduced.',
    complianceDelta: {
      previousComplianceScore: 42,
      newComplianceScore: isPatched ? 96 : 42,
      statutoryRiskReductionPercent: isPatched ? 54 : 0
    }
  };
}
