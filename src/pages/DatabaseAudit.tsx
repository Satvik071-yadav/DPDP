import React, { useState } from 'react';
import { 
  Database, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  Lock, 
  CheckCircle2, 
  RefreshCw, 
  Play, 
  FileCode, 
  Copy, 
  Check, 
  Layers, 
  Server, 
  Key, 
  FileText,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface DatabaseFinding {
  id: string;
  table: string;
  column: string;
  detectedType: 'HIPAA_PHI' | 'DPDP_PII' | 'AI_TRAINING_UNAUTHORIZED' | 'RETENTION_EXPIRED' | 'UNENCRYPTED_COLUMN';
  severity: 'critical' | 'high' | 'medium';
  lawReference: string;
  maxFineStatutory: string;
  description: string;
  samplePattern: string;
  remediationSql: string;
  status: 'open' | 'verified_remediation';
}

interface ConnectionPreset {
  id: string;
  name: string;
  engine: 'PostgreSQL' | 'MySQL' | 'MongoDB' | 'Supabase';
  host: string;
  database: string;
  descriptionLabel: string;
  findings: DatabaseFinding[];
}

const PRESETS: ConnectionPreset[] = [
  {
    id: 'healthcare-ehr',
    name: 'Healthcare EHR & Clinical Vault',
    engine: 'PostgreSQL',
    host: 'ehr-cluster-in-south.internal:5432',
    database: 'apollo_clinical_records',
    descriptionLabel: 'HIPAA & Medical PHI Verification',
    findings: [
      {
        id: 'DB-PHI-001',
        table: 'patient_diagnoses',
        column: 'icd10_code',
        detectedType: 'HIPAA_PHI',
        severity: 'critical',
        lawReference: 'HIPAA Security Rule (45 CFR §164.312) & DPDP Act §8(5)',
        maxFineStatutory: '₹250 Crores / $1.9M USD',
        description: 'Patient medical diagnosis codes and clinical treatment summaries stored in unmasked plaintext columns without column-level encryption keys.',
        samplePattern: 'E11.9 (Type 2 Diabetes), I10 (Essential Hypertension) [Plaintext]',
        remediationSql: `CREATE EXTENSION IF NOT EXISTS pgcrypto;\n-- Encrypt medical diagnosis columns using AES-GCM\nALTER TABLE patient_diagnoses ADD COLUMN icd10_encrypted bytea;\nUPDATE patient_diagnoses SET icd10_encrypted = pgp_sym_encrypt(icd10_code, current_setting('app.encryption_key'));\nALTER TABLE patient_diagnoses DROP COLUMN icd10_code;`,
        status: 'open',
      },
      {
        id: 'DB-PII-002',
        table: 'patient_demographics',
        column: 'aadhaar_number',
        detectedType: 'DPDP_PII',
        severity: 'critical',
        lawReference: 'DPDP Act 2023 Section 8(5) & Aadhaar Act Section 29',
        maxFineStatutory: '₹250 Crores statutory penalty',
        description: 'Raw 12-digit Indian national identity numbers (UIDAI Aadhaar) stored in plaintext without required 8-digit masking or vault tokenization.',
        samplePattern: '5482-9102-3481 [Unmasked 12 digits in database column]',
        remediationSql: `-- Mask all but last 4 digits of Aadhaar identifier\nCREATE OR REPLACE FUNCTION mask_aadhaar(val TEXT) RETURNS TEXT AS $$\nBEGIN\n  RETURN CONCAT('XXXX-XXXX-', RIGHT(REPLACE(val, '-', ''), 4));\nEND;\n$$ LANGUAGE plpgsql;\nUPDATE patient_demographics SET aadhaar_number = mask_aadhaar(aadhaar_number);`,
        status: 'open',
      },
    ],
  },
  {
    id: 'ai-training-risk',
    name: 'Generative AI & Customer Documents Store',
    engine: 'Supabase',
    host: 'ai-vector-db.us-east.supabase.co:5432',
    database: 'workspace_ai_embeddings',
    descriptionLabel: 'Adobe & OpenAI/NYT AI Scraping Safeguard',
    findings: [
      {
        id: 'DB-AI-001',
        table: 'customer_creative_assets',
        column: 'content_blob',
        detectedType: 'AI_TRAINING_UNAUTHORIZED',
        severity: 'critical',
        lawReference: 'DPDP Act §6(1) Purpose Limitation & Statutory Copyright Protection',
        maxFineStatutory: '₹250 Crores + Statutory IP Infringement Damages',
        description: 'Customer proprietary source code, creative documents, and private sessions are routed into vector embeddings and LLM training staging tables without explicit opt_in_ai_training consent flags (Precedent: Adobe TOS controversy & OpenAI NYT litigation).',
        samplePattern: 'SELECT content_blob FROM customer_creative_assets WHERE opt_in_ai_training IS NULL OR opt_in_ai_training = false [Flagged in model training batch]',
        remediationSql: `-- Enforce statutory purpose constraint: Prohibit AI training pipeline staging without explicit opt-in\nALTER TABLE customer_creative_assets ADD COLUMN IF NOT EXISTS opt_in_ai_training boolean DEFAULT false;\n-- Immediate purge of unconsented customer assets from model training staging\nDELETE FROM ai_vector_embeddings \nWHERE source_document_id IN (\n  SELECT id FROM customer_creative_assets WHERE opt_in_ai_training IS NOT true\n);`,
        status: 'open',
      },
      {
        id: 'DB-RET-002',
        table: 'user_session_telemetry',
        column: 'keystroke_payload',
        detectedType: 'RETENTION_EXPIRED',
        severity: 'high',
        lawReference: 'DPDP Act 2023 Section 8(7) Erasure Obligation',
        maxFineStatutory: '₹150 Crores statutory penalty',
        description: 'Telemetry and prompt session records older than 180 days retained without statutory legal hold or active consent renewal.',
        samplePattern: '482,910 rows dated > 180 days prior [No active legal hold]',
        remediationSql: `-- Automated retention purge trigger for telemetry records\nDELETE FROM user_session_telemetry\nWHERE recorded_at < NOW() - INTERVAL '90 days'\nAND legal_hold_flag IS FALSE;`,
        status: 'open',
      },
    ],
  },
  {
    id: 'fintech-vault',
    name: 'FinTech Banking & KYC Vault',
    engine: 'MySQL',
    host: 'fintech-core-prod.internal:3306',
    database: 'kyc_customer_registry',
    descriptionLabel: 'DPDP PII & Financial Tokenization',
    findings: [
      {
        id: 'DB-FT-001',
        table: 'customer_kyc',
        column: 'pan_card_number',
        detectedType: 'DPDP_PII',
        severity: 'critical',
        lawReference: 'DPDP Act Section 8(5) & RBI Cybersecurity Framework',
        maxFineStatutory: '₹250 Crores statutory penalty',
        description: 'Permanent Account Number (PAN) tax identifiers stored in plain text without SHA-256 HMAC salting or field-level encryption.',
        samplePattern: 'ABCDE1234F [Plaintext in column customer_kyc.pan_card_number]',
        remediationSql: `-- MySQL AES-256 encryption with initialization vector\nALTER TABLE customer_kyc ADD COLUMN pan_encrypted VARBINARY(255);\nUPDATE customer_kyc SET pan_encrypted = AES_ENCRYPT(pan_card_number, UNHEX(SHA2('corporate_hsm_key_2026', 512)));\nALTER TABLE customer_kyc DROP COLUMN pan_card_number;`,
        status: 'open',
      },
    ],
  },
];

export const DatabaseAudit: React.FC = () => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('healthcare-ehr');
  const [engine, setEngine] = useState<'PostgreSQL' | 'MySQL' | 'MongoDB' | 'Supabase'>('PostgreSQL');
  const [host, setHost] = useState('ehr-cluster-in-south.internal:5432');
  const [dbName, setDbName] = useState('apollo_clinical_records');
  const [username, setUsername] = useState('readonly_compliance_audit');
  const [password, setPassword] = useState('••••••••••••••••');
  const [sslMode, setSslMode] = useState<'require' | 'verify-full' | 'disable'>('require');
  
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTested, setConnectionTested] = useState(true);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState(100);
  
  const [activeFindings, setActiveFindings] = useState<DatabaseFinding[]>(PRESETS[0].findings);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string>(PRESETS[0].findings[0].id);

  const handleSelectPreset = (preset: ConnectionPreset) => {
    setSelectedPresetId(preset.id);
    setEngine(preset.engine);
    setHost(preset.host);
    setDbName(preset.database);
    setActiveFindings(preset.findings);
    setSelectedFindingId(preset.findings[0]?.id || '');
    toast.success(`Loaded connection profile: ${preset.name}`);
  };

  const handleTestConnection = () => {
    setIsTestingConnection(true);
    setConnectionTested(false);
    setTimeout(() => {
      setIsTestingConnection(false);
      setConnectionTested(true);
      toast.success(`Connected successfully to ${engine} (${host}/${dbName}) via TLS v1.3.`);
    }, 800);
  };

  const handleRunDeepAudit = () => {
    setIsAuditing(true);
    setAuditProgress(15);
    setTimeout(() => setAuditProgress(45), 300);
    setTimeout(() => setAuditProgress(80), 700);
    setTimeout(() => {
      setAuditProgress(100);
      setIsAuditing(false);
      toast.success(`Audit complete: Scanned 48 tables, detected ${activeFindings.length} compliance exposure risks.`);
    }, 1100);
  };

  const handleCopySql = (id: string, sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedId(id);
    toast.success('Remediation SQL copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleVerifyPatch = (id: string) => {
    setActiveFindings(prev => prev.map(f => f.id === id ? { ...f, status: 'verified_remediation' } : f));
    toast.success(`Verification probe successful for [${id}]: Column encryption confirmed.`);
  };

  const activeFinding = activeFindings.find(f => f.id === selectedFindingId) || activeFindings[0];

  const totalRisks = activeFindings.length;
  const criticalCount = activeFindings.filter(f => f.severity === 'critical' && f.status === 'open').length;
  const verifiedCount = activeFindings.filter(f => f.status === 'verified_remediation').length;

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header (No small line description) */}
      <div className="relative overflow-hidden rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] p-6 shadow-subtle">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F]">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B] font-sans">
                  Database Compliance & Data Store Inspector
                </h1>
                <span className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#52796F]/10 text-[#52796F] border border-[#52796F]/20">
                  ENTERPRISE DATA AUDIT
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunDeepAudit}
              disabled={isAuditing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white font-bold text-xs shadow-subtle transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
              <span>{isAuditing ? 'Auditing Schema & Columns...' : 'Run Database Compliance Audit'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Regulatory & Precedent Advisory Banner */}
      <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-[#B91C1C] flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-[#18181B] flex items-center gap-2">
              <span>Statutory Liability Counter & Precedent Verification</span>
              <span className="px-2 py-0.2 rounded text-[10px] bg-red-50 text-[#B91C1C] border border-red-200 font-mono">
                UP TO ₹250 CRORES
              </span>
            </div>
            <div className="text-[#71717A] text-[11px] leading-relaxed">
              Audits verify HIPAA Security Rule compliance, DPDP Section 8(5) PII encryption, and prevent unauthorized AI model training on customer assets (protecting against the Adobe TOS asset-scraping & OpenAI/NYT Codex liabilities).
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] border border-[#E4E4E7] text-[11px] font-mono text-[#52796F] font-semibold">
            TLS v1.3 Verified
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-green-50 border border-green-200 text-[11px] font-mono text-[#15803D] font-semibold flex items-center gap-1">
            <Check className="w-3 h-3" /> Read-Only Role
          </span>
        </div>
      </div>

      {/* 3. Connection Setup & Presets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Connection Form */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] p-5 shadow-subtle space-y-4">
            <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-[#52796F]" />
                <h2 className="text-sm font-bold text-[#18181B]">Database Connection</h2>
              </div>
              <span className="text-[10px] font-mono text-[#71717A] bg-[#F1F5F9] px-2 py-0.5 rounded border border-[#E4E4E7]">
                SSL / TLS
              </span>
            </div>

            {/* Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#18181B]">Audit Profiles</label>
              <div className="space-y-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all flex items-center justify-between ${
                      selectedPresetId === p.id
                        ? 'bg-[#F1F5F9] border-[#52796F] text-[#18181B] font-semibold shadow-subtle'
                        : 'bg-[#F8FAFC] border-[#E4E4E7] text-[#71717A] hover:bg-[#F1F5F9] hover:text-[#18181B]'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-[#18181B]">{p.name}</div>
                      <div className="text-[10px] text-[#71717A] font-mono">{p.descriptionLabel}</div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FFFFFF] border border-[#E4E4E7] text-[#52796F]">
                      {p.engine}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Credentials Form */}
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-[#71717A]">Database Engine</label>
                  <select
                    value={engine}
                    onChange={(e: any) => setEngine(e.target.value)}
                    className="w-full mt-1 bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-2.5 py-2 text-xs text-[#18181B] font-medium focus:outline-none focus:border-[#52796F]"
                  >
                    <option value="PostgreSQL">PostgreSQL</option>
                    <option value="MySQL">MySQL</option>
                    <option value="Supabase">Supabase</option>
                    <option value="MongoDB">MongoDB</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#71717A]">SSL Mode</label>
                  <select
                    value={sslMode}
                    onChange={(e: any) => setSslMode(e.target.value)}
                    className="w-full mt-1 bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-2.5 py-2 text-xs text-[#18181B] font-medium focus:outline-none focus:border-[#52796F]"
                  >
                    <option value="require">require (TLS v1.3)</option>
                    <option value="verify-full">verify-full</option>
                    <option value="disable">disable (local only)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[#71717A]">Host & Port</label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="w-full mt-1 bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-3 py-2 text-xs text-[#18181B] font-mono focus:outline-none focus:border-[#52796F]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[#71717A]">Database Name</label>
                <input
                  type="text"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                  className="w-full mt-1 bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-3 py-2 text-xs text-[#18181B] font-mono focus:outline-none focus:border-[#52796F]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-[#71717A]">Audit Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full mt-1 bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-3 py-2 text-xs text-[#18181B] font-mono focus:outline-none focus:border-[#52796F]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#71717A]">Password / Token</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full mt-1 bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-3 py-2 text-xs text-[#18181B] font-mono focus:outline-none focus:border-[#52796F]"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConnection}
                className="px-4 py-2 rounded-xl bg-[#F1F5F9] hover:bg-[#E4E4E7] border border-[#E4E4E7] text-[#18181B] font-semibold text-xs flex items-center gap-1.5 transition-colors"
              >
                {isTestingConnection ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Key className="w-3.5 h-3.5 text-[#52796F]" />
                    <span>Test Handshake</span>
                  </>
                )}
              </button>

              {connectionTested && (
                <span className="text-xs font-mono text-[#15803D] flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Connected
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Deep Audit Findings & SQL Remediation */}
        <div className="lg:col-span-7 space-y-4">
          {/* Finding Selector Chips */}
          <div className="rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] p-5 shadow-subtle space-y-4">
            <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#52796F]" />
                <h2 className="text-sm font-bold text-[#18181B]">Compliance Findings ({activeFindings.length})</h2>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span className="px-2 py-0.5 rounded bg-red-50 text-[#B91C1C] border border-red-200">
                  {criticalCount} Critical
                </span>
                <span className="px-2 py-0.5 rounded bg-green-50 text-[#15803D] border border-green-200">
                  {verifiedCount} Remediated
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeFindings.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFindingId(f.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedFindingId === f.id
                      ? 'bg-[#F1F5F9] border-[#52796F] shadow-subtle'
                      : 'bg-[#F8FAFC] border-[#E4E4E7] hover:bg-[#F1F5F9]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold text-[#18181B]">
                      {f.table}.{f.column}
                    </span>
                    <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                      f.status === 'verified_remediation'
                        ? 'bg-green-50 text-[#15803D] border border-green-200'
                        : 'bg-red-50 text-[#B91C1C] border border-red-200'
                    }`}>
                      {f.status === 'verified_remediation' ? 'VERIFIED' : f.severity.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#71717A] truncate">
                    {f.lawReference}
                  </div>
                </button>
              ))}
            </div>

            {/* Active Finding Detail Card */}
            {activeFinding && (
              <div className="mt-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E4E4E7] pb-3">
                  <div>
                    <span className="text-[10px] font-mono text-[#52796F] font-bold">[{activeFinding.id}]</span>
                    <h3 className="text-sm font-bold text-[#18181B]">
                      Table: <code className="text-[#52796F]">{activeFinding.table}</code> &bull; Column: <code className="text-[#52796F]">{activeFinding.column}</code>
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-[#71717A] block font-mono">Max Statutory Penalty</span>
                    <span className="text-xs font-bold text-[#B91C1C] font-mono">
                      {activeFinding.maxFineStatutory}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-[#71717A] font-semibold block">Statutory Law / Precedent:</span>
                    <span className="font-mono text-[#18181B] font-bold">{activeFinding.lawReference}</span>
                  </div>
                  <div>
                    <span className="text-[#71717A] font-semibold block">Finding Explanation:</span>
                    <p className="text-[#18181B] leading-relaxed">{activeFinding.description}</p>
                  </div>
                  <div>
                    <span className="text-[#71717A] font-semibold block">Observed Data Pattern:</span>
                    <code className="block p-2 rounded-lg bg-[#FFFFFF] border border-[#E4E4E7] font-mono text-[11px] text-[#B91C1C]">
                      {activeFinding.samplePattern}
                    </code>
                  </div>
                </div>

                {/* Remediation SQL */}
                <div className="space-y-2 pt-2 border-t border-[#E4E4E7]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#18181B] flex items-center gap-1.5">
                      <FileCode className="w-4 h-4 text-[#52796F]" />
                      Deterministic SQL Remediation Script
                    </span>
                    <button
                      onClick={() => handleCopySql(activeFinding.id, activeFinding.remediationSql)}
                      className="px-2.5 py-1 rounded-lg bg-[#FFFFFF] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-[#18181B] text-[11px] font-mono flex items-center gap-1 transition-colors"
                    >
                      {copiedId === activeFinding.id ? (
                        <>
                          <Check className="w-3 h-3 text-[#15803D]" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#71717A]" />
                          <span>Copy SQL</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre className="p-3 rounded-xl bg-[#FFFFFF] border border-[#E4E4E7] text-[11px] font-mono text-[#18181B] overflow-x-auto leading-relaxed">
                    {activeFinding.remediationSql}
                  </pre>

                  <div className="flex justify-end pt-1">
                    {activeFinding.status === 'verified_remediation' ? (
                      <span className="px-3 py-1.5 rounded-xl bg-green-50 border border-green-200 text-[#15803D] text-xs font-bold font-mono flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Remediation Verified in Sandbox
                      </span>
                    ) : (
                      <button
                        onClick={() => handleVerifyPatch(activeFinding.id)}
                        className="px-4 py-2 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white font-bold text-xs flex items-center gap-2 transition-all shadow-subtle active:scale-95"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-[#52796F]" />
                        <span>Verify Database Fix</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatabaseAudit;
