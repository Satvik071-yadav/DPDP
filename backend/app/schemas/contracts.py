from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# --- Evidence Schemas ---
class ObservedEvidenceSchema(BaseModel):
    method: str
    url: str
    initiatorScript: Optional[str] = None
    requestHeaders: Dict[str, str] = Field(default_factory=dict)
    responseHeaders: Dict[str, str] = Field(default_factory=dict)
    sanitizedPayload: str = ""
    detectedFields: List[str] = Field(default_factory=list)


class CodeDiffSchema(BaseModel):
    filePath: str
    language: str
    beforeCode: str
    afterCode: str
    description: str


class VerificationHistoryItemSchema(BaseModel):
    id: str
    timestamp: str
    status: str
    verifiedBy: str
    notes: str


# --- Finding Schemas ---
class FindingSchema(BaseModel):
    id: str
    title: str
    severity: str
    category: str
    status: str
    confidence: int
    affectedUrl: str
    endpoint: str
    detectedAt: str
    evidenceAvailable: bool = True
    scanId: Optional[str] = None
    dpdpSection: str
    summary: str
    description: Optional[str] = None
    impactExplanation: str
    legalRiskScore: float
    observedEvidence: ObservedEvidenceSchema
    remediationSteps: List[str] = Field(default_factory=list)
    codeDiff: Optional[CodeDiffSchema] = None
    verificationHistory: Optional[List[VerificationHistoryItemSchema]] = Field(default_factory=list)
    isDemo: bool = True


