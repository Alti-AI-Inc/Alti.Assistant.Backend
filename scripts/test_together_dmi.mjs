/**
 * Test Suite for Together.ai Dedicated Model Inference (DMI) Endpoints
 * Verifies Service Layer, Gateway Layer, and Express Router Stack with Sovereign Fallbacks
 * 
 * Endpoints Covered:
 * 1. POST   /endpoints & /v1/endpoints (Create Endpoint)
 * 2. GET    /endpoints & /v1/endpoints (List Endpoints)
 * 3. GET    /endpoints/:id & /v1/endpoints/:id (Get Endpoint)
 * 4. PATCH  /endpoints/:id & /v1/endpoints/:id (Update Endpoint)
 * 5. DELETE /endpoints/:id & /v1/endpoints/:id (Delete Endpoint)
 * 6. GET    /endpoints/:id/events & /v1/endpoints/:id/events (List Endpoint Events)
 * 7. GET    /endpoints/:id/analytics & /v1/endpoints/:id/analytics (Get Endpoint Analytics)
 * 8. GET    /endpoints/organization & /v1/endpoints/organization (List Org Endpoints)
 * 
 * License: MIT
 */
import assert from 'assert';
import {
  llmCreateEndpoint,
  llmListEndpoints,
  llmGetEndpoint,
  llmUpdateEndpoint,
  llmDeleteEndpoint,
  llmListEndpointEvents,
  llmGetEndpointAnalytics,
  llmListOrgEndpoints,
  llmListEndpointHardware,
  llmListEndpointAvzones,
} from '../src/app/services/llm.client.js';
import InferenceGateway from '../src/app/modules/inference/inference.gateway.js';
import router from '../src/app/modules/inference/inference.route.js';

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
  };
}

