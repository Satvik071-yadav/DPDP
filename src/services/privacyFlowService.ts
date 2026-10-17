import { 
  PrivacyFlowGraph, 
  PrivacyFlowNodeData, 
  PrivacyFlowEdgeData, 
  ConsentSessionMode, 
  ScanResult, 
  BrowserObservation,
  ConsentComparisonSummary,
  Finding
} from '@/types';
import { DEMO_GRAPHS, PAYSECURE_FLOW_GRAPH } from '@/data/privacyFlowFixtures';
import { api } from '@/services/api';

/**
 * Computes deterministic non-overlapping 2D layout coordinates for nodes.
 * Tiered columns:
 *   Col 0 (x: 60):  Target Website / Origin
 *   Col 1 (x: 430): First-Party Endpoints / APIs
 *   Col 2 (x: 820): Third-Party Domains / Telemetry / Services
 *
 * Stably sorts nodes by label/ID so positions remain consistent across rerenders.
 */
export function computeDeterministicLayout(
  nodes: PrivacyFlowNodeData[]
): Record<string, { x: number; y: number }> {
  const coords: Record<string, { x: number; y: number }> = {};

  const originNodes = nodes.filter((n) => n.nodeType === 'website');
  const firstPartyNodes = nodes
    .filter((n) => n.nodeType === 'api_endpoint' || (n.classification === 'first_party' && n.nodeType !== 'website'))
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  const thirdPartyNodes = nodes
    .filter((n) => n.classification === 'third_party' && n.nodeType !== 'website')
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));

  const rowHeight = 145;
  const originX = 60;
  const firstPartyX = 430;
  const thirdPartyX = 820;

  // Center the origin vertically relative to the taller column
  const maxRows = Math.max(firstPartyNodes.length, thirdPartyNodes.length, 1);
  const originY = Math.max(140, Math.round(((maxRows - 1) * rowHeight) / 2) + 60);

  originNodes.forEach((n, idx) => {
    coords[n.id] = { x: originX, y: originY + idx * rowHeight };
  });

  firstPartyNodes.forEach((n, idx) => {
    coords[n.id] = { x: firstPartyX, y: 60 + idx * rowHeight };
  });

  thirdPartyNodes.forEach((n, idx) => {
    coords[n.id] = { x: thirdPartyX, y: 60 + idx * rowHeight };
  });

  // Fallback for any unclassified nodes
  nodes.forEach((n, idx) => {
    if (!coords[n.id]) {
      coords[n.id] = { x: 620, y: 60 + idx * rowHeight };
    }
  });

  return coords;
}

/**
 * Builds a PrivacyFlowGraph strictly from recorded browser network observations.
 */
