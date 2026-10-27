import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  Wrench, 
  CheckCircle2, 
  RotateCcw, 
  Play, 
  ShieldCheck, 
  FileCode2, 
  ArrowRight, 
  AlertTriangle, 
  Check, 
  Copy, 
  Cpu, 
  Terminal, 
  ShieldAlert, 
  Lock,
  Search,
  Filter,
  Clock,
  Trash2,
  ShieldX,
  FileSearch,
  ExternalLink,
  ChevronRight,
  Info,
  Bug,
  RefreshCw,
  Eye,
  SlidersHorizontal,
  KeyRound,
  Sparkles,
  LogIn,
  UserPlus
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { api } from '@/services/api';
import { remediationService } from '@/services/remediationService';
import { authService } from '@/services/authService';
import { LoginModal } from '@/components/auth/LoginModal';
import { Finding, Severity, FindingStatus, VerificationProbeResult, AuditHistoryRecord } from '@/types';
import { formatSeverity, formatDate } from '@/lib/utils';
import { SYNTHETIC_ACCOUNT_A, SYNTHETIC_ACCOUNT_B } from '@/data/authTestFixture';

export const FixVerify: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Authentication & Session State
  const [currentUser, setCurrentUser] = useState(authService.getCurrentUser());
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<'login' | 'register'>('login');

  // Page Loading & Error Lifecycle State
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState<string>(
    searchParams.get('findingId') || 'DPDP-HIGH-007'
  );
  
  // 5-stage guided workflow: 1: Review, 2: Evidence, 3: Fix, 4: Apply, 5: Verify
  const [currentStage, setCurrentStage] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');

  // Patch deployment state
  const [isPatched, setIsPatched] = useState(false);
  const [isDeployingPatch, setIsDeployingPatch] = useState(false);

  // Probe verification state
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationProgress, setVerificationProgress] = useState(0);
  const [verificationLogs, setVerificationLogs] = useState<string[]>([]);
  const [lastProbeResult, setLastProbeResult] = useState<VerificationProbeResult | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Audit history state
  const [auditHistory, setAuditHistory] = useState<AuditHistoryRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // UI helpers
  const [copiedCode, setCopiedCode] = useState(false);

  // Helper to load audit history from backend database
  const loadAuditHistory = async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const records = await remediationService.getAuditHistory();
      setAuditHistory(records);
    } catch (err: any) {
      setHistoryError(err?.message || 'Failed to connect to PrivaCraft backend audit history service.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Load findings and audit history with guaranteed lifecycle cleanup
  const loadAll = async () => {
    if (!authService.isAuthenticated()) {
      setFindings([]);
      setAuditHistory([]);
      setIsPageLoading(false);
      setPageError(null);
      return;
    }

    setIsPageLoading(true);
    setPageError(null);
    try {
      const list = await api.getFindings();
      setFindings(list);

      const urlId = searchParams.get('findingId');
      if (urlId && list.some((f) => f.id === urlId)) {
        setSelectedFindingId(urlId);
      } else if (list.length > 0 && !list.some((f) => f.id === selectedFindingId)) {
        // prefer BOLA finding DPDP-HIGH-007 if present, else first finding
        const bola = list.find((f) => f.id === 'DPDP-HIGH-007');
        setSelectedFindingId(bola ? bola.id : list[0].id);
      }

      await loadAuditHistory();
    } catch (err: any) {
      setPageError(err?.message || 'Failed to load Fix & Verify workspace data.');
    } finally {
      setIsPageLoading(false);
    }
  };

  // Sync auth state changes across the application
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange((user) => {
      setCurrentUser(user);
      if (user) {
        loadAll();
      } else {
        setFindings([]);
        setAuditHistory([]);
        setIsPageLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Reload findings and audit history when searchParams change or on initial mount
  useEffect(() => {
    loadAll();
  }, [searchParams]);

  // Synchronize patch status for active finding
  useEffect(() => {
    if (selectedFindingId) {
      const patched = remediationService.isFindingPatched(selectedFindingId);
      setIsPatched(patched);
      setLastProbeResult(null);
      setVerificationLogs([]);
      setVerificationProgress(0);
    }
  }, [selectedFindingId]);

  const activeFinding = useMemo(() => {
    return findings.find((f) => f.id === selectedFindingId) || findings[0];
  }, [findings, selectedFindingId]);

  // Filtered findings list for quick selection
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      const matchesSearch = 
        f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.affectedUrl.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSeverity = severityFilter === 'all' || f.severity === severityFilter;
      return matchesSearch && matchesSeverity;
    });
  }, [findings, searchQuery, severityFilter]);

  // Summary counts
  const summaryCounts = useMemo(() => {
    const openCount = findings.filter((f) => f.status === 'open').length;
    const inProgressCount = findings.filter((f) => f.status === 'in_review').length;
    const verifiedCount = findings.filter((f) => f.status === 'verified_fix').length;
    return { openCount, inProgressCount, verifiedCount };
  }, [findings]);

  // Handler: Select Finding
  const handleSelectFinding = (id: string) => {
    setSelectedFindingId(id);
    setSearchParams({ findingId: id });
    setCurrentStage(1);
  };

  // Handler: Apply or Revert Patch
  const handleTogglePatch = (targetPatchState: boolean) => {
    if (!activeFinding) return;
    setIsDeployingPatch(true);
    setVerificationError(null);

    setTimeout(() => {
      setIsPatched(targetPatchState);
      remediationService.setFindingPatched(activeFinding.id, targetPatchState);
      setIsDeployingPatch(false);
      setLastProbeResult(null);
      setVerificationLogs([]);
      setVerificationProgress(0);
      if (targetPatchState) {
        toast.success(`Patch staged in sandbox for [${activeFinding.id}]`);
      } else {
        toast.info(`Sandbox reverted to vulnerable unpatched state for [${activeFinding.id}]`);
      }
    }, 300);
  };

  // Handler: Execute Verification Probe
  const handleRunVerification = async (forcePatchedState?: boolean) => {
    if (!activeFinding) return;

    const testState = forcePatchedState !== undefined ? forcePatchedState : isPatched;
    if (forcePatchedState !== undefined && forcePatchedState !== isPatched) {
      setIsPatched(forcePatchedState);
      remediationService.setFindingPatched(activeFinding.id, forcePatchedState);
    }

    setIsVerifying(true);
    setVerificationError(null);
    setLastProbeResult(null);
    setVerificationProgress(20);

    const targetUrl = activeFinding.id === 'DPDP-HIGH-007'
      ? 'http://127.0.0.1:8000/testbed/api/v1/customers/usr_demo_custB/kyc-record'
      : (activeFinding.endpoint || activeFinding.affectedUrl);

    setVerificationLogs([
      `[INIT] Dispatching verification probe to PrivaCraft backend...`,
      `[TARGET] ${targetUrl}`,
      `[MODE] ${testState ? 'REMEDIATED (Patched Guard Active)' : 'UNPATCHED / VULNERABLE (Simulate Exposure)'}`,
      `[CALLER] Account A (${SYNTHETIC_ACCOUNT_A.id} / ${SYNTHETIC_ACCOUNT_A.name})`,
      `[RESOURCE] Confidential KYC Record: Account B (${SYNTHETIC_ACCOUNT_B.id} / ${SYNTHETIC_ACCOUNT_B.name})`,
    ]);

    try {
      setVerificationProgress(50);
      const probeResult = await remediationService.runVerification(activeFinding.id, testState);
      setVerificationProgress(100);
      setIsVerifying(false);
      setLastProbeResult(probeResult);

      if (probeResult.outcome === 'PASS') {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
        toast.success(`Verified Fix: ${probeResult.testCaseId} PASSED!`);

        setVerificationLogs((prev) => [
          ...prev,
          `[DISPATCH] ${probeResult.request.method} ${probeResult.request.url}`,
          `[RESPONSE] HTTP ${probeResult.response.statusCode} ${probeResult.response.statusText} (${probeResult.response.durationMs}ms)`,
          `[SAFEGUARD] Object-level authorization guard confirmed: access denied with zero PII leaked.`,
          `[TEST PASSED] Verification Confirmed: Status upgraded to "VERIFIED FIX".`,
          `[PERSISTED] Real audit record saved to SQLite database (Test Case: ${probeResult.testCaseId}).`,
          `[COMPLIANCE] Score: ${probeResult.complianceDelta.newComplianceScore}% (+${probeResult.complianceDelta.statutoryRiskReductionPercent}% technical risk reduction).`,
        ]);
      } else {
        toast.error(`Verification Failed: Personal data exposure reproduced (${probeResult.testCaseId})`);

        setVerificationLogs((prev) => [
          ...prev,
          `[DISPATCH] ${probeResult.request.method} ${probeResult.request.url}`,
          `[RESPONSE] HTTP ${probeResult.response.statusCode} ${probeResult.response.statusText} (${probeResult.response.durationMs}ms)`,
          `[ALERT] Personal data fields exposed: ${probeResult.response.leakedPiiFields.join(', ') || 'Confidential customer data'}`,
          `[TEST FAILED] Vulnerability actively reproduced in sandbox! Status remains "OPEN".`,
          `[PERSISTED] Failure attempt logged in SQLite database (Test Case: ${probeResult.testCaseId}).`,
        ]);
      }

      // Refresh findings and audit history from backend database
      const updatedFindings = await api.getFindings();
      setFindings(updatedFindings);
      await loadAuditHistory();
    } catch (err: any) {
      setIsVerifying(false);
      setVerificationProgress(0);
      const errorMsg = err?.message || 'Verification probe failed. Ensure the backend server is running.';
      setVerificationError(errorMsg);
      toast.error('Probe execution failed: ' + errorMsg);
      setVerificationLogs((prev) => [
        ...prev,
        `[ERROR] ${errorMsg}`,
        `[ABORT] Probe failed to complete. No fake PASS or fixture data substituted.`,
      ]);
    }
  };

  // Handler: Copy code
  const handleCopyCode = () => {
    if (activeFinding?.codeDiff?.afterCode) {
      navigator.clipboard.writeText(activeFinding.codeDiff.afterCode);
      setCopiedCode(true);
      toast.success('Remediation patch copied to clipboard');
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // Handler: Clear history
  const handleClearHistory = async () => {
    if (window.confirm('Are you sure you want to clear the persisted verification audit history from the database?')) {
      try {
        await remediationService.clearAuditHistory();
        await loadAuditHistory();
        toast.info('Audit history cleared');
      } catch (err: any) {
        setHistoryError('Failed to clear audit history: ' + (err?.message || 'Unknown error'));
      }
    }
  };

  // 1. Unauthenticated Gateway State
  if (!currentUser) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-12 px-4">
        <div className="relative overflow-hidden rounded-3xl bg-[#FFFFFF] border border-[#E4E4E7] p-8 sm:p-12 shadow-subtle text-center">
          <div className="relative z-10 max-w-xl mx-auto space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F] flex items-center justify-center mx-auto shadow-subtle">
              <Lock className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F] text-xs font-mono font-semibold">
                <Wrench className="w-3.5 h-3.5 text-[#52796F]" />
                <span>FIX & VERIFY WORKSPACE • TENANT RESTRICTED</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-[#18181B] tracking-tight font-sans">
                Sign In to Access Fix & Verify Workspace
              </h2>
              <p className="text-sm text-[#71717A] leading-relaxed">
                Remediation code patches, sandbox probe verification, and audit trail records are strictly isolated per tenant. Sign in to inspect vulnerability remediation steps and execute live verification probes.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => { setLoginModalMode('login'); setShowLoginModal(true); }}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold text-sm shadow-subtle transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In to Compliance Console</span>
              </button>
              <button
                onClick={() => { setLoginModalMode('register'); setShowLoginModal(true); }}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-[#18181B] font-semibold text-sm transition-all flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4 text-[#52796F]" />
                <span>Register Account</span>
              </button>
            </div>
          </div>
        </div>

        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            setShowLoginModal(false);
            loadAll();
          }}
          initialMode={loginModalMode}
        />
      </div>
    );
  }

  // 2. Active Page Loading State
  if (isPageLoading) {
    return (
      <div className="py-24 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F] flex items-center justify-center mx-auto animate-pulse shadow-subtle">
          <Wrench className="w-6 h-6 animate-spin" style={{ animationDuration: '3s' }} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[#18181B] font-sans">Loading Fix & Verify Workspace...</p>
          <p className="text-xs text-[#71717A] font-mono">Retrieving security findings, remediation patches, and audit verification history</p>
        </div>
      </div>
    );
  }

  // 3. Page Error State with Retry
  if (pageError) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 space-y-4">
        <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-[#B91C1C] space-y-4 shadow-subtle">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-[#B91C1C] flex-shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <h3 className="text-sm font-bold text-[#18181B] font-sans">Unable to Load Fix & Verify Workspace</h3>
              <p className="text-xs text-[#B91C1C] leading-relaxed font-mono">{pageError}</p>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={loadAll}
              className="px-4 py-2 rounded-xl bg-red-50 hover:bg-[#B91C1C]/30 border border-red-200 text-[#18181B] font-semibold text-xs transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Loading</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Empty Findings State
  if (findings.length === 0 || !activeFinding) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] text-[#71717A] flex items-center justify-center mx-auto shadow-subtle">
          <ShieldAlert className="w-7 h-7 text-[#71717A]" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-[#18181B] font-sans">No Findings to Remediate</h2>
          <p className="text-xs sm:text-sm text-[#71717A] max-w-md mx-auto leading-relaxed">
            Your organization has zero active security findings or compliance issues requiring remediation. Run a privacy audit scan to identify exposure risks and generate automated code patches.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to="/scan"
            className="px-5 py-2.5 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold text-xs shadow-subtle transition-all flex items-center gap-2"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Launch Privacy Audit Scan</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={loadAll}
            className="px-4 py-2.5 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-[#18181B] font-semibold text-xs transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>
    );
  }

  const sev = formatSeverity(activeFinding.severity);

  // Line-by-line syntax renderer
  const renderCodeLines = (code: string, isVulnerable: boolean) => {
    const lines = code.split('\n');
    return lines.map((line, idx) => {
      const isHighlight = isVulnerable
        ? line.includes('VULNERABLE') || 
          line.includes('Missing check') || 
          line.includes('Leaks') || 
          line.includes('findOne({ customerId })') || 
          line.includes('img.src =') || 
          line.includes('window.fbq')
        : line.includes('REMEDIATED') || 
          line.includes('authenticatedUserId !== customerId') || 
          line.includes('DPDP_BOLA_PREVENTED') || 
          line.includes('status(403)') || 
          line.includes('maskAadhaar') || 
          line.includes('consentCategories');

      return (
        <div
          key={idx}
          className={`flex items-start text-xs font-mono leading-relaxed py-0.5 px-2.5 ${
            isHighlight
              ? isVulnerable
                ? 'bg-red-50 text-rose-200 border-l-2 border-rose-500 shadow-inner'
                : 'bg-green-50 text-emerald-200 border-l-2 border-emerald-400 shadow-inner'
              : 'text-slate-300 border-l-2 border-transparent'
          }`}
        >
          <span className="w-8 select-none text-right pr-3 text-slate-600 font-mono text-[11px] flex-shrink-0">
            {idx + 1}
          </span>
          <span className="flex-1 whitespace-pre overflow-x-auto">
            {line}
          </span>
        </div>
      );
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header & Subtitle */}
      <div className="relative overflow-hidden rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] p-6 shadow-subtle">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#F1F5F9] text-[#52796F] border border-[#E4E4E7] flex items-center gap-1.5">
                <Wrench className="w-3 h-3 text-[#52796F]" />
                REMEDIATION & VERIFICATION ENGINE
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#F1F5F9] text-[#71717A] border border-[#E4E4E7] flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-[#71717A]" />
                CONTROLLED LOCAL SANDBOX
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#18181B] flex items-center gap-2.5 font-sans">
              <span>Fix & Verify</span>
            </h1>
            <p className="text-xs sm:text-sm text-[#71717A] mt-0.5">
              Turn security findings into verified fixes. Run deterministic synthetic security probes in a safe, controlled local environment.
            </p>
          </div>

          {/* Local Demo Environment Notice Badge */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] text-xs max-w-md shadow-inner">
            <div className="flex items-center gap-2 text-[#52796F] font-bold mb-1 font-mono text-[11px]">
              <ShieldCheck className="w-4 h-4 text-[#52796F]" />
              <span>Controlled Synthetic Testbed Only</span>
            </div>
            <p className="text-[11px] text-[#71717A] leading-relaxed font-sans">
              Probing strictly targets <code className="text-[#52796F] font-mono">/testbed/api/v1/customers/...</code> with synthetic identities (Account A: <code className="text-[#52796F] font-mono">usr_demo_custA</code>, Account B: <code className="text-[#52796F] font-mono">usr_demo_custB</code>). Zero real customer data or external network egress.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Open Issues */}
        <div className="p-5 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-[#71717A] uppercase tracking-wider block font-mono">
              Open Issues
            </span>
            <div className="text-3xl font-black font-mono text-[#18181B]">
              {summaryCounts.openCount}
            </div>
            <span className="text-[11px] text-[#B91C1C] flex items-center gap-1 font-sans">
              <AlertTriangle className="w-3 h-3" />
              Requires technical remediation
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-[#B91C1C]">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        {/* Fixes in Progress */}
        <div className="p-5 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-[#71717A] uppercase tracking-wider block font-mono">
              Fixes In Progress
            </span>
            <div className="text-3xl font-black font-mono text-[#52796F]">
              {summaryCounts.inProgressCount + (isPatched && activeFinding.status !== 'verified_fix' ? 1 : 0)}
            </div>
            <span className="text-[11px] text-[#71717A] flex items-center gap-1 font-sans">
              <RefreshCw className="w-3 h-3 text-[#52796F]" />
              Code patch staged in sandbox
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] border border-[#E4E4E7] flex items-center justify-center text-[#52796F]">
            <Wrench className="w-6 h-6" />
          </div>
        </div>

        {/* Verified Fixes */}
        <div className="p-5 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-[#71717A] uppercase tracking-wider block font-mono">
              Verified Fixes
            </span>
            <div className="text-3xl font-black font-mono text-[#15803D]">
              {summaryCounts.verifiedCount}
            </div>
            <span className="text-[11px] text-[#15803D] flex items-center gap-1 font-sans">
              <CheckCircle2 className="w-3 h-3" />
              Deterministic probe certified
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center text-[#15803D]">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 3. Findings Selection & Filter Bar */}
      <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#18181B] uppercase tracking-wider font-mono">
              Select Finding to Remediate:
            </span>
            <span className="text-xs font-mono text-[#52796F] bg-[#52796F]/10 px-2 py-0.5 rounded border border-[#52796F]/20 font-bold">
              {filteredFindings.length} Available
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
              <input
                type="text"
                placeholder="Search findings or endpoints..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] text-xs text-[#18181B] placeholder-[#94A3B8] focus:outline-none focus:border-[#52796F] w-52 font-mono"
              />
            </div>

            {/* Severity Filter */}
            <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-2.5 py-1 text-xs">
              <Filter className="w-3.5 h-3.5 text-[#71717A]" />
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as any)}
                className="bg-transparent text-[#18181B] text-xs focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-[#F8FAFC] text-[#18181B]">All Severities</option>
                <option value="critical" className="bg-[#F8FAFC] text-[#18181B]">Critical</option>
                <option value="high" className="bg-[#F8FAFC] text-[#18181B]">High</option>
                <option value="medium" className="bg-[#F8FAFC] text-[#18181B]">Medium</option>
                <option value="low" className="bg-[#F8FAFC] text-[#18181B]">Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* Horizontal Findings Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {filteredFindings.map((f) => {
            const isSelected = f.id === activeFinding.id;
            const fSev = formatSeverity(f.severity);
            const isVerified = f.status === 'verified_fix';

            return (
              <button
                key={f.id}
                onClick={() => handleSelectFinding(f.id)}
                className={`px-3.5 py-2.5 rounded-xl border text-left flex-shrink-0 transition-all flex items-center gap-2.5 ${
                  isSelected
                    ? 'bg-[#F1F5F9] border-[#52796F] text-[#18181B] shadow-subtle'
                    : 'bg-[#F8FAFC] hover:bg-[#F1F5F9] border-[#E4E4E7] text-[#71717A]'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${fSev.dot}`} />
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-[#18181B]">{f.id}</span>
                    {isVerified && (
                      <span className="text-[10px] bg-green-50 text-[#15803D] px-1.5 py-0.2 rounded border border-green-200 font-bold">
                        VERIFIED
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#71717A] max-w-[200px] truncate font-sans">
                    {f.title}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. 5-Stage Guided Workflow Navigation Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        {[
          { stage: 1, title: '1. Review Finding', desc: 'Statutory ground & context' },
          { stage: 2, title: '2. Inspect Evidence', desc: 'Observed network payload' },
          { stage: 3, title: '3. Suggested Fix', desc: 'Engineered code diff' },
          { stage: 4, title: '4. Apply Fix', desc: 'Patch sandbox container' },
          { stage: 5, title: '5. Verify Result', desc: 'Execute probe & compare' },
        ].map((s) => {
          const isActive = currentStage === s.stage;
          const isCompleted = currentStage > s.stage || (s.stage === 5 && lastProbeResult?.outcome === 'PASS');

          return (
            <button
              key={s.stage}
              onClick={() => setCurrentStage(s.stage as any)}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                isActive
                  ? 'bg-[#F1F5F9] border-[#52796F] text-[#18181B] shadow-subtle font-semibold'
                  : isCompleted
                  ? 'bg-[#FFFFFF] border-[#E4E4E7] text-[#18181B] hover:border-[#52796F]/20'
                  : 'bg-[#F8FAFC] border-[#E4E4E7] text-[#71717A] hover:text-[#18181B]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs font-sans">{s.title}</span>
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[#71717A]" />
                )}
              </div>
              <div className="text-[11px] text-[#71717A] truncate font-sans">{s.desc}</div>
            </button>
          );
        })}
      </div>

      {/* STAGE 1: Review Finding */}
      {currentStage === 1 && (
        <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-6 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold border ${sev.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                  {sev.label}
                </span>
                <span className="font-mono text-xs text-[#52796F] bg-[#52796F]/10 px-2 py-0.5 rounded border border-[#52796F]/20 font-bold">
                  {activeFinding.id}
                </span>
                <span className="text-xs text-[#71717A] font-mono">
                  Confidence: {activeFinding.confidence}%
                </span>
                <span className="text-xs text-[#71717A] font-mono">
                  Status:{' '}
                  <span className={activeFinding.status === 'verified_fix' ? 'text-[#15803D] font-bold' : 'text-[#B91C1C] font-bold'}>
                    {activeFinding.status.toUpperCase()}
                  </span>
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#18181B] mt-1 font-sans">
                {activeFinding.title}
              </h2>
            </div>

            <button
              onClick={() => setCurrentStage(2)}
              className="px-5 py-2.5 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold text-xs flex items-center gap-2 shadow-subtle transition-all active:scale-95"
            >
              <span>Next: Inspect Evidence</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-2">
              <span className="text-xs font-bold text-[#18181B] uppercase tracking-wider block font-mono">
                Technical Vulnerability Summary
              </span>
              <p className="text-xs text-[#71717A] leading-relaxed font-sans">
                {activeFinding.summary}
              </p>
              <div className="pt-2 text-[11px] text-[#71717A] font-mono break-all">
                <span className="text-[#71717A]">Affected Target:</span> {activeFinding.affectedUrl}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-2">
              <span className="text-xs font-bold text-[#52796F] uppercase tracking-wider block font-mono">
                Statutory Ground: DPDP Act 2023
              </span>
              <div className="font-mono text-xs text-[#18181B] font-semibold">
                {activeFinding.dpdpSection}
              </div>
              <p className="text-xs text-[#71717A] leading-relaxed font-sans">
                {activeFinding.impactExplanation}
              </p>
            </div>
          </div>

          {activeFinding.id === 'DPDP-HIGH-007' && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
              <div className="flex items-center gap-2 text-[#B45309] font-bold text-xs font-mono">
                <KeyRound className="w-4 h-4" />
                <span>Synthetic BOLA/IDOR Cross-Account Test Scenario</span>
              </div>
              <p className="text-xs text-[#71717A] leading-relaxed font-sans">
                In this test case, <strong>Account A (Rajesh Kumar Sharma)</strong> holds a valid session token. 
                Account A queries the confidential KYC endpoint targeting <strong>Account B (Priya Patel)</strong> at 
                <code className="text-[#B45309] bg-[#F8FAFC] px-1.5 py-0.5 rounded font-mono ml-1">
                  /api/v1/customers/usr_demo_custB/kyc-record
                </code>.
                Without authorization check, Account B's PAN, Aadhaar ref, mobile, and residential address leak to Account A.
              </p>
            </div>
          )}

          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-2">
            <span className="text-xs font-bold text-[#18181B] uppercase tracking-wider block font-mono">
              Remediation Action Plan
            </span>
            <ul className="space-y-2 text-xs text-[#71717A] font-sans">
              {activeFinding.remediationSteps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6] mt-1.5 flex-shrink-0" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* STAGE 2: Inspect Evidence */}
      {currentStage === 2 && (
        <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileSearch className="w-5 h-5 text-[#52796F]" />
                <h3 className="text-lg font-bold text-[#18181B] font-sans">
                  Observed Technical Evidence & Network Telemetry
                </h3>
              </div>
              <p className="text-xs text-[#71717A] mt-0.5">
                Exact intercepted request, headers, and captured personal data markers from scan probe.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentStage(1)}
                className="px-4 py-2 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-[#18181B] text-xs font-semibold transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStage(3)}
                className="px-5 py-2.5 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold text-xs flex items-center gap-2 shadow-subtle transition-all active:scale-95"
              >
                <span>Next: Review Suggested Fix</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Evidence Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-1">
              <span className="text-[#71717A] block text-[11px] uppercase">HTTP METHOD</span>
              <span className="font-bold text-[#52796F]">{activeFinding.observedEvidence.method}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-1 md:col-span-2">
              <span className="text-[#71717A] block text-[11px] uppercase">TARGET URL</span>
              <span className="text-[#18181B] break-all">{activeFinding.observedEvidence.url}</span>
            </div>
          </div>

          {/* Detected PII Tags */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-[#71717A] block uppercase tracking-wider font-mono">
              Identified Personal Data Fields in Payload:
            </span>
            <div className="flex flex-wrap gap-2">
              {activeFinding.observedEvidence.detectedFields.map((field, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg bg-red-50 text-[#B91C1C] border border-red-200 text-xs font-mono font-semibold flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3 h-3 text-[#B91C1C]" />
                  {field}
                </span>
              ))}
            </div>
          </div>

          {/* Payload Display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#18181B] font-sans">
                Intercepted Response Body / Evidence Payload:
              </span>
              <span className="text-[11px] font-mono text-[#B91C1C] bg-red-50 px-2 py-0.5 rounded border border-red-200 font-bold">
                CONFIDENTIAL DATA EXPOSURE
              </span>
            </div>
            <pre className="p-4 rounded-xl bg-[#F8FAFC] border border-red-200 text-[#B91C1C] font-mono text-xs overflow-x-auto shadow-inner leading-relaxed">
              {activeFinding.observedEvidence.sanitizedPayload}
            </pre>
          </div>
        </div>
      )}

      {/* STAGE 3: Suggested Fix (Code Diff) */}
      {currentStage === 3 && (
        <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileCode2 className="w-5 h-5 text-[#52796F]" />
                <h3 className="text-lg font-bold text-[#18181B] font-sans">
                  Engineered Code Fix ({activeFinding.codeDiff?.filePath || 'Source Code'})
                </h3>
              </div>
              <p className="text-xs text-[#71717A] mt-0.5">
                {activeFinding.codeDiff?.description || 'Review the recommended patch to remediate the identified technical risk.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyCode}
                className="px-3.5 py-2 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-[#18181B] text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-[#15803D]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied to Clipboard' : 'Copy Remediation Code'}</span>
              </button>

              <button
                onClick={() => setCurrentStage(4)}
                className="px-5 py-2.5 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold text-xs flex items-center gap-2 shadow-subtle transition-all active:scale-95"
              >
                <span>Next: Apply Fix to Sandbox</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Controlled demo code diff banner */}
          <div className="px-4 py-2 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] text-[#52796F] text-xs flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold">
              CONTROLLED CODE DIFF — FOR SANCTIONED LOCAL SIMULATION ONLY
            </span>
            <span className="text-[11px] text-[#71717A] font-mono">
              Language: {activeFinding.codeDiff?.language || 'TypeScript'}
            </span>
          </div>

          {/* Side by side code diff */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Before (Vulnerable) */}
            <div className="rounded-2xl border border-red-200 bg-[#F8FAFC] overflow-hidden flex flex-col shadow-inner">
              <div className="px-4 py-2.5 bg-red-50 border-b border-red-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#B91C1C]" />
                  <span className="font-mono text-[#B91C1C] font-bold">
                    BEFORE: Vulnerable Authorization / Logic
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-50 text-[#B91C1C] uppercase font-bold">
                  DPDP Breach Risk
                </span>
              </div>
              <div className="py-3 overflow-x-auto flex-1 bg-[#F8FAFC]">
                {renderCodeLines(activeFinding.codeDiff?.beforeCode || '// No code fixture available', true)}
              </div>
            </div>

            {/* After (Remediated) */}
            <div className="rounded-2xl border border-green-200 bg-[#F8FAFC] overflow-hidden flex flex-col shadow-inner">
              <div className="px-4 py-2.5 bg-green-50 border-b border-green-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#15803D]" />
                  <span className="font-mono text-[#15803D] font-bold">
                    AFTER: Remediated & Section 8 Compliant
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-green-50 text-[#15803D] uppercase font-bold">
                  Approved Patch
                </span>
              </div>
              <div className="py-3 overflow-x-auto flex-1 bg-[#F8FAFC]">
                {renderCodeLines(activeFinding.codeDiff?.afterCode || '// Remediated patch available in sandbox', false)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 4: Apply Fix */}
      {currentStage === 4 && (
        <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-[#52796F]" />
                <h3 className="text-lg font-bold text-[#18181B] font-sans">
                  Sandbox Patch Deployment Workbench
                </h3>
              </div>
              <p className="text-xs text-[#71717A] mt-0.5">
                Stage or revert the code patch in the isolated local sandbox to test both pass and fail paths.
              </p>
            </div>

            <button
              onClick={() => setCurrentStage(5)}
              className="px-5 py-2.5 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold text-xs flex items-center gap-2 shadow-subtle transition-all active:scale-95"
            >
              <span>Next: Run Verification Probe</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Interactive Patch Control Card */}
          <div className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#18181B] font-mono">Sandbox Runtime State:</span>
                  {isPatched ? (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-green-50 text-[#15803D] border border-green-200 flex items-center gap-1.5 shadow-subtle">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#15803D]" />
                      PATCHED (Secured)
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-red-50 text-[#B91C1C] border border-red-200 flex items-center gap-1.5 shadow-subtle">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#B91C1C] animate-pulse" />
                      UNPATCHED (Vulnerable)
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#71717A] font-sans">
                  {isPatched
                    ? 'The approved remediation diff is active in the test environment. Probing will test for zero personal data exposure.'
                    : 'The target endpoint is currently running unpatched. Probing will reproduce the security vulnerability and trigger failure.'}
                </p>
              </div>

              {/* Action buttons to toggle state */}
              <div className="flex items-center gap-2">
                {!isPatched ? (
                  <button
                    disabled={isDeployingPatch}
                    onClick={() => handleTogglePatch(true)}
                    className="px-4 py-2.5 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold text-xs flex items-center gap-2 shadow-subtle transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isDeployingPatch ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-[#0B0F19]" />
                    ) : (
                      <Check className="w-4 h-4 text-[#0B0F19] stroke-[3]" />
                    )}
                    <span>{isDeployingPatch ? 'Applying Patch...' : 'Apply Remediation Patch'}</span>
                  </button>
                ) : (
                  <button
                    disabled={isDeployingPatch}
                    onClick={() => handleTogglePatch(false)}
                    className="px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-50 border border-red-200 text-[#B91C1C] font-semibold text-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isDeployingPatch ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-[#B91C1C]" />
                    ) : (
                      <RotateCcw className="w-4 h-4 text-[#B91C1C]" />
                    )}
                    <span>Simulate Unpatched State (Test Failure Path)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Explanatory summary of changes applied */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
              <div className="p-4 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] space-y-2">
                <span className="font-bold text-[#18181B] uppercase tracking-wider block text-[11px] font-mono">
                  What happens when Patched:
                </span>
                <ul className="space-y-1.5 text-[#71717A]">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] flex-shrink-0" />
                    <span>Object authorization guard intercepts cross-account tenant queries.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] flex-shrink-0" />
                    <span>HTTP 403 Forbidden emitted with zero PII leakage.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] flex-shrink-0" />
                    <span>Security probe status updates to VERIFIED FIXED.</span>
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] space-y-2">
                <span className="font-bold text-[#18181B] uppercase tracking-wider block text-[11px] font-mono">
                  What happens when Unpatched:
                </span>
                <ul className="space-y-1.5 text-[#71717A]">
                  <li className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#B91C1C] flex-shrink-0" />
                    <span>Cross-account request succeeds without authorization validation.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#B91C1C] flex-shrink-0" />
                    <span>Account B's confidential PII leaked in response body.</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#B91C1C] flex-shrink-0" />
                    <span>Probe status evaluates to FAIL (reproducing vulnerability).</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 5: Verify Result */}
      {currentStage === 5 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Probe Execution Console */}
          <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#18181B] flex items-center gap-2 font-sans">
                  <Cpu className="w-5 h-5 text-[#52796F]" />
                  <span>Sandbox Test Verification Engine</span>
                </h3>
                <p className="text-xs text-[#71717A] mt-0.5">
                  Executes a genuine HTTP probe against the controlled local testbed (<code className="text-[#52796F] font-mono">/testbed/api/v1/customers/...</code>) to verify zero personal data egress.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Failure path test button */}
                <button
                  disabled={isVerifying}
                  onClick={() => handleRunVerification(false)}
                  className="px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-50 border border-red-200 text-[#B91C1C] font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                  title="Simulate unpatched state to observe test FAIL"
                >
                  <Bug className="w-3.5 h-3.5 text-[#B91C1C]" />
                  <span>Test Failure Path (Unpatched)</span>
                </button>

                {/* Primary verification button */}
                <button
                  disabled={isVerifying}
                  onClick={() => handleRunVerification(true)}
                  className="px-5 py-2.5 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold text-xs flex items-center gap-2 shadow-subtle transition-all active:scale-95 disabled:opacity-50"
                >
                  {isVerifying ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-[#0B0F19]" />
                  ) : (
                    <Play className="w-4 h-4 fill-[#0B0F19]" />
                  )}
                  <span>{isVerifying ? 'Running Test Probe...' : 'Run Verification Probe (Patched)'}</span>
                </button>
              </div>
            </div>

            {/* Error Notification if Verification Probe fails */}
            {verificationError && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start justify-between gap-3 text-[#B91C1C] text-xs">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-[#B91C1C] flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-[#B91C1C] font-sans">Verification Engine Error</span>
                    <p className="text-[#71717A] mt-0.5 font-sans leading-relaxed">{verificationError}</p>
                    <p className="text-[11px] text-[#71717A] mt-1 font-mono">
                      No synthetic pass fixture was substituted. Verify backend is active on http://127.0.0.1:8000.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRunVerification(isPatched)}
                  className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-[#B91C1C]/30 text-[#B91C1C] font-semibold text-xs border border-red-200 flex items-center gap-1.5 transition-colors flex-shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retry Probe</span>
                </button>
              </div>
            )}

            {/* Progress bar */}
            {(isVerifying || lastProbeResult) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#71717A] font-mono">
                  <span>TEST EXECUTION PROGRESS</span>
                  <span className="text-[#52796F] font-bold">{verificationProgress}%</span>
                </div>
                <div className="w-full bg-[#F8FAFC] rounded-full h-2 overflow-hidden border border-[#E4E4E7]">
                  <div
                    className={`h-full transition-all duration-300 ease-out rounded-full ${
                      lastProbeResult?.outcome === 'PASS'
                        ? 'bg-[#15803D]'
                        : lastProbeResult?.outcome === 'FAIL'
                        ? 'bg-[#B91C1C]'
                        : 'bg-[#14B8A6]'
                    }`}
                    style={{ width: `${verificationProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Real-time terminal log viewer */}
            <div className="h-52 overflow-y-auto bg-[#F8FAFC] rounded-xl p-4 font-mono text-xs text-[#71717A] space-y-1.5 border border-[#E4E4E7] shadow-inner">
              {verificationLogs.length === 0 ? (
                <div className="text-slate-600 italic py-12 text-center flex flex-col items-center justify-center gap-2">
                  <Terminal className="w-6 h-6 text-slate-700" />
                  <span>Press "Run Verification Probe" to spin up the container and evaluate the security patch.</span>
                </div>
              ) : (
                verificationLogs.map((log, i) => (
                  <div key={i} className="leading-relaxed flex items-start gap-2">
                    <span className="text-[#52796F] font-bold select-none">{'>'}</span>
                    <span
                      className={
                        log.includes('[TEST PASSED]') || log.includes('[CERTIFIED]') || log.includes('[SAFE]')
                          ? 'text-[#15803D] font-semibold'
                          : log.includes('[TEST FAILED]') || log.includes('[ALERT]') || log.includes('[DPDP BREACH]')
                          ? 'text-[#B91C1C] font-semibold'
                          : ''
                      }
                    >
                      {log}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Side-by-Side Before/After Comparison Panel */}
          {lastProbeResult && (
            <div
              className={`p-6 rounded-2xl border space-y-6 shadow-subtle transition-all ${
                lastProbeResult.outcome === 'PASS'
                  ? 'bg-[#FFFFFF] border-green-200'
                  : 'bg-[#FFFFFF] border-red-200'
              }`}
            >
              {/* Header result badge */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-12 h-12 rounded-2xl border flex items-center justify-center shadow-subtle ${
                      lastProbeResult.outcome === 'PASS'
                        ? 'bg-green-50 border-green-200 text-[#15803D]'
                        : 'bg-red-50 border-red-200 text-[#B91C1C]'
                    }`}
                  >
                    {lastProbeResult.outcome === 'PASS' ? (
                      <ShieldCheck className="w-7 h-7" />
                    ) : (
                      <ShieldX className="w-7 h-7" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-lg font-bold text-[#18181B] font-sans">
                        {lastProbeResult.outcome === 'PASS'
                          ? 'Verification Successfully Confirmed: PASS'
                          : 'Probe Reproduction Confirmed: FAIL'}
                      </h4>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                          lastProbeResult.outcome === 'PASS'
                            ? 'bg-green-50 text-[#15803D] border-green-200 shadow-subtle'
                            : 'bg-red-50 text-[#B91C1C] border-red-200 shadow-subtle'
                        }`}
                      >
                        {lastProbeResult.outcome === 'PASS' ? 'VERIFIED FIXED' : 'VULNERABILITY DETECTED'}
                      </span>
                    </div>
                    <p className="text-xs text-[#71717A] mt-0.5 font-sans">
                      {lastProbeResult.summary}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRunVerification(isPatched)}
                    className="px-3.5 py-2 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-[#71717A] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Re-run Probe</span>
                  </button>
                  <Link
                    to="/findings"
                    className="px-4 py-2 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold text-xs shadow-subtle transition-all"
                  >
                    Inspect in Findings
                  </Link>
                </div>
              </div>

              {/* Before vs After Telemetry Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                {/* Metric 1 */}
                <div className="p-4 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] space-y-1">
                  <span className="text-[11px] text-[#71717A] uppercase tracking-wider block font-semibold font-mono">
                    HTTP Response Status
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-mono line-through text-[#B91C1C] font-bold">200 OK</span>
                    <span
                      className={`text-2xl font-black font-mono ${
                        lastProbeResult.response.statusCode === 403 || lastProbeResult.response.statusCode === 204
                          ? 'text-[#15803D]'
                          : 'text-[#B91C1C]'
                      }`}
                    >
                      {lastProbeResult.response.statusCode} {lastProbeResult.response.statusText}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#71717A] block font-mono">
                    {lastProbeResult.outcome === 'PASS' ? 'Access rejected by auth guard' : 'Unauthorized data emitted'}
                  </span>
                </div>

                {/* Metric 2 */}
                <div className="p-4 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] space-y-1">
                  <span className="text-[11px] text-[#71717A] uppercase tracking-wider block font-semibold font-mono">
                    Exposed Personal Data Fields
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-mono line-through text-[#B91C1C] font-bold">
                      {activeFinding.id === 'DPDP-HIGH-007' ? '5 leaked' : '2 leaked'}
                    </span>
                    <span
                      className={`text-2xl font-black font-mono ${
                        lastProbeResult.response.leakedPiiFields.length === 0 ? 'text-[#15803D]' : 'text-[#B91C1C]'
                      }`}
                    >
                      {lastProbeResult.response.leakedPiiFields.length} leaked
                    </span>
                  </div>
                  <span className="text-[11px] text-[#71717A] block font-mono">
                    {lastProbeResult.outcome === 'PASS' ? 'Zero sensitive fields exposed' : 'Confidential PII exposed'}
                  </span>
                </div>

                {/* Metric 3 */}
                <div className="p-4 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] space-y-1">
                  <span className="text-[11px] text-[#71717A] uppercase tracking-wider block font-semibold font-mono">
                    Statutory Compliance Score
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-mono line-through text-[#B45309] font-bold">42%</span>
                    <span className="text-2xl font-black font-mono text-[#52796F]">
                      {lastProbeResult.complianceDelta.newComplianceScore}%
                    </span>
                  </div>
                  <span className="text-[11px] text-[#15803D] block font-semibold font-sans">
                    +{lastProbeResult.complianceDelta.statutoryRiskReductionPercent}% technical risk reduction
                  </span>
                </div>
              </div>

              {/* Response Inspector Comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Vulnerable (Before) */}
                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-red-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#B91C1C] flex items-center gap-1.5 font-mono">
                      <span className="w-2 h-2 rounded-full bg-[#B91C1C]" />
                      UNAUTHORIZED RESPONSE (Vulnerable)
                    </span>
                    <span className="font-mono text-[10px] text-[#B91C1C] bg-red-50 px-2 py-0.5 rounded border border-red-200">
                      HTTP 200 OK
                    </span>
                  </div>
                  <pre className="p-3.5 rounded-lg bg-[#F8FAFC] text-[#B91C1C] font-mono text-xs overflow-x-auto max-h-48 leading-relaxed border border-[#E4E4E7]">
                    {activeFinding.observedEvidence.sanitizedPayload}
                  </pre>
                  <p className="text-[11px] text-[#B91C1C] font-sans">
                    Leaks personal identifiers without tenant ownership verification.
                  </p>
                </div>

                {/* Remediated (After) */}
                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-green-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#15803D] flex items-center gap-1.5 font-mono">
                      <span className="w-2 h-2 rounded-full bg-[#15803D]" />
                      REMEDIATED RESPONSE (Current Probe)
                    </span>
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded border ${
                        lastProbeResult.response.statusCode === 403 || lastProbeResult.response.statusCode === 204
                          ? 'text-[#15803D] bg-green-50 border-green-200'
                          : 'text-[#B91C1C] bg-red-50 border-red-200'
                      }`}
                    >
                      HTTP {lastProbeResult.response.statusCode} {lastProbeResult.response.statusText}
                    </span>
                  </div>
                  <pre className="p-3.5 rounded-lg bg-[#F8FAFC] text-[#18181B] font-mono text-xs overflow-x-auto max-h-48 leading-relaxed border border-[#E4E4E7]">
                    {typeof lastProbeResult.response.body === 'object'
                      ? JSON.stringify(lastProbeResult.response.body, null, 2)
                      : String(lastProbeResult.response.body)}
                  </pre>
                  <p className="text-[11px] text-[#15803D] font-sans">
                    {lastProbeResult.explanation}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Persistent Audit History */}
      <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-[#18181B] flex items-center gap-2 font-sans">
              <Clock className="w-4 h-4 text-[#52796F]" />
              <span>Compliance Verification Audit Trail</span>
            </h3>
            <p className="text-xs text-[#71717A]">
              Immutable trial records persisted in backend database (<code className="text-[#52796F] font-mono text-[11px]">audit_records</code> table).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadAuditHistory}
              disabled={isLoadingHistory}
              className="px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-[#71717A] text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
              <span>Refresh History</span>
            </button>
            {auditHistory.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="px-3 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-red-50 border border-[#E4E4E7] hover:border-red-200 text-[#71717A] hover:text-[#B91C1C] text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear History</span>
              </button>
            )}
          </div>
        </div>

        {/* Error notification if history fetch fails */}
        {historyError && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-[#B91C1C] text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#B91C1C] flex-shrink-0" />
              <div>
                <span className="font-bold block font-sans">Backend Database Unavailable</span>
                <span className="text-[#71717A]">{historyError}</span>
              </div>
            </div>
            <button
              onClick={loadAuditHistory}
              className="px-3 py-1 rounded-lg bg-red-50 hover:bg-[#B91C1C]/30 text-[#B91C1C] font-semibold text-xs border border-red-200 flex-shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Audit History Table */}
        <div className="overflow-x-auto rounded-xl border border-[#E4E4E7]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] text-[#71717A] uppercase tracking-wider text-[11px] border-b border-[#E4E4E7] font-semibold font-mono">
              <tr>
                <th className="py-3 px-4">Test Case ID</th>
                <th className="py-3 px-4">Finding ID</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Runtime State</th>
                <th className="py-3 px-4">Result</th>
                <th className="py-3 px-4">HTTP Status</th>
                <th className="py-3 px-4">Remediation</th>
                <th className="py-3 px-4">Target Endpoint</th>
                <th className="py-3 px-4">Evidence Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] font-mono text-[#71717A]">
              {isLoadingHistory ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#71717A] font-sans">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-[#52796F]" />
                      <span>Loading verification records from backend database...</span>
                    </div>
                  </td>
                </tr>
              ) : auditHistory.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#71717A] italic font-sans">
                    No verification records in database. Run a verification probe above to persist an audit entry.
                  </td>
                </tr>
              ) : (
                auditHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F1F5F9]/50 transition-colors">
                    <td className="py-3 px-4 font-bold text-[#52796F] whitespace-nowrap">{item.testCaseId}</td>
                    <td className="py-3 px-4 text-[#18181B] whitespace-nowrap">
                      <span className="font-semibold text-[#18181B]">{item.findingId}</span>
                      {item.findingTitle && (
                        <span className="block text-[11px] text-[#71717A] font-sans truncate max-w-[200px]">
                          {item.findingTitle}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#71717A] text-[11px] font-sans whitespace-nowrap">
                      {formatDate(item.timestamp)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                          item.isPatched
                            ? 'bg-green-50 text-[#15803D] border-green-200'
                            : 'bg-amber-50 text-[#B45309] border-amber-200'
                        }`}
                      >
                        {item.isPatched ? 'Patched' : 'Unpatched'}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                          item.result === 'PASS'
                            ? 'bg-green-50 text-[#15803D] border-green-200'
                            : 'bg-red-50 text-[#B91C1C] border-red-200'
                        }`}
                      >
                        {item.result === 'PASS' ? (
                          <CheckCircle2 className="w-3 h-3 text-[#15803D]" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-[#B91C1C]" />
                        )}
                        {item.result}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`font-bold ${
                          item.statusCode === 200 && !item.isPatched
                            ? 'text-[#B91C1C]'
                            : item.statusCode === 403 || item.statusCode === 204
                            ? 'text-[#15803D]'
                            : 'text-[#71717A]'
                        }`}
                      >
                        {item.statusCode}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans whitespace-nowrap">
                      <span
                        className={`capitalize text-xs font-semibold ${
                          item.remediationStatus === 'verified_fix'
                            ? 'text-[#15803D]'
                            : 'text-[#B45309]'
                        }`}
                      >
                        {item.remediationStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#71717A] font-mono text-[11px] max-w-[200px] truncate" title={item.targetEndpoint}>
                      {item.targetEndpoint}
                    </td>
                    <td className="py-3 px-4 text-[#71717A] font-sans text-xs max-w-xs truncate" title={item.evidenceSummary}>
                      {item.evidenceSummary}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setShowLoginModal(false);
          loadAll();
        }}
        initialMode={loginModalMode}
      />
    </div>
  );
};
