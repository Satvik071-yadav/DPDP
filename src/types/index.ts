export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingStatus = 'open' | 'in_review' | 'verified_fix' | 'false_positive';

export type FindingCategory = 
  | 'pii_exposure' 
  | 'tracker_pre_consent' 
  | 'unauthorized_export' 
  | 'insecure_storage' 
  | 'weak_consent_mechanism' 
  | 'children_data';

export type ScanProfile = 
  | 'quick_scan' 
  | 'privacy_audit' 
  | 'auth_tests' 
  | 'deep_audit' 
  | 'cookie_tracker' 
  | 'pii_leakage' 
  | 'consent_bypass';

export type ScanStage = 
  | 'queued'
  | 'preparing_env' 
  | 'checking_endpoints' 
  | 'running_auth_tests' 
  | 'inspecting_network' 
  | 'preparing_evidence' 
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ScanStatusResponse {
  scanId: string;
  id?: string;
  targetUrl?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  stage?: ScanStage | string;
  progress: number;
  log?: string;
  logs?: string[];
  complianceScore?: number;
  findingsCount?: number;
  errorMessage?: string;
  failureReason?: string;
  initiatedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface ScanProgressEvent {
  stage: ScanStage;
  progress: number;
  log: string;
  newFinding?: Finding;
}

export interface CodeDiff {
  filePath: string;
  language: string;
  beforeCode: string;
  afterCode: string;
  description: string;
}

export interface ObservedEvidence {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'BEACON';
  url: string;
  initiatorScript?: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  sanitizedPayload: string;
  detectedFields: string[];
}

export interface VerificationHistoryItem {
  id: string;
  timestamp: string;
  status: 'passed' | 'failed' | 'pending';
  verifiedBy: string;
  notes: string;
}

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  category: FindingCategory;
  status: FindingStatus;
  confidence: number; // 0 - 100%
  affectedUrl: string;
  endpoint: string;
  detectedAt: string;
  evidenceAvailable: boolean;
  scanId?: string;
  dpdpSection: string; // e.g. "Section 6 (Consent)", "Section 8 (Data Fiduciary Obligations)"
  summary: string;
  description?: string;
  impactExplanation: string;
  legalRiskScore: number; // 1-10
  observedEvidence: ObservedEvidence;
  remediationSteps: string[];
  codeDiff?: CodeDiff;
  verificationHistory?: VerificationHistoryItem[];
  isDemoFixture?: boolean;
}

export interface ScanResult {
  id: string;
  targetUrl: string;
  profile: ScanProfile;
  initiatedAt: string;
  completedAt?: string;
  durationSeconds: number;
  status: 'completed' | 'in_progress' | 'failed';
  riskScore: number; // 0 - 100 (higher = worse risk)
  complianceScore: number; // 0 - 100 (higher = more compliant)
  findingsCount: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  consentModeEnabled: boolean;
  findings: Finding[];
  isDemo?: boolean;
  notes?: string;
}

export type FlowNodeType = 'website' | 'api_endpoint' | 'third_party';

export interface BrowserObservation {
  id: string;
  scanId: string;
  timestamp: string;
  url: string;
  domain: string;
  method: string;
  statusCode?: number | null;
  isFailed: boolean;
  failureReason?: string | null;
  resourceType: string;
  classification: 'first_party' | 'third_party' | string;
  consentState: 'before_consent' | 'consent_accepted' | 'consent_rejected' | string;
  headersRedacted?: Record<string, string>;
  provenance?: string;
}

export interface ConsentConnectionDiff {
  url: string;
  domain: string;
  method: string;
  classification: string;
  resourceType: string;
  statusInAccepted?: number | null;
  statusInRejected?: number | null;
  evidenceObservationIds: string[];
}

export interface ConsentComparisonSummary {
  scanId: string;
  targetUrl: string;
  observedInBoth: ConsentConnectionDiff[];
  observedOnlyInAccepted: ConsentConnectionDiff[];
  observedOnlyInRejected: ConsentConnectionDiff[];
  summaryText: string;
}

export interface PrivacyFlowNodeData extends Record<string, unknown> {
  id: string;
  label: string;
  domain: string;
  nodeType: FlowNodeType;
  classification: 'first_party' | 'third_party' | string;
  categoryLabel: string;
  endpointPath?: string;
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | string;
  observedDataCategory?: string;
  jurisdiction: string;
  piiItems: string[];
  riskLevel: Severity;
  observedRequestsCount: number;
  description: string;
  associatedFindingIds?: string[];
  inferredCategory?: string;
  evidenceObservationIds?: string[];
  isSynthetic?: boolean;
  failedRequestsCount?: number;
  statusCode?: number | null;
  isDimmed?: boolean;
  isHighlighted?: boolean;
  isSuppressedInCurrentConsent?: boolean;
}