# --- Scan Schemas ---
class FindingsCountSchema(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0
    total: int = 0


class CreateScanRequest(BaseModel):
    targetUrl: str
    profile: str = "privacy_audit"
    consentModeEnabled: bool = True
    asyncMode: Optional[bool] = False
    organizationId: Optional[str] = None
    websiteId: Optional[str] = None


class ScanResultSchema(BaseModel):
    id: str
    targetUrl: str
    profile: str
    initiatedAt: str
    completedAt: Optional[str] = None
    durationSeconds: int
    status: str
    riskScore: int
    complianceScore: int
    findingsCount: FindingsCountSchema
    consentModeEnabled: bool
    findings: List[FindingSchema] = Field(default_factory=list)
    isDemo: bool = True
    errorMessage: Optional[str] = None
    provenance: Optional[str] = None
    progressStage: Optional[str] = "completed"
    progressPercent: Optional[int] = 100
    logMessage: Optional[str] = None
    organizationId: Optional[str] = None
    websiteId: Optional[str] = None
    userId: Optional[str] = None


class ScanStatusResponseSchema(BaseModel):
    scanId: str
    status: str
    stage: str
    progress: int
    log: str
    initiatedAt: str
    completedAt: Optional[str] = None
    errorMessage: Optional[str] = None


# --- Verification / Audit Schemas ---
class VerificationProbeRequestSchema(BaseModel):
    method: str
    url: str
    headers: Dict[str, str]
    callerId: str
    callerName: str
    targetResourceId: str
    description: str


class VerificationProbeResponseSchema(BaseModel):
    statusCode: int
    statusText: str
    headers: Dict[str, str]
    body: Any
    durationMs: int
    leakedPiiFields: List[str] = Field(default_factory=list)


class ComplianceDeltaSchema(BaseModel):
    previousComplianceScore: int
    newComplianceScore: int
    statutoryRiskReductionPercent: int


class VerificationProbeResultSchema(BaseModel):
    testCaseId: str
    findingId: str
    timestamp: str
    isPatched: bool
    outcome: str  # PASS or FAIL
    request: VerificationProbeRequestSchema
    response: VerificationProbeResponseSchema
    explanation: str
    summary: str
    complianceDelta: ComplianceDeltaSchema


class VerifyFindingRequest(BaseModel):
    isPatched: bool = False


class AuditHistoryRecordSchema(BaseModel):
    id: str
    findingId: str
    findingTitle: str
    testCaseId: str
    timestamp: str
    result: str
    remediationStatus: str
    isPatched: bool
    evidenceSummary: str
    targetEndpoint: str
    statusCode: int


# --- Copilot Schemas ---
class EvidenceReferenceSchema(BaseModel):
    id: str
    label: str
    snippet: Optional[str] = None
    sourceType: str


class CopilotStructuredResponseSchema(BaseModel):
    summary: str
    whatWeObserved: List[str]
    whyItMatters: str
    whatRemainsUncertain: str
    recommendedActions: List[str]
    howToVerify: List[str]
    evidenceReferences: List[EvidenceReferenceSchema]
    disclaimer: str


class CopilotChatMessageInput(BaseModel):
    role: str
    content: str


class CopilotFindingContextInput(BaseModel):
    findingId: str
    title: str
    severity: str
    confidence: int
    category: str
    affectedUrl: str
    endpoint: str
    dpdpSection: str
    isDemoFixture: bool = True
    observedEvidence: Dict[str, Any]
    remediationSteps: List[str] = Field(default_factory=list)
    hasCodeDiff: bool = False


class CopilotChatRequest(BaseModel):
    findingContext: CopilotFindingContextInput
    messages: List[CopilotChatMessageInput]


class CopilotChatResponse(BaseModel):
    summary: str
    structuredResponse: CopilotStructuredResponseSchema
    isDemoResponse: bool = True
    suggestedNextQuestions: List[str] = Field(default_factory=list)


# --- Settings Schemas ---
class NotificationSettingsSchema(BaseModel):
    emailAlerts: bool = True
    notifyOnCritical: bool = True
    webhookUrl: str = ""


class UserSettingsSchema(BaseModel):
    organizationName: str = "Bharat Privacy Labs Ltd."
    dpoName: str = "Aditi Deshmukh, CISSP"
    dpoEmail: str = "dpo@bharatprivacy.in"
    jurisdiction: str = "Republic of India (DPDP Act 2023)"
    demoMode: bool = True
    apiUrl: str = "http://127.0.0.1:8000"
    scanRateLimit: str = "standard"
    rulesetVersion: str = "DPDP-2023.4-IN (Updated Q4 2026)"
    notifications: NotificationSettingsSchema = Field(default_factory=NotificationSettingsSchema)


# --- Auth Schemas ---
class UserLoginRequest(BaseModel):
    username: str
    password: str


class UserRegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    fullName: Optional[str] = None
    role: Optional[str] = "auditor"


class UserProfileSchema(BaseModel):
    id: str
    username: str
    email: str
    fullName: str
    role: str
    isActive: bool = True


class AuthTokenResponse(BaseModel):
    accessToken: str
    tokenType: str = "Bearer"
    user: UserProfileSchema


# --- Notification Schemas ---
class NotificationItemSchema(BaseModel):
    id: str
    type: str  # scan_completed, finding_detected, fix_verified, system_notice
    title: str
    description: str
    timestamp: str
    severity: str  # critical, high, medium, low, info, success
    link: Optional[str] = None
    isSynthetic: bool = False


# --- Organization & Multi-Tenancy Schemas ---
class CreateOrganizationRequest(BaseModel):
    name: str


class OrganizationResponseSchema(BaseModel):
    id: str
    name: str
    slug: str
    role: str
    planId: str
    planName: str
    subscriptionStatus: str
    websiteCount: int = 0
    memberCount: int = 0
    createdAt: str


class OrganizationMemberResponseSchema(BaseModel):
    id: str
    userId: str
    username: str
    email: str
    fullName: str
    role: str
    joinedAt: str


class AddMemberRequest(BaseModel):
    email: str
    role: str = "auditor"


# --- Website & Domain Management Schemas ---
class AddWebsiteRequest(BaseModel):
    url: Optional[str] = None
    hostname: Optional[str] = None
    verificationMethod: str = "dns_txt"

    @property
    def target_url(self) -> str:
        return self.hostname or self.url or ""



class WebsiteResponseSchema(BaseModel):
    id: str
    organizationId: str
    hostname: str
    verificationStatus: str
    verificationMethod: str
    verificationToken: Optional[str] = None
    dnsRecordName: Optional[str] = None
    dnsRecordType: Optional[str] = "TXT"
    dnsTxtHost: Optional[str] = None
    dnsTxtExpectedValue: Optional[str] = None
    httpPath: Optional[str] = None
    httpFilePath: Optional[str] = None
    httpExpectedContent: Optional[str] = None
    verificationTokenExpiry: Optional[str] = None
    tokenExpiresAt: Optional[str] = None
    verificationAttempts: int = 0
    verifiedAt: Optional[str] = None
    lastScannedAt: Optional[str] = None
    isActive: bool = True
    createdAt: str


class VerifyWebsiteRequest(BaseModel):
    method: Optional[str] = None


class VerifyWebsiteResponse(BaseModel):
    success: bool
    verified: bool
    verificationStatus: str
    message: str
    website: WebsiteResponseSchema
    verifiedAt: Optional[str] = None
    diagnostic: Optional[str] = None


class RegenerateTokenResponse(BaseModel):
    website: WebsiteResponseSchema
    token: str


# --- Subscription & Plan Schemas ---
class PlanDefinitionSchema(BaseModel):
    id: str
    name: str
    description: str
    tagline: str = ""
    priceInrMonthly: int
    priceInrMonth: int
    priceInrAnnual: int = 0
    priceInrAnnualMonthlyEquivalent: int = 0
    maxWebsites: int
    scansPerMonth: int
    maxMembers: int
    dataRetentionDays: int = 30
    features: List[str]
    isPopular: bool = False


class LimitsSchema(BaseModel):
    maxWebsites: int
    scansPerMonth: int
    maxMembers: int


class UsageSchema(BaseModel):
    totalWebsites: int
    verifiedWebsites: int
    websiteQuotaUsedPercent: int
    scansUsed: int
    scansRemaining: int
    scanQuotaUsedPercent: int
    memberCount: int
    memberQuotaUsedPercent: int


class SubscriptionOverviewResponse(BaseModel):
    organizationId: str
    planId: str
    planName: str
    description: str
    priceInrMonthly: int
    status: str
    billingPeriodStart: str
    billingPeriodEnd: str
    limits: LimitsSchema
    usage: UsageSchema
    features: List[str]
    plan: Optional[PlanDefinitionSchema] = None
    websitesCount: Optional[int] = None
    websitesLimit: Optional[int] = None
    scansUsed: Optional[int] = None
    scansLimit: Optional[int] = None
    scansRemaining: Optional[int] = None
    membersCount: Optional[int] = None
    membersLimit: Optional[int] = None
    dataRetentionDays: Optional[int] = None



class ChangePlanRequest(BaseModel):
    planId: str


class PlanRecommendationRequest(BaseModel):
    websiteType: Optional[str] = "saas"
    domainCount: Optional[int] = 1
    scanFrequency: Optional[str] = "monthly"
    teamMembers: Optional[int] = 1
    hasTrackers: Optional[bool] = False
    hasPayments: Optional[bool] = False
    hasLogin: Optional[bool] = False
    answers: Optional[Dict[str, Any]] = None


class PlanRecommendationResponse(BaseModel):
    recommendedPlanId: str
    recommendedPlan: str
    recommendedPlanName: str
    plan: Optional[PlanDefinitionSchema] = None
    reasoning: List[str]
    summary: str
    decisionFactors: List[str]
    suggestedAlternativeId: Optional[str] = None
    answersGiven: Optional[Dict[str, Any]] = None

