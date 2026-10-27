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
  ShieldCheck,
  Building2
} from 'lucide-react';
import { ScanProfile, ScanStage, ScanResult, Finding, Website } from '@/types';
import { DEMO_PRESET_TARGETS } from '@/data/mockData';
import { scanService, validateScanTarget, AUTHORIZED_DEMO_DOMAINS } from '@/services/scanService';
import { api } from '@/services/api';
import { authService } from '@/services/authService';
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

  const domainParam = searchParams.get('domain');
  const targetParam = searchParams.get('target');
  const initialTarget = domainParam
    ? (domainParam.startsWith('http') ? domainParam : `https://${domainParam}`)
    : (targetParam || 'https://paysecure-india.in');

  const [targetUrl, setTargetUrl] = useState(initialTarget);
  const [verifiedWebsites, setVerifiedWebsites] = useState<Website[]>([]);
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
    if (authService.isAuthenticated()) {
      api.getOrganizations()
        .then(orgs => {
          if (orgs.length > 0) {
            return api.getWebsites(orgs[0].id);
          }
          return [];
        })
        .then(sites => {
          if (isMounted.current) {
            setVerifiedWebsites(sites);
          }
        })
        .catch(() => {});
    }
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

    // 2. Validate URL against demo boundaries and verified organization domains
    const verifiedHostnames = verifiedWebsites
      .filter((w) => w.verificationStatus === 'verified')
      .map((w) => w.hostname);
    const validation = validateScanTarget(targetUrl, verifiedHostnames);
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
      <div className="relative overflow-hidden rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] p-6 shadow-subtle">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F]">
                <Radar className="w-5 h-5 animate-spin-slow" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B] font-sans">
                    Target Website Scanner
                  </h2>
                  <span className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#52796F] border border-[#E4E4E7]">
                    DEMO SCANNER
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#71717A] mt-0.5">
                  Launch deterministic privacy investigations to detect personal data exposures, tracker fires, and consent notice validity under India's DPDP Act 2023.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start lg:self-auto">
            {isScanning ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F] text-xs font-mono shadow-subtle">
                <span className="w-2 h-2 rounded-full bg-[#14B8A6] animate-ping" />
                <span>Scanning Active Sandbox Target...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] text-[#71717A] text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-[#15803D]" />
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
          <div className="rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] p-6 shadow-subtle space-y-5">
            <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-3.5">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#52796F]" />
                <h3 className="text-sm font-bold text-[#18181B] tracking-wide">
                  Scan Parameters
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[#52796F] bg-[#F1F5F9] px-2 py-0.5 rounded border border-[#E4E4E7]">
                PROBE_SPEC
              </span>
            </div>

            {/* Target URL */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#18181B] tracking-wide">
                Target Website URL
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[#71717A] pointer-events-none">
                  <Globe className="w-4 h-4 text-[#52796F]" />
                  <span className="text-[10px] font-mono text-[#71717A] font-bold border-r border-[#E4E4E7] pr-1.5">URL</span>
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
                  className="w-full bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl pl-16 pr-4 py-2.5 text-xs text-[#18181B] placeholder:text-slate-600 focus:outline-none focus:border-[#52796F] focus:ring-1 focus:ring-[#14B8A6]/20 transition-all font-mono disabled:opacity-50"
                />
              </div>
            </div>

            {/* Organization Verified Domains */}
            {verifiedWebsites.filter((w) => w.verificationStatus === 'verified').length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-[#52796F] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Your Verified Domains
                  </label>
                  <Link to="/domains" className="text-[10px] text-[#71717A] hover:text-[#52796F] underline">
                    Manage Domains
                  </Link>
                </div>
                <div className="space-y-2">
                  {verifiedWebsites
                    .filter((w) => w.verificationStatus === 'verified')
                    .map((w) => {
                      const fullUrl = `https://${w.hostname}`;
                      const isSelected = targetUrl === fullUrl || targetUrl === w.hostname;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          disabled={isScanning}
                          onClick={() => {
                            setTargetUrl(fullUrl);
                            setValidationError('');
                          }}
                          className={`w-full text-left p-3 rounded-xl border text-xs transition-all ${
                            isSelected
                              ? 'bg-[#F1F5F9] border-[#52796F] text-[#18181B] shadow-subtle'
                              : 'bg-[#F8FAFC] border-[#E4E4E7] text-[#71717A] hover:bg-[#F1F5F9] hover:border-[#52796F]/20 hover:text-[#18181B]'
                          }`}
                        >
                          <div className="font-bold flex items-center justify-between">
                            <span className="font-mono text-xs tracking-wide flex items-center gap-1.5">
                              <Globe className="w-3.5 h-3.5 text-[#52796F]" />
                              {w.hostname}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-[#15803D] border border-green-200">
                              Verified
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Authorized Demo Targets */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-[#71717A]">
                  Authorized Demo Sandboxes
                </label>
                <span className="text-[10px] text-[#71717A] font-mono">3 Presets</span>
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
                          ? 'bg-[#F1F5F9] border-[#52796F] text-[#18181B] shadow-subtle'
                          : 'bg-[#F8FAFC] border-[#E4E4E7] text-[#71717A] hover:bg-[#F1F5F9] hover:text-[#18181B]'
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between">
                        <span className="font-sans text-xs tracking-wide">{p.label}</span>
                        {isSelected ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-[#52796F] uppercase">Selected</span>
                            <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6]" />
                          </div>
                        ) : (
                          <span className="text-[10px] font-mono text-[#71717A]">ID: {p.profile}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#71717A] mt-1 leading-relaxed">
                        {p.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scan Profile Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#18181B]">
                Scan Profile
              </label>
              <select
                disabled={isScanning}
                value={profile}
                onChange={(e) => setProfile(e.target.value as ScanProfile)}
                className="w-full bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-3.5 py-2.5 text-xs font-medium text-[#18181B] focus:outline-none focus:border-[#52796F] focus:ring-1 focus:ring-[#14B8A6]/20 disabled:opacity-50 cursor-pointer transition-all"
              >
                <option value="quick_scan">Quick Scan (Rapid Third-Party Pixel & Cookie Check)</option>
                <option value="privacy_audit">Privacy Audit (Full DPDP Act PII & Data Flow Inspection)</option>
                <option value="auth_tests">Authorization Tests (Unauthenticated & Consent Bypass Tests)</option>
              </select>
              <p className="text-[11px] text-[#71717A] mt-1 leading-relaxed">
                {profile === 'quick_scan' && 'Runs lightweight check on public landing pages and third-party trackers.'}
                {profile === 'privacy_audit' && 'Deep audit of form telemetry, national ID parameters, and storage caches.'}
                {profile === 'auth_tests' && 'Tests unauthenticated access, pre-consent cookies, and opt-out compliance.'}
              </p>
            </div>

            {/* Optional Consent Behavior Comparison Toggle */}
            <div className="pt-2 border-t border-[#E4E4E7]">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  disabled={isScanning}
                  checked={consentTesting}
                  onChange={(e) => setConsentTesting(e.target.checked)}
                  className="mt-0.5 rounded bg-[#F8FAFC] border-[#E4E4E7] text-[#52796F] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-[#18181B] block group-hover:text-[#52796F] transition-colors">
                    Optional Consent-Behavior Comparison Toggle
                  </span>
                  <span className="text-[11px] text-[#71717A] leading-relaxed block mt-0.5">
                    Compares observed browser beacon firings Before Consent vs After Consent Rejection under DPDP Section 6.
                  </span>
                </div>
              </label>
            </div>

            {/* Clear Authorization Reminder */}
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isScanning}
                  checked={authorizedConsent}
                  onChange={(e) => setAuthorizedConsent(e.target.checked)}
                  className="mt-0.5 rounded bg-[#F8FAFC] border-[#E4E4E7] text-[#52796F] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span className="text-[11px] text-[#71717A] leading-relaxed">
                  <strong className="text-[#18181B]">Authorization Reminder:</strong> I certify that I am authorized to test this target domain or am evaluating a controlled demonstration sandbox.
                </span>
              </label>
            </div>

            {/* Error Message Display */}
            {validationError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-[#B91C1C] text-xs space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-[#B91C1C] mt-0.5" />
                  <span className="leading-relaxed">{validationError}</span>
                </div>
                {validationError.includes('Domain Management') && (
                  <div className="pl-6.5 pt-1">
                    <Link
                      to="/domains"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#52796F] hover:text-[#405F57] underline"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Go to Domain Management to Verify Ownership
                    </Link>
                  </div>
                )}
              </div>
            )}


            {/* Action Buttons */}
            <div className="pt-2">
              {!isScanning && !scanComplete ? (
                <button
                  type="button"
                  onClick={handleStartScan}
                  disabled={isScanning}
                  className="w-full py-3 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-subtle transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  <Radar className="w-4 h-4 stroke-[2.5]" />
                  <span>Start Scan</span>
                </button>
              ) : isScanning ? (
                <button
                  type="button"
                  onClick={handleCancelScan}
                  className="w-full py-3 rounded-xl bg-red-50 hover:bg-[#B91C1C]/30 border border-red-200 text-[#B91C1C] font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-subtle"
                >
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning in progress... (Click to Cancel)</span>
                </button>
              ) : (
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex-1 py-2.5 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-[#18181B] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Scan Another Target</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/findings')}
                    className="flex-1 py-2.5 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-subtle transition-all"
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
          <div className="rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] p-6 shadow-subtle space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#52796F]" />
                  <span>Scan Execution Lifecycle</span>
                </h3>
                <span className="text-xs text-[#71717A] mt-0.5 block">
                  {isScanning 
                    ? 'Scanner actively inspecting target sandbox telemetry...' 
                    : scanComplete 
                    ? 'Scan completed with deterministic compliance evidence report.' 
                    : 'Scanner idle. Awaiting configuration.'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-[#52796F] bg-[#F1F5F9] px-2.5 py-1 rounded-lg border border-[#E4E4E7]">
                  {progress}%
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-[#F8FAFC] rounded-full h-2 overflow-hidden border border-[#E4E4E7]">
              <div
                className="bg-[#14B8A6] h-full transition-all duration-500 ease-out rounded-full"
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
                        ? 'bg-[#F1F5F9] border-[#52796F] text-[#18181B] shadow-subtle'
                        : isPassed
                        ? 'bg-[#F8FAFC] border-[#E4E4E7] text-slate-300'
                        : 'bg-[#F8FAFC]/50 border-[#E4E4E7]/40 text-[#71717A]/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isPassed ? (
                        <div className="w-5 h-5 rounded-full bg-green-50 border border-green-200 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-[#15803D]" />
                        </div>
                      ) : isCurrent ? (
                        <div className="w-5 h-5 rounded-full bg-[#52796F]/20 border border-[#52796F]/50 flex items-center justify-center flex-shrink-0">
                          <Cpu className="w-3 h-3 text-[#52796F] animate-spin" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-[#E4E4E7] flex items-center justify-center flex-shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#273449]" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className={`font-bold ${isCurrent ? 'text-white' : isPassed ? 'text-slate-200' : 'text-[#71717A]'}`}>
                          {s.label}
                        </div>
                        <div className="text-[11px] text-[#71717A] leading-relaxed truncate">
                          {s.description}
                        </div>
                      </div>
                    </div>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#F1F5F9] text-[#52796F] border border-[#52796F] animate-pulse flex-shrink-0 ml-2">
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
            <div className="rounded-2xl bg-[#FFFFFF] border border-green-200 p-6 shadow-subtle space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-[#E4E4E7] pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center text-[#15803D]">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#18181B] tracking-wide">
                      Scan Completed: Report Generated
                    </h4>
                    <span className="text-[10px] text-[#71717A] font-mono">
                      Report ID: {completedReport.id}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-[#15803D] bg-green-50 px-3 py-1 rounded-full border border-green-200">
                    COMPLETED
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7]">
                  <span className="text-[10px] text-[#71717A] uppercase font-mono block">Target</span>
                  <span className="font-semibold text-[#18181B] truncate block mt-0.5 font-mono text-[11px]" title={completedReport.targetUrl}>
                    {completedReport.targetUrl}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7]">
                  <span className="text-[10px] text-[#71717A] uppercase font-mono block">Profile</span>
                  <span className="font-semibold text-[#52796F] capitalize block mt-0.5 font-mono text-[11px]">
                    {completedReport.profile.replace('_', ' ')}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7]">
                  <span className="text-[10px] text-[#71717A] uppercase font-mono block">Duration</span>
                  <span className="font-semibold text-[#18181B] block mt-0.5 font-mono text-[11px]">
                    {completedReport.durationSeconds} seconds
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7]">
                  <span className="text-[10px] text-[#71717A] uppercase font-mono block">Findings</span>
                  <span className="font-semibold text-[#B91C1C] block mt-0.5 font-mono text-[11px]">
                    {completedReport.findingsCount.total} Flagged
                  </span>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-xs text-[#71717A]">
                  Findings have been registered and are ready for investigation in the Findings Explorer.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/privacy-flow?scanId=${completedReport.id}`)}
                    className="px-3.5 py-2 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-[#52796F] font-semibold text-xs transition-colors"
                  >
                    View Privacy Flow
                  </button>
                  <button
                    onClick={() => navigate(`/findings?scanId=${completedReport.id}`)}
                    className="px-4 py-2 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white font-bold text-xs flex items-center gap-1.5 shadow-subtle transition-all"
                  >
                    <span>Open Findings Explorer</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Live Discovered Findings & Console Logs */}
          <div className="rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] p-6 shadow-subtle space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#52796F]" />
                <h4 className="text-xs font-bold text-[#18181B] font-mono tracking-wider">
                  SCANNER CONSOLE TELEMETRY
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#71717A] font-mono">
                  {findingsDiscovered.length > 0
                    ? `${findingsDiscovered.length} potential compliance risk indicators identified`
                    : 'No potential risk indicators detected'}
                </span>
                {consoleLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyLogs}
                    className="p-1 rounded bg-[#F8FAFC] border border-[#E4E4E7] text-[#71717A] hover:text-[#18181B] transition-colors"
                    title="Copy Logs"
                  >
                    {copiedLog ? <Check className="w-3 h-3 text-[#15803D]" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>

            {/* Findings detected pills */}
            {findingsDiscovered.length > 0 && (
              <div className="space-y-2 p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7]">
                <span className="text-[10px] text-[#71717A] uppercase font-bold tracking-wider block font-mono">
                  Identified Exposures (Real-Time Discovery):
                </span>
                <div className="space-y-1.5">
                  {findingsDiscovered.map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs font-semibold p-2 rounded-lg bg-[#FFFFFF] border border-[#E4E4E7]">
                      <div className="flex items-center gap-2 text-[#B91C1C] truncate">
                        <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{item.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#71717A] flex-shrink-0 px-2 py-0.5 rounded bg-[#F8FAFC] border border-[#E4E4E7]">
                        {item.dpdpSection.split('-')[0].trim()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Terminal log box */}
            <div className="h-48 overflow-y-auto bg-[#F8FAFC] rounded-xl p-4 font-mono text-[11px] text-[#18181B] space-y-1.5 border border-[#E4E4E7] shadow-inner relative">
              <div className="sticky top-0 right-0 flex justify-end pointer-events-none mb-1">
                <span className="text-[9px] font-mono text-[#71717A] bg-[#FFFFFF] px-2 py-0.5 rounded border border-[#E4E4E7]">
                  LIVE_LOG_BUFFER
                </span>
              </div>
              {consoleLogs.length === 0 ? (
                <div className="text-[#71717A] italic py-8 text-center flex flex-col items-center justify-center gap-1">
                  <Terminal className="w-5 h-5 text-slate-600 mb-1" />
                  <span>No active audit session. Launch investigation to stream output.</span>
                </div>
              ) : (
                consoleLogs.map((log, index) => (
                  <div key={index} className="leading-relaxed flex items-start gap-2">
                    <span className="text-[#52796F] font-bold select-none">{'>'}</span>
                    <span className={log.includes('[ERROR]') ? 'text-[#B91C1C]' : log.includes('[WARN]') ? 'text-[#B45309]' : log.includes('[COMPLETED]') ? 'text-[#15803D]' : 'text-slate-300'}>
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
