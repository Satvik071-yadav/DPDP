import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { 
  ReactFlow, 
  Controls, 
  Background, 
  MiniMap, 
  useNodesState, 
  useEdgesState, 
  MarkerType, 
  Node, 
  Edge,
  ReactFlowInstance
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Network, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Filter, 
  Info, 
  Lock, 
  Eye, 
  Sparkles,
  ArrowRight,
  Search,
  Maximize2,
  RotateCcw,
  RefreshCw,
  Globe,
  Server,
  Radio,
  Database,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  X,
  FileCode2,
  Terminal,
  Activity,
  SlidersHorizontal,
  Layers,
  ArrowUpRight,
  HelpCircle,
  FileText,
  Copy,
  Check
} from 'lucide-react';
import { CustomPrivacyNode } from '@/components/privacy-flow/CustomNode';
import { privacyFlowService } from '@/services/privacyFlowService';
import { 
  PrivacyFlowNodeData, 
  PrivacyFlowEdgeData, 
  PrivacyFlowGraph, 
  ConsentSessionMode, 
  ScanResult 
} from '@/types';
import { formatSeverity } from '@/lib/utils';

const nodeTypes = {
  customPrivacy: CustomPrivacyNode,
};

export const PrivacyFlow: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Scan selection state
  const [availableScans, setAvailableScans] = useState<ScanResult[]>([]);
  const [selectedScanId, setSelectedScanId] = useState<string>(
    searchParams.get('scanId') || ''
  );

  // Loading & error state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState<boolean>(false);
  const [isSynthetic, setIsSynthetic] = useState<boolean>(false);

  // Consent comparison state: 'consent_rejected' vs 'consent_accepted'
  const [consentMode, setConsentMode] = useState<ConsentSessionMode>(
    (searchParams.get('consent') as ConsentSessionMode) || 'consent_rejected'
  );

  // Connection filters
  const [connectionFilter, setConnectionFilter] = useState<'all' | 'first_party' | 'third_party'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightPiiOnly, setHighlightPiiOnly] = useState(false);

  // Raw graph data
  const [currentGraph, setCurrentGraph] = useState<PrivacyFlowGraph | null>(null);
  const [stats, setStats] = useState({
    totalDomains: 0,
    firstPartyCount: 0,
    thirdPartyCount: 0,
    totalConnections: 0,
    flaggedViolations: 0,
    piiBearingEdges: 0,
    failedConnections: 0,
  });

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<PrivacyFlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<any, any> | null>(null);

  // Inspection drawer state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Load available scans
  useEffect(() => {
    async function loadScans() {
      try {
        const scans = await privacyFlowService.getAvailableScans();
        setAvailableScans(scans);
        if (scans.length > 0 && !searchParams.get('scanId')) {
          setSelectedScanId(scans[0].id);
        } else if (!searchParams.get('scanId')) {
          setSelectedScanId('SCAN-2026-1014-01');
        }
      } catch (err: any) {
        console.warn('Failed to load available scans:', err);
      }
    }
    loadScans();
  }, []);

  // Load graph topology based on scan & consent state
  const loadGraphData = useCallback(async () => {
    if (!selectedScanId) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { 
        graph, 
        activeNodes, 
        activeEdges, 
        stats: graphStats, 
        isEmpty: graphEmpty, 
        isSynthetic: synth 
      } = await privacyFlowService.getGraphForScan(selectedScanId, consentMode);

      setCurrentGraph(graph);
      setStats(graphStats);
      setIsEmpty(graphEmpty || graph.nodes.length === 0);
      setIsSynthetic(synth);

      if (graphEmpty || graph.nodes.length === 0) {
        setNodes([]);
        setEdges([]);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        return;
      }

      // Check query param for findingId deep linking
      const deepLinkFindingId = searchParams.get('findingId');

      // Compute deterministic layout
      const layoutCoords = privacyFlowService.computeLayout(graph.nodes);

      // Transform nodes into React Flow nodes
      const rfNodes: Node<PrivacyFlowNodeData>[] = graph.nodes.map((n) => {
        const coords = layoutCoords[n.id] || { x: 300, y: 200 };
        const isConnectedInThisConsent = activeEdges.some(
          (e) => e.source === n.id || e.target === n.id || n.nodeType === 'website'
        );

        // Filter checks
        let isFilteredOut = false;
        if (connectionFilter === 'first_party' && n.classification !== 'first_party') {
          isFilteredOut = true;
        } else if (connectionFilter === 'third_party' && n.classification !== 'third_party') {
          isFilteredOut = true;
        }
        if (highlightPiiOnly && n.piiItems.length === 0 && n.nodeType !== 'website') {
          isFilteredOut = true;
        }

        // Search match
        const q = searchQuery.trim().toLowerCase();
        const matchesSearch = 
          q === '' ||
          n.label.toLowerCase().includes(q) ||
          n.domain.toLowerCase().includes(q) ||
          Boolean(n.endpointPath && n.endpointPath.toLowerCase().includes(q));

        const isDimmed = isFilteredOut || !matchesSearch || !isConnectedInThisConsent;
        const isHighlighted = Boolean(matchesSearch && q !== '');

        return {
          id: n.id,
          type: 'customPrivacy',
          position: coords,
          data: {
            ...n,
            isDimmed,
            isHighlighted,
            isSuppressedInCurrentConsent: !isConnectedInThisConsent,
          },
        };
      });

      // Transform edges into React Flow edges with distinct Obsidian styling
      const rfEdges: Edge[] = activeEdges.map((e) => {
        let strokeColor = '#00F2FE'; // electric cyan default
        let strokeWidth = 2;
        let isAnimated = true;

        if (e.isFailed) {
          strokeColor = '#64748B'; // slate for failed / blocked requests
          strokeWidth = 1.5;
          isAnimated = false;
        } else if (e.isStatutoryViolation) {
          if (e.statutoryNote?.includes('§8(5)') || e.label.includes('Aadhaar')) {
            strokeColor = '#F43F5E'; // crimson rose for PII breach
            strokeWidth = 2.5;
          } else {
            strokeColor = '#F59E0B'; // amber for pre-consent / cross-border
          }
        } else if (e.source === 'node-origin' && (e.target.includes('node-fp') || e.target.includes('api'))) {
          strokeColor = '#10B981'; // emerald for authorized internal API
        }

        if (consentMode === 'consent_rejected' && e.presence.diffStatus === 'persists_despite_rejection') {
          strokeColor = '#F43F5E';
          strokeWidth = 3;
        }

        const targetNode = graph.nodes.find((n) => n.id === e.target);
        const isFilteredOut =
          (connectionFilter === 'first_party' && targetNode?.classification !== 'first_party') ||
          (connectionFilter === 'third_party' && targetNode?.classification !== 'third_party') ||
          (highlightPiiOnly && (targetNode?.piiItems.length === 0));

        const isSelected = selectedEdgeId === e.id;

        return {
          id: e.id,
          source: e.source,
          target: e.target,
          animated: isAnimated,
          label: e.label,
          data: e,
          style: {
            stroke: strokeColor,
            strokeWidth: isSelected ? strokeWidth + 1.5 : strokeWidth,
            opacity: isFilteredOut ? 0.2 : 1,
          },
          labelStyle: {
            fill: strokeColor,
            fontSize: 10,
            fontFamily: 'monospace',
            fontWeight: 700,
          },
          labelBgStyle: {
            fill: '#060913',
            fillOpacity: 0.95,
            stroke: strokeColor,
            strokeWidth: 1,
            rx: 6,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: strokeColor,
            width: 14,
            height: 14,
          },
        };
      });

      setNodes(rfNodes);
      setEdges(rfEdges);

      // Deep linking or default selection
      if (deepLinkFindingId) {
        const matchingNode = graph.nodes.find((n) => n.associatedFindingIds?.includes(deepLinkFindingId));
        if (matchingNode) {
          setSelectedNodeId(matchingNode.id);
          setSelectedEdgeId(null);
        } else {
          const matchingEdge = activeEdges.find((e) => e.associatedFindingIds?.includes(deepLinkFindingId));
          if (matchingEdge) {
            setSelectedEdgeId(matchingEdge.id);
            setSelectedNodeId(null);
          }
        }
      } else if (!selectedNodeId && !selectedEdgeId && graph.nodes.length > 0) {
        // Select origin website by default
        const origin = graph.nodes.find((n) => n.id === 'node-origin' || n.nodeType === 'website') || graph.nodes[0];
        setSelectedNodeId(origin.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load scan observation topology.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedScanId, consentMode, connectionFilter, searchQuery, highlightPiiOnly, selectedEdgeId, searchParams]);

  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  // Selected Node Details
  const selectedNodeData = useMemo(() => {
    if (!selectedNodeId || !currentGraph) return null;
    return currentGraph.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, currentGraph]);

  // Selected Edge Details
  const selectedEdgeData = useMemo(() => {
    if (!selectedEdgeId || !currentGraph) return null;
    return currentGraph.edges.find((e) => e.id === selectedEdgeId) || null;
  }, [selectedEdgeId, currentGraph]);

  // Related connections for the selected node
  const relatedEdgesForNode = useMemo(() => {
    if (!selectedNodeId || !currentGraph) return { inbound: [], outbound: [] };
    const inbound = currentGraph.edges.filter((e) => e.target === selectedNodeId);
    const outbound = currentGraph.edges.filter((e) => e.source === selectedNodeId);
    return { inbound, outbound };
  }, [selectedNodeId, currentGraph]);

  // Handle Node Click
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);

  // Handle Edge Click
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  // Reset Selection
  const handleResetSelection = () => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSearchQuery('');
    setConnectionFilter('all');
    setHighlightPiiOnly(false);
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
    }
  };

  // Fit view
  const handleFitView = () => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  return (
    <div className="space-y-4 h-[calc(100vh-8.2rem)] flex flex-col pb-2">
      {/* 1. Header & Investigation Toolbar */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-obsidian-900/90 via-obsidian-850/80 to-obsidian-900/90 border border-white/[0.08] p-4 shadow-obsidian-card backdrop-blur-md flex-shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 shadow-cyan-glow">
                <Network className="w-3 h-3 text-cyan-400" />
                PRIVACY TOPOLOGY MAP
              </span>
              {isSynthetic ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                  <Info className="w-3 h-3 text-amber-400" />
                  CONTROLLED TESTBED / SYNTHETIC
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  PERSISTED BROWSER EVIDENCE
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2 font-sans">
              <span>Privacy Flow</span>
            </h1>
            <p className="text-xs text-slate-400">
              Real data-driven visualization of client network connections, APIs, and third parties recorded by Playwright browser instrumentation.
            </p>
          </div>

          {/* Scan Selector & Consent Switch Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Scan Selector */}
            <div className="flex items-center gap-1.5 bg-obsidian-950/80 border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs shadow-inner">
              <Globe className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
              <select
                value={selectedScanId}
                onChange={(e) => {
                  setSelectedScanId(e.target.value);
                  setSearchParams({ scanId: e.target.value });
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                }}
                className="bg-transparent text-slate-200 text-xs font-medium focus:outline-none cursor-pointer max-w-[220px] truncate"
              >
                {availableScans.length > 0 ? (
                  availableScans.map((s) => (
                    <option key={s.id} value={s.id} className="bg-obsidian-950 text-slate-200">
                      {s.targetUrl.replace(/^https?:\/\//, '')} ({s.id.slice(0, 14)})
                    </option>
                  ))
                ) : (
                  <option value="SCAN-2026-1014-01" className="bg-obsidian-950 text-slate-200">
                    paysecure-india.in (SCAN-2026-1014)
                  </option>
                )}
              </select>
            </div>

            {/* Consent-State Comparison Selector */}
            <div className="flex items-center p-1 rounded-xl bg-obsidian-950/80 border border-white/[0.08] text-xs">
              <span className="text-[11px] font-semibold text-slate-400 px-2 select-none font-mono">
                Consent Mode:
              </span>
              <button
                onClick={() => {
                  setConsentMode('consent_rejected');
                  setSearchParams((prev) => {
                    prev.set('consent', 'consent_rejected');
                    return prev;
                  });
                }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  consentMode === 'consent_rejected'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Session where user explicitly clicks Reject on optional tracking"
              >
                Optional Consent Rejected
              </button>
              <button
                onClick={() => {
                  setConsentMode('consent_accepted');
                  setSearchParams((prev) => {
                    prev.set('consent', 'consent_accepted');
                    return prev;
                  });
                }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  consentMode === 'consent_accepted'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Session where user grants consent for optional advertising & analytics"
              >
                Optional Consent Accepted
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Compact Metric Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs flex-shrink-0">
        <div className="p-3.5 rounded-xl bg-obsidian-900/80 border border-white/[0.08] shadow-obsidian-card backdrop-blur-md flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono block">
              Observed Destinations
            </span>
            <div className="text-xl font-black font-mono text-white">
              {stats.totalDomains}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 text-right font-mono">
            <div><span className="text-emerald-400 font-bold">{stats.firstPartyCount}</span> 1st Party</div>
            <div><span className="text-cyan-400 font-bold">{stats.thirdPartyCount}</span> 3rd Party</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-obsidian-900/80 border border-white/[0.08] shadow-obsidian-card backdrop-blur-md flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono block">
              Active Connections
            </span>
            <div className="text-xl font-black font-mono text-cyan-300">
              {stats.totalConnections}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 text-right font-mono">
            {stats.failedConnections > 0 ? (
              <span className="text-amber-400 font-medium">{stats.failedConnections} blocked/failed</span>
            ) : (
              <span className="text-emerald-400 font-medium">All active</span>
            )}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-obsidian-900/80 border border-white/[0.08] shadow-obsidian-card backdrop-blur-md flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono block">
              Flagged Risk Indicators
            </span>
            <div className="text-xl font-black font-mono text-rose-400">
              {stats.flaggedViolations}
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-500/15 text-rose-300 border border-rose-500/30 font-bold">
            RISK INDICATOR
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-obsidian-900/80 border border-white/[0.08] shadow-obsidian-card backdrop-blur-md flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold font-mono block">
              PII Bearing Nodes
            </span>
            <div className="text-xl font-black font-mono text-amber-400">
              {stats.piiBearingEdges}
            </div>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            Aadhaar / PAN / Auth
          </span>
        </div>
      </div>

      {/* 3. Main Graph Canvas & Investigation Panel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 relative">
        {/* React Flow Container */}
        <div className="lg:col-span-8 rounded-2xl bg-obsidian-950 border border-white/[0.08] overflow-hidden relative min-h-[550px] lg:min-h-[620px] h-full flex flex-col shadow-inner">
          {/* Top Canvas Filter Toolbar */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap p-1.5 rounded-xl bg-obsidian-900/90 backdrop-blur-md border border-white/[0.08] text-xs shadow-xl">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search endpoints or domains..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 pr-2.5 py-1 rounded-lg bg-obsidian-950/80 border border-white/[0.08] text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400 w-44 font-mono"
              />
            </div>

            <div className="h-4 w-px bg-white/[0.08]" />

            {/* Connection filter pills */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setConnectionFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  connectionFilter === 'all'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-cyan-glow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setConnectionFilter('first_party')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  connectionFilter === 'first_party'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(52,211,153,0.3)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                1st-Party
              </button>
              <button
                onClick={() => setConnectionFilter('third_party')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  connectionFilter === 'third_party'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-cyan-glow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                3rd-Party
              </button>
            </div>

            <div className="h-4 w-px bg-white/[0.08]" />

            {/* PII Toggle */}
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer px-1">
              <input
                type="checkbox"
                checked={highlightPiiOnly}
                onChange={(e) => setHighlightPiiOnly(e.target.checked)}
                className="rounded bg-obsidian-950 border-white/[0.15] text-rose-500 focus:ring-0"
              />
              <span>PII Only</span>
            </label>
          </div>

          {/* Top-Right Canvas Action Controls */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 p-1 rounded-xl bg-obsidian-900/90 backdrop-blur-md border border-white/[0.08] text-xs shadow-xl">
            <button
              onClick={handleFitView}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Fit graph to view"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetSelection}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Reset view and selection"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* React Flow Viewport / States */}
          <div className="flex-1 w-full h-full min-h-[500px] relative">
            {isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                <span className="text-xs font-mono font-medium">Loading observed privacy topology...</span>
              </div>
            ) : errorMessage ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <AlertTriangle className="w-10 h-10 text-rose-400" />
                <h3 className="text-sm font-bold text-white font-sans">Failed to Load Topology</h3>
                <p className="text-xs text-slate-400 max-w-sm">{errorMessage}</p>
                <button
                  onClick={loadGraphData}
                  className="px-3.5 py-1.5 rounded-xl bg-obsidian-900 hover:bg-obsidian-850 border border-white/[0.08] text-xs text-white font-medium flex items-center gap-1.5 shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400" /> Retry
                </button>
              </div>
            ) : isEmpty || nodes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-obsidian-900 border border-white/[0.08] flex items-center justify-center text-slate-500">
                  <Network className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-sans">No Network Observations Recorded</h3>
                  <p className="text-xs text-slate-400 max-w-md mt-1 leading-relaxed">
                    Zero network requests were recorded during this scan session. This occurs if browser instrumentation was not triggered or if the target website opened without making outbound network requests.
                  </p>
                </div>
                <div className="pt-2 flex items-center gap-3">
                  <Link
                    to="/scan"
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-cyan-glow transition-all"
                  >
                    <span>Run Controlled Testbed Scan</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                onEdgeClick={onEdgeClick}
                onInit={(inst) => setReactFlowInstance(inst)}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.25 }}
                minZoom={0.4}
                maxZoom={1.6}
                className="bg-[#050812]"
              >
                <Background color="#101A30" gap={24} size={1} />
                <Controls className="bg-obsidian-900 border border-white/[0.08] text-slate-300 rounded-xl overflow-hidden shadow-xl" />
                <MiniMap
                  nodeColor={(node: any) => {
                    if (node.data?.riskLevel === 'critical') return '#F43F5E';
                    if (node.data?.riskLevel === 'high') return '#F59E0B';
                    if (node.data?.classification === 'first_party') return '#10B981';
                    return '#00F2FE';
                  }}
                  maskColor="rgba(5, 8, 18, 0.85)"
                  className="bg-obsidian-900 border border-white/[0.08] rounded-xl overflow-hidden"
                />
              </ReactFlow>
            )}
          </div>

          {/* Canvas Bottom Legend */}
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-4 px-3.5 py-2 rounded-xl bg-obsidian-900/90 backdrop-blur-md border border-white/[0.08] text-[11px] text-slate-400 shadow-xl flex-wrap font-sans">
            <div className="font-semibold text-slate-300">Legend:</div>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" /> Authorized 1st Party
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,242,254,0.6)]" /> Standard 3rd Party
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]" /> Pre-Consent / Cross-Border
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]" /> Plaintext PII / Rogue Flow
            </span>
            {consentMode === 'consent_rejected' && (
              <span className="text-[10px] font-mono text-rose-300 bg-rose-500/15 px-2 py-0.5 rounded border border-rose-500/30">
                🚨 Rogue Flow Highlighted
              </span>
            )}
          </div>
        </div>

        {/* 4. Selection and Evidence Panel */}
        <div className="lg:col-span-4 rounded-2xl bg-obsidian-900/90 border border-white/[0.08] p-5 flex flex-col justify-between overflow-y-auto shadow-obsidian-card backdrop-blur-md h-full min-h-[450px]">
          {/* Case A: Node Selected */}
          {selectedNodeData ? (
            <div className="space-y-4 text-xs">
              {/* Header */}
              <div className="pb-3 border-b border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                    {selectedNodeData.categoryLabel}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                      formatSeverity(selectedNodeData.riskLevel).badge
                    }`}
                  >
                    {formatSeverity(selectedNodeData.riskLevel).label}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white mt-1 leading-snug font-sans">
                  {selectedNodeData.label}
                </h3>
                <div className="text-[11px] font-mono text-cyan-300 mt-0.5 break-all">
                  {selectedNodeData.endpointPath || selectedNodeData.domain}
                </div>
              </div>

              {/* Classification & Operational Metrics */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-obsidian-950/70 border border-white/[0.06] space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold font-mono block">
                    Classification
                  </span>
                  <span className="font-bold text-slate-200 capitalize">
                    {selectedNodeData.classification.replace('_', ' ')}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-obsidian-950/70 border border-white/[0.06] space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold font-mono block">
                    Observed Traffic
                  </span>
                  <span className="font-mono font-bold text-white">
                    {selectedNodeData.observedRequestsCount} requests
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                  Observed Technical Role
                </span>
                <p className="text-slate-300 text-xs leading-relaxed">
                  {selectedNodeData.description}
                </p>
              </div>

              {/* Traceable Evidence Observation IDs */}
              {selectedNodeData.evidenceObservationIds && selectedNodeData.evidenceObservationIds.length > 0 && (
                <div className="p-3 rounded-xl bg-obsidian-950/70 border border-white/[0.06] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block font-mono">
                      Evidence Observation IDs ({selectedNodeData.evidenceObservationIds.length})
                    </span>
                    <span className="text-[10px] text-cyan-400 font-mono">Telemetry DB</span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-0.5">
                    {selectedNodeData.evidenceObservationIds.map((obsId) => (
                      <span key={obsId} className="px-1.5 py-0.5 rounded bg-obsidian-900 border border-white/[0.08] text-[10px] font-mono text-slate-300">
                        {obsId}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Observed PII items */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                  Observed Personal Data Items:
                </span>
                {selectedNodeData.piiItems && selectedNodeData.piiItems.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNodeData.piiItems.map((item, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-rose-500/15 text-rose-300 border border-rose-500/30 font-semibold flex items-center gap-1.5"
                      >
                        <AlertTriangle className="w-3 h-3 text-rose-400" />
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 italic">
                    Zero personal data items transmitted to this domain.
                  </div>
                )}
              </div>

              {/* Server Jurisdiction */}
              <div className="p-3 rounded-xl bg-obsidian-950/70 border border-white/[0.06] space-y-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block font-mono">
                  Server Jurisdiction
                </span>
                <div className="text-slate-200 font-medium font-mono">
                  {selectedNodeData.jurisdiction}
                </div>
              </div>

              {/* Related Connections */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                  Related Network Connections
                </span>
                <div className="space-y-1.5">
                  {relatedEdgesForNode.inbound.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        setSelectedEdgeId(e.id);
                        setSelectedNodeId(null);
                      }}
                      className="w-full p-2.5 rounded-xl bg-obsidian-950/70 hover:bg-obsidian-850 border border-white/[0.06] text-left flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="truncate">
                        <span className="text-slate-500 text-[10px] font-mono">INBOUND: </span>
                        <span className="font-mono text-cyan-300">{e.label}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    </button>
                  ))}
                  {relatedEdgesForNode.outbound.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        setSelectedEdgeId(e.id);
                        setSelectedNodeId(null);
                      }}
                      className="w-full p-2.5 rounded-xl bg-obsidian-950/70 hover:bg-obsidian-850 border border-white/[0.06] text-left flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="truncate">
                        <span className="text-slate-500 text-[10px] font-mono">OUTBOUND: </span>
                        <span className="font-mono text-cyan-300">{e.label}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Associated Findings */}
              {selectedNodeData.associatedFindingIds && selectedNodeData.associatedFindingIds.length > 0 && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 space-y-2">
                  <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Associated DPDP Findings:
                  </span>
                  <div className="space-y-1.5">
                    {selectedNodeData.associatedFindingIds.map((fId) => (
                      <div key={fId} className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-white">{fId}</span>
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/findings?findingId=${fId}`}
                            className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-medium"
                          >
                            Inspect
                          </Link>
                          <Link
                            to={`/fix-verify?findingId=${fId}`}
                            className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-bold border border-cyan-500/30 hover:bg-cyan-500/30"
                          >
                            Fix & Verify
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : selectedEdgeData ? (
            /* Case B: Edge Selected */
            <div className="space-y-4 text-xs">
              {/* Header */}
              <div className="pb-3 border-b border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                    OBSERVED CONNECTION EVIDENCE
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      selectedEdgeData.isStatutoryViolation
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : selectedEdgeData.isFailed
                        ? 'bg-slate-500/20 text-slate-300 border-slate-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    {selectedEdgeData.isStatutoryViolation 
                      ? 'POTENTIAL COMPLIANCE RISK' 
                      : selectedEdgeData.isFailed 
                      ? 'BLOCKED / FAILED' 
                      : 'PERMISSIBLE FLOW'}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-1 leading-snug font-sans">
                  {selectedEdgeData.label}
                </h3>
                <div className="text-[11px] font-mono text-cyan-300 mt-0.5 break-all">
                  {selectedEdgeData.targetUrl || selectedEdgeData.endpointPath}
                </div>
              </div>

              {/* Source & Destination */}
              <div className="p-3 rounded-xl bg-obsidian-950/70 border border-white/[0.06] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium text-[11px]">Source Node:</span>
                  <span className="font-mono text-slate-200">{selectedEdgeData.source}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium text-[11px]">Destination Node:</span>
                  <span className="font-mono text-cyan-300">{selectedEdgeData.target}</span>
                </div>
                {selectedEdgeData.httpMethod && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium text-[11px]">Method:</span>
                    <span className="font-mono text-white font-bold">{selectedEdgeData.httpMethod}</span>
                  </div>
                )}
                {selectedEdgeData.statusCode && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium text-[11px]">Status Code:</span>
                    <span className="font-mono text-emerald-400 font-bold">{selectedEdgeData.statusCode}</span>
                  </div>
                )}
                {selectedEdgeData.failureReason && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium text-[11px]">Failure Reason:</span>
                    <span className="font-mono text-rose-300 text-[10px]">{selectedEdgeData.failureReason}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium text-[11px]">Detected Timestamp:</span>
                  <span className="font-mono text-slate-400 text-[10px]">{selectedEdgeData.timestamp}</span>
                </div>
              </div>

              {/* Consent Behavior Diff Status */}
              <div className="p-3.5 rounded-xl bg-violet-950/20 border border-violet-500/30 space-y-1.5 shadow-violet-glow">
                <span className="text-[10px] font-bold text-violet-300 uppercase tracking-wider block font-mono">
                  Consent Mode Behavior
                </span>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  {selectedEdgeData.presence.diffStatus === 'accepted_only'
                    ? 'Active in "Consent Accepted" mode only. Gated behind user consent choice.'
                    : selectedEdgeData.presence.diffStatus === 'persists_despite_rejection'
                    ? '🚨 Persists and continues transmitting data even when the user clicks "Consent Rejected". This constitutes an unauthorized data collection violation under DPDP Act §6(1).'
                    : selectedEdgeData.presence.diffStatus === 'rejected_only'
                    ? 'Transmitted only when the user rejects tracking (e.g. opt-out confirmation receipt).'
                    : 'Standard operational flow present in all consent states.'}
                </p>
              </div>

              {/* Traceable Evidence Observation IDs */}
              {selectedEdgeData.evidenceObservationIds && selectedEdgeData.evidenceObservationIds.length > 0 && (
                <div className="p-3 rounded-xl bg-obsidian-950/70 border border-white/[0.06] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block font-mono">
                      Evidence Observation IDs ({selectedEdgeData.evidenceObservationIds.length})
                    </span>
                    <span className="text-[10px] text-cyan-400 font-mono">Telemetry DB</span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-0.5">
                    {selectedEdgeData.evidenceObservationIds.map((obsId) => (
                      <span key={obsId} className="px-1.5 py-0.5 rounded bg-obsidian-900 border border-white/[0.08] text-[10px] font-mono text-cyan-300">
                        {obsId}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Redacted Payload Metadata */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                    Redacted Payload Preview:
                  </span>
                  <button
                    onClick={() => handleCopyText(selectedEdgeData.redactedMetadata.payloadSummary)}
                    className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300"
                  >
                    {copiedPayload ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedPayload ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-obsidian-950 border border-white/[0.08] text-cyan-300 font-mono text-[11px] overflow-x-auto max-h-36 shadow-inner leading-relaxed">
                  {selectedEdgeData.redactedMetadata.payloadSummary}
                </pre>
              </div>

              {/* Redacted Request Headers */}
              {selectedEdgeData.redactedMetadata?.headers && Object.keys(selectedEdgeData.redactedMetadata.headers).length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                    Redacted Request Headers:
                  </span>
                  <div className="p-2.5 rounded-xl bg-obsidian-950 border border-white/[0.08] font-mono text-[10px] space-y-1 max-h-28 overflow-y-auto">
                    {Object.entries(selectedEdgeData.redactedMetadata.headers).map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between gap-2">
                        <span className="text-cyan-400 font-semibold">{k}:</span>
                        <span className={v.includes('REDACTED') ? 'text-amber-400 font-bold' : 'text-slate-300 truncate max-w-[180px]'}>
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence Source Script */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                  Evidence Origin / Initiator:
                </span>
                <div className="font-mono text-[11px] text-cyan-300 bg-obsidian-950 p-2 rounded-lg border border-white/[0.06] break-all">
                  {selectedEdgeData.evidenceSource}
                </div>
              </div>

              {/* Statutory Legal Disclaimer */}
              <div className="p-3 rounded-xl bg-obsidian-950/80 border border-white/[0.06] space-y-1 text-slate-400 text-[11px] leading-relaxed">
                <div className="flex items-center gap-1 text-slate-300 font-semibold">
                  <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Statutory Evaluation Context</span>
                </div>
                <p>
                  Never claim a website violates consent requirements merely because a third-party request was observed. Interpretation depends on context, purpose, and applicable requirements.
                </p>
              </div>

              {/* Associated Finding Link */}
              {selectedEdgeData.associatedFindingIds && selectedEdgeData.associatedFindingIds.length > 0 && (
                <div className="pt-2">
                  <Link
                    to={`/fix-verify?findingId=${selectedEdgeData.associatedFindingIds[0]}`}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-cyan-glow transition-all"
                  >
                    <span>Launch Fix & Verify for [{selectedEdgeData.associatedFindingIds[0]}]</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>
          ) : (
            /* Case C: No Selection */
            <div className="py-20 text-center text-slate-500 text-xs space-y-3">
              <Network className="w-8 h-8 text-slate-600 mx-auto" />
              <div>
                <p className="font-bold text-slate-300 font-sans">No Node or Edge Selected</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">
                  Click any website node, API endpoint, or directed edge to inspect network telemetry, redacted headers, and DPDP Act legal evaluations.
                </p>
              </div>

              {nodes.length > 0 && (
                <div className="pt-2 flex justify-center gap-2">
                  <button
                    onClick={() => {
                      const origin = nodes.find((n) => n.id === 'node-origin' || n.data?.nodeType === 'website') || nodes[0];
                      if (origin) setSelectedNodeId(origin.id);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-obsidian-950 hover:bg-obsidian-850 border border-white/[0.08] text-slate-300 text-xs font-semibold transition-colors"
                  >
                    Select Origin
                  </button>
                  {nodes.some((n) => n.data?.nodeType === 'api_endpoint') && (
                    <button
                      onClick={() => {
                        const apiNode = nodes.find((n) => n.data?.nodeType === 'api_endpoint');
                        if (apiNode) setSelectedNodeId(apiNode.id);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-obsidian-950 hover:bg-obsidian-850 border border-white/[0.08] text-slate-300 text-xs font-semibold transition-colors"
                    >
                      Select 1st-Party API
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action bottom button */}
          <div className="pt-3 border-t border-white/[0.06]">
            <Link
              to="/fix-verify"
              className="w-full py-2.5 rounded-xl bg-obsidian-950 hover:bg-obsidian-850 border border-white/[0.08] text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <span>Go to Fix & Verify Workbench</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
