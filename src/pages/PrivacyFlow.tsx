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
        let strokeColor = '#14B8A6'; // primary teal default
        let strokeWidth = 2;
        let isAnimated = true;

        if (e.isFailed) {
          strokeColor = '#64748B'; // slate for failed / blocked requests
          strokeWidth = 1.5;
          isAnimated = false;
        } else if (e.isStatutoryViolation) {
          if (e.statutoryNote?.includes('§8(5)') || e.label.includes('Aadhaar')) {
            strokeColor = '#EF4444'; // critical red for PII breach
            strokeWidth = 2.5;
          } else {
            strokeColor = '#F59E0B'; // amber for pre-consent / cross-border
          }
        } else if (e.source === 'node-origin' && (e.target.includes('node-fp') || e.target.includes('api'))) {
          strokeColor = '#22C55E'; // emerald for authorized internal API
        }

        if (consentMode === 'consent_rejected' && e.presence.diffStatus === 'persists_despite_rejection') {
          strokeColor = '#EF4444';
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
      <div className="relative overflow-hidden rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] p-4 shadow-subtle flex-shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#F1F5F9] text-[#52796F] border border-[#E4E4E7] flex items-center gap-1.5 shadow-subtle">
                <Network className="w-3 h-3 text-[#52796F]" />
                PRIVACY TOPOLOGY MAP
              </span>
              {isSynthetic ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-[#B45309] border border-amber-200 flex items-center gap-1.5">
                  <Info className="w-3 h-3 text-[#B45309]" />
                  CONTROLLED TESTBED / SYNTHETIC
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-green-50 text-[#15803D] border border-green-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-[#15803D]" />
                  PERSISTED BROWSER EVIDENCE
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#18181B] flex items-center gap-2 font-sans">
              <span>Privacy Flow</span>
            </h1>
            <p className="text-xs text-[#71717A]">
              Real data-driven visualization of client network connections, APIs, and third parties recorded by Playwright browser instrumentation.
            </p>
          </div>

          {/* Scan Selector & Consent Switch Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Scan Selector */}
            <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-[#E4E4E7] rounded-xl px-3 py-1.5 text-xs shadow-inner">
              <Globe className="w-3.5 h-3.5 text-[#52796F] flex-shrink-0" />
              <select
                value={selectedScanId}
                onChange={(e) => {
                  setSelectedScanId(e.target.value);
                  setSearchParams({ scanId: e.target.value });
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                }}
                className="bg-transparent text-[#18181B] text-xs font-medium focus:outline-none cursor-pointer max-w-[220px] truncate"
              >
                {availableScans.length > 0 ? (
                  availableScans.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#F8FAFC] text-[#18181B]">
                      {s.targetUrl.replace(/^https?:\/\//, '')} ({s.id.slice(0, 14)})
                    </option>
                  ))
                ) : (
                  <option value="SCAN-2026-1014-01" className="bg-[#F8FAFC] text-[#18181B]">
                    paysecure-india.in (SCAN-2026-1014)
                  </option>
                )}
              </select>
            </div>

            {/* Consent-State Comparison Selector */}
            <div className="flex items-center p-1 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] text-xs">
              <span className="text-[11px] font-semibold text-[#71717A] px-2 select-none font-mono">
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
                    ? 'bg-red-50 text-[#B91C1C] border border-red-200'
                    : 'text-[#71717A] hover:text-[#18181B]'
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
                    ? 'bg-green-50 text-[#15803D] border border-green-200'
                    : 'text-[#71717A] hover:text-[#18181B]'
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
        <div className="p-3.5 rounded-xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-[#71717A] uppercase tracking-wider font-semibold font-mono block">
              Observed Destinations
            </span>
            <div className="text-xl font-black font-mono text-[#18181B]">
              {stats.totalDomains}
            </div>
          </div>
          <div className="text-[11px] text-[#71717A] text-right font-mono">
            <div><span className="text-[#15803D] font-bold">{stats.firstPartyCount}</span> 1st Party</div>
            <div><span className="text-[#52796F] font-bold">{stats.thirdPartyCount}</span> 3rd Party</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-[#71717A] uppercase tracking-wider font-semibold font-mono block">
              Active Connections
            </span>
            <div className="text-xl font-black font-mono text-[#52796F]">
              {stats.totalConnections}
            </div>
          </div>
          <div className="text-[10px] text-[#71717A] text-right font-mono">
            {stats.failedConnections > 0 ? (
              <span className="text-[#B45309] font-medium">{stats.failedConnections} blocked/failed</span>
            ) : (
              <span className="text-[#15803D] font-medium">All active</span>
            )}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-[#71717A] uppercase tracking-wider font-semibold font-mono block">
              Flagged Risk Indicators
            </span>
            <div className="text-xl font-black font-mono text-[#B91C1C]">
              {stats.flaggedViolations}
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-50 text-[#B91C1C] border border-red-200 font-bold">
            RISK INDICATOR
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#FFFFFF] border border-[#E4E4E7] shadow-subtle flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-[#71717A] uppercase tracking-wider font-semibold font-mono block">
              PII Bearing Nodes
            </span>
            <div className="text-xl font-black font-mono text-[#B45309]">
              {stats.piiBearingEdges}
            </div>
          </div>
          <span className="text-[10px] text-[#71717A] font-mono">
            Aadhaar / PAN / Auth
          </span>
        </div>
      </div>

      {/* 3. Main Graph Canvas & Investigation Panel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 relative">
        {/* React Flow Container */}
        <div className="lg:col-span-8 rounded-2xl bg-[#F8FAFC] border border-[#E4E4E7] overflow-hidden relative min-h-[550px] lg:min-h-[620px] h-full flex flex-col shadow-inner">
          {/* Top Canvas Filter Toolbar */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap p-1.5 rounded-xl bg-[#FFFFFF]/90 backdrop-blur-md border border-[#E4E4E7] text-xs shadow-subtle">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#71717A]" />
              <input
                type="text"
                placeholder="Search endpoints or domains..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 pr-2.5 py-1 rounded-lg bg-[#F8FAFC] border border-[#E4E4E7] text-xs text-[#18181B] placeholder-[#94A3B8] focus:outline-none focus:border-[#52796F] w-44 font-mono"
              />
            </div>

            <div className="h-4 w-px bg-[#273449]" />

            {/* Connection filter pills */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setConnectionFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  connectionFilter === 'all'
                    ? 'bg-[#F1F5F9] text-[#52796F] border border-[#52796F]'
                    : 'text-[#71717A] hover:text-[#18181B]'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setConnectionFilter('first_party')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  connectionFilter === 'first_party'
                    ? 'bg-green-50 text-[#15803D] border border-green-200'
                    : 'text-[#71717A] hover:text-[#18181B]'
                }`}
              >
                1st-Party
              </button>
              <button
                onClick={() => setConnectionFilter('third_party')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  connectionFilter === 'third_party'
                    ? 'bg-[#F1F5F9] text-[#52796F] border border-[#52796F]'
                    : 'text-[#71717A] hover:text-[#18181B]'
                }`}
              >
                3rd-Party
              </button>
            </div>

            <div className="h-4 w-px bg-[#273449]" />

            {/* PII Toggle */}
            <label className="flex items-center gap-1.5 text-[11px] text-[#18181B] cursor-pointer px-1">
              <input
                type="checkbox"
                checked={highlightPiiOnly}
                onChange={(e) => setHighlightPiiOnly(e.target.checked)}
                className="rounded bg-[#F8FAFC] border-[#E4E4E7] text-[#B91C1C] focus:ring-0"
              />
              <span>PII Only</span>
            </label>
          </div>

          {/* Top-Right Canvas Action Controls */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 p-1 rounded-xl bg-[#FFFFFF]/90 backdrop-blur-md border border-[#E4E4E7] text-xs shadow-subtle">
            <button
              onClick={handleFitView}
              className="p-1.5 rounded-lg text-[#71717A] hover:text-[#18181B] hover:bg-[#F1F5F9] transition-colors"
              title="Fit graph to view"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetSelection}
              className="p-1.5 rounded-lg text-[#71717A] hover:text-[#18181B] hover:bg-[#F1F5F9] transition-colors"
              title="Reset view and selection"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* React Flow Viewport / States */}
          <div className="flex-1 w-full h-full min-h-[500px] relative">
            {isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-[#71717A] gap-3">
                <RefreshCw className="w-8 h-8 text-[#52796F] animate-spin" />
                <span className="text-xs font-mono font-medium">Loading observed privacy topology...</span>
              </div>
            ) : errorMessage ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <AlertTriangle className="w-10 h-10 text-[#B91C1C]" />
                <h3 className="text-sm font-bold text-[#18181B] font-sans">Failed to Load Topology</h3>
                <p className="text-xs text-[#71717A] max-w-sm">{errorMessage}</p>
                <button
                  onClick={loadGraphData}
                  className="px-3.5 py-1.5 rounded-xl bg-[#F1F5F9] hover:bg-[#273449] border border-[#E4E4E7] text-xs text-[#18181B] font-medium flex items-center gap-1.5 shadow-subtle"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#52796F]" /> Retry
                </button>
              </div>
            ) : isEmpty || nodes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] flex items-center justify-center text-[#71717A]">
                  <Network className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#18181B] font-sans">No Network Observations Recorded</h3>
                  <p className="text-xs text-[#71717A] max-w-md mt-1 leading-relaxed">
                    Zero network requests were recorded during this scan session. This occurs if browser instrumentation was not triggered or if the target website opened without making outbound network requests.
                  </p>
                </div>
                <div className="pt-2 flex items-center gap-3">
                  <Link
                    to="/scan"
                    className="px-4 py-2 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] text-xs font-bold flex items-center gap-2 shadow-subtle transition-all"
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
                className="bg-[#F8FAFC]"
              >
                <Background color="#273449" gap={24} size={1} />
                <Controls className="bg-[#FFFFFF] border border-[#E4E4E7] text-[#71717A] rounded-xl overflow-hidden shadow-subtle" />
                <MiniMap
                  nodeColor={(node: any) => {
                    if (node.data?.riskLevel === 'critical') return '#EF4444';
                    if (node.data?.riskLevel === 'high') return '#F59E0B';
                    if (node.data?.classification === 'first_party') return '#22C55E';
                    return '#14B8A6';
                  }}
                  maskColor="rgba(11, 15, 25, 0.85)"
                  className="bg-[#FFFFFF] border border-[#E4E4E7] rounded-xl overflow-hidden"
                />
              </ReactFlow>
            )}
          </div>

          {/* Canvas Bottom Legend */}
          <div className="absolute bottom-3 left-3 z-10 flex items-center gap-4 px-3.5 py-2 rounded-xl bg-[#FFFFFF]/90 backdrop-blur-md border border-[#E4E4E7] text-[11px] text-[#71717A] shadow-subtle flex-wrap font-sans">
            <div className="font-semibold text-[#18181B]">Legend:</div>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#15803D]" /> Authorized 1st Party
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#14B8A6]" /> Standard 3rd Party
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#B45309]" /> Pre-Consent / Cross-Border
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#B91C1C]" /> Plaintext PII / Rogue Flow
            </span>
            {consentMode === 'consent_rejected' && (
              <span className="text-[10px] font-mono text-[#B91C1C] bg-red-50 px-2 py-0.5 rounded border border-red-200">
                🚨 Rogue Flow Highlighted
              </span>
            )}
          </div>
        </div>

        {/* 4. Selection and Evidence Panel */}
        <div className="lg:col-span-4 rounded-2xl bg-[#FFFFFF] border border-[#E4E4E7] p-5 flex flex-col justify-between overflow-y-auto shadow-subtle h-full min-h-[450px]">
          {/* Case A: Node Selected */}
          {selectedNodeData ? (
            <div className="space-y-4 text-xs">
              {/* Header */}
              <div className="pb-3 border-b border-[#E4E4E7]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#71717A] font-bold">
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
                <h3 className="text-base sm:text-lg font-bold text-[#18181B] mt-1 leading-snug font-sans">
                  {selectedNodeData.label}
                </h3>
                <div className="text-[11px] font-mono text-[#52796F] mt-0.5 break-all">
                  {selectedNodeData.endpointPath || selectedNodeData.domain}
                </div>
              </div>

              {/* Classification & Operational Metrics */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-1">
                  <span className="text-[10px] text-[#71717A] uppercase tracking-wider font-semibold font-mono block">
                    Classification
                  </span>
                  <span className="font-bold text-[#18181B] capitalize">
                    {selectedNodeData.classification.replace('_', ' ')}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-1">
                  <span className="text-[10px] text-[#71717A] uppercase tracking-wider font-semibold font-mono block">
                    Observed Traffic
                  </span>
                  <span className="font-mono font-bold text-[#18181B]">
                    {selectedNodeData.observedRequestsCount} requests
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider block font-mono">
                  Observed Technical Role
                </span>
                <p className="text-[#71717A] text-xs leading-relaxed">
                  {selectedNodeData.description}
                </p>
              </div>

              {/* Traceable Evidence Observation IDs */}
              {selectedNodeData.evidenceObservationIds && selectedNodeData.evidenceObservationIds.length > 0 && (
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#71717A] uppercase tracking-wider font-semibold block font-mono">
                      Evidence Observation IDs ({selectedNodeData.evidenceObservationIds.length})
                    </span>
                    <span className="text-[10px] text-[#52796F] font-mono">Telemetry DB</span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-0.5">
                    {selectedNodeData.evidenceObservationIds.map((obsId) => (
                      <span key={obsId} className="px-1.5 py-0.5 rounded bg-[#F1F5F9] border border-[#E4E4E7] text-[10px] font-mono text-[#18181B]">
                        {obsId}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Observed PII items */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider block font-mono">
                  Observed Personal Data Items:
                </span>
                {selectedNodeData.piiItems && selectedNodeData.piiItems.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNodeData.piiItems.map((item, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-red-50 text-[#B91C1C] border border-red-200 font-semibold flex items-center gap-1.5"
                      >
                        <AlertTriangle className="w-3 h-3 text-[#B91C1C]" />
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-[#71717A] italic">
                    Zero personal data items transmitted to this domain.
                  </div>
                )}
              </div>

              {/* Server Jurisdiction */}
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-1">
                <span className="text-[10px] text-[#71717A] uppercase tracking-wider font-semibold block font-mono">
                  Server Jurisdiction
                </span>
                <div className="text-[#18181B] font-medium font-mono">
                  {selectedNodeData.jurisdiction}
                </div>
              </div>

              {/* Related Connections */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider block font-mono">
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
                      className="w-full p-2.5 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-left flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="truncate">
                        <span className="text-[#71717A] text-[10px] font-mono">INBOUND: </span>
                        <span className="font-mono text-[#52796F]">{e.label}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-[#71717A] flex-shrink-0" />
                    </button>
                  ))}
                  {relatedEdgesForNode.outbound.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        setSelectedEdgeId(e.id);
                        setSelectedNodeId(null);
                      }}
                      className="w-full p-2.5 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-left flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="truncate">
                        <span className="text-[#71717A] text-[10px] font-mono">OUTBOUND: </span>
                        <span className="font-mono text-[#52796F]">{e.label}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-[#71717A] flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Associated Findings */}
              {selectedNodeData.associatedFindingIds && selectedNodeData.associatedFindingIds.length > 0 && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-[#EF4444]/25 space-y-2">
                  <span className="text-[10px] font-bold text-[#B91C1C] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Associated DPDP Findings:
                  </span>
                  <div className="space-y-1.5">
                    {selectedNodeData.associatedFindingIds.map((fId) => (
                      <div key={fId} className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-[#18181B]">{fId}</span>
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/findings?findingId=${fId}`}
                            className="text-[11px] text-[#52796F] hover:text-[#405F57] underline font-medium"
                          >
                            Inspect
                          </Link>
                          <Link
                            to={`/fix-verify?findingId=${fId}`}
                            className="px-2 py-0.5 rounded bg-[#52796F]/20 text-[#52796F] text-[10px] font-bold border border-[#52796F]/20 hover:bg-[#52796F]/30"
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
              <div className="pb-3 border-b border-[#E4E4E7]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#71717A] font-bold">
                    OBSERVED CONNECTION EVIDENCE
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      selectedEdgeData.isStatutoryViolation
                        ? 'bg-red-50 text-[#B91C1C] border-red-200'
                        : selectedEdgeData.isFailed
                        ? 'bg-[#94A3B8]/20 text-[#71717A] border-[#94A3B8]/40'
                        : 'bg-green-50 text-[#15803D] border-green-200'
                    }`}
                  >
                    {selectedEdgeData.isStatutoryViolation 
                      ? 'POTENTIAL COMPLIANCE RISK' 
                      : selectedEdgeData.isFailed 
                      ? 'BLOCKED / FAILED' 
                      : 'PERMISSIBLE FLOW'}
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#18181B] mt-1 leading-snug font-sans">
                  {selectedEdgeData.label}
                </h3>
                <div className="text-[11px] font-mono text-[#52796F] mt-0.5 break-all">
                  {selectedEdgeData.targetUrl || selectedEdgeData.endpointPath}
                </div>
              </div>

              {/* Source & Destination */}
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#71717A] font-medium text-[11px]">Source Node:</span>
                  <span className="font-mono text-[#18181B]">{selectedEdgeData.source}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#71717A] font-medium text-[11px]">Destination Node:</span>
                  <span className="font-mono text-[#52796F]">{selectedEdgeData.target}</span>
                </div>
                {selectedEdgeData.httpMethod && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A] font-medium text-[11px]">Method:</span>
                    <span className="font-mono text-[#18181B] font-bold">{selectedEdgeData.httpMethod}</span>
                  </div>
                )}
                {selectedEdgeData.statusCode && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A] font-medium text-[11px]">Status Code:</span>
                    <span className="font-mono text-[#15803D] font-bold">{selectedEdgeData.statusCode}</span>
                  </div>
                )}
                {selectedEdgeData.failureReason && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#71717A] font-medium text-[11px]">Failure Reason:</span>
                    <span className="font-mono text-[#B91C1C] text-[10px]">{selectedEdgeData.failureReason}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[#71717A] font-medium text-[11px]">Detected Timestamp:</span>
                  <span className="font-mono text-[#71717A] text-[10px]">{selectedEdgeData.timestamp}</span>
                </div>
              </div>

              {/* Consent Behavior Diff Status */}
              <div className="p-3.5 rounded-xl bg-[#F1F5F9] border border-[#E4E4E7] space-y-1.5 shadow-subtle">
                <span className="text-[10px] font-bold text-[#18181B] uppercase tracking-wider block font-mono">
                  Consent Mode Behavior
                </span>
                <p className="text-xs text-[#71717A] leading-relaxed font-sans">
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
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#71717A] uppercase tracking-wider font-semibold block font-mono">
                      Evidence Observation IDs ({selectedEdgeData.evidenceObservationIds.length})
                    </span>
                    <span className="text-[10px] text-[#52796F] font-mono">Telemetry DB</span>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-0.5">
                    {selectedEdgeData.evidenceObservationIds.map((obsId) => (
                      <span key={obsId} className="px-1.5 py-0.5 rounded bg-[#F1F5F9] border border-[#E4E4E7] text-[10px] font-mono text-[#52796F]">
                        {obsId}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Redacted Payload Metadata */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider block font-mono">
                    Redacted Payload Preview:
                  </span>
                  <button
                    onClick={() => handleCopyText(selectedEdgeData.redactedMetadata.payloadSummary)}
                    className="flex items-center gap-1 text-[10px] text-[#52796F] hover:text-[#405F57]"
                  >
                    {copiedPayload ? <Check className="w-3 h-3 text-[#15803D]" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedPayload ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] text-[#52796F] font-mono text-[11px] overflow-x-auto max-h-36 shadow-inner leading-relaxed">
                  {selectedEdgeData.redactedMetadata.payloadSummary}
                </pre>
              </div>

              {/* Redacted Request Headers */}
              {selectedEdgeData.redactedMetadata?.headers && Object.keys(selectedEdgeData.redactedMetadata.headers).length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider block font-mono">
                    Redacted Request Headers:
                  </span>
                  <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] font-mono text-[10px] space-y-1 max-h-28 overflow-y-auto">
                    {Object.entries(selectedEdgeData.redactedMetadata.headers).map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between gap-2">
                        <span className="text-[#52796F] font-semibold">{k}:</span>
                        <span className={v.includes('REDACTED') ? 'text-[#B45309] font-bold' : 'text-[#18181B] truncate max-w-[180px]'}>
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence Source Script */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider block font-mono">
                  Evidence Origin / Initiator:
                </span>
                <div className="font-mono text-[11px] text-[#52796F] bg-[#F8FAFC] p-2 rounded-lg border border-[#E4E4E7] break-all">
                  {selectedEdgeData.evidenceSource}
                </div>
              </div>

              {/* Statutory Legal Disclaimer */}
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E4E4E7] space-y-1 text-[#71717A] text-[11px] leading-relaxed">
                <div className="flex items-center gap-1 text-[#18181B] font-semibold">
                  <HelpCircle className="w-3.5 h-3.5 text-[#52796F]" />
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
                    className="w-full py-2.5 rounded-xl bg-[#14B8A6] hover:bg-[#405F57] text-[#0B0F19] font-bold text-xs flex items-center justify-center gap-2 shadow-subtle transition-all"
                  >
                    <span>Launch Fix & Verify for [{selectedEdgeData.associatedFindingIds[0]}]</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>
          ) : (
            /* Case C: No Selection */
            <div className="py-20 text-center text-[#71717A] text-xs space-y-3">
              <Network className="w-8 h-8 text-[#71717A] mx-auto" />
              <div>
                <p className="font-bold text-[#18181B] font-sans">No Node or Edge Selected</p>
                <p className="text-[11px] text-[#71717A] mt-1 max-w-xs mx-auto">
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
                    className="px-3 py-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-[#18181B] text-xs font-semibold transition-colors"
                  >
                    Select Origin
                  </button>
                  {nodes.some((n) => n.data?.nodeType === 'api_endpoint') && (
                    <button
                      onClick={() => {
                        const apiNode = nodes.find((n) => n.data?.nodeType === 'api_endpoint');
                        if (apiNode) setSelectedNodeId(apiNode.id);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-[#18181B] text-xs font-semibold transition-colors"
                    >
                      Select 1st-Party API
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action bottom button */}
          <div className="pt-3 border-t border-[#E4E4E7]">
            <Link
              to="/fix-verify"
              className="w-full py-2.5 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E4E4E7] text-[#18181B] font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
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
