/**
 * Test Suite for Together.ai Account & Identity (whoami)
 * Verifies both Service Layer and Gateway Layer with Sovereign Fallback
 * 
 * Endpoints:
 * 1. GET /whoami
 * 2. GET /v1/whoami
 */
import assert from 'assert';
import { llmWhoami } from '../src/app/services/llm.client.js';
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

async function runWhoamiTestSuite() {
  console.log('🧪 Testing Together.ai Account & Identity (whoami)...\n');

  // 1. Service Layer Test
  console.log('[Test 1] Service: llmWhoami()...');
  const serviceIdentity = await llmWhoami();
  assert.ok(serviceIdentity.api_key_id, 'Must contain api_key_id');
  assert.ok(serviceIdentity.project_id, 'Must contain project_id');
  assert.ok(serviceIdentity.project_name, 'Must contain project_name');
  assert.ok(serviceIdentity.project_slug, 'Must contain project_slug');
  assert.ok(serviceIdentity.organization_id, 'Must contain organization_id');
  assert.ok(serviceIdentity.organization_name, 'Must contain organization_name');
  console.log(`✅ Service: Retrieved identity: project=${serviceIdentity.project_name} (${serviceIdentity.project_slug}), org=${serviceIdentity.organization_name}`);

  // 2. Gateway Layer Test
  console.log('\n[Test 2] Gateway: InferenceGateway.handleWhoami()...');
  const resGateway = mockRes();
  await InferenceGateway.handleWhoami({}, resGateway);
  assert.strictEqual(resGateway.statusCode, 200);
  assert.ok(resGateway.body.api_key_id);
  assert.ok(resGateway.body.project_slug);
  console.log(`✅ Gateway: GET /whoami handled successfully.`);

  // 3. Router Stack Verification
  console.log('\n[Test 3] Verifying Express Router Stack for /whoami and /v1/whoami...');
  const routes = [];
  router.stack.forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    }
  });

  const requiredRoutes = [
    { path: '/whoami', method: 'GET' },
    { path: '/v1/whoami', method: 'GET' },
  ];

  for (const reqRoute of requiredRoutes) {
    const match = routes.find(
      (r) => r.path === reqRoute.path && r.methods.includes(reqRoute.method),
    );
    assert.ok(match, `Route ${reqRoute.method} ${reqRoute.path} must be registered in router stack`);
  }
  console.log(`✅ Router: Both /whoami and /v1/whoami routes registered properly in inferenceRoutes.`);

  console.log('\n🎉 TOGETHER.AI WHOAMI ENDPOINT VERIFIED & WORKING!\n');
}

runWhoamiTestSuite().catch((err) => {
  console.error('❌ Whoami Test Suite Failed:', err);
  process.exit(1);
});
