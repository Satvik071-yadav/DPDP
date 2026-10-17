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
  Code2
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
      className="fixed inset-0 z-50 flex justify-end bg-obsidian-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />

      <div className="relative z-10 w-full max-w-2xl bg-obsidian-900 border-l border-white/[0.08] shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Drawer Header */}
        <div className="p-5 border-b border-white/[0.08] bg-obsidian-950/70 flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${sev.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                {sev.label} Severity
              </span>
              <span className="font-mono text-xs text-cyan-300 bg-cyan-500/10 px-2.5 py-0.5 rounded border border-cyan-500/20 font-bold">
                {finding.id}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {finding.confidence}% Scanner Confidence
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white leading-snug font-sans">
              {finding.title}
            </h2>
            <div className="text-xs text-slate-400 flex items-center gap-2 font-mono">
              <span>Detected: {formatDate(finding.detectedAt)}</span>
              <span className="text-slate-600">•</span>
              <span className="text-cyan-400/90 capitalize">{finding.category.replace('_', ' ')}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/[0.06] px-5 bg-obsidian-900 text-xs font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3 border-b-2 font-sans font-semibold transition-all ${
              activeTab === 'overview'
                ? 'border-cyan-400 text-cyan-300 shadow-[0_1px_0_rgba(0,242,254,0.5)]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Analysis & Impact
          </button>
          <button
            onClick={() => setActiveTab('evidence')}
            className={`py-3 px-3 border-b-2 font-sans font-semibold transition-all ${
              activeTab === 'evidence'
                ? 'border-cyan-400 text-cyan-300 shadow-[0_1px_0_rgba(0,242,254,0.5)]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Observed Evidence
          </button>
          <button
            onClick={() => setActiveTab('remediation')}
            className={`py-3 px-3 border-b-2 font-sans font-semibold transition-all ${
              activeTab === 'remediation'
                ? 'border-cyan-400 text-cyan-300 shadow-[0_1px_0_rgba(0,242,254,0.5)]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Remediation & Diff
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-slate-300">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Statutory Legal Context */}
              <div className="p-4 rounded-xl bg-obsidian-950/70 border border-white/[0.08] space-y-2.5">
                <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs font-mono">
                  <Lock className="w-4 h-4" />
                  <span>Statutory Reference: DPDP Act 2023</span>
                </div>
                <div className="font-mono text-slate-100 font-bold text-xs bg-obsidian-900/80 p-2.5 rounded-lg border border-white/[0.04]">
                  {finding.dpdpSection}
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  {finding.impactExplanation}
                </p>
                <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-white/[0.06]">
                  <span>Regulatory Risk Index:</span>
                  <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    {finding.legalRiskScore} / 10
                  </span>
                </div>
              </div>

              {/* Observed Facts vs AI Explanation distinction */}
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-obsidian-950/60 border border-white/[0.06] space-y-1.5">
                  <span className="text-[10px] font-semibold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,242,254,0.8)]" />
                    Observed Scanner Fact (Deterministic)
                  </span>
                  <p className="text-slate-200 leading-relaxed font-sans text-xs">
                    {finding.summary}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-violet-950/20 border border-violet-500/20 space-y-1.5 shadow-violet-glow">
                  <span className="text-[10px] font-semibold text-violet-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    AI Privacy Analysis & Context
                  </span>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    This pattern indicates that telemetry libraries and third-party vendor pixels are instantiated without conditional checks against user consent state or data-scrubbing middleware.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300/90 text-[11px] flex items-start gap-2">
                  <Info className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
                  <span>
                    Disclaimer: Automated scanner findings provide technical indicators of exposure for remediation and do not constitute a formal judicial finding of non-compliance.
                  </span>
                </div>
              </div>

              {/* Affected Endpoints */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-200">Affected Asset & Destination</span>
                <div className="p-3.5 rounded-xl bg-obsidian-950/70 border border-white/[0.08] space-y-2 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Client Webpage:</span>
                    <span className="text-cyan-300 break-all">{finding.affectedUrl}</span>
                  </div>
                  <div className="pt-1 border-t border-white/[0.04]">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Destination Endpoint / Beacon:</span>
                    <span className="text-rose-300 break-all">{finding.endpoint}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'evidence' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200 text-xs">
                  Captured Telemetry Evidence
                </span>
                <button
                  onClick={handleCopyPayload}
                  className="flex items-center gap-1.5 text-[11px] text-cyan-400 hover:text-cyan-300 px-2.5 py-1 rounded-lg bg-obsidian-950 border border-white/[0.08] transition-colors"
                >
                  {copiedPayload ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedPayload ? 'Copied' : 'Copy Payload'}</span>
                </button>
              </div>

              {/* Method and Target */}
              <div className="p-3.5 rounded-xl bg-obsidian-950/70 border border-white/[0.08] space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold text-[10px] border border-cyan-500/30">
                    {finding.observedEvidence.method}
                  </span>
                  <span className="text-slate-200 truncate">
                    {finding.observedEvidence.url}
                  </span>
                </div>
                {finding.observedEvidence.initiatorScript && (
                  <div className="text-slate-400 text-[10px] pt-1 border-t border-white/[0.04]">
                    Initiator: {finding.observedEvidence.initiatorScript}
                  </div>
                )}
              </div>

              {/* Detected Sensitive Fields */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-300">
                  Detected Personal Data Identifiers:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {finding.observedEvidence.detectedFields.map((field, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[11px] font-mono bg-rose-500/10 text-rose-300 border border-rose-500/25"
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>

              {/* Request Headers */}
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                  Observed Headers
                </span>
                <div className="p-3 rounded-xl bg-obsidian-950/90 border border-white/[0.06] font-mono text-[10px] text-slate-300 space-y-1 max-h-36 overflow-y-auto">
                  {Object.entries(finding.observedEvidence.requestHeaders).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-slate-500">{k}:</span>
                      <span className="text-slate-300 truncate">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sanitized Payload */}
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                  Redacted Payload / Query String
                </span>
                <pre className="p-3.5 rounded-xl bg-obsidian-950/95 border border-white/[0.08] font-mono text-[11px] text-cyan-300 overflow-x-auto">
                  {finding.observedEvidence.sanitizedPayload}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'remediation' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-obsidian-950/70 border border-white/[0.08] space-y-2">
                <span className="font-semibold text-slate-200 block text-xs">
                  Recommended Engineering Remediation Steps:
                </span>
                <ul className="space-y-2 text-[11px] text-slate-300">
                  {finding.remediationSteps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-cyan-400 font-bold">•</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {finding.codeDiff && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 text-xs">
                      Suggested Code Patch ({finding.codeDiff.filePath})
                    </span>
                    <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                      {finding.codeDiff.language}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    {finding.codeDiff.description}
                  </p>

                  <div className="space-y-2.5">
                    <div className="text-[10px] text-rose-400 font-mono font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                      BEFORE (Vulnerable Implementation)
                    </div>
                    <pre className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/20 text-rose-200 font-mono text-[11px] overflow-x-auto">
                      {finding.codeDiff.beforeCode}
                    </pre>

                    <div className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1.5 pt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      AFTER (Remediated Safe Implementation)
                    </div>
                    <pre className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-emerald-200 font-mono text-[11px] overflow-x-auto">
                      {finding.codeDiff.afterCode}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-white/[0.08] bg-obsidian-950/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-mono">Status:</span>
            <select
              value={finding.status}
              onChange={(e) => onStatusChange(finding.id, e.target.value as FindingStatus)}
              className="bg-obsidian-900 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer font-sans"
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-200 font-semibold text-xs transition-all shadow-violet-glow"
              title="Ask AI Investigation Copilot"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span>Ask Copilot</span>
            </Link>

            <Link
              to={`/privacy-flow?findingId=${finding.id}`}
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-obsidian-900 hover:bg-obsidian-800 border border-white/[0.08] text-cyan-300 font-semibold text-xs transition-all"
              title="View connection in Privacy Flow topology graph"
            >
              <Network className="w-3.5 h-3.5 text-cyan-400" />
              <span>Privacy Flow</span>
            </Link>

            <Link
              to={`/fix-verify?findingId=${finding.id}`}
              onClick={onClose}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-cyan-glow transition-all"
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
