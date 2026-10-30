import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  X, 
  ShieldAlert, 
  FileText, 
  Terminal, 
  CheckCircle2, 
  ArrowRight, 
  Copy, 
  Check, 
  ExternalLink, 
  AlertTriangle, 
  Info,
  Wrench,
  Sparkles,
  Lock,
  Network,
  Code2,
  IndianRupee
} from 'lucide-react';
import { Finding, FindingStatus } from '@/types';
import { formatSeverity, formatDate } from '@/lib/utils';
import { api } from '@/services/api';

interface FindingDetailDrawerProps {
  finding: Finding | null;
  onClose: () => void;
  onStatusChange: (findingId: string, newStatus: FindingStatus) => void;
}

export const FindingDetailDrawer: React.FC<FindingDetailDrawerProps> = ({
  finding,
  onClose,
  onStatusChange,
}) => {
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'evidence' | 'remediation'>('overview');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!finding) return null;

  const sev = formatSeverity(finding.severity);

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(finding.observedEvidence.sanitizedPayload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-label="Finding Details"
      data-testid="finding-drawer"
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />

      <div className="relative z-10 w-full max-w-2xl bg-[#FFFFFF] border-l border-[#E4E4E7] shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Drawer Header */}
        <div className="p-5 border-b border-[#E4E4E7] bg-[#FFFFFF] flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${sev.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                {sev.label} Severity
              </span>
              <span className="font-mono text-xs text-[#52796F] bg-[#52796F]/10 px-2.5 py-0.5 rounded border border-[#52796F]/20 font-bold">
                {finding.id}
              </span>
              <span className="text-xs text-[#71717A] font-mono">
                {finding.confidence}% Scanner Confidence
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#18181B] leading-snug font-sans">
              {finding.title}
            </h2>
            <div className="text-xs text-[#71717A] flex items-center gap-2 font-mono">
              <span>Detected: {formatDate(finding.detectedAt)}</span>
              <span className="text-[#273449]">•</span>
              <span className="text-[#52796F] capitalize">{finding.category.replace('_', ' ')}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#71717A] hover:text-[#18181B] hover:bg-[#F1F5F9] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#E4E4E7] px-5 bg-[#FFFFFF] text-xs font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3 border-b-2 font-sans font-semibold transition-all ${
              activeTab === 'overview'
                ? 'border-[#52796F] text-[#52796F]'
                : 'border-transparent text-[#71717A] hover:text-[#18181B]'
            }`}
          >
            Analysis & Impact
          </button>
          <button
            onClick={() => setActiveTab('evidence')}
            className={`py-3 px-3 border-b-2 font-sans font-semibold transition-all ${
              activeTab === 'evidence'
                ? 'border-[#52796F] text-[#52796F]'
                : 'border-transparent text-[#71717A] hover:text-[#18181B]'
            }`}
          >
            Observed Evidence
          </button>
          <button
            onClick={() => setActiveTab('remediation')}
            className={`py-3 px-3 border-b-2 font-sans font-semibold transition-all ${
              activeTab === 'remediation'
                ? 'border-[#52796F] text-[#52796F]'
                : 'border-transparent text-[#71717A] hover:text-[#18181B]'
            }`}
          >
            Remediation & Diff
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-[#71717A]">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Statutory Legal Context */}
              <div className="p-4 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] space-y-2.5">
                <div className="flex items-center gap-2 text-[#52796F] font-semibold text-xs font-mono">
                  <Lock className="w-4 h-4" />
                  <span>Statutory Reference: DPDP Act 2023</span>
                </div>
                <div className="font-mono text-[#18181B] font-bold text-xs bg-[#FFFFFF] p-2.5 rounded-lg border border-[#E4E4E7]">
                  {finding.dpdpSection}
                </div>
                <p className="text-[#71717A] leading-relaxed text-[11px]">
                  {finding.impactExplanation}
                </p>
                <div className="pt-2 flex items-center justify-between text-[11px] text-[#71717A] border-t border-[#E4E4E7]">
                  <span>Regulatory Risk Index:</span>
                  <span className="font-mono font-bold text-[#B45309] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {finding.legalRiskScore} / 10
                  </span>
                </div>
                <div className="pt-2 flex items-center justify-between text-[11px] text-[#71717A] border-t border-[#E4E4E7]">
                  <span className="flex items-center gap-1"><IndianRupee className="w-3 h-3" /> Statutory Penalty (Max):</span>
                  <span className={`font-mono font-bold px-2 py-0.5 rounded border ${
                    finding.severity === 'critical'
                      ? 'text-[#B91C1C] bg-red-50 border-red-200'
                      : finding.severity === 'high'
                      ? 'text-[#B45309] bg-amber-50 border-amber-200'
                      : 'text-[#18181B] bg-[#F1F5F9] border-[#E4E4E7]'
                  }`}>
                    {finding.severity === 'critical'
                      ? (finding.dpdpSection.toLowerCase().includes('9(1)') ? '₹200 Crores' : '₹250 Crores')
                      : finding.severity === 'high'
                      ? '₹150 Crores'
                      : finding.severity === 'medium'
                      ? '₹50 Crores'
                      : '₹10 Crores'}
                  </span>
                </div>
              </div>

              {/* Observed Facts vs AI Explanation distinction */}
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] space-y-1.5">
                  <span className="text-[10px] font-semibold text-[#52796F] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6]" />
                    Observed Scanner Fact (Deterministic)
                  </span>
                  <p className="text-[#18181B] leading-relaxed font-sans text-xs">
                    {finding.summary}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] space-y-1.5">
                  <span className="text-[10px] font-semibold text-[#52796F] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <Sparkles className="w-3.5 h-3.5 text-[#52796F]" />
                    AI Privacy Analysis & Context
                  </span>
                  <p className="text-[#71717A] leading-relaxed text-[11px]">
                    This pattern indicates that telemetry libraries and third-party vendor pixels are instantiated without conditional checks against user consent state or data-scrubbing middleware.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[#B45309] text-[11px] flex items-start gap-2">
                  <Info className="w-4 h-4 flex-shrink-0 text-[#B45309] mt-0.5" />
                  <span>
                    Disclaimer: Automated scanner findings provide technical indicators of exposure for remediation and do not constitute a formal judicial finding of non-compliance.
                  </span>
                </div>
              </div>

              {/* Affected Endpoints */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-[#18181B]">Affected Asset & Destination</span>
                <div className="p-3.5 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] space-y-2 font-mono text-[11px]">
                  <div>
                    <span className="text-[#71717A] block text-[10px] uppercase font-bold">Client Webpage:</span>
                    <span className="text-[#52796F] break-all">{finding.affectedUrl}</span>
                  </div>
                  <div className="pt-1 border-t border-[#E4E4E7]">
                    <span className="text-[#71717A] block text-[10px] uppercase font-bold">Destination Endpoint / Beacon:</span>
                    <span className="text-[#B91C1C] break-all">{finding.endpoint}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'evidence' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#18181B] text-xs">
                  Captured Telemetry Evidence
                </span>
                <button
                  onClick={handleCopyPayload}
                  className="flex items-center gap-1.5 text-[11px] text-[#52796F] hover:text-[#405F57] px-2.5 py-1 rounded-lg bg-[#F1F5F9] border border-[#E4E4E7] transition-colors"
                >
                  {copiedPayload ? <Check className="w-3 h-3 text-[#15803D]" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPayload ? 'Copied' : 'Copy Payload'}</span>
                </button>
              </div>

              {/* Method and Target */}
              <div className="p-3.5 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#14B8A6]/15 text-[#52796F] font-bold text-[10px] border border-[#52796F]/20">
                    {finding.observedEvidence.method}
                  </span>
                  <span className="text-[#18181B] truncate">
                    {finding.observedEvidence.url}
                  </span>
                </div>
                {finding.observedEvidence.initiatorScript && (
                  <div className="text-[#71717A] text-[10px] pt-1 border-t border-[#E4E4E7]">
                    Initiator: {finding.observedEvidence.initiatorScript}
                  </div>
                )}
              </div>

              {/* Detected Sensitive Fields */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-[#18181B]">
                  Detected Personal Data Identifiers:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {finding.observedEvidence.detectedFields.map((field, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[11px] font-mono bg-red-50 text-[#B91C1C] border border-red-200"
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>

              {/* Request Headers */}
              <div>
                <span className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider block mb-1 font-mono">
                  Observed Headers
                </span>
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] font-mono text-[10px] text-[#71717A] space-y-1 max-h-36 overflow-y-auto">
                  {Object.entries(finding.observedEvidence.requestHeaders).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-[#71717A]">{k}:</span>
                      <span className="text-[#18181B] truncate">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sanitized Payload */}
              <div>
                <span className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider block mb-1 font-mono">
                  Redacted Payload / Query String
                </span>
                <pre className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] font-mono text-[11px] text-[#52796F] overflow-x-auto">
                  {finding.observedEvidence.sanitizedPayload}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'remediation' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] space-y-2">
                <span className="font-semibold text-[#18181B] block text-xs">
                  Recommended Engineering Remediation Steps:
                </span>
                <ul className="space-y-2 text-[11px] text-[#71717A]">
                  {finding.remediationSteps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-[#52796F] font-bold">•</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {finding.codeDiff && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#18181B] text-xs">
                      Suggested Code Patch ({finding.codeDiff.filePath})
                    </span>
                    <span className="text-[10px] font-mono text-[#52796F] bg-[#52796F]/10 px-2 py-0.5 rounded border border-[#52796F]/20">
                      {finding.codeDiff.language}
                    </span>
                  </div>

                  <p className="text-[11px] text-[#71717A]">
                    {finding.codeDiff.description}
                  </p>

                  <div className="space-y-2.5">
                    <div className="text-[10px] text-[#B91C1C] font-mono font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#B91C1C]" />
                      BEFORE (Vulnerable Implementation)
                    </div>
                    <pre className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-rose-200 font-mono text-[11px] overflow-x-auto">
                      {finding.codeDiff.beforeCode}
                    </pre>

                    <div className="text-[10px] text-[#15803D] font-mono font-bold flex items-center gap-1.5 pt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#15803D]" />
                      AFTER (Remediated Safe Implementation)
                    </div>
                    <pre className="p-3.5 rounded-xl bg-green-50 border border-green-200 text-emerald-200 font-mono text-[11px] overflow-x-auto">
                      {finding.codeDiff.afterCode}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-[#E4E4E7] bg-[#FFFFFF] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#71717A] font-mono">Status:</span>
            <select
              value={finding.status}
              onChange={(e) => onStatusChange(finding.id, e.target.value as FindingStatus)}
              className="bg-[#F1F5F9] border border-[#E4E4E7] rounded-lg px-2.5 py-1.5 text-xs text-[#18181B] focus:outline-none focus:border-[#52796F] cursor-pointer font-sans"
            >
              <option value="open">Open</option>
              <option value="in_review">In Review</option>
              <option value="verified_fix">Verified Fix</option>
              <option value="false_positive">False Positive</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={`/copilot?findingId=${finding.id}`}
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-[#52796F] font-semibold text-xs transition-colors"
              title="Ask AI Investigation Copilot"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#52796F]" />
              <span>Ask Copilot</span>
            </Link>

            <Link
              to={`/privacy-flow?findingId=${finding.id}`}
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-[#18181B] font-semibold text-xs transition-colors"
              title="View connection in Privacy Flow topology graph"
            >
              <Network className="w-3.5 h-3.5 text-[#52796F]" />
              <span>Privacy Flow</span>
            </Link>

            <Link
              to={`/fix-verify?findingId=${finding.id}`}
              onClick={onClose}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white font-bold text-xs shadow-sm transition-colors"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Launch Fix & Verify</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
