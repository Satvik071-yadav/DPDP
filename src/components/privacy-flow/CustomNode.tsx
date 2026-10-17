import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Globe, Server, Radio, Database, Cloud, ExternalLink, ShieldAlert, AlertTriangle, Layers } from 'lucide-react';
import { PrivacyFlowNodeData } from '@/types';
import { formatSeverity } from '@/lib/utils';

export interface CustomNodeProps {
  data: PrivacyFlowNodeData & {
    isDimmed?: boolean;
    isHighlighted?: boolean;
    isSuppressedInCurrentConsent?: boolean;
  };
  selected?: boolean;
}

export const CustomPrivacyNode = memo(({ data, selected }: CustomNodeProps) => {
  const sev = formatSeverity(data.riskLevel);
  const isDimmed = data.isDimmed || data.isSuppressedInCurrentConsent;

  // 1. Variant: Website Node (Category A - Origin)
  if (data.nodeType === 'website') {
    return (
      <div
        className={`relative min-w-[240px] max-w-[270px] rounded-2xl bg-obsidian-900/90 border transition-all duration-200 shadow-obsidian-card backdrop-blur-md ${
          selected
            ? 'border-cyan-400 ring-2 ring-cyan-400/50 shadow-[0_0_30px_rgba(0,242,254,0.35)]'
            : data.isHighlighted
            ? 'border-cyan-400/80 ring-1 ring-cyan-400/40'
            : 'border-white/[0.12] hover:border-cyan-500/50'
        } ${isDimmed ? 'opacity-35 saturate-50' : 'opacity-100'}`}
      >
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-cyan-glow">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 font-bold block">
                    TARGET WEBSITE
                  </span>
                  {data.isSynthetic && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold border border-amber-500/30">
                      SYNTHETIC
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-medium">1st-Party Origin</span>
              </div>
            </div>
            <span className={`w-2.5 h-2.5 rounded-full ${sev.dot} shadow-[0_0_6px_rgba(0,242,254,0.6)]`} />
          </div>

          <div>
            <div className="font-bold text-sm text-white tracking-tight truncate font-sans">
              {data.label}
            </div>
            <div className="text-[11px] text-cyan-300 font-mono truncate">
              {data.domain}
            </div>
          </div>

          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">{data.jurisdiction}</span>
            <span className="font-mono text-xs text-white font-bold bg-obsidian-950 px-2 py-0.5 rounded border border-white/[0.08]">
              {data.observedRequestsCount} reqs
            </span>
          </div>
        </div>

        {/* Source handle (outbound connections) */}
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-obsidian-950 !rounded-full shadow-[0_0_8px_rgba(0,242,254,0.8)]"
        />
      </div>
    );
  }

  // 2. Variant: API Endpoint Node (Category B - Internal APIs)
  if (data.nodeType === 'api_endpoint') {
    const methodColor = 
      data.httpMethod === 'POST' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' :
      data.httpMethod === 'GET' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
      data.httpMethod === 'PUT' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
      'bg-slate-500/20 text-slate-300 border-slate-500/40';

    return (
      <div
        className={`relative min-w-[240px] max-w-[270px] rounded-2xl bg-obsidian-900/90 border transition-all duration-200 shadow-obsidian-card backdrop-blur-md ${
          selected
            ? 'border-cyan-400 ring-2 ring-cyan-400/50 shadow-[0_0_30px_rgba(0,242,254,0.35)]'
            : data.isHighlighted
            ? 'border-cyan-400/80 ring-1 ring-cyan-400/40'
            : 'border-white/[0.12] hover:border-emerald-500/50'
        } ${isDimmed ? 'opacity-35 saturate-50' : 'opacity-100'}`}
      >
        {/* Target handle (inbound from website) */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-obsidian-950 !rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)]"
        />

        <div className="p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm">
                <Server className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300 font-semibold">
                  FIRST-PARTY API
                </span>
                {Boolean(data.failedRequestsCount) && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[9px] font-mono font-bold border border-rose-500/30">
                    {data.failedRequestsCount} FAILED
                  </span>
                )}
              </div>
            </div>

            {data.httpMethod && (
              <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${methodColor}`}>
                {data.httpMethod}
              </span>
            )}
          </div>

          <div>
            <div className="font-bold text-xs text-white truncate font-sans">
              {data.label}
            </div>
            <div className="text-[11px] text-slate-300 font-mono truncate bg-obsidian-950/80 px-2 py-0.5 rounded border border-white/[0.06] mt-1">
              {data.endpointPath || data.domain}
            </div>
          </div>

          {/* Observed Data Category */}
          {data.observedDataCategory && (
            <div className="text-[10px] text-slate-400 font-medium truncate">
              Payload: <span className="text-slate-200">{data.observedDataCategory}</span>
            </div>
          )}

          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
            {data.piiItems && data.piiItems.length > 0 ? (
              <span className="text-amber-400 font-medium flex items-center gap-1 text-[10px]">
                <AlertTriangle className="w-3 h-3" />
                {data.piiItems.length} PII fields
              </span>
            ) : (
              <span className="text-emerald-400 text-[10px] font-medium">Standard Service</span>
            )}
            <span className="font-mono text-slate-400 text-[10px]">{data.observedRequestsCount} reqs</span>
          </div>
        </div>

        {/* Source handle (for outbound to storage/downstream) */}
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-cyan-400 !border-2 !border-obsidian-950 !rounded-full shadow-[0_0_8px_rgba(0,242,254,0.8)]"
        />
      </div>
    );
  }

  // 3. Variant: Third-Party Domain Node (Category C - Third Parties & Beacons)
  const isTracker = data.categoryLabel.includes('Ad') || data.categoryLabel.includes('Telemetry') || data.categoryLabel.includes('Tracker');
  const isStorage = data.categoryLabel.includes('Storage');

  return (
    <div
      className={`relative min-w-[240px] max-w-[270px] rounded-2xl bg-obsidian-900/90 border transition-all duration-200 shadow-obsidian-card backdrop-blur-md ${
        selected
          ? 'border-cyan-400 ring-2 ring-cyan-400/50 shadow-[0_0_30px_rgba(0,242,254,0.35)]'
          : data.isHighlighted
          ? 'border-cyan-400/80 ring-1 ring-cyan-400/40'
          : data.riskLevel === 'critical'
          ? 'border-rose-500/50 hover:border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.2)]'
          : data.riskLevel === 'high'
          ? 'border-amber-500/50 hover:border-amber-400'
          : 'border-white/[0.12] hover:border-slate-500'
      } ${isDimmed ? 'opacity-35 saturate-50' : 'opacity-100'}`}
    >
      {/* Target input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className={`!w-3 !h-3 !border-2 !border-obsidian-950 !rounded-full shadow-sm ${
          data.riskLevel === 'critical' ? '!bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]' : data.riskLevel === 'high' ? '!bg-amber-500' : '!bg-cyan-400 shadow-[0_0_8px_rgba(0,242,254,0.8)]'
        }`}
      />

      <div className="p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div
              className={`p-1.5 rounded-lg border ${
                isTracker
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                  : isStorage
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
              }`}
            >
              {isTracker ? <Radio className="w-3.5 h-3.5" /> : isStorage ? <Database className="w-3.5 h-3.5" /> : <Cloud className="w-3.5 h-3.5" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300 font-bold block">
                  3RD-PARTY DOMAIN
                </span>
                {data.isSynthetic && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold border border-amber-500/30">
                    SYNTHETIC
                  </span>
                )}
                {Boolean(data.failedRequestsCount) && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[9px] font-mono font-bold border border-rose-500/30">
                    BLOCKED
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 truncate max-w-[130px] block font-sans">
                {data.inferredCategory || data.categoryLabel}
              </span>
            </div>
          </div>

          <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${sev.badge}`}>
            {sev.label}
          </span>
        </div>

        <div>
          <div className="font-bold text-xs text-white truncate font-sans">
            {data.label}
          </div>
          <div className="text-[11px] text-cyan-300 font-mono truncate">
            {data.domain}
          </div>
        </div>

        {/* PII payload tags */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
          {data.piiItems && data.piiItems.length > 0 ? (
            <span className="text-rose-400 font-semibold text-[10px] flex items-center gap-1 font-mono">
              <ShieldAlert className="w-3 h-3 text-rose-400" />
              {data.piiItems.length} PII items
            </span>
          ) : (
            <span className="text-slate-400 text-[10px]">Zero personal data</span>
          )}
          <span className="font-mono text-slate-400 text-[10px]">{data.observedRequestsCount} reqs</span>
        </div>
      </div>
    </div>
  );
});

CustomPrivacyNode.displayName = 'CustomPrivacyNode';
