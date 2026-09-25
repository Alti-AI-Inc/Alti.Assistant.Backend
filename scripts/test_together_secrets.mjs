/**
 * Test Suite for Together.ai Deployments Secrets Suite (5 Endpoints)
 * Verifies both Service Layer and Gateway Layer with Sovereign Fallback
 * 
 * Endpoints:
 * 1. GET /deployments/secrets (List secrets)
 * 2. POST /deployments/secrets (Create secret)
 * 3. GET /deployments/secrets/:id (Retrieve secret)
 * 4. PATCH /deployments/secrets/:id (Update secret)
 * 5. DELETE /deployments/secrets/:id (Delete secret)
 */
import assert from 'assert';
import {
  llmListSecrets,
  llmCreateSecret,
  llmGetSecret,
  llmUpdateSecret,
  llmDeleteSecret,
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

async function runSecretsTestSuite() {
  console.log('🧪 Testing Together.ai Deployment Secrets Suite (5 Endpoints)...\n');

  // 1. POST /deployments/secrets (Create secret)
  console.log('[Test 1] Create Secret (POST /deployments/secrets)...');
  const createPayload = {
    name: 'TEST_API_KEY',
    value: 'sk-sovereign-liberty-test-token-12345',
    description: 'Test API Key for Sovereign Deployments',
  };

  const createdSec = await llmCreateSecret(createPayload);
  assert.ok(createdSec.id, 'Created secret must have an id');
  assert.strictEqual(createdSec.object, 'secret');
  assert.strictEqual(createdSec.name, 'TEST_API_KEY');
  console.log(`✅ Service: Created secret ID = ${createdSec.id} (name: ${createdSec.name})`);

  const testSecId = createdSec.id;

  const resGatewayCreate = mockRes();
  await InferenceGateway.handleCreateSecret({ body: createPayload }, resGatewayCreate);
  assert.strictEqual(resGatewayCreate.statusCode, 200);
  assert.ok(resGatewayCreate.body.id);
  assert.strictEqual(resGatewayCreate.body.object, 'secret');
  console.log(`✅ Gateway: POST /deployments/secrets handled successfully.`);

  // 2. GET /deployments/secrets (List secrets)
  console.log('\n[Test 2] List Secrets (GET /deployments/secrets)...');
  const listedSecs = await llmListSecrets({});
  assert.strictEqual(listedSecs.object, 'list');
  assert.ok(Array.isArray(listedSecs.data), 'Listed secrets must contain data array');
  assert.ok(listedSecs.data.length > 0, 'Should return at least 1 secret');
  console.log(`✅ Service: Listed ${listedSecs.data.length} secrets (e.g. ${listedSecs.data[0].id || listedSecs.data[0].name})`);

  const resGatewayList = mockRes();
  await InferenceGateway.handleListSecrets({ query: {} }, resGatewayList);
  assert.strictEqual(resGatewayList.statusCode, 200);
  assert.strictEqual(resGatewayList.body.object, 'list');
  assert.ok(Array.isArray(resGatewayList.body.data));
  console.log(`✅ Gateway: GET /deployments/secrets handled successfully.`);

  // 3. GET /deployments/secrets/:id (Retrieve secret)
  console.log('\n[Test 3] Retrieve Secret (GET /deployments/secrets/:id)...');
  const retrievedSec = await llmGetSecret(testSecId);
  assert.strictEqual(retrievedSec.id, testSecId);
  assert.strictEqual(retrievedSec.object, 'secret');
  console.log(`✅ Service: Retrieved secret ${testSecId} (name: ${retrievedSec.name})`);

  const resGatewayGet = mockRes();
  await InferenceGateway.handleGetSecret({ params: { id: testSecId } }, resGatewayGet);
  assert.strictEqual(resGatewayGet.statusCode, 200);
  assert.strictEqual(resGatewayGet.body.id, testSecId);
  console.log(`✅ Gateway: GET /deployments/secrets/:id handled successfully.`);

  // 4. PATCH /deployments/secrets/:id (Update secret)
  console.log('\n[Test 4] Update Secret (PATCH /deployments/secrets/:id)...');
  const updatePayload = {
    value: 'sk-sovereign-updated-token-67890',
    description: 'Updated test API key on Liberty Center One',
  };
  const updatedSec = await llmUpdateSecret(testSecId, updatePayload);
  assert.strictEqual(updatedSec.id, testSecId);
  assert.strictEqual(updatedSec.object, 'secret');
  console.log(`✅ Service: Updated secret ${testSecId}`);

  const resGatewayUpdate = mockRes();
  await InferenceGateway.handleUpdateSecret(
    { params: { id: testSecId }, body: updatePayload },
    resGatewayUpdate,
  );
  assert.strictEqual(resGatewayUpdate.statusCode, 200);
  assert.strictEqual(resGatewayUpdate.body.id, testSecId);
  console.log(`✅ Gateway: PATCH /deployments/secrets/:id handled successfully.`);

  // 5. DELETE /deployments/secrets/:id (Delete secret)
  console.log('\n[Test 5] Delete Secret (DELETE /deployments/secrets/:id)...');
  const deletedSec = await llmDeleteSecret(testSecId);
  assert.ok(deletedSec.deleted === true || deletedSec.id === testSecId);
  console.log(`✅ Service: Deleted secret ${testSecId}`);

  const resGatewayDelete = mockRes();
  await InferenceGateway.handleDeleteSecret({ params: { id: testSecId } }, resGatewayDelete);
  assert.strictEqual(resGatewayDelete.statusCode, 200);
  assert.ok(resGatewayDelete.body.deleted === true || resGatewayDelete.body.id === testSecId);
  console.log(`✅ Gateway: DELETE /deployments/secrets/:id handled successfully.`);

  // 6. Router Stack Verification for Secrets
  console.log('\n[Test 6] Verifying Express Router Stack for Secret Paths...');
  const routes = [];
  router.stack.forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    }
  });

  const requiredRoutes = [
    { path: '/deployments/secrets', method: 'GET' },
    { path: '/v1/deployments/secrets', method: 'GET' },
    { path: '/deployments/secrets', method: 'POST' },
    { path: '/v1/deployments/secrets', method: 'POST' },
    { path: '/deployments/secrets/:id', method: 'GET' },
    { path: '/v1/deployments/secrets/:id', method: 'GET' },
    { path: '/deployments/secrets/:id', method: 'PATCH' },
    { path: '/v1/deployments/secrets/:id', method: 'PATCH' },
    { path: '/deployments/secrets/:id', method: 'PUT' },
    { path: '/v1/deployments/secrets/:id', method: 'PUT' },
    { path: '/deployments/secrets/:id', method: 'POST' },
    { path: '/v1/deployments/secrets/:id', method: 'POST' },
    { path: '/deployments/secrets/:id', method: 'DELETE' },
    { path: '/v1/deployments/secrets/:id', method: 'DELETE' },
  ];

  for (const reqRoute of requiredRoutes) {
    const match = routes.find(
      (r) => r.path === reqRoute.path && r.methods.includes(reqRoute.method),
    );
    assert.ok(match, `Route ${reqRoute.method} ${reqRoute.path} must be registered in router stack`);
  }
  console.log(`✅ Router: All ${requiredRoutes.length} required secret routes registered properly in inferenceRoutes.`);

  console.log('\n🎉 ALL 5 TOGETHER.AI DEPLOYMENT SECRETS ENDPOINTS VERIFIED & WORKING!\n');
}

runSecretsTestSuite().catch((err) => {
  console.error('❌ Secrets Test Suite Failed:', err);
  process.exit(1);
});