export function buildGraphFromObservations(
  scan: { id: string; targetUrl: string; isDemo?: boolean },
  observations: BrowserObservation[],
  comparisonSummary: ConsentComparisonSummary | null = null,
  findings: Finding[] = []
): PrivacyFlowGraph {
  const isSynthetic = 
    Boolean(scan.isDemo) || 
    scan.targetUrl.includes('testbed') || 
    scan.targetUrl.includes('127.0.0.1') || 
    scan.targetUrl.includes('localhost');

  const originDomain = scan.targetUrl
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '') || 'localhost';

  if (!observations || observations.length === 0) {
    return {
      scanId: scan.id,
      targetDomain: originDomain,
      targetUrl: scan.targetUrl,
      nodes: [],
      edges: [],
      isSynthetic,
    };
  }

  // 1. Origin Node
  const originNodeId = 'node-origin';
  const originNode: PrivacyFlowNodeData = {
    id: originNodeId,
    label: originDomain,
    domain: originDomain,
    nodeType: 'website',
    classification: 'first_party',
    categoryLabel: isSynthetic ? 'Synthetic Testbed Origin' : 'Primary Target Origin',
    jurisdiction: isSynthetic ? 'IN (Controlled Testbed)' : 'India (Edge Production)',
    piiItems: [],
    riskLevel: 'info',
    observedRequestsCount: observations.length,
    description: isSynthetic 
      ? 'Local controlled synthetic test application origin.' 
      : `Target web application origin for ${scan.targetUrl}.`,
    associatedFindingIds: [],
    isSynthetic,
    evidenceObservationIds: observations.map((o) => o.id),
  };

  const nodesMap = new Map<string, PrivacyFlowNodeData>();
  nodesMap.set(originNodeId, originNode);

  // Helper to extract path slug
  const getPathKey = (urlStr: string): string => {
    try {
      const u = new URL(urlStr, 'http://localhost');
      return u.pathname;
    } catch {
      return '';
    }
  };

  // 2. Build Destination Nodes
  observations.forEach((obs) => {
    const isFirstParty = obs.classification === 'first_party';
    const pathKey = getPathKey(obs.url);

    let targetNodeId: string;
    let label: string;
    let categoryLabel: string;
    let nodeType: 'api_endpoint' | 'third_party';

    if (isFirstParty) {
      const pathSlug = pathKey.replace(/[^a-zA-Z0-9]/g, '-').replace(/^-+|-+$/g, '') || 'root';
      targetNodeId = `node-fp-${pathSlug}`;
      label = pathKey || obs.domain;
      categoryLabel = 'First-Party Endpoint';
      nodeType = 'api_endpoint';
    } else {
      // Third party: if it's the testbed third-party analytics endpoint on the same host, disambiguate
      if (pathKey.includes('/testbed/api/analytics')) {
        targetNodeId = 'node-tp-testbed-analytics';
        label = 'Testbed Analytics (Tracker)';
      } else {
        const domainSlug = obs.domain.replace(/[^a-zA-Z0-9]/g, '-').replace(/^-+|-+$/g, '') || 'third-party';
        targetNodeId = `node-tp-${domainSlug}`;
        label = obs.domain;
      }
      categoryLabel = isSynthetic ? 'Synthetic Third-Party Tracker' : 'Third-Party Service';
      nodeType = 'third_party';
    }

    // Match associated findings
    const matchedFindingIds = findings
      .filter((f) => {
        if (!f.affectedUrl && !f.endpoint) return false;
        const target = (f.affectedUrl || f.endpoint || '').toLowerCase();
        return target.includes(obs.domain.toLowerCase()) || (pathKey && target.includes(pathKey.toLowerCase()));
      })
      .map((f) => f.id);

    // Check PII in observation headers or findings
    const piiItems: string[] = [];
    if (obs.headersRedacted && Object.keys(obs.headersRedacted).length > 0) {
      const keys = Object.keys(obs.headersRedacted).join(' ').toLowerCase();
      if (keys.includes('pan')) piiItems.push('PAN Number');
      if (keys.includes('aadhaar')) piiItems.push('Aadhaar Reference');
      if (keys.includes('auth') || keys.includes('cookie')) piiItems.push('Session Credential');
    }

    if (!nodesMap.has(targetNodeId)) {
      const isViolation = !isFirstParty && obs.consentState === 'consent_rejected';
      const riskLevel = isViolation ? 'high' : (!isFirstParty ? 'medium' : 'low');

      nodesMap.set(targetNodeId, {
        id: targetNodeId,
        label,
        domain: obs.domain,
        endpointPath: isFirstParty ? pathKey : undefined,
        httpMethod: obs.method as any,
        nodeType,
        classification: obs.classification,
        categoryLabel,
        jurisdiction: isSynthetic ? 'IN (Controlled Testbed)' : 'Global Telemetry POP',
        piiItems,
        riskLevel,
        observedRequestsCount: 1,
        failedRequestsCount: obs.isFailed ? 1 : 0,
        description: `Observed via browser instrumentation. Resource: ${obs.resourceType}, Method: ${obs.method}`,
        associatedFindingIds: matchedFindingIds,
        evidenceObservationIds: [obs.id],
        isSynthetic,
      });
    } else {
      const existing = nodesMap.get(targetNodeId)!;
      existing.observedRequestsCount += 1;
      if (obs.isFailed) existing.failedRequestsCount = (existing.failedRequestsCount || 0) + 1;
      if (!existing.evidenceObservationIds?.includes(obs.id)) {
        existing.evidenceObservationIds?.push(obs.id);
      }
      matchedFindingIds.forEach((id) => {
        if (!existing.associatedFindingIds?.includes(id)) {
          existing.associatedFindingIds?.push(id);
        }
      });
      piiItems.forEach((item) => {
        if (!existing.piiItems.includes(item)) {
          existing.piiItems.push(item);
        }
      });
      if (!isFirstParty && obs.consentState === 'consent_rejected') {
        existing.riskLevel = 'high';
      }
    }
  });

  // 3. Build Edges (Aggregated by source -> destination)
  const edgeMap = new Map<string, {
    targetNodeId: string;
    observations: BrowserObservation[];
    methods: Set<string>;
    resourceTypes: Set<string>;
    consentStates: Set<string>;
    hasFailure: boolean;
    failureReasons: Set<string>;
    statusCodes: Set<number>;
    isThirdParty: boolean;
  }>();

  observations.forEach((obs) => {
    const isFirstParty = obs.classification === 'first_party';
    const pathKey = getPathKey(obs.url);

    let targetNodeId: string;
    if (isFirstParty) {
      const pathSlug = pathKey.replace(/[^a-zA-Z0-9]/g, '-').replace(/^-+|-+$/g, '') || 'root';
      targetNodeId = `node-fp-${pathSlug}`;
    } else {
      if (pathKey.includes('/testbed/api/analytics')) {
        targetNodeId = 'node-tp-testbed-analytics';
      } else {
        const domainSlug = obs.domain.replace(/[^a-zA-Z0-9]/g, '-').replace(/^-+|-+$/g, '') || 'third-party';
        targetNodeId = `node-tp-${domainSlug}`;
      }
    }

    const edgeKey = `${originNodeId}->${targetNodeId}`;
    if (!edgeMap.has(edgeKey)) {
      edgeMap.set(edgeKey, {
        targetNodeId,
        observations: [obs],
        methods: new Set([obs.method]),
        resourceTypes: new Set([obs.resourceType]),
        consentStates: new Set([obs.consentState]),
        hasFailure: obs.isFailed,
        failureReasons: obs.failureReason ? new Set([obs.failureReason]) : new Set(),
        statusCodes: obs.statusCode ? new Set([obs.statusCode]) : new Set(),
        isThirdParty: !isFirstParty,
      });
    } else {
      const entry = edgeMap.get(edgeKey)!;
      entry.observations.push(obs);
      entry.methods.add(obs.method);
      entry.resourceTypes.add(obs.resourceType);
      entry.consentStates.add(obs.consentState);
      if (obs.isFailed) entry.hasFailure = true;
      if (obs.failureReason) entry.failureReasons.add(obs.failureReason);
      if (obs.statusCode) entry.statusCodes.add(obs.statusCode);
    }
  });

  const edges: PrivacyFlowEdgeData[] = [];

  edgeMap.forEach((entry, edgeKey) => {
    const primaryObs = entry.observations[0];
    const inAccepted = entry.consentStates.has('consent_accepted') || entry.consentStates.has('before_consent');
    const inRejected = entry.consentStates.has('consent_rejected') || entry.consentStates.has('before_consent');

    let diffStatus: PrivacyFlowEdgeData['presence']['diffStatus'] = 'both';
    if (inAccepted && inRejected) {
      diffStatus = entry.isThirdParty ? 'persists_despite_rejection' : 'both';
    } else if (inAccepted && !inRejected) {
      diffStatus = 'accepted_only';
    } else if (!inAccepted && inRejected) {
      diffStatus = 'rejected_only';
    }

    const isStatutoryViolation = entry.isThirdParty && inRejected;
    const methodStr = Array.from(entry.methods).join('/');
    const resourceStr = Array.from(entry.resourceTypes).join('/');

    const aggregatedHeaders: Record<string, string> = {};
    entry.observations.forEach((o) => {
      if (o.headersRedacted) {
        Object.assign(aggregatedHeaders, o.headersRedacted);
      }
    });

    const statusSummary = entry.statusCodes.size > 0 
      ? `HTTP ${Array.from(entry.statusCodes).join(', ')}`
      : (entry.hasFailure ? 'Failed/Blocked' : '200 OK');

    const failureSummary = entry.failureReasons.size > 0 
      ? ` (Reason: ${Array.from(entry.failureReasons).join(', ')})`
      : '';

    edges.push({
      id: `edge-${originNodeId}-${entry.targetNodeId}`,
      source: originNodeId,
      target: entry.targetNodeId,
      label: `${methodStr} ${resourceStr}`,
      httpMethod: methodStr,
      endpointPath: primaryObs.url,
      timestamp: primaryObs.timestamp,
      consentStateObserved: inRejected && inAccepted ? 'both' : (inRejected ? 'consent_rejected' : 'consent_accepted'),
      presence: {
        inConsentRejected: inRejected,
        inConsentAccepted: inAccepted,
        diffStatus,
      },
      evidenceSource: `Playwright Live Observation (${entry.observations.length} reqs)`,
      evidenceObservationIds: entry.observations.map((o) => o.id),
      targetUrl: primaryObs.url,
      statusCode: primaryObs.statusCode || undefined,
      isFailed: entry.hasFailure,
      failureReason: entry.failureReasons.size > 0 ? Array.from(entry.failureReasons).join(', ') : undefined,
      resourceType: resourceStr,
      redactedMetadata: {
        headers: aggregatedHeaders,
        payloadSummary: `Status: ${statusSummary}${failureSummary}. Traffic: ${entry.observations.length} observed request(s).`,
      },
      purposeContext: entry.isThirdParty ? 'Third-party telemetry/analytics' : 'Application core functionality',
      isStatutoryViolation,
      statutoryNote: isStatutoryViolation 
        ? 'Observed active network transmission when user explicitly selected Consent Rejected (DPDP Act §6(1)).' 
        : undefined,
      isSynthetic,
    });
  });

  return {
    scanId: scan.id,
    targetDomain: originDomain,
    targetUrl: scan.targetUrl,
    nodes: Array.from(nodesMap.values()),
    edges,
    isSynthetic,
  };
}