async function runDMITestSuite() {
  console.log('🧪 Testing Together.ai Dedicated Model Inference (DMI) Suite (8 Endpoints)...\n');

  // ==========================================
  // 1. SERVICE LAYER TESTS
  // ==========================================
  console.log('── 1. Service Layer Tests ──');

  // Test 1: llmCreateEndpoint
  console.log('[Test 1.1] Service: llmCreateEndpoint()...');
  const createdEp = await llmCreateEndpoint({
    name: 'aphura/test-deepseek-r1-endpoint',
    model: 'deepseek-ai/DeepSeek-R1',
    hardware: '8x_H100_SXM',
    visibility: 'VISIBILITY_INTERNAL',
  });
  assert.ok(createdEp.id, 'Must contain endpoint id');
  assert.ok(createdEp.name, 'Must contain endpoint name');
  assert.ok(createdEp.state || createdEp.status, 'Must contain state or status');
  console.log(`✅ Service: Created dedicated endpoint: ${createdEp.id} (${createdEp.name})`);

  const testEpId = createdEp.id;

  // Test 2: llmListEndpoints
  console.log('\n[Test 1.2] Service: llmListEndpoints()...');
  const epList = await llmListEndpoints();
  assert.ok(epList && (Array.isArray(epList.data) || Array.isArray(epList)), 'Must return data list');
  const listItems = Array.isArray(epList.data) ? epList.data : epList;
  assert.ok(listItems.length > 0, 'Endpoints list must not be empty');
  console.log(`✅ Service: Listed ${listItems.length} dedicated endpoints.`);

  // Test 3: llmGetEndpoint
  console.log('\n[Test 1.3] Service: llmGetEndpoint()...');
  const epDetail = await llmGetEndpoint(testEpId);
  assert.ok(epDetail.id, 'Must return endpoint id');
  assert.strictEqual(epDetail.id, testEpId, 'Endpoint ID must match requested');
  console.log(`✅ Service: Retrieved endpoint detail for ${testEpId}.`);

  // Test 4: llmUpdateEndpoint
  console.log('\n[Test 1.4] Service: llmUpdateEndpoint()...');
  const updatedEp = await llmUpdateEndpoint(testEpId, {
    visibility: 'VISIBILITY_PRIVATE',
    replicas: 2,
  });
  assert.ok(updatedEp.id, 'Must return endpoint id');
  assert.strictEqual(updatedEp.replicas, 2, 'Replicas should be updated');
  console.log(`✅ Service: Updated endpoint ${testEpId}.`);

  // Test 5: llmListEndpointEvents
  console.log('\n[Test 1.5] Service: llmListEndpointEvents()...');
  const eventsRes = await llmListEndpointEvents(testEpId);
  assert.ok(eventsRes && Array.isArray(eventsRes.data), 'Must return events data array');
  assert.ok(eventsRes.data.length > 0, 'Must have at least one audit/lifecycle event');
  console.log(`✅ Service: Retrieved ${eventsRes.data.length} audit events for endpoint ${testEpId}.`);

  // Test 6: llmGetEndpointAnalytics
  console.log('\n[Test 1.6] Service: llmGetEndpointAnalytics()...');
  const analyticsRes = await llmGetEndpointAnalytics(testEpId);
  assert.ok(analyticsRes.endpointId, 'Must return endpointId in analytics');
  assert.ok(analyticsRes.summary, 'Must return summary metrics');
  assert.ok(typeof analyticsRes.summary.totalRequests === 'number', 'totalRequests must be a number');
  console.log(`✅ Service: Retrieved analytics: totalRequests=${analyticsRes.summary.totalRequests}, avgLatencyMs=${analyticsRes.summary.avgLatencyMs}`);

  // Test 7: llmListOrgEndpoints
  console.log('\n[Test 1.7] Service: llmListOrgEndpoints()...');
  const orgEndpoints = await llmListOrgEndpoints('org_sovereign_liberty');
  assert.ok(orgEndpoints && Array.isArray(orgEndpoints.data), 'Must return org endpoints data array');
  assert.ok(orgEndpoints.data.length > 0, 'Must return at least one org endpoint');
  console.log(`✅ Service: Retrieved ${orgEndpoints.data.length} organization-scoped endpoints.`);

  // Test 8: llmDeleteEndpoint
  console.log('\n[Test 1.8] Service: llmDeleteEndpoint()...');
  const deletedEp = await llmDeleteEndpoint(testEpId);
  assert.ok(deletedEp.id, 'Must contain endpoint id');
  assert.ok(deletedEp.deleted, 'Must indicate deleted');
  console.log(`✅ Service: Deleted endpoint ${testEpId}.`);

  // ==========================================
  // 2. GATEWAY LAYER TESTS
  // ==========================================
  console.log('\n── 2. Gateway Layer Tests ──');

  // Gateway 1: handleCreateEndpoint
  console.log('[Test 2.1] Gateway: handleCreateEndpoint()...');
  const resGwCreate = mockRes();
  await InferenceGateway.handleCreateEndpoint(
    { body: { name: 'aphura/gw-dmi-test', model: 'deepseek-ai/DeepSeek-R1' }, query: {}, params: {} },
    resGwCreate
  );
  assert.strictEqual(resGwCreate.statusCode, 200);
  assert.ok(resGwCreate.body.id, 'Must return created endpoint ID');
  console.log(`✅ Gateway: handleCreateEndpoint succeeded (id=${resGwCreate.body.id}).`);

  const gwEpId = resGwCreate.body.id;

  // Gateway 2: handleListEndpoints
  console.log('\n[Test 2.2] Gateway: handleListEndpoints()...');
  const resGwList = mockRes();
  await InferenceGateway.handleListEndpoints({ query: {}, params: {} }, resGwList);
  assert.strictEqual(resGwList.statusCode, 200);
  assert.ok(resGwList.body.data, 'Must return data list');
  console.log(`✅ Gateway: handleListEndpoints succeeded.`);

  // Gateway 3: handleGetEndpoint
  console.log('\n[Test 2.3] Gateway: handleGetEndpoint()...');
  const resGwGet = mockRes();
  await InferenceGateway.handleGetEndpoint({ params: { id: gwEpId }, query: {} }, resGwGet);
  assert.strictEqual(resGwGet.statusCode, 200);
  assert.strictEqual(resGwGet.body.id, gwEpId);
  console.log(`✅ Gateway: handleGetEndpoint succeeded.`);

  // Gateway 4: handleUpdateEndpoint
  console.log('\n[Test 2.4] Gateway: handleUpdateEndpoint()...');
  const resGwUpdate = mockRes();
  await InferenceGateway.handleUpdateEndpoint(
    { params: { id: gwEpId }, body: { visibility: 'VISIBILITY_INTERNAL' }, query: {} },
    resGwUpdate
  );
  assert.strictEqual(resGwUpdate.statusCode, 200);
  assert.strictEqual(resGwUpdate.body.id, gwEpId);
  console.log(`✅ Gateway: handleUpdateEndpoint succeeded.`);

  // Gateway 5: handleListEndpointEvents
  console.log('\n[Test 2.5] Gateway: handleListEndpointEvents()...');
  const resGwEvents = mockRes();
  await InferenceGateway.handleListEndpointEvents({ params: { id: gwEpId }, query: {} }, resGwEvents);
  assert.strictEqual(resGwEvents.statusCode, 200);
  assert.ok(Array.isArray(resGwEvents.body.data));
  console.log(`✅ Gateway: handleListEndpointEvents succeeded.`);

  // Gateway 6: handleGetEndpointAnalytics
  console.log('\n[Test 2.6] Gateway: handleGetEndpointAnalytics()...');
  const resGwAnalytics = mockRes();
  await InferenceGateway.handleGetEndpointAnalytics({ params: { id: gwEpId }, query: {} }, resGwAnalytics);
  assert.strictEqual(resGwAnalytics.statusCode, 200);
  assert.ok(resGwAnalytics.body.summary);
  console.log(`✅ Gateway: handleGetEndpointAnalytics succeeded.`);

  // Gateway 7: handleListOrgEndpoints
  console.log('\n[Test 2.7] Gateway: handleListOrgEndpoints()...');
  const resGwOrg = mockRes();
  await InferenceGateway.handleListOrgEndpoints({ params: {}, query: { organizationId: 'org_test' } }, resGwOrg);
  assert.strictEqual(resGwOrg.statusCode, 200);
  assert.ok(Array.isArray(resGwOrg.body.data));
  console.log(`✅ Gateway: handleListOrgEndpoints succeeded.`);

  // Gateway 8: handleDeleteEndpoint
  console.log('\n[Test 2.8] Gateway: handleDeleteEndpoint()...');
  const resGwDel = mockRes();
  await InferenceGateway.handleDeleteEndpoint({ params: { id: gwEpId }, query: {} }, resGwDel);
  assert.strictEqual(resGwDel.statusCode, 200);
  assert.strictEqual(resGwDel.body.id, gwEpId);
  assert.ok(resGwDel.body.deleted);
  console.log(`✅ Gateway: handleDeleteEndpoint succeeded.`);

  // ==========================================
  // 3. ROUTER STACK & ROUTE PRECEDENCE VERIFICATION
  // ==========================================
  console.log('\n── 3. Router Stack & Precedence Tests ──');
  const routes = [];
  router.stack.forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    }
  });

  const expectedDmiRoutes = [
    { path: '/endpoints', method: 'POST' },
    { path: '/v1/endpoints', method: 'POST' },
    { path: '/endpoints', method: 'GET' },
    { path: '/v1/endpoints', method: 'GET' },
    { path: '/endpoints/organization', method: 'GET' },
    { path: '/v1/endpoints/organization', method: 'GET' },
    { path: '/endpoints/org', method: 'GET' },
    { path: '/v1/endpoints/org', method: 'GET' },
    { path: '/endpoints/:id/events', method: 'GET' },
    { path: '/v1/endpoints/:id/events', method: 'GET' },
    { path: '/endpoints/:id/analytics', method: 'GET' },
    { path: '/v1/endpoints/:id/analytics', method: 'GET' },
    { path: '/endpoints/:id', method: 'GET' },
    { path: '/v1/endpoints/:id', method: 'GET' },
    { path: '/endpoints/:id', method: 'PATCH' },
    { path: '/v1/endpoints/:id', method: 'PATCH' },
    { path: '/endpoints/:id', method: 'PUT' },
    { path: '/v1/endpoints/:id', method: 'PUT' },
    { path: '/endpoints/:id', method: 'DELETE' },
    { path: '/v1/endpoints/:id', method: 'DELETE' },
    { path: '/organizations/:organizationId/endpoints', method: 'GET' },
  ];

  for (const exp of expectedDmiRoutes) {
    const match = routes.find(
      (r) => r.path === exp.path && r.methods.includes(exp.method)
    );
    assert.ok(match, `Route ${exp.method} ${exp.path} must be registered in router`);
  }
  console.log(`✅ Router: All ${expectedDmiRoutes.length} expected DMI routes successfully verified.`);

  // Verify route precedence: /endpoints/organization must appear before /endpoints/:id
  const orgIndex = routes.findIndex((r) => r.path === '/endpoints/organization');
  const epParamIndex = routes.findIndex((r) => r.path === '/endpoints/:id');
  assert.ok(orgIndex !== -1, '/endpoints/organization must exist');
  assert.ok(epParamIndex !== -1, '/endpoints/:id must exist');
  assert.ok(orgIndex < epParamIndex, `/endpoints/organization (idx ${orgIndex}) MUST precede /endpoints/:id (idx ${epParamIndex})`);
  console.log(`✅ Router: Precedence confirmed! /endpoints/organization (pos ${orgIndex}) is mounted before /endpoints/:id (pos ${epParamIndex}).`);

  console.log('\n🎉 ALL DEDICATED MODEL INFERENCE (DMI) TESTS PASSED CLEANLY (8/8 ENDPOINTS VERIFIED)!\n');
}

runDMITestSuite().catch((err) => {
  console.error('❌ DMI Test Suite Failed:', err);
  process.exit(1);
});
