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
  UserPlus,
  FileText,
  Eye,
  Database,
  IndianRupee,
  FileWarning,
  XCircle,
  CircleAlert
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
    { name: 'Critical', value: criticalCount, color: '#B91C1C' },
    { name: 'High', value: highCount, color: '#B45309' },
    { name: 'Medium', value: mediumCount, color: '#B45309' },
    { name: 'Low', value: lowCount, color: '#2563EB' },
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

  // 5b. Realistic Penalty Exposure Calculator (DPDP Act 2023)
  // Based on the Schedule to the DPDP Act (statutory ceilings) PLUS Section 33
  // mitigation factors: first-time offence, proportionality, cooperation, remediation speed.
  //
  // DPDP Act 2023 Schedule — Statutory Ceilings ("may extend to"):
  //   §8(5)  Security safeguards breach    → up to ₹250 Cr
  //   §9(1)  Children's data breach        → up to ₹200 Cr
  //   §16    Cross-border transfer         → "other provisions" up to ₹50 Cr
  //   §6(1)  Consent obligation            → "other provisions" up to ₹50 Cr
  //   SDF-specific obligations            → up to ₹150 Cr
  //
  // Section 33 factors that determine the actual penalty:
  //   - Nature, gravity, and duration of the contravention
  //   - Type of personal data affected
  //   - Whether the contravention is repetitive
  //   - Mitigation efforts and speed of response
  //   - Proportionality to turnover/scale
  //
  // Realistic first-time penalty: ~5–12% of the statutory ceiling.

  const getPenaltyForFinding = (f: Finding): {
    maxAmount: number; maxLabel: string;
    likelyAmount: number; likelyLabel: string;
    section: string; scheduleRef: string
  } => {
    const sec = f.dpdpSection.toLowerCase();

    if (f.severity === 'critical') {
      if (sec.includes('9(1)') || sec.includes('children')) {
        return { maxAmount: 200, maxLabel: '₹200 Cr (max)', likelyAmount: 15, likelyLabel: '₹10–20 Cr', section: 'Section 9(1)', scheduleRef: 'Schedule, Row 3' };
      }
      if (sec.includes('8(5)')) {
        return { maxAmount: 250, maxLabel: '₹250 Cr (max)', likelyAmount: 20, likelyLabel: '₹15–30 Cr', section: 'Section 8(5)', scheduleRef: 'Schedule, Row 1' };
      }
      return { maxAmount: 250, maxLabel: '₹250 Cr (max)', likelyAmount: 20, likelyLabel: '₹15–30 Cr', section: 'Section 8(5)', scheduleRef: 'Schedule, Row 1' };
    }

    if (f.severity === 'high') {
      if (sec.includes('16')) {
        return { maxAmount: 50, maxLabel: '₹50 Cr (max)', likelyAmount: 7, likelyLabel: '₹5–10 Cr', section: 'Section 16', scheduleRef: 'Schedule, Row 5' };
      }
      if (sec.includes('6(1)')) {
        return { maxAmount: 50, maxLabel: '₹50 Cr (max)', likelyAmount: 5, likelyLabel: '₹3–8 Cr', section: 'Section 6(1)', scheduleRef: 'Schedule, Row 5' };
      }
      return { maxAmount: 250, maxLabel: '₹250 Cr (max)', likelyAmount: 15, likelyLabel: '₹10–25 Cr', section: sec.includes('8(5)') ? 'Section 8(5)' : 'Section 8', scheduleRef: 'Schedule, Row 1' };
    }

    if (f.severity === 'medium') {
      const sectionLabel = sec.includes('8(5)') ? 'Section 8(5)' : sec.includes('6(2)') ? 'Section 6(2)' : 'Section 8';
      return { maxAmount: 50, maxLabel: '₹50 Cr (max)', likelyAmount: 3, likelyLabel: '₹2–5 Cr', section: sectionLabel, scheduleRef: 'Schedule, Row 5' };
    }

    return { maxAmount: 50, maxLabel: '₹50 Cr (max)', likelyAmount: 1, likelyLabel: '₹1–2 Cr', section: 'General', scheduleRef: 'Schedule, Row 5' };
  };

  const penaltyBreakdown = openFindings.map((f) => ({
    finding: f,
    penalty: getPenaltyForFinding(f),
  }));
  const totalPenaltyExposureLikely = penaltyBreakdown.reduce((sum, p) => sum + p.penalty.likelyAmount, 0);
  const totalPenaltyExposureMax = penaltyBreakdown.reduce((sum, p) => sum + p.penalty.maxAmount, 0);

  // 5c. Missing Compliance Policies Detection
  // Check which required DPDP policies are NOT evidenced across findings
  const detectedSections = new Set(findings.map((f) => f.dpdpSection.toLowerCase()));
  const requiredPolicies = [
    { id: 'cookie-consent', name: 'Cookie Consent Banner', section: '6(1)', icon: 'consent',
      detected: detectedSections.size > 0 && findings.some((f) => f.status === 'verified_fix' && f.dpdpSection.toLowerCase().includes('6(1)')),
      description: 'Explicit pre-consent notice before setting non-essential cookies' },
    { id: 'data-retention', name: 'Data Retention Policy', section: '8(7)', icon: 'retention',
      detected: false,
      description: 'Documented retention periods and automated erasure schedule' },
    { id: 'dpo-contact', name: 'DPO Contact Information', section: '8(10)', icon: 'dpo',
      detected: false,
      description: 'Designated Data Protection Officer contact published on website' },
    { id: 'grievance-redressal', name: 'Grievance Redressal Mechanism', section: '11(2)', icon: 'grievance',
      detected: false,
      description: 'Accessible process for Data Principals to file complaints' },
    { id: 'cross-border', name: 'Cross-Border Transfer Safeguards', section: '16', icon: 'transfer',
      detected: !findings.some((f) => f.dpdpSection.toLowerCase().includes('16') && f.status === 'open'),
      description: 'Contractual safeguards for personal data transferred outside India' },
    { id: 'children-data', name: "Children's Data Consent Gate", section: '9(1)', icon: 'children',
      detected: !findings.some((f) => f.dpdpSection.toLowerCase().includes('9(1)') && f.status === 'open'),
      description: 'Verifiable parental consent mechanism for users under 18' },
  ];
  const missingPolicies = requiredPolicies.filter((p) => !p.detected);
  const presentPolicies = requiredPolicies.filter((p) => p.detected);

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
        <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-subtle">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] flex items-center justify-center text-[#52796F]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#18181B] uppercase tracking-wider">Public Security Gateway</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#F1F5F9] text-[#71717A] border border-[#E4E4E7] font-mono">Unauthenticated</span>
              </div>
              <p className="text-xs text-[#71717A] mt-0.5">
                Telemetry and audit records are isolated per tenant. Sign in to launch target audits and review your organization's findings.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
            <button
              onClick={() => { setLoginModalMode('register'); setShowLoginModal(true); }}
              className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-[#18181B] font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register</span>
            </button>
          </div>
        </div>

        {/* Hero Section */}
        <div className="relative rounded-3xl bg-[#FFFFFF] border border-[#E4E4E7] p-8 sm:p-12 overflow-hidden shadow-subtle">
          <div className="relative z-10 max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F1F5F9] border border-[#E4E4E7] text-[#52796F] text-xs font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              <span>PrivaCraft — Privacy Intelligence & Compliance Auditing</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-5xl font-black text-[#18181B] tracking-tight leading-tight">
                Continuous Client-Side Privacy Auditing & Exposure Defense
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => { setLoginModalMode('login'); setShowLoginModal(true); }}
                className="px-6 py-3 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white font-bold text-sm shadow-subtle hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center gap-2"
              >
                <span>Access Compliance Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => { setLoginModalMode('register'); setShowLoginModal(true); }}
                className="px-5 py-3 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-[#18181B] font-semibold text-sm transition-all flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4 text-[#52796F]" />
                <span>Create Multi-Tenant Account</span>
              </button>

              <Link
                to="/scan"
                className="px-4 py-3 rounded-xl text-[#71717A] hover:text-[#18181B] font-medium text-sm transition-colors flex items-center gap-1.5"
              >
                <span>Explore Scanner</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* 4 Core Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] flex items-center justify-center text-[#52796F]">
              <Radar className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-[#18181B]">Browser Observer</h3>
            <p className="text-xs text-[#71717A] leading-relaxed">
              Instruments headless Chromium via Playwright to observe live network requests, cookies, and localStorage writes prior to user consent.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] flex items-center justify-center text-[#52796F]">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-[#18181B]">Statutory DPDP Rules</h3>
            <p className="text-xs text-[#71717A] leading-relaxed">
              Automated rule checks against Sections 6(1) Notice, 6(4) Consent Withdrawal, 8(5) Security, 9(1) Children's Data, and 11(1) Rights.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] flex items-center justify-center text-[#52796F]">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-[#18181B]">Cryptographic Verification</h3>
            <p className="text-xs text-[#71717A] leading-relaxed">
              Captures SHA-256 evidence logs and runs automated remediation probes to verify that reported privacy gaps have been patched.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-3">
            <div className="w-10 h-10 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] flex items-center justify-center text-[#52796F]">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-[#18181B]">Multi-Tenant Isolation</h3>
            <p className="text-xs text-[#71717A] leading-relaxed">
              Enterprise tenant isolation ensures that your organization's scans, findings, evidence logs, and settings are never exposed across tenants.
            </p>
          </div>
        </div>

        {/* DPDP Act 2023 Statutory Breakdown Table */}
        <div className="p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#52796F]" />
              <h2 className="text-sm font-bold text-[#18181B]">DPDP Act, 2023 — Statutory Inspection Modules</h2>
            </div>
            <span className="text-[11px] text-[#71717A]">Active Rule Engine Coverage</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E4E4E7] text-[#71717A] font-mono text-[11px]">
                  <th className="py-2.5 px-3">Statutory Provision</th>
                  <th className="py-2.5 px-3">Evaluation Scope</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Automated Telemetry Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] text-[#18181B]">
                <tr>
                  <td className="py-3 px-3 font-mono font-semibold text-[#52796F]">Section 6(1)</td>
                  <td className="py-3 px-3">Notice Requirements & Itemised Purpose Specification</td>
                  <td className="py-3 px-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-[#B45309] border border-amber-200">HIGH</span></td>
                  <td className="py-3 px-3 text-[#71717A]">DOM extraction of consent notice and purpose disclosure</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-mono font-semibold text-[#52796F]">Section 6(4)</td>
                  <td className="py-3 px-3">Ease of Consent Withdrawal (Equal friction)</td>
                  <td className="py-3 px-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-[#B45309] border border-amber-200">HIGH</span></td>
                  <td className="py-3 px-3 text-[#71717A]">Withdrawal link accessibility and friction comparison</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-mono font-semibold text-[#52796F]">Section 8(5)</td>
                  <td className="py-3 px-3">Reasonable Security Safeguards & Egress Protection</td>
                  <td className="py-3 px-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-[#B91C1C] border border-red-200">CRITICAL</span></td>
                  <td className="py-3 px-3 text-[#71717A]">Network egress capture, tracker detection, cookie auditing</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-mono font-semibold text-[#52796F]">Section 9(1)</td>
                  <td className="py-3 px-3">Verifiable Parental Consent for Children's Data</td>
                  <td className="py-3 px-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-[#B91C1C] border border-red-200">CRITICAL</span></td>
                  <td className="py-3 px-3 text-[#71717A]">Age gating, profiling script checks, parental consent mechanism</td>
                </tr>
                <tr>
                  <td className="py-3 px-3 font-mono font-semibold text-[#52796F]">Section 11(1)</td>
                  <td className="py-3 px-3">Data Principal Rights: Access, Correction & Erasure</td>
                  <td className="py-3 px-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-[#B45309] border border-amber-200">MEDIUM</span></td>
                  <td className="py-3 px-3 text-[#71717A]">Privacy policy rights clause parsing and DPO contact verification</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] flex items-start gap-3 text-xs text-[#71717A]">
          <AlertCircle className="w-4 h-4 text-[#52796F] flex-shrink-0 mt-0.5" />
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
      <div className="relative rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] p-6 sm:p-8 overflow-hidden shadow-subtle">
        <div className="relative z-10 space-y-6">
          {/* Top Status Badges */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-[#F1F5F9] text-[#52796F] border border-[#E4E4E7] flex items-center gap-1.5 shadow-subtle">
                <span className="w-2 h-2 rounded-full bg-[#52796F] animate-pulse" />
                PRIVACRAFT REGULATORY AUDITOR
              </span>
              <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full text-[10px] font-mono bg-[#F8FAFC] text-[#71717A] border border-[#E4E4E7]">
                SANDBOX ENGINE v2.4
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Link
                to="/fix-verify"
                className="px-3 py-1.5 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-[#71717A] hover:text-[#18181B] font-medium transition-colors flex items-center gap-2 group"
              >
                <span>Verify Pending Patches</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] group-hover:scale-125 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Headline & Mission Context */}
          <div className="max-w-3xl space-y-2">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#18181B] tracking-tight leading-tight">
              Crafting trust through privacy.{' '}
              <span className="text-[#52796F]">
                Verify every fix.
              </span>
            </h2>
          </div>

          {/* Prominent Website Scan Input */}
          <div className="pt-2">
            <form onSubmit={handleQuickScan} className="space-y-3">
              <div className="flex flex-col md:flex-row gap-2.5 p-2 rounded-2xl bg-[#F8FAFC] border border-[#E4E4E7] shadow-subtle">
                {/* URL Input */}
                <div className="flex-1 flex items-center gap-3 px-3.5 py-2.5 bg-[#F1F5F9] rounded-xl border border-[#E4E4E7] focus-within:border-[#52796F] transition-colors">
                  <Globe className="w-4 h-4 text-[#52796F] flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Enter target website URL (e.g. https://your-business.in)"
                    value={quickUrl}
                    onChange={(e) => {
                      setQuickUrl(e.target.value);
                      setUrlError('');
                    }}
                    className="w-full bg-transparent text-xs sm:text-sm text-[#18181B] placeholder:text-[#71717A] focus:outline-none font-mono"
                  />
                  {quickUrl && (
                    <button
                      type="button"
                      onClick={() => setQuickUrl('')}
                      className="text-[#71717A] hover:text-[#18181B] text-xs px-1 font-mono"
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
                    className="w-full h-full min-h-[44px] bg-[#F1F5F9] border border-[#E4E4E7] rounded-xl px-3 py-2 text-xs font-medium text-[#18181B] focus:outline-none focus:border-[#52796F] transition-colors cursor-pointer"
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
                  className="px-6 py-3 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-subtle transition-all flex-shrink-0 active:scale-95"
                >
                  <Radar className="w-4 h-4 stroke-[2.5]" />
                  <span>Run DPDP Audit</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {urlError && (
                <div className="flex items-center gap-2 text-[#B91C1C] text-xs px-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{urlError}</span>
                </div>
              )}

              {/* Quick Target Preset Chips */}
              <div className="flex items-center gap-2 flex-wrap pt-1 text-xs">
                <span className="text-[#71717A] text-[11px] font-medium flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-[#52796F]" />
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
                          ? 'bg-[#F1F5F9] text-[#52796F] border border-[#52796F] shadow-subtle'
                          : 'bg-[#F8FAFC] text-[#71717A] border border-[#E4E4E7] hover:bg-[#F1F5F9] hover:text-[#18181B]'
                      }`}
                    >
                      <span>{preset.label.split('(')[0].trim()}</span>
                      <span className="text-[10px] text-[#71717A] font-mono">
                        ({preset.label.includes('FinTech') ? 'FinTech' : preset.label.includes('Health') ? 'Health' : 'Retail'})
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Authorization Note */}
              <div className="flex items-center gap-2 text-[11px] text-[#71717A] pt-1">
                <Lock className="w-3.5 h-3.5 text-[#52796F] flex-shrink-0" />
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
          <div className="p-5 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] hover:border-[#52796F]/20 transition-all shadow-subtle group">
            <div className="flex items-center justify-between text-[#71717A] text-xs mb-3">
              <span className="font-semibold text-[#18181B]">Websites Monitored</span>
              <div className="w-8 h-8 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] flex items-center justify-center text-[#52796F]">
                <Globe className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-[#18181B] font-mono">{monitoredWebsitesCount}</span>
              {monitoredWebsitesCount > 0 ? (
                <span className="text-xs font-semibold text-[#15803D] bg-green-50 px-2 py-0.5 rounded-full border border-green-200 font-mono">
                  {monitoredWebsitesCount} Active
                </span>
              ) : (
                <span className="text-xs font-semibold text-[#71717A] bg-[#F1F5F9] px-2 py-0.5 rounded-full border border-[#E4E4E7] font-mono">
                  No targets
                </span>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-[#E4E4E7] flex items-center justify-between text-[11px] text-[#71717A]">
              <span>Audit Scope</span>
              <span className="text-[#18181B] font-mono">
                {monitoredWebsitesCount > 0 ? `${scans.length} Total Audits` : 'Pending First Scan'}
              </span>
            </div>
          </div>

          {/* Card 2: Open Privacy Findings */}
          <div className="p-5 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] hover:border-[#F59E0B]/40 transition-all shadow-subtle group">
            <div className="flex items-center justify-between text-[#71717A] text-xs mb-3">
              <span className="font-semibold text-[#18181B]">Open Privacy Findings</span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-[#B45309]">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-black font-mono ${openFindings.length > 0 ? 'text-[#B45309]' : 'text-[#15803D]'}`}>
                {openFindings.length}
              </span>
              {openFindings.length > 0 ? (
                <span className="text-xs font-semibold text-[#B45309] bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-mono">
                  Action Required
                </span>
              ) : (
                <span className="text-xs font-semibold text-[#15803D] bg-green-50 px-2 py-0.5 rounded-full border border-green-200 font-mono">
                  Baseline Clear
                </span>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-[#E4E4E7] flex items-center justify-between text-[11px]">
              <span className="text-[#71717A]">Severity distribution</span>
              <span className="text-[#B91C1C] font-mono font-bold">
                {criticalCount} Crit • {highCount} High
              </span>
            </div>
          </div>

          {/* Card 3: Technical Risk Exposure Index */}
          <div className="p-5 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] hover:border-[#EF4444]/40 transition-all shadow-subtle group">
            <div className="flex items-center justify-between text-[#71717A] text-xs mb-3">
              <span className="font-semibold text-[#18181B]">Technical Exposure Index</span>
              <div className="w-8 h-8 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-[#B91C1C]">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-xl sm:text-2xl font-black font-mono ${criticalCount > 0 ? 'text-[#B91C1C]' : highCount > 0 ? 'text-[#B45309]' : 'text-[#15803D]'}`}>
                {exposureTierText}
              </span>
              <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                criticalCount > 0
                  ? 'text-[#B91C1C] bg-red-50 border-red-200'
                  : openFindings.length === 0
                  ? 'text-[#15803D] bg-green-50 border-green-200'
                  : 'text-[#B45309] bg-amber-50 border-amber-200'
              }`}>
                {exposureBadge}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-[#E4E4E7] flex items-center justify-between text-[11px] text-[#71717A]">
              <span className="font-mono">{exposureTierLevel}</span>
              <span className="text-[#18181B] font-mono truncate max-w-[170px]" title={exposureTierLabel}>{exposureTierLabel}</span>
            </div>
          </div>

          {/* Card 4: Verified Remediations */}
          <div className="p-5 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] hover:border-[#22C55E]/40 transition-all shadow-subtle group">
            <div className="flex items-center justify-between text-[#71717A] text-xs mb-3">
              <span className="font-semibold text-[#18181B]">Verified Remediations</span>
              <div className="w-8 h-8 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center text-[#15803D]">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-[#15803D] font-mono">{verifiedFindingsCount}</span>
              <span className="text-xs font-semibold text-[#15803D] bg-green-50 px-2 py-0.5 rounded-full border border-green-200 font-mono">
                {totalAuditCount > 0 ? `${passRate}% pass rate` : (verifiedFindingsCount > 0 ? 'Verified' : 'No tests yet')}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-[#E4E4E7]">
              <div className="w-full bg-[#F8FAFC] rounded-full h-1.5 overflow-hidden border border-[#E4E4E7]">
                <div
                  className="bg-[#15803D] h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(5, passRate)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2b. Statutory Penalty Exposure & Missing Compliance Policies */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Statutory Penalty Exposure Card */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-[#B91C1C]" />
              <span>Statutory Penalty Exposure — DPDP Act 2023</span>
            </h3>
            <span className="text-[10px] font-mono text-[#71717A] bg-[#F8FAFC] px-2 py-0.5 rounded border border-[#E4E4E7]">
              ADVISORY ESTIMATE
            </span>
          </div>

          {/* Total Exposure Banner - Realistic Range */}
          <div className={`p-4 rounded-xl border flex items-center justify-between ${
            totalPenaltyExposureLikely > 30
              ? 'bg-red-50 border-red-200'
              : totalPenaltyExposureLikely > 10
              ? 'bg-amber-50 border-amber-200'
              : 'bg-green-50 border-green-200'
          }`}>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#71717A]">Likely First-Time Penalty (Sec. 33 adjusted)</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-2xl sm:text-3xl font-black font-mono ${
                  totalPenaltyExposureLikely > 30 ? 'text-[#B91C1C]' : totalPenaltyExposureLikely > 10 ? 'text-[#B45309]' : 'text-[#15803D]'
                }`}>
                  ₹{totalPenaltyExposureLikely}
                </span>
                <span className="text-sm font-bold text-[#71717A]">Crores</span>
                <span className="text-[11px] text-[#71717A] font-mono">
                  (~${Math.round(totalPenaltyExposureLikely * 0.12)}M USD)
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-[#71717A]">Statutory max: ₹{totalPenaltyExposureMax} Cr</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-mono text-[#71717A] uppercase">Open Violations</span>
              <div className={`text-2xl font-black font-mono ${
                openFindings.length > 0 ? 'text-[#B91C1C]' : 'text-[#15803D]'
              }`}>
                {openFindings.length}
              </div>
            </div>
          </div>

          {/* Per-finding penalty breakdown */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {penaltyBreakdown.length === 0 ? (
              <div className="text-center py-6 text-[#71717A] text-xs">
                <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-[#15803D]" />
                <p className="font-semibold text-[#15803D]">No Open Statutory Violations</p>
                <p className="text-[11px]">All detected findings have been remediated.</p>
              </div>
            ) : (
              penaltyBreakdown.map(({ finding, penalty }) => {
                const sev = formatSeverity(finding.severity);
                return (
                  <div key={finding.id} className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] hover:bg-[#F1F5F9] transition-colors group">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 ${sev.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                        {sev.label}
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-[#18181B] truncate block">{finding.title}</span>
                        <span className="text-[10px] font-mono text-[#71717A]">{penalty.section} • {penalty.scheduleRef}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className={`text-sm font-black font-mono ${
                        finding.severity === 'critical' ? 'text-[#B91C1C]' : finding.severity === 'high' ? 'text-[#B45309]' : 'text-[#18181B]'
                      }`}>
                        {penalty.likelyLabel}
                      </span>
                      <span className="text-[9px] font-mono text-[#A1A1AA]">
                        max: {penalty.maxLabel}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Disclaimer */}
          <div className="pt-2 border-t border-[#E4E4E7] text-[10px] text-[#71717A] flex items-start gap-1.5">
            <CircleAlert className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>Likely penalty range estimated using DPDP Act 2023 Schedule ceilings adjusted by Section 33 factors (first-time offence, mitigation efforts, proportionality). Actual penalty determined by the Data Protection Board of India on a case-by-case basis.</span>
          </div>
        </div>

        {/* Missing Compliance Policies Card */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-[#B45309]" />
              <span>Missing Compliance Policies</span>
            </h3>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
              missingPolicies.length > 3
                ? 'text-[#B91C1C] bg-red-50 border-red-200'
                : missingPolicies.length > 0
                ? 'text-[#B45309] bg-amber-50 border-amber-200'
                : 'text-[#15803D] bg-green-50 border-green-200'
            }`}>
              {missingPolicies.length} / {requiredPolicies.length} MISSING
            </span>
          </div>

          {/* Missing Policies List */}
          <div className="space-y-2">
            {missingPolicies.map((policy) => (
              <div key={policy.id} className="flex items-start gap-3 p-3 rounded-xl bg-red-50/50 border border-red-200/60 hover:bg-red-50 transition-colors">
                <XCircle className="w-4 h-4 text-[#B91C1C] flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#18181B]">{policy.name}</span>
                    <span className="text-[10px] font-mono text-[#B91C1C] bg-red-50 px-1.5 py-0.5 rounded border border-red-200">MISSING</span>
                  </div>
                  <p className="text-[10px] text-[#71717A] mt-0.5">{policy.description}</p>
                  <span className="text-[10px] font-mono text-[#52796F] mt-1 inline-block">DPDP Act — Section {policy.section}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Present Policies */}
          {presentPolicies.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#E4E4E7]">
              <span className="text-[10px] font-semibold text-[#15803D] uppercase tracking-wider">Verified Present</span>
              {presentPolicies.map((policy) => (
                <div key={policy.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-green-50/50 border border-green-200/60">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] flex-shrink-0" />
                  <span className="text-xs font-medium text-[#18181B]">{policy.name}</span>
                  <span className="text-[10px] font-mono text-[#15803D]">Section {policy.section}</span>
                </div>
              ))}
            </div>
          )}

          {/* Action CTA */}
          <div className="pt-2 border-t border-[#E4E4E7]">
            <Link
              to="/scan"
              className="w-full py-2.5 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-center text-xs text-[#18181B] font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Radar className="w-3.5 h-3.5 text-[#52796F]" />
              <span>Run Full Policy Compliance Scan</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* 3. Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weekly Exposure vs Verified Area Chart */}
        <div className="lg:col-span-8 p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#52796F]" />
                <span>Weekly Exposure vs. Verified Remediation Trajectory</span>
              </h3>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-[#71717A]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#B91C1C]" /> Detected Exposures
              </span>
              <span className="flex items-center gap-1.5 text-[#71717A]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#15803D]" /> Verified Fixes
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
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111827',
                    borderColor: '#273449',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#F8FAFC',
                    boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.4)',
                  }}
                />
                <Area type="monotone" dataKey="exposures" stroke="#EF4444" strokeWidth={2.5} fillOpacity={1} fill="url(#colorExposures)" />
                <Area type="monotone" dataKey="verified" stroke="#22C55E" strokeWidth={2.5} fillOpacity={1} fill="url(#colorVerified)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Severity Donut Distribution */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#B45309]" />
                <span>Severity Breakdown</span>
              </h3>
              <span className="text-[10px] font-mono text-[#52796F] bg-[#F1F5F9] px-2 py-0.5 rounded border border-[#E4E4E7] font-bold">
                ACTIVE
              </span>
            </div>
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
                    backgroundColor: '#111827',
                    borderColor: '#273449',
                    borderRadius: '10px',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center">
              <span className="text-2xl font-black text-[#18181B] font-mono">{findings.length}</span>
              <span className="text-[10px] text-[#71717A] block uppercase tracking-wider font-semibold font-mono">Total Items</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-[#E4E4E7]">
            {severityData.map((item) => (
              <div key={item.name} className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7]">
                <span className="flex items-center gap-1.5 text-[#71717A] font-medium text-[11px]">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
                <span className="font-mono text-[#18181B] font-bold">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Bottom Grid: Findings Table & Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Findings Table */}
        <div className="lg:col-span-8 p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2">
                <span>Priority Privacy & Security Findings</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#F1F5F9] text-[#52796F] border border-[#E4E4E7]">
                  {filteredFindings.length} Items
                </span>
              </h3>
            </div>

            {/* Quick Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] text-xs">
              {(['all', 'critical', 'high', 'verified'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setTableFilter(tab)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all capitalize font-mono ${
                    tableFilter === tab
                      ? 'bg-[#F1F5F9] text-[#52796F] border border-[#52796F] font-bold shadow-subtle'
                      : 'text-[#71717A] hover:text-[#18181B]'
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
                <tr className="border-b border-[#E4E4E7] text-[#71717A] font-medium">
                  <th className="pb-3 font-semibold">Finding Details</th>
                  <th className="pb-3 font-semibold">Severity</th>
                  <th className="pb-3 font-semibold hidden sm:table-cell">Statutory Section</th>
                  <th className="pb-3 font-semibold hidden md:table-cell">Status</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7]">
                {filteredFindings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-xs text-[#71717A] italic">
                      No security or privacy findings matching the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredFindings.slice(0, 5).map((f) => {
                    const sev = formatSeverity(f.severity);
                    const isSynthetic = f.isDemoFixture || f.affectedUrl.includes('paysecure-india.in') || f.affectedUrl.includes('testbed');
                    return (
                      <tr key={f.id} className="group hover:bg-[#F1F5F9]/50 transition-colors">
                        <td className="py-3.5 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#18181B] group-hover:text-[#52796F] transition-colors truncate max-w-xs sm:max-w-sm">
                              {f.title}
                            </span>
                            {isSynthetic && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#52796F] border border-[#E4E4E7] flex-shrink-0 font-bold">
                                TESTBED
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#71717A] truncate max-w-xs font-mono mt-0.5">
                            {truncateUrl(f.affectedUrl, 42)}
                          </div>
                        </td>
                        <td className="py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${sev.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                            {sev.label}
                          </span>
                        </td>
                        <td className="py-3.5 text-[#18181B] hidden sm:table-cell font-mono text-[11px]">
                          {f.dpdpSection.split('-')[0].trim()}
                        </td>
                        <td className="py-3.5 hidden md:table-cell">
                          <span className="capitalize text-[#18181B] text-[11px] font-medium font-mono">
                            {f.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3.5 text-right">
                          <Link
                            to={`/fix-verify?findingId=${f.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#F1F5F9] hover:bg-[#18181B] hover:text-white border border-[#E4E4E7] text-[#52796F] transition-all font-semibold text-xs shadow-subtle"
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

          <div className="pt-2 border-t border-[#E4E4E7] flex items-center justify-between text-xs">
            <span className="text-[#71717A]">
              Showing {Math.min(filteredFindings.length, 5)} of {findings.length} total findings
            </span>
            <Link
              to="/findings"
              className="text-[#52796F] hover:text-[#405F57] font-semibold flex items-center gap-1"
            >
              <span>Explore all findings</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#18181B] flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#15803D]" />
                <span>Audit Activity Stream</span>
              </h3>
              <span className="text-[10px] text-[#15803D] flex items-center gap-1 font-mono font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] animate-pulse" />
                STREAMING
              </span>
            </div>

            <div className="space-y-2.5">
              {activityList.length === 0 ? (
                <div className="text-center py-10 text-[#71717A] text-xs space-y-1">
                  <Activity className="w-6 h-6 text-slate-600 mx-auto mb-2 opacity-60" />
                  <p className="font-semibold text-[#71717A]">No Audit Activity Recorded</p>
                  <p className="text-[11px] text-[#71717A]">Run a website scan or verify a patch to stream real compliance events.</p>
                </div>
              ) : (
                activityList.slice(0, 5).map((act) => (
                  <div key={act.id} className="p-3 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] hover:bg-[#F1F5F9]/80 transition-colors text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate pr-2">
                        <span className="font-semibold text-[#18181B] truncate">{act.title}</span>
                        {act.isSynthetic && (
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#F8FAFC] text-[#71717A] border border-[#E4E4E7] font-bold">
                            TESTBED
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[#71717A] font-mono flex-shrink-0">{act.timestamp}</span>
                    </div>
                    <p className="text-[#71717A] text-[11px] leading-relaxed">
                      {act.description}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E4E4E7]">
            <Link
              to="/history"
              className="w-full py-2.5 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-center text-xs text-[#18181B] font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>View Full Compliance Event Log</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Advisory Assessment Disclaimer */}
      <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle flex items-start gap-3 text-xs text-[#71717A]">
        <AlertCircle className="w-4 h-4 text-[#52796F] flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold text-[#18181B]">Technical Advisory Notice (DPDP Act 2023 Evaluation):</span>
          <p className="text-[11px] leading-relaxed">
            Technical audit scores, exposure categories, and automated observations represent an advisory security assessment of observed system behaviors. They identify potential compliance risk indicators and do not constitute formal legal adjudication or confirmed statutory penalty determinations under the Digital Personal Data Protection Act, 2023.
          </p>
        </div>
      </div>
    </div>
  );

};
