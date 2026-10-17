import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  History as HistoryIcon, 
  Search, 
  Download, 
  ExternalLink, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  FileText, 
  X,
  Filter,
  ArrowRight,
  Printer,
  ShieldCheck,
  Radar
} from 'lucide-react';
import { api } from '@/services/api';
import { ScanResult } from '@/types';
import { formatDate, truncateUrl } from '@/lib/utils';

export const History: React.FC = () => {
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScanReport, setSelectedScanReport] = useState<ScanResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadScans = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const list = await api.getScans();
      setScans(list);
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load historical audit scans.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadScans();
  }, []);

  const filteredScans = scans.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.targetUrl.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
  });

  const handleExportJSON = (scan: ScanResult) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(scan, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `DPDP_Audit_Report_${scan.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportCSV = () => {
    if (scans.length === 0) return;
    const headers = [
      'Scan ID',
      'Target URL',
      'Scope',
      'Initiated At',
      'Duration Seconds',
      'Risk Score',
      'Compliance Score',
      'Critical Findings',
      'High Findings',
      'Total Findings',
      'Status',
    ];
    const rows = scans.map((s) => [
      `"${s.id}"`,
      `"${s.targetUrl}"`,
      `"${s.profile}"`,
      `"${s.initiatedAt}"`,
      s.durationSeconds,
      s.riskScore,
      s.complianceScore,
      s.findingsCount?.critical ?? 0,
      s.findingsCount?.high ?? 0,
      s.findingsCount?.total ?? 0,
      `"${s.status}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `DPDP_Compliance_Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-obsidian-900/90 via-obsidian-850/80 to-obsidian-900/90 border border-white/[0.08] p-6 shadow-obsidian-card backdrop-blur-md">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 shadow-cyan-glow">
                <HistoryIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans">
                    Audit History & Historical Scans
                  </h2>
                  <span className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    {filteredScans.length} ARCHIVED
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Archival records of completed technical privacy audits, recorded evidence, and compliance exposure trends under DPDP 2023.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              onClick={handleExportCSV}
              disabled={scans.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-obsidian-950 hover:bg-obsidian-850 border border-white/[0.08] text-slate-200 font-semibold text-xs transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export CSV</span>
            </button>
            <Link
              to="/scan"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-cyan-glow transition-all active:scale-95"
            >
              Run New Audit
            </Link>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {loadError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            onClick={loadScans}
            className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="p-4 rounded-2xl bg-obsidian-900/85 border border-white/[0.08] shadow-obsidian-card backdrop-blur-md flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by target domain or scan ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-obsidian-950/80 border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/20 transition-all font-mono"
          />
        </div>

        <span className="text-xs text-slate-400 font-mono font-medium hidden sm:inline">
          {filteredScans.length} Scans Archived
        </span>
      </div>

      {/* History Table */}
      <div className="rounded-2xl bg-obsidian-900/85 border border-white/[0.08] shadow-obsidian-card backdrop-blur-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-slate-400 font-semibold bg-obsidian-950/80 font-mono text-[11px] uppercase tracking-wider">
                <th className="py-3.5 px-5">Scan ID & Target</th>
                <th className="py-3.5 px-5">Initiated At</th>
                <th className="py-3.5 px-5">Duration</th>
                <th className="py-3.5 px-5">DPDP Risk Index</th>
                <th className="py-3.5 px-5">Findings</th>
                <th className="py-3.5 px-5">Status</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {isLoading ? (
                [1, 2, 3].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-5 space-y-2">
                      <div className="h-3 w-24 bg-obsidian-800 rounded" />
                      <div className="h-4 w-48 bg-obsidian-750 rounded" />
                    </td>
                    <td className="py-4 px-5"><div className="h-3 w-20 bg-obsidian-800 rounded" /></td>
                    <td className="py-4 px-5"><div className="h-3 w-12 bg-obsidian-800 rounded" /></td>
                    <td className="py-4 px-5"><div className="h-3 w-16 bg-obsidian-800 rounded" /></td>
                    <td className="py-4 px-5"><div className="h-3 w-16 bg-obsidian-800 rounded" /></td>
                    <td className="py-4 px-5"><div className="h-4 w-20 bg-obsidian-800 rounded-full" /></td>
                    <td className="py-4 px-5 text-right"><div className="h-7 w-16 bg-obsidian-800 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filteredScans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-sans">
                    No historical scans match your query.
                  </td>
                </tr>
              ) : (
                filteredScans.map((scan) => (
                  <tr key={scan.id} className="hover:bg-obsidian-850/50 transition-colors group">
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-cyan-300 font-bold text-xs">
                          {scan.id}
                        </span>
                        {scan.isDemo && (
                          <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 font-bold">
                            DEMO FIXTURE
                          </span>
                        )}
                      </div>
                      <div className="text-slate-200 font-semibold truncate max-w-xs sm:max-w-sm mt-0.5 font-sans">
                        {scan.targetUrl}
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase mt-0.5 font-mono">
                        Scope: {scan.profile.replace('_', ' ')}
                      </div>
                    </td>
                    <td className="py-4 px-5 text-slate-300 font-sans text-xs">
                      {formatDate(scan.initiatedAt)}
                    </td>
                    <td className="py-4 px-5 text-slate-400 font-mono">
                      {scan.durationSeconds}s
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-16 bg-obsidian-950 rounded-full h-2 overflow-hidden border border-white/[0.08]">
                          <div
                            className={`h-full ${
                              scan.riskScore > 65
                                ? 'bg-rose-500'
                                : scan.riskScore > 35
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                            }`}
                            style={{ width: `${scan.riskScore}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs font-bold text-slate-200">
                          {scan.riskScore}/100
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        {scan.findingsCount.critical > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                            {scan.findingsCount.critical}C
                          </span>
                        )}
                        {scan.findingsCount.high > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                            {scan.findingsCount.high}H
                          </span>
                        )}
                        <span className="text-slate-400">
                          ({scan.findingsCount.total} total)
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Completed
                      </span>
                    </td>
                    <td className="py-4 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedScanReport(scan)}
                          className="px-3 py-1.5 rounded-xl bg-obsidian-950 hover:bg-obsidian-800 border border-white/[0.08] text-slate-200 text-xs font-semibold transition-colors"
                        >
                          Report
                        </button>
                        <button
                          onClick={() => handleExportJSON(scan)}
                          title="Download JSON Report"
                          className="p-2 rounded-xl bg-obsidian-950 hover:bg-obsidian-800 border border-white/[0.08] text-slate-400 hover:text-white transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Report Modal */}
      {selectedScanReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian-950/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-3xl bg-obsidian-900 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-white/[0.08] bg-obsidian-950/80 flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider font-bold block">
                  Official DPDP Audit Report
                </span>
                <h3 className="text-xl font-bold text-white mt-1 font-sans">
                  DPDP Compliance Audit: {selectedScanReport.targetUrl}
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  Scan ID: {selectedScanReport.id} • Completed: {formatDate(selectedScanReport.initiatedAt)}
                </span>
              </div>
              <button
                onClick={() => setSelectedScanReport(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
              {/* Executive Summary Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-obsidian-950/70 border border-white/[0.06] space-y-1">
                  <span className="text-slate-400 text-[11px] uppercase font-semibold font-mono">Compliance Rating</span>
                  <div className="text-2xl font-black font-mono text-cyan-300">
                    {selectedScanReport.complianceScore}%
                  </div>
                  <span className="text-[10px] text-slate-500 font-sans">Statutory audit score</span>
                </div>
                <div className="p-4 rounded-xl bg-obsidian-950/70 border border-white/[0.06] space-y-1">
                  <span className="text-slate-400 text-[11px] uppercase font-semibold font-mono">Exposures Flagged</span>
                  <div className="text-2xl font-black font-mono text-rose-400">
                    {selectedScanReport.findingsCount.total}
                  </div>
                  <span className="text-[10px] text-slate-500 font-sans">
                    {selectedScanReport.findingsCount.critical} Critical / {selectedScanReport.findingsCount.high} High
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-obsidian-950/70 border border-white/[0.06] space-y-1">
                  <span className="text-slate-400 text-[11px] uppercase font-semibold font-mono">Audit Profile</span>
                  <div className="text-sm font-bold font-mono text-slate-200 truncate">
                    {selectedScanReport.profile.replace('_', ' ').toUpperCase()}
                  </div>
                  <span className="text-[10px] text-slate-500 font-sans">Consent evaluation: Enabled</span>
                </div>
              </div>

              {/* Finding Breakdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white font-sans">
                    Identified Risk Indicators & Recorded Evidence:
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Advisory Assessment
                  </span>
                </div>
                <div className="space-y-2">
                  {selectedScanReport.findings.map((f) => (
                    <div
                      key={f.id}
                      className="p-3.5 rounded-xl bg-obsidian-950/70 border border-white/[0.06] flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-200 font-sans">{f.title}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{f.dpdpSection}</div>
                      </div>
                      <span className="font-mono text-xs font-bold text-rose-400 uppercase bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                        {f.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/[0.08] bg-obsidian-950/80 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportJSON(selectedScanReport)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-obsidian-900 hover:bg-obsidian-850 border border-white/[0.08] text-slate-200 text-xs font-semibold transition-colors"
                >
                  <Download className="w-4 h-4 text-cyan-400" />
                  <span>Export JSON</span>
                </button>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-obsidian-900 hover:bg-obsidian-850 border border-white/[0.08] text-slate-200 text-xs font-semibold transition-colors"
                >
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <span>Print Report</span>
                </button>
              </div>

              <button
                onClick={() => setSelectedScanReport(null)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-cyan-glow transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
