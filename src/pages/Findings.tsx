import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  AlertTriangle, 
  Search, 
  Filter, 
  ShieldAlert, 
  CheckCircle2, 
  ArrowUpDown, 
  ExternalLink, 
  Wrench, 
  ChevronRight, 
  Eye, 
  SlidersHorizontal, 
  X, 
  FileText, 
  Lock, 
  Layers, 
  Sparkles,
  Database,
  ArrowRight,
  ShieldCheck,
  Radar
} from 'lucide-react';
import { api } from '@/services/api';
import { Finding, Severity, FindingStatus, FindingCategory } from '@/types';
import { formatSeverity, formatDate, truncateUrl } from '@/lib/utils';
import { FindingDetailDrawer } from '@/components/findings/FindingDetailDrawer';

export const Findings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedScanId, setSelectedScanId] = useState<string>(searchParams.get('scanId') || 'all');
  const [sortBy, setSortBy] = useState<'severity' | 'detectedAt' | 'confidence'>('severity');
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadFindings = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const list = await api.getFindings();
      setFindings(list);

      // Check if URL specified an id
      const targetId = searchParams.get('id');
      if (targetId) {
        const match = list.find((f) => f.id === targetId);
        if (match) setSelectedFinding(match);
      }

      // Check if URL specified a scanId
      const scanIdParam = searchParams.get('scanId');
      if (scanIdParam) {
        setSelectedScanId(scanIdParam);
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load findings from backend.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFindings();
  }, [searchParams]);

  const handleStatusChange = async (id: string, newStatus: FindingStatus) => {
    const updated = await api.updateFindingStatus(id, newStatus);
    if (updated) {
      setFindings((prev) => prev.map((f) => (f.id === id ? updated : f)));
      if (selectedFinding?.id === id) {
        setSelectedFinding(updated);
      }
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedSeverity('all');
    setSelectedStatus('all');
    setSelectedCategory('all');
    setSelectedScanId('all');
    setSortBy('severity');
  };

  const isFiltered =
    selectedSeverity !== 'all' ||
    selectedStatus !== 'all' ||
    selectedCategory !== 'all' ||
    selectedScanId !== 'all' ||
    searchQuery.trim() !== '';

  const severityWeight: Record<Severity, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
  };

  // Get unique scanIds present in findings
  const availableScanIds = Array.from(new Set(findings.map((f) => f.scanId).filter(Boolean)));

  const filteredFindings = findings
    .filter((f) => {
      if (selectedScanId !== 'all' && f.scanId !== selectedScanId) return false;
      if (selectedSeverity !== 'all' && f.severity !== selectedSeverity) return false;
      if (selectedStatus !== 'all' && f.status !== selectedStatus) return false;
      if (selectedCategory !== 'all' && f.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          f.title.toLowerCase().includes(q) ||
          f.endpoint.toLowerCase().includes(q) ||
          f.dpdpSection.toLowerCase().includes(q) ||
          f.affectedUrl.toLowerCase().includes(q) ||
          f.id.toLowerCase().includes(q) ||
          f.summary.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'severity') {
        return severityWeight[b.severity] - severityWeight[a.severity];
      }
      if (sortBy === 'confidence') {
        return b.confidence - a.confidence;
      }
      return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
    });

  return (
    <div className="space-y-6 pb-12">
      {/* Editorial Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-obsidian-900/90 via-obsidian-850/80 to-obsidian-900/90 border border-white/[0.08] p-6 shadow-obsidian-card backdrop-blur-md">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 shadow-cyan-glow">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans">
                    Identified Privacy & Exposure Findings
                  </h2>
                  <span className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    {filteredFindings.length} Active Items
                  </span>
                  <span className="hidden sm:inline-flex text-[10px] font-mono px-2 py-0.5 rounded bg-obsidian-950/80 text-slate-400 border border-white/[0.06]">
                    SYNTHETIC DEMO FIXTURES
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Granular technical exposures evaluated against DPDP Act 2023 statutory obligations (Section 6, 8, 9, 16).
                </p>
              </div>
            </div>
          </div>

          <Link
            to="/fix-verify"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-cyan-glow transition-all self-start sm:self-auto active:scale-95"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Launch Fix & Verify Workbench</span>
          </Link>
        </div>
      </div>

      {/* Multi-facet Filter and Search Bar */}
      <div className="rounded-2xl bg-obsidian-900/85 border border-white/[0.08] p-5 shadow-obsidian-card backdrop-blur-md space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Box */}
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search by title, endpoint, or section..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-obsidian-950/80 border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/20 transition-all font-mono"
            />
          </div>

          {/* Scope / Scan Report Filter */}
          <div className="md:col-span-2">
            <select
              value={selectedScanId}
              onChange={(e) => setSelectedScanId(e.target.value)}
              className="w-full h-full min-h-[40px] bg-obsidian-950/80 border border-white/[0.08] rounded-xl px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
            >
              <option value="all">All Audit Scans</option>
              {availableScanIds.map((sid) => (
                <option key={sid} value={sid}>
                  {sid}
                </option>
              ))}
            </select>
          </div>

          {/* Severity Filter */}
          <div className="md:col-span-2">
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full h-full min-h-[40px] bg-obsidian-950/80 border border-white/[0.08] rounded-xl px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Informational</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="md:col-span-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full h-full min-h-[40px] bg-obsidian-950/80 border border-white/[0.08] rounded-xl px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="pii_exposure">PII Exposure</option>
              <option value="tracker_pre_consent">Unconsented Tracker</option>
              <option value="unauthorized_export">Cross-Border Transfer</option>
              <option value="insecure_storage">Insecure Storage</option>
              <option value="weak_consent_mechanism">Consent Defect</option>
            </select>
          </div>

          {/* Sort selector */}
          <div className="md:col-span-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full h-full min-h-[40px] bg-obsidian-950/80 border border-white/[0.08] rounded-xl px-3 py-2 text-xs font-medium text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
            >
              <option value="severity">Sort: Severity (High to Low)</option>
              <option value="detectedAt">Sort: Detection Time (Newest)</option>
              <option value="confidence">Sort: Confidence Score</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Status Pills & Clear Action */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-white/[0.06] text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider font-mono mr-1">Status:</span>
            {['all', 'open', 'in_review', 'verified_fix', 'false_positive'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all capitalize ${
                  selectedStatus === st
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 font-semibold shadow-cyan-glow'
                    : 'bg-obsidian-950/60 border border-white/[0.06] text-slate-400 hover:text-slate-200 hover:border-white/[0.12]'
                }`}
              >
                {st === 'all' ? 'All Statuses' : st.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 font-mono">
              Showing {filteredFindings.length} of {findings.length}
            </span>
            {isFiltered && (
              <button
                onClick={handleResetFilters}
                className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {loadError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={loadFindings}
            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Findings Table / List */}
      <div className="rounded-2xl bg-obsidian-900/85 border border-white/[0.08] shadow-obsidian-card backdrop-blur-md overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-white/[0.04] p-4 space-y-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-16 bg-obsidian-800 rounded-full" />
                  <div className="h-4 w-24 bg-obsidian-800 rounded" />
                </div>
                <div className="h-5 w-2/3 bg-obsidian-750 rounded" />
                <div className="h-3 w-1/3 bg-obsidian-800 rounded" />
              </div>
            ))}
          </div>
        ) : filteredFindings.length === 0 ? (
          <div className="py-20 text-center text-slate-400 space-y-3">
            <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-200 font-sans">No matching findings found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No results match your search keywords or active severity filters.
            </p>
            {isFiltered && (
              <button
                onClick={handleResetFilters}
                className="mt-2 px-3.5 py-1.5 rounded-xl bg-obsidian-950 hover:bg-obsidian-800 border border-white/[0.08] text-xs text-cyan-400 font-medium transition-colors"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {filteredFindings.map((finding) => {
              const sev = formatSeverity(finding.severity);
              return (
                <div
                  key={finding.id}
                  data-testid="finding-row"
                  onClick={() => setSelectedFinding(finding)}
                  className="p-5 hover:bg-obsidian-850/60 transition-colors cursor-pointer group flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left Column: Title, Endpoint, Section */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${sev.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                        {sev.label}
                      </span>
                      <span className="font-mono text-xs text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 font-bold">
                        {finding.id}
                      </span>
                      {finding.scanId && (
                        <span className="text-[10px] font-mono text-slate-400 bg-obsidian-950 px-2 py-0.5 rounded border border-white/[0.06]">
                          {finding.scanId}
                        </span>
                      )}
                      {finding.isDemoFixture && (
                        <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 font-bold">
                          DEMO FIXTURE
                        </span>
                      )}
                      {/* Confidence Meter Bar */}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 bg-obsidian-950/80 px-2 py-0.5 rounded border border-white/[0.06]">
                        <span>{finding.confidence}% confidence</span>
                        <div className="w-12 bg-obsidian-800 rounded-full h-1 overflow-hidden">
                          <div
                            className={`h-full ${finding.confidence >= 95 ? 'bg-emerald-400' : 'bg-cyan-400'}`}
                            style={{ width: `${finding.confidence}%` }}
                          />
                        </div>
                      </div>
                      {finding.evidenceAvailable && (
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          Forensic Packet Available
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm sm:text-base font-bold text-slate-100 group-hover:text-cyan-300 transition-colors leading-snug font-sans">
                      {finding.title}
                    </h3>

                    <div className="space-y-1 font-mono text-xs">
                      <div className="text-slate-400 flex items-center gap-2 flex-wrap">
                        <span className="text-slate-200 font-semibold">{finding.dpdpSection.split('-')[0].trim()}</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-500 text-[11px]">Detected: {formatDate(finding.detectedAt)}</span>
                      </div>
                      <div className="text-slate-400 flex items-center gap-1.5 truncate">
                        <span className="text-slate-500 uppercase text-[10px] font-bold">Endpoint:</span>
                        <span className="text-cyan-300/90 truncate text-[11px]">{finding.endpoint}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Status & Action */}
                  <div className="flex items-center justify-between md:justify-end gap-3 flex-shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-white/[0.06]">
                    <div className="flex flex-col md:items-end text-xs">
                      <span className="text-[10px] text-slate-500 uppercase font-mono font-semibold">Status</span>
                      <span className="font-semibold text-slate-200 capitalize mt-0.5">
                        {finding.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFinding(finding);
                        }}
                        className="p-2.5 rounded-xl bg-obsidian-950 hover:bg-obsidian-800 border border-white/[0.08] text-slate-300 hover:text-white transition-colors"
                        title="Inspect Evidence Trace"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <Link
                        to={`/fix-verify?findingId=${finding.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-gradient-to-r hover:from-cyan-400 hover:to-teal-400 text-cyan-300 hover:text-slate-950 border border-cyan-500/30 hover:border-transparent font-bold text-xs transition-all shadow-sm"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Fix</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Slide-out detail inspector */}
      <FindingDetailDrawer
        finding={selectedFinding}
        onClose={() => setSelectedFinding(null)}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
};
