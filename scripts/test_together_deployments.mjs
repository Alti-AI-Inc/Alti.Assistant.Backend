/**
 * Test Suite for Together.ai Deployments Suite (6 Endpoints)
 * Verifies both Service Layer and Gateway Layer with Sovereign Fallback
 * 
 * Endpoints:
 * 1. GET /deployments (List deployments)
 * 2. POST /deployments (Create deployment)
 * 3. GET /deployments/:id (Retrieve deployment)
 * 4. PATCH /deployments/:id (Update deployment)
 * 5. GET /deployments/:id/logs (Retrieve deployment logs)
 * 6. DELETE /deployments/:id (Delete deployment)
 */
import assert from 'assert';
import {
  llmListDeployments,
  llmCreateDeployment,
  llmGetDeployment,
  llmUpdateDeployment,
  llmDeleteDeployment,
  llmGetDeploymentLogs,
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

async function runDeploymentsTestSuite() {
  console.log('🧪 Testing Together.ai Deployments Suite (6 Endpoints)...\n');

  // 1. POST /deployments (Create deployment)
  console.log('[Test 1] Create Deployment (POST /deployments)...');
  const createPayload = {
    name: 'test-sovereign-deployment',
    image: 'registry.together.ai/inso-ai/llama-3-8b:latest',
    gpu_type: 'h100-80gb',
    gpu_count: 1,
    cpu: 8,
    memory: 32,
    storage: 100,
    port: 8000,
    min_replicas: 1,
    max_replicas: 3,
    capacity_type: 'stable',
    description: 'Test Deployment on Sovereign Liberty Center One',
  };

  const createdDep = await llmCreateDeployment(createPayload);
  assert.ok(createdDep.id, 'Created deployment must have an id');
  assert.strictEqual(createdDep.object, 'deployment');
  assert.strictEqual(createdDep.status, 'Ready');
  assert.strictEqual(createdDep.name, 'test-sovereign-deployment');
  console.log(`✅ Service: Created deployment ID = ${createdDep.id} (name: ${createdDep.name}, status: ${createdDep.status})`);

  const testDepId = createdDep.id;

  const resGatewayCreate = mockRes();
  await InferenceGateway.handleCreateDeployment({ body: createPayload }, resGatewayCreate);
  assert.strictEqual(resGatewayCreate.statusCode, 200);
  assert.ok(resGatewayCreate.body.id);
  assert.strictEqual(resGatewayCreate.body.object, 'deployment');
  console.log(`✅ Gateway: POST /deployments handled successfully.`);

  // 2. GET /deployments (List deployments)
  console.log('\n[Test 2] List Deployments (GET /deployments)...');
  const listedDeps = await llmListDeployments({});
  assert.strictEqual(listedDeps.object, 'list');
  assert.ok(Array.isArray(listedDeps.data), 'Listed deployments must contain data array');
  assert.ok(listedDeps.data.length > 0, 'Should return at least 1 deployment');
  console.log(`✅ Service: Listed ${listedDeps.data.length} deployments (e.g. ${listedDeps.data[0].id || listedDeps.data[0].name})`);

  const resGatewayList = mockRes();
  await InferenceGateway.handleListDeployments({ query: {} }, resGatewayList);
  assert.strictEqual(resGatewayList.statusCode, 200);
  assert.strictEqual(resGatewayList.body.object, 'list');
  assert.ok(Array.isArray(resGatewayList.body.data));
  console.log(`✅ Gateway: GET /deployments handled successfully.`);

  // 3. GET /deployments/:id (Retrieve deployment details)
  console.log('\n[Test 3] Retrieve Deployment (GET /deployments/:id)...');
  const retrievedDep = await llmGetDeployment(testDepId);
  assert.strictEqual(retrievedDep.id, testDepId);
  assert.strictEqual(retrievedDep.object, 'deployment');
  assert.strictEqual(retrievedDep.status, 'Ready');
  console.log(`✅ Service: Retrieved deployment ${testDepId} (status: ${retrievedDep.status})`);

  const resGatewayGet = mockRes();
  await InferenceGateway.handleGetDeployment({ params: { id: testDepId } }, resGatewayGet);
  assert.strictEqual(resGatewayGet.statusCode, 200);
  assert.strictEqual(resGatewayGet.body.id, testDepId);
  console.log(`✅ Gateway: GET /deployments/:id handled successfully.`);

  // 4. PATCH /deployments/:id (Update deployment)
  console.log('\n[Test 4] Update Deployment (PATCH /deployments/:id)...');
  const updatePayload = {
    min_replicas: 2,
    max_replicas: 5,
    description: 'Updated sovereign deployment replica scale',
  };
  const updatedDep = await llmUpdateDeployment(testDepId, updatePayload);
  assert.strictEqual(updatedDep.id, testDepId);
  assert.strictEqual(updatedDep.min_replicas, 2);
  assert.strictEqual(updatedDep.max_replicas, 5);
  console.log(`✅ Service: Updated deployment ${testDepId} (min: ${updatedDep.min_replicas}, max: ${updatedDep.max_replicas})`);

  const resGatewayUpdate = mockRes();
  await InferenceGateway.handleUpdateDeployment(
    { params: { id: testDepId }, body: updatePayload },
    resGatewayUpdate,
  );
  assert.strictEqual(resGatewayUpdate.statusCode, 200);
  assert.strictEqual(resGatewayUpdate.body.id, testDepId);
  console.log(`✅ Gateway: PATCH /deployments/:id handled successfully.`);

  // 5. GET /deployments/:id/logs (Retrieve deployment logs)
  console.log('\n[Test 5] Deployment Logs (GET /deployments/:id/logs)...');
  const logs = await llmGetDeploymentLogs(testDepId, { replica_id: 'rep_01' });
  assert.ok(Array.isArray(logs.lines), 'Logs must contain lines array');
  assert.ok(logs.lines.length > 0, 'Logs must have at least 1 line');
  console.log(`✅ Service: Retrieved ${logs.lines.length} log lines for deployment ${testDepId}`);

  const resGatewayLogs = mockRes();
  await InferenceGateway.handleGetDeploymentLogs(
    { params: { id: testDepId }, query: { replica_id: 'rep_01' } },
    resGatewayLogs,
  );
  assert.strictEqual(resGatewayLogs.statusCode, 200);
  assert.ok(Array.isArray(resGatewayLogs.body.lines));
  console.log(`✅ Gateway: GET /deployments/:id/logs handled successfully.`);

  // 6. DELETE /deployments/:id (Delete deployment)
  console.log('\n[Test 6] Delete Deployment (DELETE /deployments/:id)...');
  const deletedDep = await llmDeleteDeployment(testDepId);
  assert.ok(deletedDep.deleted === true || deletedDep.id === testDepId);
  console.log(`✅ Service: Deleted deployment ${testDepId}`);

  const resGatewayDelete = mockRes();
  await InferenceGateway.handleDeleteDeployment({ params: { id: testDepId } }, resGatewayDelete);
  assert.strictEqual(resGatewayDelete.statusCode, 200);
  assert.ok(resGatewayDelete.body.deleted === true || resGatewayDelete.body.id === testDepId);
  console.log(`✅ Gateway: DELETE /deployments/:id handled successfully.`);

  // 7. Express Router Stack Verification
  console.log('\n[Test 7] Verifying Express Router Stack for Deployment Paths...');
  const routes = [];
  router.stack.forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    }
  });

  const requiredRoutes = [
    { path: '/deployments', method: 'GET' },
    { path: '/v1/deployments', method: 'GET' },
    { path: '/deployments', method: 'POST' },
    { path: '/v1/deployments', method: 'POST' },
    { path: '/deployments/:id', method: 'GET' },
    { path: '/v1/deployments/:id', method: 'GET' },
    { path: '/deployments/:id', method: 'PATCH' },
    { path: '/v1/deployments/:id', method: 'PATCH' },
    { path: '/deployments/:id', method: 'PUT' },
    { path: '/v1/deployments/:id', method: 'PUT' },
    { path: '/deployments/:id', method: 'POST' },
    { path: '/v1/deployments/:id', method: 'POST' },
    { path: '/deployments/:id', method: 'DELETE' },
    { path: '/v1/deployments/:id', method: 'DELETE' },
    { path: '/deployments/:id/logs', method: 'GET' },
    { path: '/v1/deployments/:id/logs', method: 'GET' },
  ];

  for (const reqRoute of requiredRoutes) {
    const match = routes.find(
      (r) => r.path === reqRoute.path && r.methods.includes(reqRoute.method),
    );
    assert.ok(match, `Route ${reqRoute.method} ${reqRoute.path} must be registered in router stack`);
  }
  console.log(`✅ Router: All ${requiredRoutes.length} required deployment routes registered properly in inferenceRoutes.`);

  console.log('\n🎉 ALL 6 TOGETHER.AI DEPLOYMENTS ENDPOINTS VERIFIED & WORKING!\n');
}

runDeploymentsTestSuite().catch((err) => {
  console.error('❌ Deployments Test Suite Failed:', err);
  process.exit(1);
});
