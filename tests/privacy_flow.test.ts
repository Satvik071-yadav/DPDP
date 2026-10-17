import assert from 'node:assert';
import { 
  buildGraphFromObservations, 
  computeDeterministicLayout, 
  privacyFlowService 
} from '../src/services/privacyFlowService';
import { 
  BrowserObservation, 
  ConsentComparisonSummary, 
  Finding, 
  ScanResult 
} from '../src/types';

console.log('Running DPDP-Guard Privacy Flow Data-Driven Visualization Tests...\n');

let passedTests = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// -------------------------------------------------------------
// Test Fixtures for Unit Testing (Explicitly Labeled Test Fixtures)
// -------------------------------------------------------------
const MOCK_TESTBED_SCAN: ScanResult = {
  id: 'SCAN-2026-TEST-01',
  targetUrl: 'http://127.0.0.1:8000/testbed',
  timestamp: '2026-10-16T12:00:00Z',
  durationSeconds: 3.2,
  profile: 'privacy_audit',
  status: 'completed',
  complianceScore: 82,
  findingsCount: { critical: 0, high: 1, medium: 0, low: 1, info: 1, total: 3 },
  consentModeEnabled: true,
  findings: [
    {
      id: 'DPDP-LIVE-001',
      title: 'Unconsented Third-Party Tracker',
      severity: 'high',
      confidence: 95,
      category: 'consent_bypass',
      description: 'Analytics tracking request sent despite user rejecting consent.',
      affectedUrl: 'http://127.0.0.1:8000/testbed/api/analytics',
      endpoint: '/testbed/api/analytics',
      dpdpSection: 'Section 6(1)',
      remediationGuide: 'Gate tracker dispatch behind explicit consent.',
      status: 'open',
    }
  ],
};

const MOCK_PRODUCTION_SCAN: ScanResult = {
  id: 'SCAN-2026-PROD-01',
  targetUrl: 'https://ecommerce-platform.in',
  timestamp: '2026-10-16T12:00:00Z',
  durationSeconds: 5.1,
  profile: 'privacy_audit',
  status: 'completed',
  complianceScore: 90,
  findingsCount: { critical: 0, high: 0, medium: 1, low: 2, info: 0, total: 3 },
  consentModeEnabled: true,
  findings: [],
};

const MOCK_OBSERVATIONS: BrowserObservation[] = [
  // 1. First-party session endpoint (in both accepted and rejected)
  {
    id: 'obs-001',
    scanId: 'SCAN-2026-TEST-01',
    timestamp: '2026-10-16T12:00:01Z',
    url: 'http://127.0.0.1:8000/testbed/api/session',
    domain: '127.0.0.1',
    method: 'GET',
    statusCode: 200,
    isFailed: false,
    resourceType: 'fetch',
    classification: 'first_party',
    consentState: 'consent_accepted',
    headersRedacted: { 'Authorization': '[REDACTED_CREDENTIAL]' },
  },
  {
    id: 'obs-002',
    scanId: 'SCAN-2026-TEST-01',
    timestamp: '2026-10-16T12:00:02Z',
    url: 'http://127.0.0.1:8000/testbed/api/session',
    domain: '127.0.0.1',
    method: 'GET',
    statusCode: 200,
    isFailed: false,
    resourceType: 'fetch',
    classification: 'first_party',
    consentState: 'consent_rejected',
    headersRedacted: { 'Authorization': '[REDACTED_CREDENTIAL]' },
  },
  // 2. First-party opt-out receipt (rejected session only)
  {
    id: 'obs-003',
    scanId: 'SCAN-2026-TEST-01',
    timestamp: '2026-10-16T12:00:03Z',
    url: 'http://127.0.0.1:8000/testbed/api/optout-receipt',
    domain: '127.0.0.1',
    method: 'POST',
    statusCode: 200,
    isFailed: false,
    resourceType: 'fetch',
    classification: 'first_party',
    consentState: 'consent_rejected',
    headersRedacted: {},
  },
  // 3. Third-party analytics tracker (observed in consent_accepted)
  {
    id: 'obs-004',
    scanId: 'SCAN-2026-TEST-01',
    timestamp: '2026-10-16T12:00:04Z',
    url: 'http://127.0.0.1:8000/testbed/api/analytics',
    domain: '127.0.0.1',
    method: 'POST',
    statusCode: 200,
    isFailed: false,
    resourceType: 'xhr',
    classification: 'third_party',
    consentState: 'consent_accepted',
    headersRedacted: { 'X-Telemetry-ID': 'telemetry-abc' },
  },
  // 4. Third-party analytics tracker (observed in consent_rejected -> statutory violation!)
  {
    id: 'obs-005',
    scanId: 'SCAN-2026-TEST-01',
    timestamp: '2026-10-16T12:00:05Z',
    url: 'http://127.0.0.1:8000/testbed/api/analytics',
    domain: '127.0.0.1',
    method: 'POST',
    statusCode: 200,
    isFailed: false,
    resourceType: 'xhr',
    classification: 'third_party',
    consentState: 'consent_rejected',
    headersRedacted: { 'X-Telemetry-ID': 'telemetry-abc' },
  },
  // 5. Blocked / Failed request
  {
    id: 'obs-006',
    scanId: 'SCAN-2026-TEST-01',
    timestamp: '2026-10-16T12:00:06Z',
    url: 'http://10.0.0.1/internal-metrics',
    domain: '10.0.0.1',
    method: 'GET',
    statusCode: null,
    isFailed: true,
    failureReason: 'Blocked by egress security proxy: Private RFC 1918 destination',
    resourceType: 'fetch',
    classification: 'third_party',
    consentState: 'consent_accepted',
    headersRedacted: {},
  },
];