export const privacyFlowService = {
  /**
   * Retrieves all available scans for the scan selector.
   */
  async getAvailableScans(): Promise<ScanResult[]> {
    return api.getScans();
  },

  /**
   * Computes layout coordinates deterministically.
   */
  computeLayout(nodes: PrivacyFlowNodeData[]): Record<string, { x: number; y: number }> {
    return computeDeterministicLayout(nodes);
  },

  /**
   * Retrieves the privacy flow graph for a given scan or domain, evaluated under the chosen consent state.
   */
  async getGraphForScan(
    scanIdOrDomain: string,
    consentMode: ConsentSessionMode
  ): Promise<{
    graph: PrivacyFlowGraph;
    activeNodes: PrivacyFlowNodeData[];
    activeEdges: PrivacyFlowEdgeData[];
    stats: {
      totalDomains: number;
      firstPartyCount: number;
      thirdPartyCount: number;
      totalConnections: number;
      flaggedViolations: number;
      piiBearingEdges: number;
      failedConnections: number;
    };
    isEmpty: boolean;
    isSynthetic: boolean;
  }> {
    const scans = await api.getScans();
    const matchedScan = scans.find((s) => s.id === scanIdOrDomain || s.targetUrl.includes(scanIdOrDomain));

    let graph: PrivacyFlowGraph | null = null;

    if (matchedScan) {
      // 1. Fetch live observations from backend API
      const liveObservations = await api.getScanObservations(matchedScan.id);
      const comparison = await api.getConsentComparison(matchedScan.id);
      const findings = matchedScan.findings || await api.getFindings();

      if (liveObservations && liveObservations.length > 0) {
        graph = buildGraphFromObservations(matchedScan, liveObservations, comparison, findings);
      } else if (matchedScan.isDemo) {
        // Explicit demo scan with no live observations: load fixture only if labeled demo
        const fixtureGraph = DEMO_GRAPHS[matchedScan.id] || PAYSECURE_FLOW_GRAPH;
        graph = {
          ...fixtureGraph,
          scanId: matchedScan.id,
          isSynthetic: true,
        };
      } else {
        // Genuine empty state for real scan with 0 observations
        graph = {
          scanId: matchedScan.id,
          targetDomain: matchedScan.targetUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
          targetUrl: matchedScan.targetUrl,
          nodes: [],
          edges: [],
          isSynthetic: false,
        };
      }
    } else if (scanIdOrDomain.startsWith('SCAN-') || scanIdOrDomain.startsWith('TEST-')) {
      // Directly query backend for this scan ID
      try {
        const liveObservations = await api.getScanObservations(scanIdOrDomain);
        const comparison = await api.getConsentComparison(scanIdOrDomain);
        if (liveObservations && liveObservations.length > 0) {
          graph = buildGraphFromObservations(
            { id: scanIdOrDomain, targetUrl: `http://${liveObservations[0]?.domain || 'localhost'}` },
            liveObservations,
            comparison,
            []
          );
        }
      } catch {
        // Backend error / not found handled below
      }
    }

    // Fallback: If explicit demo domain fixture requested and demo graphs exist
    if (!graph) {
      if (DEMO_GRAPHS[scanIdOrDomain]) {
        graph = {
          ...DEMO_GRAPHS[scanIdOrDomain],
          isSynthetic: true,
        };
      } else {
        // Honest empty state
        graph = {
          scanId: scanIdOrDomain,
          targetDomain: scanIdOrDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
          targetUrl: scanIdOrDomain.startsWith('http') ? scanIdOrDomain : `https://${scanIdOrDomain}`,
          nodes: [],
          edges: [],
          isSynthetic: false,
        };
      }
    }

    // Filter edges active under the selected consent mode
    const activeEdges = graph.edges.filter((e) => {
      if (consentMode === 'consent_rejected') {
        return e.presence.inConsentRejected;
      }
      return e.presence.inConsentAccepted;
    });

    // Compute active nodes connected by active edges, plus the origin website
    const connectedNodeIds = new Set<string>();
    activeEdges.forEach((e) => {
      connectedNodeIds.add(e.source);
      connectedNodeIds.add(e.target);
    });

    // Ensure the website node is always present
    const activeNodes = graph.nodes.map((node) => ({
      ...node,
      isSuppressedInCurrentConsent: !connectedNodeIds.has(node.id) && node.nodeType !== 'website',
    }));

    // Calculate forensic metrics
    const firstPartyCount = activeNodes.filter((n) => n.classification === 'first_party').length;
    const thirdPartyCount = activeNodes.filter((n) => n.classification === 'third_party').length;
    const flaggedViolations = activeEdges.filter((e) => e.isStatutoryViolation).length;
    const piiBearingEdges = activeNodes.reduce((acc, n) => acc + (n.piiItems.length > 0 ? 1 : 0), 0);
    const failedConnections = activeEdges.filter((e) => e.isFailed).length;

    return {
      graph,
      activeNodes,
      activeEdges,
      stats: {
        totalDomains: graph.nodes.length,
        firstPartyCount,
        thirdPartyCount,
        totalConnections: activeEdges.length,
        flaggedViolations,
        piiBearingEdges,
        failedConnections,
      },
      isEmpty: graph.nodes.length === 0,
      isSynthetic: Boolean(graph.isSynthetic),
    };
  },
};
