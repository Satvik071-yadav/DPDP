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
        className={`relative min-w-[240px] max-w-[270px] rounded-2xl bg-[#FFFFFF] border transition-all duration-200 shadow-md ${
          selected
            ? 'border-[#52796F] ring-2 ring-[#14B8A6]/40 shadow-lg'
            : data.isHighlighted
            ? 'border-[#52796F]/80 ring-1 ring-[#14B8A6]/30'
            : 'border-[#E4E4E7] hover:border-[#52796F]/50'
        } ${isDimmed ? 'opacity-35 saturate-50' : 'opacity-100'}`}
      >
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] flex items-center justify-center text-[#52796F]">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#52796F] font-bold block">
                    TARGET WEBSITE
                  </span>
                  {data.isSynthetic && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-[#B45309] text-[9px] font-mono font-bold border border-amber-200">
                      SYNTHETIC
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[#71717A] font-medium">1st-Party Origin</span>
              </div>
            </div>
            <span className={`w-2.5 h-2.5 rounded-full ${sev.dot}`} />
          </div>

          <div>
            <div className="font-bold text-sm text-[#18181B] tracking-tight truncate font-sans">
              {data.label}
            </div>
            <div className="text-[11px] text-[#52796F] font-mono truncate">
              {data.domain}
            </div>
          </div>

          <div className="pt-2 border-t border-[#E4E4E7] flex items-center justify-between text-[11px]">
            <span className="text-[#71717A] font-medium">{data.jurisdiction}</span>
            <span className="font-mono text-xs text-[#18181B] font-bold bg-[#F1F5F9] px-2 py-0.5 rounded border border-[#E4E4E7]">
              {data.observedRequestsCount} reqs
            </span>
          </div>
        </div>

        {/* Source handle (outbound connections) */}
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-[#14B8A6] !border-2 !border-[#0B0F19] !rounded-full shadow-sm"
        />
      </div>
    );
  }

  // 2. Variant: API Endpoint Node (Category B - Internal APIs)
  if (data.nodeType === 'api_endpoint') {
    const methodColor = 
      data.httpMethod === 'POST' ? 'bg-blue-50 text-[#2563EB] border-blue-200' :
      data.httpMethod === 'GET' ? 'bg-green-50 text-[#15803D] border-green-200' :
      data.httpMethod === 'PUT' ? 'bg-amber-50 text-[#B45309] border-amber-200' :
      'bg-[#F1F5F9] text-[#71717A] border-[#E4E4E7]';

    return (
      <div
        className={`relative min-w-[240px] max-w-[270px] rounded-2xl bg-[#FFFFFF] border transition-all duration-200 shadow-md ${
          selected
            ? 'border-[#52796F] ring-2 ring-[#14B8A6]/40 shadow-lg'
            : data.isHighlighted
            ? 'border-[#52796F]/80 ring-1 ring-[#14B8A6]/30'
            : 'border-[#E4E4E7] hover:border-[#22C55E]/50'
        } ${isDimmed ? 'opacity-35 saturate-50' : 'opacity-100'}`}
      >
        {/* Target handle (inbound from website) */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-[#15803D] !border-2 !border-[#0B0F19] !rounded-full shadow-sm"
        />

        <div className="p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <div className="p-1.5 rounded-lg bg-green-50 border border-green-200 text-[#15803D]">
                <Server className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#15803D] font-semibold">
                  FIRST-PARTY API
                </span>
                {Boolean(data.failedRequestsCount) && (
                  <span className="px-1.5 py-0.5 rounded bg-red-50 text-[#B91C1C] text-[9px] font-mono font-bold border border-red-200">
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
            <div className="font-bold text-xs text-[#18181B] truncate font-sans">
              {data.label}
            </div>
            <div className="text-[11px] text-[#71717A] font-mono truncate bg-[#F1F5F9] px-2 py-0.5 rounded border border-[#E4E4E7] mt-1">
              {data.endpointPath || data.domain}
            </div>
          </div>

          {/* Observed Data Category */}
          {data.observedDataCategory && (
            <div className="text-[10px] text-[#71717A] font-medium truncate">
              Payload: <span className="text-[#18181B]">{data.observedDataCategory}</span>
            </div>
          )}

          <div className="pt-2 border-t border-[#E4E4E7] flex items-center justify-between text-[11px]">
            {data.piiItems && data.piiItems.length > 0 ? (
              <span className="text-[#B45309] font-medium flex items-center gap-1 text-[10px]">
                <AlertTriangle className="w-3 h-3" />
                {data.piiItems.length} PII fields
              </span>
            ) : (
              <span className="text-[#15803D] text-[10px] font-medium">Standard Service</span>
            )}
            <span className="font-mono text-[#71717A] text-[10px]">{data.observedRequestsCount} reqs</span>
          </div>
        </div>

        {/* Source handle (for outbound to storage/downstream) */}
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-[#14B8A6] !border-2 !border-[#0B0F19] !rounded-full shadow-sm"
        />
      </div>
    );
  }

  // 3. Variant: Third-Party Domain Node (Category C - Third Parties & Beacons)
  const isTracker = data.categoryLabel.includes('Ad') || data.categoryLabel.includes('Telemetry') || data.categoryLabel.includes('Tracker');
  const isStorage = data.categoryLabel.includes('Storage');

  return (
    <div
      className={`relative min-w-[240px] max-w-[270px] rounded-2xl bg-[#FFFFFF] border transition-all duration-200 shadow-md ${
        selected
          ? 'border-[#52796F] ring-2 ring-[#14B8A6]/40 shadow-lg'
          : data.isHighlighted
          ? 'border-[#52796F]/80 ring-1 ring-[#14B8A6]/30'
          : data.riskLevel === 'critical'
          ? 'border-[#EF4444]/50 hover:border-[#EF4444]'
          : data.riskLevel === 'high'
          ? 'border-[#F59E0B]/50 hover:border-[#F59E0B]'
          : 'border-[#E4E4E7] hover:border-[#52796F]/50'
      } ${isDimmed ? 'opacity-35 saturate-50' : 'opacity-100'}`}
    >
      {/* Target input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className={`!w-3 !h-3 !border-2 !border-[#0B0F19] !rounded-full shadow-sm ${
          data.riskLevel === 'critical' ? '!bg-[#B91C1C]' : data.riskLevel === 'high' ? '!bg-[#B45309]' : '!bg-[#14B8A6]'
        }`}
      />

      <div className="p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div
              className={`p-1.5 rounded-lg border ${
                isTracker
                  ? 'bg-red-50 border-red-200 text-[#B91C1C]'
                  : isStorage
                  ? 'bg-amber-50 border-amber-200 text-[#B45309]'
                  : 'bg-[#14B8A6]/15 border-[#52796F]/20 text-[#52796F]'
              }`}
            >
              {isTracker ? <Radio className="w-3.5 h-3.5" /> : isStorage ? <Database className="w-3.5 h-3.5" /> : <Cloud className="w-3.5 h-3.5" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#71717A] font-bold block">
                  3RD-PARTY DOMAIN
                </span>
                {data.isSynthetic && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-[#B45309] text-[9px] font-mono font-bold border border-amber-200">
                    SYNTHETIC
                  </span>
                )}
                {Boolean(data.failedRequestsCount) && (
                  <span className="px-1.5 py-0.5 rounded bg-red-50 text-[#B91C1C] text-[9px] font-mono font-bold border border-red-200">
                    BLOCKED
                  </span>
                )}
              </div>
              <span className="text-[10px] text-[#71717A] truncate max-w-[130px] block font-sans">
                {data.inferredCategory || data.categoryLabel}
              </span>
            </div>
          </div>

          <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${sev.badge}`}>
            {sev.label}
          </span>
        </div>

        <div>
          <div className="font-bold text-xs text-[#18181B] truncate font-sans">
            {data.label}
          </div>
          <div className="text-[11px] text-[#52796F] font-mono truncate">
            {data.domain}
          </div>
        </div>

        {/* PII payload tags */}
        <div className="pt-2 border-t border-[#E4E4E7] flex items-center justify-between text-[11px]">
          {data.piiItems && data.piiItems.length > 0 ? (
            <span className="text-[#B91C1C] font-semibold text-[10px] flex items-center gap-1 font-mono">
              <ShieldAlert className="w-3 h-3 text-[#B91C1C]" />
              {data.piiItems.length} PII items
            </span>
          ) : (
            <span className="text-[#71717A] text-[10px]">Zero personal data</span>
          )}
          <span className="font-mono text-[#71717A] text-[10px]">{data.observedRequestsCount} reqs</span>
        </div>
      </div>
    </div>
  );
});

CustomPrivacyNode.displayName = 'CustomPrivacyNode';
