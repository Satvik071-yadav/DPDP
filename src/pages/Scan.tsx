import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { 
  Radar, 
  ShieldAlert, 
  CheckCircle2, 
  AlertCircle, 
  Terminal, 
  Globe, 
  Layers, 
  Sliders, 
  Lock, 
  ArrowRight, 
  RotateCcw, 
  ExternalLink,
  Cpu,
  Sparkles,
  Info,
  Zap,
  Activity,
  FileCheck,
  Check,
  XCircle,
  Copy,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { ScanProfile, ScanStage, ScanResult, Finding } from '@/types';
import { DEMO_PRESET_TARGETS } from '@/data/mockData';
import { scanService, validateScanTarget, AUTHORIZED_DEMO_DOMAINS } from '@/services/scanService';
import { api } from '@/services/api';
import { formatDate } from '@/lib/utils';

interface StageConfig {
  stage: ScanStage;
  label: string;
  description: string;
}

const SCAN_STAGES: StageConfig[] = [
  { stage: 'preparing_env', label: '1. Preparing Test Environment', description: 'Initializing isolated sandbox container and loading DPDP 2023 statutory ruleset' },
  { stage: 'checking_endpoints', label: '2. Checking Configured Endpoints', description: 'Inspecting public DOM tree, discovering client-side routes, and checking script bundles' },
  { stage: 'running_auth_tests', label: '3. Running Controlled Authorization Tests', description: 'Evaluating pre-consent triggers, opt-out compliance, and access boundaries' },
  { stage: 'inspecting_network', label: '4. Inspecting Recorded Browser Network Events', description: 'Monitoring background beacons, third-party trackers, cookies, and telemetry payloads' },
  { stage: 'preparing_evidence', label: '5. Preparing Findings and Evidence', description: 'Correlating forensic packet traces against DPDP Act Section 6, 8, & 16 obligations' },
];

export const Scan: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isMounted = useRef(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const [targetUrl, setTargetUrl] = useState(searchParams.get('target') || 'https://paysecure-india.in');
  const [profile, setProfile] = useState<ScanProfile>(
    (searchParams.get('profile') as ScanProfile) || 'privacy_audit'
  );
  const [consentTesting, setConsentTesting] = useState(true);
  const [authorizedConsent, setAuthorizedConsent] = useState(true);

  // Scan execution state
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [currentStage, setCurrentStage] = useState<ScanStage>('preparing_env');
  const [progress, setProgress] = useState(0);
  const [scanComplete, setScanComplete] = useState(false);
  const [completedReport, setCompletedReport] = useState<ScanResult | null>(null);
  const [findingsDiscovered, setFindingsDiscovered] = useState<Finding[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [validationError, setValidationError] = useState('');
  const [copiedLog, setCopiedLog] = useState(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Auto-scroll terminal logs
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  // Resume or start scan based on searchParams or localStorage
  useEffect(() => {
    const urlScanId = searchParams.get('scanId');
    const storedScanId = localStorage.getItem('dpdp_active_scan_id');
    const targetScanId = urlScanId || storedScanId;

    if (targetScanId && !isScanning && !scanComplete) {
      resumeExistingScan(targetScanId);
    } else if (searchParams.get('autoStart') === 'true' && !isScanning && !scanComplete) {
      handleStartScan();
    }
  }, [searchParams]);

  const resumeExistingScan = async (scanId: string) => {
    setActiveScanId(scanId);
    setIsScanning(true);
    setScanComplete(false);
    setValidationError('');
    setConsoleLogs([`[RESUME] Attaching to telemetry session: ${scanId}`]);

    try {
      const report = await scanService.pollExistingScan(scanId, (event) => {
        if (!isMounted.current) return;
        setCurrentStage(event.stage);
        setProgress(event.progress);
        setConsoleLogs((prev) => [...prev, event.log]);
        if (event.newFinding) {
          setFindingsDiscovered((prev) => {
            if (prev.some((f) => f.id === event.newFinding?.id)) return prev;
            return [...prev, event.newFinding!];
          });
        }
      });

      if (isMounted.current) {
        setCompletedReport(report);
        setScanComplete(true);
        setIsScanning(false);
        setActiveScanId(null);
        localStorage.removeItem('dpdp_active_scan_id');
        try {
          await Promise.all([api.getScans(), api.getFindings()]);
        } catch {}
      }
    } catch (err: any) {
      if (isMounted.current) {
        setIsScanning(false);
        setActiveScanId(null);
        localStorage.removeItem('dpdp_active_scan_id');
        setValidationError(err.message || 'Error monitoring scan execution.');
      }
    }
  };

  const handleStartScan = async () => {
    // 1. Validate authorization checkbox
    if (!authorizedConsent) {
      setValidationError('You must confirm that you are authorized to audit this domain or testing a controlled demo sandbox.');
      return;
    }

    // 2. Validate URL and demo boundary
    const validation = validateScanTarget(targetUrl);
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid target domain.');
      return;
    }

    const resolvedTarget = validation.normalizedUrl || targetUrl;
    setValidationError('');
    setIsScanning(true);
    setScanComplete(false);
    setCompletedReport(null);
    setCurrentStage('preparing_env');
    setProgress(5);
    setFindingsDiscovered([]);
    setConsoleLogs([
      `[PROBE_INIT] Target: ${resolvedTarget}`,
      `[PROBE_INIT] Profile: ${profile.toUpperCase()}`,
      `[PROBE_INIT] Consent Testing Comparison: ${consentTesting ? 'ENABLED' : 'DISABLED'}`,
      `[SANDBOX] Dispatching deterministic Playwright telemetry container...`,
    ]);

    try {
      const report = await scanService.executeScan(
        resolvedTarget,
        profile,
        consentTesting,
        (event) => {
          if (!isMounted.current) return;
          setCurrentStage(event.stage);
          setProgress(event.progress);
          setConsoleLogs((prev) => [...prev, event.log]);
          if (event.newFinding) {
            setFindingsDiscovered((prev) => {
              if (prev.some((f) => f.id === event.newFinding?.id)) return prev;
              return [...prev, event.newFinding!];
            });
          }
        },
        (scanId) => {
          if (!isMounted.current) return;
          setActiveScanId(scanId);
          localStorage.setItem('dpdp_active_scan_id', scanId);
          navigate(`?scanId=${encodeURIComponent(scanId)}&target=${encodeURIComponent(resolvedTarget)}&profile=${encodeURIComponent(profile)}`, { replace: true });
        }
      );

      if (isMounted.current) {
        setCompletedReport(report);
        setScanComplete(true);
        setIsScanning(false);
        setActiveScanId(null);
        localStorage.removeItem('dpdp_active_scan_id');
        try {
          await Promise.all([api.getScans(), api.getFindings()]);
        } catch {}
      }
    } catch (err: any) {
      if (isMounted.current) {
        setIsScanning(false);
        setActiveScanId(null);
        localStorage.removeItem('dpdp_active_scan_id');
        setValidationError(err.message || 'An error occurred during scan execution.');
      }
    }
  };

  const handleCancelScan = async () => {
    if (activeScanId) {
      setConsoleLogs((prev) => [...prev, `[ABORT_SIGNAL] Cancelling scan session ${activeScanId}...`]);
      try {
        await scanService.cancelScan(activeScanId);
        setConsoleLogs((prev) => [...prev, `[ABORTED] Scan ${activeScanId} cancelled by operator.`]);
      } catch (err: any) {
        setConsoleLogs((prev) => [...prev, `[WARN] Cancellation signal: ${err.message}`]);
      }
    }
    setIsScanning(false);
    localStorage.removeItem('dpdp_active_scan_id');
    setActiveScanId(null);
    setCurrentStage('cancelled');
    setValidationError('Scan was cancelled by user.');
  };

  const handleReset = () => {
    setIsScanning(false);
    setScanComplete(false);
    setCompletedReport(null);
    setProgress(0);
    setCurrentStage('preparing_env');
    setConsoleLogs([]);
    setFindingsDiscovered([]);
    setValidationError('');
    setActiveScanId(null);
    localStorage.removeItem('dpdp_active_scan_id');
    navigate('/scan', { replace: true });
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(consoleLogs.join('\n'));
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  const getStageIndex = (stage: ScanStage) => {
    switch (stage) {
      case 'preparing_env': return 0;
      case 'checking_endpoints': return 1;
      case 'running_auth_tests': return 2;
      case 'inspecting_network': return 3;
      case 'preparing_evidence': return 4;
      case 'completed': return 5;
      default: return 0;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Editorial Header Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-obsidian-900/90 via-obsidian-850/80 to-obsidian-900/90 border border-white/[0.08] p-6 shadow-obsidian-card backdrop-blur-md">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 shadow-cyan-glow">
                <Radar className="w-5 h-5 animate-spin-slow" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans">
                    Target Website Scanner
                  </h2>
                  <span className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    DEMO SCANNER
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Launch deterministic privacy investigations to detect personal data exposures, tracker fires, and consent notice validity under India's DPDP Act 2023.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start lg:self-auto">
            {isScanning ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono shadow-cyan-glow">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span>Scanning Active Sandbox Target...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-obsidian-950/60 border border-white/[0.08] text-slate-400 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                <span>Sandbox Ready</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Investigation Workbench Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Probe Configuration Form */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-obsidian-900/85 border border-white/[0.08] p-6 shadow-obsidian-card backdrop-blur-md space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white tracking-wide">
                  Scan Parameters
                </h3>
              </div>
              <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                PROBE_SPEC
              </span>
            </div>

            {/* Target URL */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 tracking-wide">
                Target Website URL
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-500 pointer-events-none">
                  <Globe className="w-4 h-4 text-cyan-400/70" />
                  <span className="text-[10px] font-mono text-slate-600 font-bold border-r border-white/10 pr-1.5">URL</span>
                </div>
                <input
                  type="text"
                  disabled={isScanning}
                  value={targetUrl}
                  onChange={(e) => {
                    setTargetUrl(e.target.value);
                    setValidationError('');
                  }}
                  placeholder="https://paysecure-india.in"
                  className="w-full bg-obsidian-950/80 border border-white/[0.08] rounded-xl pl-16 pr-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/20 transition-all font-mono disabled:opacity-50"
                />
              </div>
            </div>

            {/* Authorized Demo Targets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-400">
                  Authorized Demo Targets
                </label>
                <span className="text-[10px] text-slate-500 font-mono">3 Presets</span>
              </div>
              <div className="space-y-2">
                {DEMO_PRESET_TARGETS.map((p) => {
                  const isSelected = targetUrl === p.url;
                  return (
                    <button
                      key={p.url}
                      type="button"
                      disabled={isScanning}
                      onClick={() => {
                        setTargetUrl(p.url);
                        setProfile(p.profile);
                        setValidationError('');
                      }}
                      className={`w-full text-left p-3.5 rounded-xl border text-xs transition-all ${
                        isSelected
                          ? 'bg-gradient-to-r from-cyan-950/30 to-obsidian-950/60 border-cyan-400/50 text-cyan-200 shadow-cyan-glow'
                          : 'bg-obsidian-950/50 border-white/[0.06] text-slate-300 hover:bg-obsidian-850 hover:border-white/[0.12] hover:text-white'
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between">
                        <span className="font-sans text-xs tracking-wide">{p.label}</span>
                        {isSelected ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-cyan-400 uppercase">Selected</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,242,254,0.8)]" />
                          </div>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-600">ID: {p.profile}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        {p.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scan Profile Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Scan Profile
              </label>
              <select
                disabled={isScanning}
                value={profile}
                onChange={(e) => setProfile(e.target.value as ScanProfile)}
                className="w-full bg-obsidian-950/80 border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-200 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/20 disabled:opacity-50 cursor-pointer transition-all"
              >
                <option value="quick_scan">Quick Scan (Rapid Third-Party Pixel & Cookie Check)</option>
                <option value="privacy_audit">Privacy Audit (Full DPDP Act PII & Data Flow Inspection)</option>
                <option value="auth_tests">Authorization Tests (Unauthenticated & Consent Bypass Tests)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                {profile === 'quick_scan' && 'Runs lightweight check on public landing pages and third-party trackers.'}
                {profile === 'privacy_audit' && 'Deep audit of form telemetry, national ID parameters, and storage caches.'}
                {profile === 'auth_tests' && 'Tests unauthenticated access, pre-consent cookies, and opt-out compliance.'}
              </p>
            </div>

            {/* Optional Consent Behavior Comparison Toggle */}
            <div className="pt-2 border-t border-white/[0.06]">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  disabled={isScanning}
                  checked={consentTesting}
                  onChange={(e) => setConsentTesting(e.target.checked)}
                  className="mt-0.5 rounded bg-obsidian-950 border-white/[0.15] text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-200 block group-hover:text-cyan-300 transition-colors">
                    Optional Consent-Behavior Comparison Toggle
                  </span>
                  <span className="text-[11px] text-slate-400 leading-relaxed block mt-0.5">
                    Compares observed browser beacon firings Before Consent vs After Consent Rejection under DPDP Section 6.
                  </span>
                </div>
              </label>
            </div>

            {/* Clear Authorization Reminder */}
            <div className="p-3.5 rounded-xl bg-obsidian-950/70 border border-white/[0.08] space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isScanning}
                  checked={authorizedConsent}
                  onChange={(e) => setAuthorizedConsent(e.target.checked)}
                  className="mt-0.5 rounded bg-obsidian-950 border-white/[0.15] text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-[11px] text-slate-300 leading-relaxed">
                  <strong className="text-white">Authorization Reminder:</strong> I certify that I am authorized to test this target domain or am evaluating a controlled demonstration sandbox.
                </span>
              </label>
            </div>

            {/* Error Message Display */}
            {validationError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
                <span className="leading-relaxed">{validationError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2">
              {!isScanning && !scanComplete ? (
                <button
                  type="button"
                  onClick={handleStartScan}
                  disabled={isScanning}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-cyan-glow transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  <Radar className="w-4 h-4 stroke-[2.5]" />
                  <span>Start Scan</span>
                </button>
              ) : isScanning ? (
                <button
                  type="button"
                  onClick={handleCancelScan}
                  className="w-full py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_0_15px_rgba(244,63,94,0.2)]"
                >
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning in progress... (Click to Cancel)</span>
                </button>
              ) : (
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex-1 py-2.5 rounded-xl bg-obsidian-950 hover:bg-obsidian-800 border border-white/[0.08] text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Scan Another Target</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/findings')}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-cyan-glow transition-all"
                  >
                    <span>Inspect Findings ({findingsDiscovered.length})</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Progress & Live Scanner Telemetry */}
        <div className="lg:col-span-7 space-y-4">
          {/* Progress Card */}
          <div className="rounded-2xl bg-obsidian-900/85 border border-white/[0.08] p-6 shadow-obsidian-card backdrop-blur-md space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>Scan Execution Lifecycle</span>
                </h3>
                <span className="text-xs text-slate-400 mt-0.5 block">
                  {isScanning 
                    ? 'Scanner actively inspecting target sandbox telemetry...' 
                    : scanComplete 
                    ? 'Scan completed with deterministic compliance evidence report.' 
                    : 'Scanner idle. Awaiting configuration.'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-cyan-300 bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/30 shadow-cyan-glow">
                  {progress}%
                </span>
              </div>
            </div>

            {/* Glowing Progress Bar */}
            <div className="w-full bg-obsidian-950 rounded-full h-2 overflow-hidden border border-white/[0.08]">
              <div
                className="bg-gradient-to-r from-cyan-400 via-teal-400 to-cyan-300 h-full transition-all duration-500 ease-out rounded-full shadow-[0_0_12px_rgba(0,242,254,0.6)]"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Stages Step List: Exactly 5 Stages */}
            <div className="space-y-2 pt-1">
              {SCAN_STAGES.map((s, idx) => {
                const currentIdx = getStageIndex(currentStage);
                const isPassed = currentIdx > idx || scanComplete;
                const isCurrent = currentIdx === idx && isScanning;
                return (
                  <div
                    key={s.stage}
                    className={`p-3.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
                      isCurrent
                        ? 'bg-gradient-to-r from-cyan-950/40 to-obsidian-950/60 border-cyan-400/50 text-cyan-200 shadow-cyan-glow'
                        : isPassed
                        ? 'bg-obsidian-950/40 border-white/[0.06] text-slate-300'
                        : 'bg-obsidian-950/20 border-white/[0.03] text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isPassed ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-emerald-400" />
                        </div>
                      ) : isCurrent ? (
                        <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center flex-shrink-0">
                          <Cpu className="w-3 h-3 text-cyan-400 animate-spin" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-slate-700/60 flex items-center justify-center flex-shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className={`font-bold ${isCurrent ? 'text-white' : isPassed ? 'text-slate-200' : 'text-slate-500'}`}>
                          {s.label}
                        </div>
                        <div className="text-[11px] text-slate-400 leading-relaxed truncate">
                          {s.description}
                        </div>
                      </div>
                    </div>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse flex-shrink-0 ml-2">
                        RUNNING
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Generated Scan Report Card (Shown on completion) */}
          {scanComplete && completedReport && (
            <div className="rounded-2xl bg-gradient-to-b from-obsidian-900 via-obsidian-850 to-obsidian-900 border border-emerald-500/40 p-6 shadow-obsidian-card space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-wide">
                      Scan Completed: Report Generated
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Report ID: {completedReport.id}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/15 px-3 py-1 rounded-full border border-emerald-500/30 shadow-[0_0_10px_rgba(52,211,153,0.2)]">
                    COMPLETED
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-obsidian-950/70 border border-white/[0.06]">
                  <span className="text-[10px] text-slate-500 uppercase font-mono block">Target</span>
                  <span className="font-semibold text-slate-200 truncate block mt-0.5 font-mono text-[11px]" title={completedReport.targetUrl}>
                    {completedReport.targetUrl}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-obsidian-950/70 border border-white/[0.06]">
                  <span className="text-[10px] text-slate-500 uppercase font-mono block">Profile</span>
                  <span className="font-semibold text-cyan-300 capitalize block mt-0.5 font-mono text-[11px]">
                    {completedReport.profile.replace('_', ' ')}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-obsidian-950/70 border border-white/[0.06]">
                  <span className="text-[10px] text-slate-500 uppercase font-mono block">Duration</span>
                  <span className="font-semibold text-slate-200 block mt-0.5 font-mono text-[11px]">
                    {completedReport.durationSeconds} seconds
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-obsidian-950/70 border border-white/[0.06]">
                  <span className="text-[10px] text-slate-500 uppercase font-mono block">Findings</span>
                  <span className="font-semibold text-rose-400 block mt-0.5 font-mono text-[11px]">
                    {completedReport.findingsCount.total} Flagged
                  </span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs text-slate-400">
                  Findings have been registered and are ready for investigation in the Findings Explorer.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/privacy-flow?scanId=${completedReport.id}`)}
                    className="px-3.5 py-2 rounded-xl bg-obsidian-950 hover:bg-obsidian-800 border border-white/[0.08] text-cyan-300 font-semibold text-xs transition-colors"
                  >
                    View Privacy Flow
                  </button>
                  <button
                    onClick={() => navigate(`/findings?scanId=${completedReport.id}`)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-cyan-glow transition-all"
                  >
                    <span>Open Findings Explorer</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Live Discovered Findings & Console Logs */}
          <div className="rounded-2xl bg-obsidian-900/85 border border-white/[0.08] p-6 shadow-obsidian-card backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold text-slate-200 font-mono tracking-wider">
                  SCANNER CONSOLE TELEMETRY
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-mono">
                  {findingsDiscovered.length > 0
                    ? `${findingsDiscovered.length} potential compliance risk indicators identified`
                    : 'No potential risk indicators detected'}
                </span>
                {consoleLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyLogs}
                    className="p-1 rounded bg-obsidian-950 border border-white/[0.06] text-slate-400 hover:text-white transition-colors"
                    title="Copy Logs"
                  >
                    {copiedLog ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* Findings detected pills */}
            {findingsDiscovered.length > 0 && (
              <div className="space-y-2 p-3.5 rounded-xl bg-obsidian-950/80 border border-white/[0.08]">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block font-mono">
                  Identified Exposures (Real-Time Discovery):
                </span>
                <div className="space-y-1.5">
                  {findingsDiscovered.map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs font-semibold p-2 rounded-lg bg-obsidian-900/60 border border-white/[0.04]">
                      <div className="flex items-center gap-2 text-rose-400 truncate">
                        <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{item.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 flex-shrink-0 px-2 py-0.5 rounded bg-obsidian-950 border border-white/[0.06]">
                        {item.dpdpSection.split('-')[0].trim()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Terminal log box */}
            <div className="h-48 overflow-y-auto bg-obsidian-950/95 rounded-xl p-4 font-mono text-[11px] text-slate-300 space-y-1.5 border border-white/[0.08] shadow-inner relative">
              <div className="sticky top-0 right-0 flex justify-end pointer-events-none mb-1">
                <span className="text-[9px] font-mono text-slate-600 bg-obsidian-900/90 px-2 py-0.5 rounded border border-white/[0.04]">
                  LIVE_LOG_BUFFER
                </span>
              </div>
              {consoleLogs.length === 0 ? (
                <div className="text-slate-600 italic py-8 text-center flex flex-col items-center justify-center gap-1">
                  <Terminal className="w-5 h-5 text-slate-700 mb-1" />
                  <span>No active audit session. Launch investigation to stream output.</span>
                </div>
              ) : (
                consoleLogs.map((log, index) => (
                  <div key={index} className="leading-relaxed flex items-start gap-2">
                    <span className="text-cyan-400 font-bold select-none">{'>'}</span>
                    <span className={log.includes('[ERROR]') ? 'text-rose-400' : log.includes('[WARN]') ? 'text-amber-300' : log.includes('[COMPLETED]') ? 'text-emerald-300' : 'text-slate-300'}>
                      {log}
                    </span>
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