// -------------------------------------------------------------
// Suite 1: Graph Generation from Real Observations
// -------------------------------------------------------------
runTest('Graph Generation: origin node is derived accurately from targetUrl', () => {
  const graph = buildGraphFromObservations(MOCK_TESTBED_SCAN, MOCK_OBSERVATIONS, null, MOCK_TESTBED_SCAN.findings);
  const originNode = graph.nodes.find((n) => n.id === 'node-origin');
  assert.ok(originNode, 'Origin node must exist with id node-origin');
  assert.strictEqual(originNode.nodeType, 'website');
  assert.strictEqual(originNode.classification, 'first_party');
  assert.strictEqual(originNode.isSynthetic, true);
  assert.strictEqual(originNode.jurisdiction, 'IN (Controlled Testbed)');
  assert.strictEqual(originNode.observedRequestsCount, MOCK_OBSERVATIONS.length);
});

runTest('Graph Generation: accurately separates first-party and third-party nodes', () => {
  const graph = buildGraphFromObservations(MOCK_TESTBED_SCAN, MOCK_OBSERVATIONS, null, MOCK_TESTBED_SCAN.findings);
  const fpNodes = graph.nodes.filter((n) => n.classification === 'first_party' && n.nodeType !== 'website');
  const tpNodes = graph.nodes.filter((n) => n.classification === 'third_party');

  assert.strictEqual(fpNodes.length, 2, 'Should create 2 first-party endpoint nodes (/session, /optout-receipt)');
  assert.strictEqual(tpNodes.length, 2, 'Should create 2 third-party nodes (testbed-analytics, 10.0.0.1)');

  const sessionNode = fpNodes.find((n) => n.endpointPath === '/testbed/api/session');
  assert.ok(sessionNode, 'Session endpoint node must exist');
  assert.strictEqual(sessionNode.nodeType, 'api_endpoint');

  const trackerNode = tpNodes.find((n) => n.id === 'node-tp-testbed-analytics');
  assert.ok(trackerNode, 'Analytics tracker node must exist');
  assert.strictEqual(trackerNode.nodeType, 'third_party');
});

runTest('Graph Generation: links associated findings to affected nodes', () => {
  const graph = buildGraphFromObservations(MOCK_TESTBED_SCAN, MOCK_OBSERVATIONS, null, MOCK_TESTBED_SCAN.findings);
  const trackerNode = graph.nodes.find((n) => n.id === 'node-tp-testbed-analytics');
  assert.ok(trackerNode?.associatedFindingIds?.includes('DPDP-LIVE-001'), 'Tracker node must link to DPDP-LIVE-001 finding');
});

