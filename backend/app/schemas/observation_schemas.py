from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# --- Browser Observation Schema ---
class BrowserObservationSchema(BaseModel):
    id: str
    scanId: str
    timestamp: str
    url: str
    domain: str
    method: str
    statusCode: Optional[int] = None
    isFailed: bool = False
    failureReason: Optional[str] = None
    resourceType: str
    classification: str  # first_party, third_party
    consentState: str    # before_consent, consent_accepted, consent_rejected
    headersRedacted: Dict[str, str] = Field(default_factory=dict)
    provenance: str = "live_browser_observation"


# --- Consent Comparison Schema ---
class ConsentConnectionDiff(BaseModel):
    url: str
    domain: str
    method: str
    classification: str
    resourceType: str
    statusInAccepted: Optional[int] = None
    statusInRejected: Optional[int] = None
    evidenceObservationIds: List[str] = Field(default_factory=list)


class ConsentComparisonSummary(BaseModel):
    scanId: str
    targetUrl: str
    observedInBoth: List[ConsentConnectionDiff] = Field(default_factory=list)
    observedOnlyInAccepted: List[ConsentConnectionDiff] = Field(default_factory=list)
    observedOnlyInRejected: List[ConsentConnectionDiff] = Field(default_factory=list)
    summaryText: str
