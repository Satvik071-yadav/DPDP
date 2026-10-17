import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, Text, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.db.session import Base


def get_utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


class ScanJob(Base):
    __tablename__ = "scan_jobs"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    target_url = Column(String, nullable=False, index=True)
    profile = Column(String, nullable=False, default="privacy_audit")
    status = Column(String, nullable=False, default="queued", index=True)  # queued, running, completed, failed, cancelled
    progress_stage = Column(String, default="completed")
    progress_percent = Column(Integer, default=100)
    log_message = Column(String, nullable=True)
    initiated_at = Column(DateTime(timezone=True), default=get_utc_now, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, default=0)
    risk_score = Column(Integer, default=0)
    compliance_score = Column(Integer, default=100)
    consent_mode_enabled = Column(Boolean, default=True)
    findings_count = Column(JSON, default=lambda: {
        "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0, "total": 0
    })
    is_demo = Column(Boolean, default=True)
    provenance = Column(String, default="controlled_demo")  # controlled_demo, live_browser_observation
    error_message = Column(Text, nullable=True)

    findings = relationship("FindingModel", back_populates="scan_job", cascade="all, delete-orphan")
    observations = relationship("BrowserObservationModel", back_populates="scan_job", cascade="all, delete-orphan")


class BrowserObservationModel(Base):
    __tablename__ = "browser_observations"

    id = Column(String, primary_key=True, index=True)
    scan_id = Column(String, ForeignKey("scan_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), default=get_utc_now, index=True)
    url = Column(String, nullable=False)
    domain = Column(String, nullable=False)
    method = Column(String, nullable=False)
    status_code = Column(Integer, nullable=True)  # None if failed / blocked
    is_failed = Column(Boolean, default=False)
    failure_reason = Column(String, nullable=True)
    resource_type = Column(String, nullable=False)  # document, script, xhr, fetch, image, ping
    classification = Column(String, nullable=False)  # first_party, third_party
    consent_state = Column(String, nullable=False)  # before_consent, consent_accepted, consent_rejected
    headers_redacted = Column(JSON, default=dict)
    provenance = Column(String, default="live_browser_observation")

    scan_job = relationship("ScanJob", back_populates="observations")


class FindingModel(Base):
    __tablename__ = "findings"

    id = Column(String, primary_key=True, index=True)
    scan_id = Column(String, ForeignKey("scan_jobs.id", ondelete="CASCADE"), nullable=True, index=True)
    title = Column(String, nullable=False)
    severity = Column(String, nullable=False, index=True)  # critical, high, medium, low, info
    category = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="open", index=True)  # open, in_review, verified_fix, false_positive
    confidence = Column(Integer, default=95)
    affected_url = Column(String, nullable=False)
    endpoint = Column(String, nullable=False)
    detected_at = Column(DateTime(timezone=True), default=get_utc_now, index=True)
    evidence_available = Column(Boolean, default=True)
    dpdp_section = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    impact_explanation = Column(Text, nullable=False)
    legal_risk_score = Column(Float, default=5.0)
    is_demo = Column(Boolean, default=True)
    provenance = Column(String, default="controlled_fixture")

    # Detailed structured fields stored as JSON
    observed_evidence = Column(JSON, nullable=False)
    evidence_observation_ids = Column(JSON, default=list)  # Links to BrowserObservationModel.id
    remediation_steps = Column(JSON, default=list)
    code_diff = Column(JSON, nullable=True)
    verification_history = Column(JSON, default=list)

    scan_job = relationship("ScanJob", back_populates="findings")
    # Audit evidence is preserved independently of finding deletion
    audit_records = relationship("AuditRecordModel", back_populates="finding")


class AuditRecordModel(Base):
    __tablename__ = "audit_records"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    # ondelete="SET NULL" preserves historical compliance records even if associated finding is purged
    finding_id = Column(String, ForeignKey("findings.id", ondelete="SET NULL"), nullable=True, index=True)
    finding_title = Column(String, nullable=False)
    test_case_id = Column(String, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=get_utc_now, index=True)
    result = Column(String, nullable=False)  # PASS or FAIL
    remediation_status = Column(String, nullable=False)
    is_patched = Column(Boolean, default=False)
    evidence_summary = Column(Text, nullable=False)
    target_endpoint = Column(String, nullable=False)
    status_code = Column(Integer, nullable=False)
    probe_details = Column(JSON, nullable=True)

    finding = relationship("FindingModel", back_populates="audit_records")


class CopilotInteractionModel(Base):
    __tablename__ = "copilot_interactions"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    finding_id = Column(String, nullable=False, index=True)
    user_prompt = Column(Text, nullable=False)
    provider_used = Column(String, nullable=False, default="demo")
    structured_response = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, index=True)


class SettingsModel(Base):
    __tablename__ = "platform_settings"

    id = Column(String, primary_key=True, default="default")
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    organization_name = Column(String, nullable=False, default="Bharat Privacy Labs Ltd.")
    dpo_name = Column(String, nullable=False, default="Aditi Deshmukh, CISSP")
    dpo_email = Column(String, nullable=False, default="dpo@bharatprivacy.in")
    jurisdiction = Column(String, nullable=False, default="Republic of India (DPDP Act 2023)")
    demo_mode = Column(Boolean, default=True)
    api_url = Column(String, nullable=False, default="http://127.0.0.1:8000")
    scan_rate_limit = Column(String, default="standard")
    ruleset_version = Column(String, default="DPDP-2023.4-IN (Updated Q4 2026)")
    notifications = Column(JSON, default=lambda: {
        "emailAlerts": True,
        "notifyOnCritical": True,
        "webhookUrl": "https://hooks.slack.com/services/T00/B00/DPDPAlerts"
    })
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


class UserModel(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="dpo")  # dpo, auditor, admin
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    is_active = Column(Boolean, default=True)