// -------------------------------------------------------------
// Suite 2: Node and Edge Deduplication & Evidence Retention
// -------------------------------------------------------------
runTest('Deduplication: multiple requests to the same endpoint aggregate into one node', () => {
  const graph = buildGraphFromObservations(MOCK_TESTBED_SCAN, MOCK_OBSERVATIONS, null, MOCK_TESTBED_SCAN.findings);
  const sessionNodes = graph.nodes.filter((n) => n.endpointPath === '/testbed/api/session');
  assert.strictEqual(sessionNodes.length, 1, 'Only 1 node should exist for /testbed/api/session');
  assert.strictEqual(sessionNodes[0].observedRequestsCount, 2, 'Should record 2 requests');
  assert.deepStrictEqual(sessionNodes[0].evidenceObservationIds, ['obs-001', 'obs-002']);
});

runTest('Deduplication: multiple requests to same destination aggregate into single edge with evidence references', () => {
  const graph = buildGraphFromObservations(MOCK_TESTBED_SCAN, MOCK_OBSERVATIONS, null, MOCK_TESTBED_SCAN.findings);
  const sessionEdges = graph.edges.filter((e) => e.target === 'node-fp-testbed-api-session');
  assert.strictEqual(sessionEdges.length, 1, 'Only 1 edge should exist between origin and session endpoint');
  assert.deepStrictEqual(sessionEdges[0].evidenceObservationIds, ['obs-001', 'obs-002']);
});

// -------------------------------------------------------------
// Suite 3: Empty Observations & No Silent Fixture Substitution
// -------------------------------------------------------------
runTest('Empty State: zero observations returns empty graph with zero nodes and zero edges', () => {
  const emptyGraph = buildGraphFromObservations(MOCK_PRODUCTION_SCAN, [], null, []);
  assert.strictEqual(emptyGraph.nodes.length, 0, 'Zero observations must produce 0 nodes');
  assert.strictEqual(emptyGraph.edges.length, 0, 'Zero observations must produce 0 edges');
  assert.strictEqual(emptyGraph.targetDomain, 'ecommerce-platform.in');
});

runTest('Service Fallback: getGraphForScan returns isEmpty: true and never loads PaySecure fixture for unknown scan', async () => {
  const result = await privacyFlowService.getGraphForScan('SCAN-NONEXISTENT-999', 'consent_rejected');
  assert.strictEqual(result.isEmpty, true, 'Nonexistent scan must return isEmpty: true');
  assert.strictEqual(result.graph.nodes.length, 0, 'Must not return nodes from PAYSECURE_FLOW_GRAPH');
  assert.strictEqual(result.graph.edges.length, 0, 'Must not return edges from PAYSECURE_FLOW_GRAPH');
});

// -------------------------------------------------------------
// Suite 4: Deterministic Layout Positioning (No Stacking)
// -------------------------------------------------------------
runTest('Layout Positioning: tiered columns position origin, APIs, and third parties at distinct X coordinates', () => {
  const graph = buildGraphFromObservations(MOCK_TESTBED_SCAN, MOCK_OBSERVATIONS, null, MOCK_TESTBED_SCAN.findings);
  const layout = computeDeterministicLayout(graph.nodes);

  const originCoords = layout['node-origin'];
  assert.strictEqual(originCoords.x, 60, 'Origin node must be placed at x=60');

  const fpCoords = layout['node-fp-testbed-api-session'];
  assert.strictEqual(fpCoords.x, 430, 'First-party node must be placed at x=430');

  const tpCoords = layout['node-tp-testbed-analytics'];
  assert.strictEqual(tpCoords.x, 820, 'Third-party node must be placed at x=820');
});

runTest('Layout Positioning: zero overlapping coordinates across all nodes', () => {
  const graph = buildGraphFromObservations(MOCK_TESTBED_SCAN, MOCK_OBSERVATIONS, null, MOCK_TESTBED_SCAN.findings);
  const layout = computeDeterministicLayout(graph.nodes);

  const coordSet = new Set<string>();
  for (const [nodeId, coord] of Object.entries(layout)) {
    const key = `${coord.x},${coord.y}`;
    assert.ok(!coordSet.has(key), `Coordinate ${key} for node ${nodeId} is already occupied (stacking bug!)`);
    coordSet.add(key);
  }
});

runTest('Layout Positioning: coordinates remain 100% stable across reruns', () => {
  const graph = buildGraphFromObservations(MOCK_TESTBED_SCAN, MOCK_OBSERVATIONS, null, MOCK_TESTBED_SCAN.findings);
  const layout1 = computeDeterministicLayout(graph.nodes);
  const layout2 = computeDeterministicLayout([...graph.nodes].reverse());

  for (const node of graph.nodes) {
    assert.deepStrictEqual(layout1[node.id], layout2[node.id], `Coordinates for ${node.id} must match regardless of input order`);
  }
});

