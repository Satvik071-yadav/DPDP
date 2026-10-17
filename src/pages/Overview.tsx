import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Radar, 
  ShieldAlert, 
  CheckCircle2, 
  Globe, 
  AlertCircle, 
  ArrowRight,
  Lock, 
  ChevronRight,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Building2,
  TrendingUp,
  Activity,
  Layers,
  Zap,
  Check,
  Shield,
  LogIn,
  UserPlus,
  FileText,
  Eye,
  Database
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { api } from '@/services/api';
import { authService } from '@/services/authService';
import { LoginModal } from '@/components/auth/LoginModal';
import { Finding, ScanResult, ScanProfile, Severity, AuditHistoryRecord, UserProfile } from '@/types';
import { formatSeverity, formatDate, truncateUrl } from '@/lib/utils';
import { DEMO_PRESET_TARGETS } from '@/data/mockData';

export const Overview: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(authService.getCurrentUser());
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<'login' | 'register'>('login');

  const [findings, setFindings] = useState<Finding[]>([]);
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [auditHistory, setAuditHistory] = useState<AuditHistoryRecord[]>([]);
  const [quickUrl, setQuickUrl] = useState('https://paysecure-india.in');
  const [quickProfile, setQuickProfile] = useState<ScanProfile>('privacy_audit');
  const [urlError, setUrlError] = useState('');
  const [tableFilter, setTableFilter] = useState<'all' | 'critical' | 'high' | 'verified'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = async () => {
    if (!authService.isAuthenticated()) {
      setFindings([]);
      setScans([]);
      setAuditHistory([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const [fList, sList, aList] = await Promise.all([
        api.getFindings(),
        api.getScans(),
        api.getAuditHistory(),
      ]);
      setFindings(fList);
      setScans(sList);
      setAuditHistory(aList);
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load telemetry from backend.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange((user) => {
      setCurrentUser(user);
      if (user) {
        loadData();
      } else {
        setFindings([]);
        setScans([]);
        setAuditHistory([]);
        setIsLoading(false);
      }
    });

    if (authService.isAuthenticated()) {
      loadData();
    } else {
      setIsLoading(false);
    }

    return () => unsubscribe();
  }, []);


  const handleQuickScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickUrl.trim()) {
      setUrlError('Please enter a valid website URL');
      return;
    }
    try {
      new URL(quickUrl);
      setUrlError('');
      navigate(`/scan?target=${encodeURIComponent(quickUrl)}&profile=${quickProfile}&autoStart=true`);
    } catch {
      setUrlError('URL must start with http:// or https://');
    }
  };

  const handleApplyPreset = (url: string, profile: ScanProfile) => {
    setQuickUrl(url);
    setQuickProfile(profile);
    setUrlError('');
  };

  // 1. Websites Monitored
  const uniqueDomains = Array.from(
    new Set(
      scans.map((s) => {
        try {
          return new URL(s.targetUrl).hostname;
        } catch {
          return s.targetUrl;
        }
      })
    )
  ).filter(Boolean);
  const monitoredWebsitesCount = uniqueDomains.length;

  // 2. Open Privacy Findings
  const openFindings = findings.filter((f) => f.status === 'open' || f.status === 'in_review');
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  const lowCount = findings.filter((f) => f.severity === 'low').length;

  // 3. Technical Risk Exposure Assessment (DPDP Act 2023 - Qualitative Advisory Assessment)
  let exposureTierText = 'Baseline Clear';
  let exposureTierLabel = 'No Detected Exposures (Advisory Only)';
  let exposureTierLevel = 'Level 0/4';
  let exposureBadge = 'BASELINE CLEAR';
  if (criticalCount > 0) {
    exposureTierText = 'Critical Tier';
    exposureTierLabel = 'Section 8(5) Technical Exposure (Advisory)';
    exposureTierLevel = 'Level 4/4';
    exposureBadge = 'CRITICAL TIER';
  } else if (highCount > 0) {
    exposureTierText = 'Elevated Tier';
    exposureTierLabel = 'Section 6 & 8 Technical Exposure (Advisory)';
    exposureTierLevel = 'Level 3/4';
    exposureBadge = 'ELEVATED TIER';
  } else if (mediumCount > 0) {
    exposureTierText = 'Moderate Tier';
    exposureTierLabel = 'Moderate Exposure (Advisory)';
    exposureTierLevel = 'Level 2/4';
    exposureBadge = 'MODERATE TIER';
  } else if (lowCount > 0) {
    exposureTierText = 'Low Tier';
    exposureTierLabel = 'Low Exposure (Advisory)';
    exposureTierLevel = 'Level 1/4';
    exposureBadge = 'LOW TIER';
  }

  // 4. Verified Remediations
  const verifiedFindingsCount = findings.filter((f) => f.status === 'verified_fix').length;
  const totalAuditCount = auditHistory.length;
  const passedAuditCount = auditHistory.filter((a) => a.result === 'PASS').length;
  const passRate = totalAuditCount > 0
    ? Math.round((passedAuditCount / totalAuditCount) * 100)
    : (verifiedFindingsCount > 0 ? 100 : 0);

  const severityData = [
    { name: 'Critical', value: criticalCount, color: '#F43F5E' },
    { name: 'High', value: highCount, color: '#F59E0B' },
    { name: 'Medium', value: mediumCount, color: '#FACC15' },
    { name: 'Low', value: lowCount, color: '#22D3EE' },
  ];

  // 5. Weekly Exposure vs. Verified Remediation Trajectory
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const now = new Date();
  const raw7DayTrend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
    const dayStr = daysOfWeek[d.getDay()];
    const dateStr = d.toISOString().slice(0, 10);

    const exposures = findings.filter((f) => (f.detectedAt || '').startsWith(dateStr)).length;
    const verified = auditHistory.filter(
      (a) => (a.timestamp || '').startsWith(dateStr) && a.result === 'PASS'
    ).length;

    return { day: dayStr, exposures, verified };
  });

  const hasRecentTrend = raw7DayTrend.some((t) => t.exposures > 0 || t.verified > 0);
  let trendData = raw7DayTrend;
  if (!hasRecentTrend && (findings.length > 0 || auditHistory.length > 0)) {
    // Map existing records to days of week
    const dowCounts: Record<string, { exposures: number; verified: number }> = {
      Mon: { exposures: 0, verified: 0 },
      Tue: { exposures: 0, verified: 0 },
      Wed: { exposures: 0, verified: 0 },
      Thu: { exposures: 0, verified: 0 },
      Fri: { exposures: 0, verified: 0 },
      Sat: { exposures: 0, verified: 0 },
      Sun: { exposures: 0, verified: 0 },
    };
    for (const f of findings) {
      try {
        const d = daysOfWeek[new Date(f.detectedAt).getDay()];
        if (dowCounts[d]) dowCounts[d].exposures++;
      } catch {}
    }
    for (const a of auditHistory) {
      try {
        const d = daysOfWeek[new Date(a.timestamp).getDay()];
        if (dowCounts[d] && a.result === 'PASS') dowCounts[d].verified++;
      } catch {}
    }
    trendData = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({
      day,
      exposures: dowCounts[day].exposures,
      verified: dowCounts[day].verified,
    }));
  }

  // 6. Build Activity Stream from real records
  interface ActivityItem {
    id: string;
    title: string;
    description: string;
    timestamp: string;
    isSynthetic?: boolean;
  }
  const activityList: ActivityItem[] = [];
  for (const s of scans) {
    activityList.push({
      id: `scan-${s.id}`,
      title: `Scan ${s.status === 'completed' ? 'Completed' : s.status.toUpperCase()}: ${s.targetUrl}`,
      description: `Audited ${s.findingsCount?.total ?? 0} findings in ${s.durationSeconds ?? 0}s (${s.profile.replace('_', ' ')}).`,
      timestamp: s.completedAt ? formatDate(s.completedAt) : (s.initiatedAt ? formatDate(s.initiatedAt) : 'Recent'),
      isSynthetic: s.isDemo || s.id.includes('DEMO') || s.targetUrl.includes('paysecure-india.in'),
    });
  }
  for (const a of auditHistory) {
    activityList.push({
      id: `audit-${a.id}`,
      title: `Fix Verification: ${a.findingTitle || a.testCaseId}`,
      description: `Automated probe ${a.result === 'PASS' ? 'PASSED (Remediated)' : 'FAILED (Vulnerable)'} on ${a.targetEndpoint} (HTTP ${a.statusCode}).`,
      timestamp: a.timestamp ? formatDate(a.timestamp) : 'Recent',
      isSynthetic: a.testCaseId.includes('KYC') || a.targetEndpoint.includes('testbed'),
    });
  }
  activityList.sort((a, b) => b.id.localeCompare(a.id));

  const filteredFindings = findings.filter((f) => {
    if (tableFilter === 'critical') return f.severity === 'critical';
    if (tableFilter === 'high') return f.severity === 'high';
    if (tableFilter === 'verified') return f.status === 'verified_fix';
    return true;
  });

  if (!currentUser) {
    return (
      <div className="space-y-8 pb-12 animate-in fade-in duration-200">
        <LoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            setShowLoginModal(false);
            loadData();
          }}
          initialMode={loginModalMode}
        />

        {/* Guest Warning / CTA Banner */}
        <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-cyan-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Public Security Gateway</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 font-mono">Unauthenticated</span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Telemetry and audit records are isolated per tenant. Sign in to launch target audits and review your organization's findings.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
            <button
              onClick={() => { setLoginModalMode('login'); setShowLoginModal(true); }}
              className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-cyan-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
            <button
              onClick={() => { setLoginModalMode('register'); setShowLoginModal(true); }}
              className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-obsidian-850 hover:bg-obsidian-800 border border-white/10 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register</span>
            </button>
          </div>
        </div>

        {/* Hero Section */}
        <div className="relative rounded-3xl bg-gradient-to-b from-obsidian-850 via-obsidian-900 to-obsidian-950 border border-white/10 p-8 sm:p-12 overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 -mr-24 -mt-24 w-[28rem] h-[28rem] rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/4 -mb-24 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              <span>India DPDP Act 2023 Technical Compliance & Verification</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
                Continuous Client-Side Privacy Auditing & Exposure Defense
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                DPDP-Guard instruments automated headless Chromium browsers to detect pre-consent tracker egress, unconsented storage writes, statutory notice omissions, and data security vulnerabilities in live web applications.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => { setLoginModalMode('login'); setShowLoginModal(true); }}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 text-slate-950 font-bold text-sm shadow-cyan-md hover:shadow-cyan-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
              >
                <span>Access Compliance Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => { setLoginModalMode('register'); setShowLoginModal(true); }}
                className="px-5 py-3 rounded-xl bg-obsidian-800 hover:bg-obsidian-750 border border-white/10 text-slate-200 font-semibold text-sm transition-all flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4 text-cyan-400" />
                <span>Create Multi-Tenant Account</span>
              </button>

              <Link
                to="/scan"
                className="px-4 py-3 rounded-xl text-slate-400 hover:text-white font-medium text-sm transition-colors flex items-center gap-1.5"
              >
                <span>Explore Scanner</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* 4 Core Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-6 rounded-2xl bg-obsidian-900/90 border border-white/[0.08] shadow-obsidian-card space-y-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Radar className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Browser Observer</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Instruments headless Chromium via Playwright to observe live network requests, cookies, and localStorage writes prior to user consent.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-obsidian-900/90 border border-white/[0.08] shadow-obsidian-card space-y-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Statutory DPDP Rules</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Automated rule checks against Sections 6(1) Notice, 6(4) Consent Withdrawal, 8(5) Security, 9(1) Children's Data, and 11(1) Rights.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-obsidian-900/90 border border-white/[0.08] shadow-obsidian-card space-y-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Cryptographic Verification</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Captures SHA-256 evidence logs and runs automated remediation probes to verify that reported privacy gaps have been patched.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-obsidian-900/90 border border-white/[0.08] shadow-obsidian-card space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Multi-Tenant Isolation</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Enterprise tenant isolation ensures that your organization's scans, findings, evidence logs, and settings are never exposed across tenants.
            </p>
          </div>
        </div>

        {/* DPDP Act 2023 Statutory Breakdown Table */}
        <div className="p-6 rounded-2xl bg-obsidian-900/90 border border-white/[0.08] shadow-obsidian-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white">DPDP Act, 2023 — Statutory Inspection Modules</h2>
            </div>
            <span className="text-[11px] text-slate-400">Active Rule Engine Coverage</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-slate-400 font-mono text-[11px]">
                  <th className="py-2.5 px-3">Statutory Provision</th>
                  <th className="py-2.5 px-3">Evaluation Scope</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Automated Telemetry Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-slate-300">
                <tr>
                  <td className="py-3 px-3 font-mono font-semibold text-cyan-300">Section 6(1)</td>
                  <td className="py-3 px-3">Notice Requirements & Itemised Purpose Specification</td>
                  <td className="py-3 px-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">HIGH</span></td>
                  <td className="py-3 px-3 text-slate-400">DOM extraction of consent notice and purpose disclosure</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-mono font-semibold text-cyan-300">Section 6(4)</td>
                  <td className="py-3 px-3">Ease of Consent Withdrawal (Equal friction)</td>
                  <td className="py-3 px-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">HIGH</span></td>
                  <td className="py-3 px-3 text-slate-400">Withdrawal link accessibility and friction comparison</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-mono font-semibold text-cyan-300">Section 8(5)</td>
                  <td className="py-3 px-3">Reasonable Security Safeguards & Egress Protection</td>
                  <td className="py-3 px-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">CRITICAL</span></td>
                  <td className="py-3 px-3 text-slate-400">Network egress capture, tracker detection, cookie auditing</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-mono font-semibold text-cyan-300">Section 9(1)</td>
                  <td className="py-3 px-3">Verifiable Parental Consent for Children's Data</td>
                  <td className="py-3 px-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">CRITICAL</span></td>
                  <td className="py-3 px-3 text-slate-400">Age gating, profiling script checks, parental consent mechanism</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-mono font-semibold text-cyan-300">Section 11(1)</td>
                  <td className="py-3 px-3">Data Principal Rights: Access, Correction & Erasure</td>
                  <td className="py-3 px-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">MEDIUM</span></td>
                  <td className="py-3 px-3 text-slate-400">Privacy policy rights clause parsing and DPO contact verification</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="p-4 rounded-2xl bg-obsidian-900/80 border border-white/[0.07] flex items-start gap-3 text-xs text-slate-400">
          <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            Technical audit scores, exposure categories, and automated observations represent an advisory security assessment of observed system behaviors under India's Digital Personal Data Protection Act, 2023. They identify potential compliance risk indicators and do not constitute formal legal adjudication.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* 1. Hero Command Center & Target Audit Launchpad */}
      <div className="relative rounded-2xl bg-gradient-to-b from-obsidian-850 via-obsidian-900 to-obsidian-950 border border-cyan-500/30 p-6 sm:p-8 overflow-hidden shadow-2xl">
        {/* Subtle Atmospheric Top Glow */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-80 h-80 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          {/* Top Status Badges */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 shadow-cyan-sm">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                DPDP ACT 2023 REGULATORY AUDITOR
              </span>
              <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full text-[10px] font-mono bg-obsidian-950 text-slate-400 border border-white/10">
                SANDBOX ENGINE v2.4
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Link
                to="/fix-verify"
                className="px-3 py-1.5 rounded-xl bg-obsidian-950/80 hover:bg-obsidian-800 border border-white/10 text-slate-300 hover:text-white font-medium transition-colors flex items-center gap-2 group"
              >
                <span>Verify Pending Patches</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 group-hover:scale-125 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Headline & Mission Context */}
          <div className="max-w-3xl space-y-2">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Discover exposure. Understand risk.{' '}
              <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
                Verify every fix.
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed font-normal">
              Continuous technical privacy auditing platform engineered to uncover personal data leakage, unauthorized third-party tracking, and object-level authorization vulnerabilities across modern web architectures.
            </p>
          </div>

          {/* Prominent Website Scan Input */}
          <div className="pt-2">
            <form onSubmit={handleQuickScan} className="space-y-3">
              <div className="flex flex-col md:flex-row gap-2.5 p-2 rounded-2xl bg-obsidian-950/90 border border-cyan-500/40 shadow-cyan-glow backdrop-blur-md">
                {/* URL Input */}
                <div className="flex-1 flex items-center gap-3 px-3.5 py-2.5 bg-obsidian-900/80 rounded-xl border border-white/10 focus-within:border-cyan-400/80 transition-colors">
                  <Globe className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Enter target website URL (e.g. https://your-business.in)"
                    value={quickUrl}
                    onChange={(e) => {
                      setQuickUrl(e.target.value);
                      setUrlError('');
                    }}
                    className="w-full bg-transparent text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none font-mono"
                  />
                  {quickUrl && (
                    <button
                      type="button"
                      onClick={() => setQuickUrl('')}
                      className="text-slate-500 hover:text-slate-300 text-xs px-1 font-mono"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Profile Selector */}
                <div className="md:w-60 flex-shrink-0">
                  <select
                    value={quickProfile}
                    onChange={(e) => setQuickProfile(e.target.value as ScanProfile)}
                    className="w-full h-full min-h-[44px] bg-obsidian-900/90 border border-white/10 rounded-xl px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-cyan-400 transition-colors cursor-pointer"
                  >
                    <option value="privacy_audit">Privacy Audit (Full DPDP Scope)</option>
                    <option value="quick_scan">Quick Scan (Pixels & Trackers)</option>
                    <option value="auth_tests">Authorization & Consent Tests</option>
                    <option value="deep_audit">Deep Full-Stack Audit</option>
                  </select>
                </div>

                {/* Scan Button */}
                <button
                  type="submit"
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-cyan-sm transition-all flex-shrink-0 active:scale-95"
                >
                  <Radar className="w-4 h-4 stroke-[2.5]" />
                  <span>Run DPDP Audit</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {urlError && (
                <div className="flex items-center gap-2 text-rose-400 text-xs px-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{urlError}</span>
                </div>
              )}

              {/* Quick Target Preset Chips */}
              <div className="flex items-center gap-2 flex-wrap pt-1 text-xs">
                <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  Target presets:
                </span>
                {DEMO_PRESET_TARGETS.map((preset) => {
                  const isSelected = quickUrl === preset.url;
                  return (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => handleApplyPreset(preset.url, preset.profile)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-cyan-sm'
                          : 'bg-obsidian-950/80 text-slate-300 border border-white/[0.08] hover:bg-obsidian-800 hover:text-white'
                      }`}
                    >
                      <span>{preset.label.split('(')[0].trim()}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        ({preset.label.includes('FinTech') ? 'FinTech' : preset.label.includes('Health') ? 'Health' : 'Retail'})
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Authorization Note */}
              <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
                <Lock className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                <span>
                  Authorized security testing mode: Scan only domains you own or have explicit verification authority to inspect under statutory guidelines.
                </span>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Backend Error Banner */}
      {loadError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={loadData}
            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. Four Polished KPI Metric Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-5 rounded-2xl bg-obsidian-900 border border-white/10 space-y-3">
              <div className="h-3 w-28 bg-slate-800 rounded" />
              <div className="h-8 w-16 bg-slate-700 rounded" />
              <div className="h-2 w-full bg-slate-800/80 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Card 1: Monitored Websites */}
          <div className="p-5 rounded-2xl bg-obsidian-900 border border-white/[0.08] hover:border-cyan-500/30 transition-all shadow-obsidian-card group">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-3">
              <span className="font-semibold text-slate-200">Websites Monitored</span>
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Globe className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white font-mono">{monitoredWebsitesCount}</span>
              {monitoredWebsitesCount > 0 ? (
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                  {monitoredWebsitesCount} Active
                </span>
              ) : (
                <span className="text-xs font-semibold text-slate-400 bg-obsidian-850 px-2 py-0.5 rounded-full border border-white/10 font-mono">
                  No targets
                </span>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-white/[0.07] flex items-center justify-between text-[11px] text-slate-400">
              <span>Audit Scope</span>
              <span className="text-slate-200 font-mono">
                {monitoredWebsitesCount > 0 ? `${scans.length} Total Audits` : 'Pending First Scan'}
              </span>
            </div>
          </div>

          {/* Card 2: Open Privacy Findings */}
          <div className="p-5 rounded-2xl bg-obsidian-900 border border-white/[0.08] hover:border-amber-500/30 transition-all shadow-obsidian-card group">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-3">
              <span className="font-semibold text-slate-200">Open Privacy Findings</span>
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-black font-mono ${openFindings.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {openFindings.length}
              </span>
              {openFindings.length > 0 ? (
                <span className="text-xs font-semibold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-mono">
                  Action Required
                </span>
              ) : (
                <span className="text-xs font-semibold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                  Baseline Clear
                </span>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-white/[0.07] flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Severity distribution</span>
              <span className="text-rose-400 font-mono font-bold">
                {criticalCount} Crit • {highCount} High
              </span>
            </div>
          </div>

          {/* Card 3: Technical Risk Exposure Index */}
          <div className="p-5 rounded-2xl bg-obsidian-900 border border-white/[0.08] hover:border-rose-500/30 transition-all shadow-obsidian-card group">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-3">
              <span className="font-semibold text-slate-200">Technical Exposure Index</span>
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-xl sm:text-2xl font-black font-mono ${criticalCount > 0 ? 'text-rose-400' : highCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {exposureTierText}
              </span>
              <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                criticalCount > 0
                  ? 'text-rose-300 bg-rose-500/20 border-rose-500/30'
                  : openFindings.length === 0
                  ? 'text-emerald-300 bg-emerald-500/20 border-emerald-500/30'
                  : 'text-amber-300 bg-amber-500/20 border-amber-500/30'
              }`}>
                {exposureBadge}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/[0.07] flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-mono">{exposureTierLevel}</span>
              <span className="text-slate-300 font-mono truncate max-w-[170px]" title={exposureTierLabel}>{exposureTierLabel}</span>
            </div>
          </div>

          {/* Card 4: Verified Remediations */}
          <div className="p-5 rounded-2xl bg-obsidian-900 border border-white/[0.08] hover:border-emerald-500/30 transition-all shadow-obsidian-card group">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-3">
              <span className="font-semibold text-slate-200">Verified Remediations</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-400 font-mono">{verifiedFindingsCount}</span>
              <span className="text-xs font-semibold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                {totalAuditCount > 0 ? `${passRate}% pass rate` : (verifiedFindingsCount > 0 ? 'Verified' : 'No tests yet')}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/[0.07]">
              <div className="w-full bg-obsidian-950 rounded-full h-1.5 overflow-hidden border border-white/5">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-500 shadow-emerald-glow"
                  style={{ width: `${Math.max(5, passRate)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weekly Exposure vs Verified Area Chart */}
        <div className="lg:col-span-8 p-6 rounded-2xl bg-obsidian-900 border border-white/[0.08] shadow-obsidian-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>Weekly Exposure vs. Verified Remediation Trajectory</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Observed potential personal-data exposures vs proven fixes validated in sandbox
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" /> Detected Exposures
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400" /> Verified Fixes
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorExposures" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorVerified" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A0F1F',
                    borderColor: 'rgba(255, 255, 255, 0.12)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#F8FAFC',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
                  }}
                />
                <Area type="monotone" dataKey="exposures" stroke="#EF4444" strokeWidth={2.5} fillOpacity={1} fill="url(#colorExposures)" />
                <Area type="monotone" dataKey="verified" stroke="#06B6D4" strokeWidth={2.5} fillOpacity={1} fill="url(#colorVerified)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Severity Donut Distribution */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-obsidian-900 border border-white/[0.08] shadow-obsidian-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <span>Severity Breakdown</span>
              </h3>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 font-bold">
                ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Current active vulnerability severity weights
            </p>
          </div>

          <div className="h-48 w-full relative flex items-center justify-center my-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={severityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={78}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A0F1F',
                    borderColor: 'rgba(255, 255, 255, 0.12)',
                    borderRadius: '10px',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center">
              <span className="text-2xl font-black text-white font-mono">{findings.length}</span>
              <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold font-mono">Total Items</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-white/[0.07]">
            {severityData.map((item) => (
              <div key={item.name} className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-obsidian-850 border border-white/[0.06]">
                <span className="flex items-center gap-1.5 text-slate-300 font-medium text-[11px]">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
                <span className="font-mono text-slate-200 font-bold">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Bottom Grid: Findings Table & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Findings Table */}
        <div className="lg:col-span-8 p-6 rounded-2xl bg-obsidian-900 border border-white/[0.08] shadow-obsidian-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Priority Privacy & Security Findings</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  {filteredFindings.length} Items
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Forensic findings mapped directly against DPDP Act obligations
              </p>
            </div>

            {/* Quick Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-obsidian-850 border border-white/[0.08] text-xs">
              {(['all', 'critical', 'high', 'verified'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setTableFilter(tab)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all capitalize font-mono ${
                    tableFilter === tab
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-slate-400 font-medium">
                  <th className="pb-3 font-semibold">Finding Details</th>
                  <th className="pb-3 font-semibold">Severity</th>
                  <th className="pb-3 font-semibold hidden sm:table-cell">Statutory Section</th>
                  <th className="pb-3 font-semibold hidden md:table-cell">Status</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filteredFindings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-xs text-slate-500 italic">
                      No security or privacy findings matching the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredFindings.slice(0, 5).map((f) => {
                    const sev = formatSeverity(f.severity);
                    const isSynthetic = f.isDemoFixture || f.affectedUrl.includes('paysecure-india.in') || f.affectedUrl.includes('testbed');
                    return (
                      <tr key={f.id} className="group hover:bg-obsidian-800/50 transition-colors">
                        <td className="py-3.5 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors truncate max-w-xs sm:max-w-sm">
                              {f.title}
                            </span>
                            {isSynthetic && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 flex-shrink-0 font-bold">
                                TESTBED
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-xs font-mono mt-0.5">
                            {truncateUrl(f.affectedUrl, 42)}
                          </div>
                        </td>
                        <td className="py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${sev.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                            {sev.label}
                          </span>
                        </td>
                        <td className="py-3.5 text-slate-300 hidden sm:table-cell font-mono text-[11px]">
                          {f.dpdpSection.split('-')[0].trim()}
                        </td>
                        <td className="py-3.5 hidden md:table-cell">
                          <span className="capitalize text-slate-300 text-[11px] font-medium font-mono">
                            {f.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3.5 text-right">
                          <Link
                            to={`/fix-verify?findingId=${f.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-obsidian-850 hover:bg-cyan-500 hover:text-slate-950 border border-white/10 text-cyan-400 transition-all font-semibold text-xs shadow-sm"
                          >
                            <span>Remediate</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="pt-2 border-t border-white/[0.08] flex items-center justify-between text-xs">
            <span className="text-slate-400">
              Showing {Math.min(filteredFindings.length, 5)} of {findings.length} total findings
            </span>
            <Link
              to="/findings"
              className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
            >
              <span>Explore all findings</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-obsidian-900 border border-white/[0.08] shadow-obsidian-card flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Audit Activity Stream</span>
              </h3>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                STREAMING
              </span>
            </div>

            <div className="space-y-2.5">
              {activityList.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs space-y-1">
                  <Activity className="w-6 h-6 text-slate-600 mx-auto mb-2 opacity-60" />
                  <p className="font-semibold text-slate-400">No Audit Activity Recorded</p>
                  <p className="text-[11px] text-slate-500">Run a website scan or verify a patch to stream real compliance events.</p>
                </div>
              ) : (
                activityList.slice(0, 5).map((act) => (
                  <div key={act.id} className="p-3 rounded-xl bg-obsidian-850 border border-white/[0.07] hover:bg-obsidian-800 transition-colors text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate pr-2">
                        <span className="font-semibold text-slate-200 truncate">{act.title}</span>
                        {act.isSynthetic && (
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-obsidian-950 text-slate-400 border border-white/10 font-bold">
                            TESTBED
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">{act.timestamp}</span>
                    </div>
                    <p className="text-slate-400 text-[11px] leading-relaxed">
                      {act.description}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/[0.08]">
            <Link
              to="/history"
              className="w-full py-2.5 rounded-xl bg-obsidian-850 hover:bg-obsidian-800 border border-white/10 text-center text-xs text-slate-200 font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>View Full Compliance Event Log</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Advisory Assessment Disclaimer */}
      <div className="p-4 rounded-2xl bg-obsidian-900/80 border border-white/[0.07] shadow-obsidian-card flex items-start gap-3 text-xs text-slate-400">
        <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold text-slate-300">Technical Advisory Notice (DPDP Act 2023 Evaluation):</span>
          <p className="text-[11px] leading-relaxed">
            Technical audit scores, exposure categories, and automated observations represent an advisory security assessment of observed system behaviors. They identify potential compliance risk indicators and do not constitute formal legal adjudication or confirmed statutory penalty determinations under the Digital Personal Data Protection Act, 2023.
          </p>
        </div>
      </div>
    </div>
  );

};