export interface PrivacyFlowEdgeData extends Record<string, unknown> {
  id: string;
  source: string;
  target: string;
  label: string;
  httpMethod?: string;
  endpointPath?: string;
  timestamp: string;
  consentStateObserved: 'consent_rejected' | 'consent_accepted' | 'before_consent' | string;
  presence: {
    inConsentRejected: boolean;
    inConsentAccepted: boolean;
    diffStatus?: 'both' | 'accepted_only' | 'rejected_only' | 'blocked_by_rejection' | 'persists_despite_rejection';
  };
  evidenceSource: string;
  redactedMetadata: {
    headers: Record<string, string>;
    queryParams?: Record<string, string>;
    payloadSummary: string;
  };
  purposeContext: string;
  isStatutoryViolation: boolean;
  statutoryNote?: string;
  associatedFindingIds?: string[];
  evidenceObservationIds?: string[];
  targetUrl?: string;
  statusCode?: number | null;
  isFailed?: boolean;
  failureReason?: string | null;
  resourceType?: string;
  isSynthetic?: boolean;
}

export interface PrivacyFlowGraph {
  scanId: string;
  targetDomain: string;
  targetUrl: string;
  nodes: PrivacyFlowNodeData[];
  edges: PrivacyFlowEdgeData[];
  isSynthetic?: boolean;
}

export type ConsentSessionMode = 'consent_rejected' | 'consent_accepted';

export interface ConsentComparisonState {
  mode: ConsentSessionMode;
  description: string;
}

export interface VerificationSession {
  findingId: string;
  stage: 'inspect' | 'patch_ready' | 'verifying' | 'verified_passed';
  progress: number;
  beforeMetrics: {
    leakedFields: string[];
    requestCount: number;
    unconsentedTrackers: number;
  };
  afterMetrics: {
    leakedFields: string[];
    requestCount: number;
    unconsentedTrackers: number;
  };
  log: string[];
}

export interface UserSettings {
  organizationName: string;
  dpoName: string;
  dpoEmail: string;
  jurisdiction: string;
  demoMode: boolean;
  apiUrl: string;
  scanRateLimit: 'conservative' | 'standard' | 'aggressive';
  rulesetVersion: string;
  notifications: {
    emailAlerts: boolean;
    notifyOnCritical: boolean;
    webhookUrl: string;
  };
}

export type VerificationOutcome = 'PASS' | 'FAIL';

export interface VerificationProbeRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  callerId: string;
  callerName: string;
  targetResourceId: string;
  description: string;
}

export interface VerificationProbeResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: Record<string, any> | string;
  durationMs: number;
  leakedPiiFields: string[];
}

export interface VerificationProbeResult {
  testCaseId: string;
  findingId: string;
  timestamp: string;
  isPatched: boolean;
  outcome: VerificationOutcome;
  request: VerificationProbeRequest;
  response: VerificationProbeResponse;
  explanation: string;
  summary: string;
  complianceDelta: {
    previousComplianceScore: number;
    newComplianceScore: number;
    statutoryRiskReductionPercent: number;
  };
}

export interface AuditHistoryRecord {
  id: string;
  findingId: string;
  findingTitle: string;
  testCaseId: string;
  timestamp: string;
  result: VerificationOutcome;
  remediationStatus: FindingStatus;
  isPatched: boolean;
  evidenceSummary: string;
  targetEndpoint: string;
  statusCode: number;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'success';
  link?: string;
  isSynthetic?: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
}

export interface AuthTokenResponse {
  accessToken: string;
  tokenType: string;
  user: UserProfile;
}

// --- Multi-Tenant SaaS, Domain Verification & Subscription Types ---

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
  role?: 'owner' | 'admin' | 'auditor' | 'member';
}

export interface OrganizationMember {
  id: string;
  userId: string;
  username: string;
  email: string;
  fullName?: string;
  role: 'owner' | 'admin' | 'auditor' | 'member';
  joinedAt: string;
}

export type VerificationMethod = 'dns_txt' | 'http_file';
export type VerificationStatus = 'pending' | 'verified' | 'failed' | 'expired';

export interface Website {
  id: string;
  organizationId: string;
  hostname: string;
  verificationStatus: VerificationStatus;
  verificationMethod: VerificationMethod;
  verificationToken?: string;
  tokenExpiresAt?: string;
  dnsTxtHost?: string;
  dnsTxtExpectedValue?: string;
  httpFilePath?: string;
  httpExpectedContent?: string;
  verificationAttempts?: number;
  lastVerificationAttempt?: string;
  verifiedAt?: string;
  lastScannedAt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface VerifyWebsiteResult {
  success: boolean;
  verificationStatus: VerificationStatus;
  message: string;
  verifiedAt?: string;
  diagnostic?: string;
}

export interface PlanFeature {
  code: string;
  name: string;
  description: string;
}

export interface PlanTier {
  id: 'starter' | 'growth' | 'business';
  name: string;
  tagline: string;
  priceInrMonth: number;
  priceInrMonthly?: number;
  priceInrAnnual: number;
  priceInrAnnualMonthlyEquivalent?: number;
  scansPerMonth: number;
  maxWebsites: number;
  maxMembers: number;
  dataRetentionDays: number;
  features: string[];
  isPopular?: boolean;
}

export interface PlanRecommendation {
  recommendedPlan: 'starter' | 'growth' | 'business';
  recommendedPlanName: string;
  reasoning: string[];
  summary: string;
  answersGiven: Record<string, string>;
}

export interface SubscriptionOverview {
  organizationId: string;
  plan: PlanTier;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  scansUsed: number;
  scansLimit: number;
  scansRemaining: number;
  websitesCount: number;
  websitesLimit: number;
  membersCount: number;
  membersLimit: number;
  dataRetentionDays: number;
  isDowngradePending?: boolean;
}