// -------------------------------------------------------------
// Suite 5: Consent Filtering & Statutory Violation Flagging
// -------------------------------------------------------------
runTest('Consent Filtering: third-party tracker observed in consent_rejected flagged as statutory violation', () => {
  const graph = buildGraphFromObservations(MOCK_TESTBED_SCAN, MOCK_OBSERVATIONS, null, MOCK_TESTBED_SCAN.findings);
  const trackerEdge = graph.edges.find((e) => e.target === 'node-tp-testbed-analytics');
  assert.ok(trackerEdge, 'Tracker edge must exist');
  assert.strictEqual(trackerEdge.isStatutoryViolation, true, 'Tracker active in consent_rejected must be statutory violation');
  assert.strictEqual(trackerEdge.presence.diffStatus, 'persists_despite_rejection');
  assert.ok(trackerEdge.statutoryNote?.includes('§6(1)'));
});

runTest('Consent Filtering: first-party session active in both states is not a violation', () => {
  const graph = buildGraphFromObservations(MOCK_TESTBED_SCAN, MOCK_OBSERVATIONS, null, MOCK_TESTBED_SCAN.findings);
  const sessionEdge = graph.edges.find((e) => e.target === 'node-fp-testbed-api-session');
  assert.ok(sessionEdge, 'Session edge must exist');
  assert.strictEqual(sessionEdge.isStatutoryViolation, false, 'First-party session is not a violation');
  assert.strictEqual(sessionEdge.presence.diffStatus, 'both');
});

// -------------------------------------------------------------
// Suite 6: Blocked and Failed Request Representation
// -------------------------------------------------------------
runTest('Failed Requests: blocked request retains failure reason and failure status', () => {
  const graph = buildGraphFromObservations(MOCK_TESTBED_SCAN, MOCK_OBSERVATIONS, null, MOCK_TESTBED_SCAN.findings);
  const failedNode = graph.nodes.find((n) => n.id === 'node-tp-10-0-0-1');
  assert.ok(failedNode, 'Blocked node must exist');
  assert.strictEqual(failedNode.failedRequestsCount, 1);

  const failedEdge = graph.edges.find((e) => e.target === 'node-tp-10-0-0-1');
  assert.ok(failedEdge, 'Blocked edge must exist');
  assert.strictEqual(failedEdge.isFailed, true);
  assert.ok(failedEdge.failureReason?.includes('Blocked by egress security proxy'));
});

// -------------------------------------------------------------
// Suite 7: Synthetic Testbed vs Real Scan Labeling
// -------------------------------------------------------------
runTest('Provenance Labeling: testbed scan is marked synthetic while public scan is not', () => {
  const testbedGraph = buildGraphFromObservations(MOCK_TESTBED_SCAN, MOCK_OBSERVATIONS);
  assert.strictEqual(testbedGraph.isSynthetic, true);

  const prodGraph = buildGraphFromObservations(MOCK_PRODUCTION_SCAN, [
    {
      id: 'obs-prod-1',
      scanId: 'SCAN-2026-PROD-01',
      timestamp: '2026-10-16T12:00:00Z',
      url: 'https://ecommerce-platform.in/api/products',
      domain: 'ecommerce-platform.in',
      method: 'GET',
      statusCode: 200,
      isFailed: false,
      resourceType: 'fetch',
      classification: 'first_party',
      consentState: 'before_consent',
      headersRedacted: {},
    }
  ]);
  assert.strictEqual(prodGraph.isSynthetic, false);
});

// -------------------------------------------------------------
// Suite 8: Sensitive Value Redaction
// -------------------------------------------------------------
runTest('Redaction: sensitive request headers are preserved in redacted form', () => {
  const graph = buildGraphFromObservations(MOCK_TESTBED_SCAN, MOCK_OBSERVATIONS);
  const sessionEdge = graph.edges.find((e) => e.target === 'node-fp-testbed-api-session');
  assert.strictEqual(
    sessionEdge?.redactedMetadata.headers['Authorization'],
    '[REDACTED_CREDENTIAL]',
    'Authorization header must remain redacted'
  );
});

console.log(`\nAll ${passedTests} Privacy Flow tests passed successfully!`);
