/**
 * Test Suite for Together.ai Billing Usage
 * Verifies both Service Layer and Gateway Layer with Sovereign Fallback
 * 
 * Endpoints:
 * 1. GET /billing/usage
 * 2. GET /v1/billing/usage
 */
import assert from 'assert';
import { llmGetBillingUsage } from '../src/app/services/llm.client.js';
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

async function runBillingTestSuite() {
  console.log('🧪 Testing Together.ai Billing Usage Endpoint...\n');

  // 1. Service Layer Test
  console.log('[Test 1] Service: llmGetBillingUsage()...');
  const report = await llmGetBillingUsage({ month: '2026-06', granularity: 'day' });
  assert.strictEqual(report.object, 'list');
  assert.ok(report.organization_id, 'Must contain organization_id');
  assert.ok(report.billing_period, 'Must contain billing_period');
  assert.ok(Array.isArray(report.data), 'data must be an array of time windows');
  assert.ok(report.data.length > 0, 'data must have at least 1 time window');
  assert.ok(Array.isArray(report.data[0].line_items), 'line_items must be an array');
  assert.ok(report.data[0].line_items.length > 0, 'Must contain line items');
  console.log(`✅ Service: Retrieved billing report for period ${report.billing_period} (windows: ${report.data.length}, line items: ${report.data[0].line_items.length})`);

  // 2. Gateway Layer Test
  console.log('\n[Test 2] Gateway: InferenceGateway.handleGetBillingUsage()...');
  const resGateway = mockRes();
  await InferenceGateway.handleGetBillingUsage(
    { query: { month: '2026-06', granularity: 'day' } },
    resGateway,
  );
  assert.strictEqual(resGateway.statusCode, 200);
  assert.strictEqual(resGateway.body.object, 'list');
  assert.ok(Array.isArray(resGateway.body.data));
  console.log(`✅ Gateway: GET /billing/usage handled successfully.`);

  // 3. Router Stack Verification
  console.log('\n[Test 3] Verifying Express Router Stack for /billing/usage and /v1/billing/usage...');
  const routes = [];
  router.stack.forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    }
  });

  const requiredRoutes = [
    { path: '/billing/usage', method: 'GET' },
    { path: '/v1/billing/usage', method: 'GET' },
  ];

  for (const reqRoute of requiredRoutes) {
    const match = routes.find(
      (r) => r.path === reqRoute.path && r.methods.includes(reqRoute.method),
    );
    assert.ok(match, `Route ${reqRoute.method} ${reqRoute.path} must be registered in router stack`);
  }
  console.log(`✅ Router: Both /billing/usage and /v1/billing/usage routes registered properly in inferenceRoutes.`);

  console.log('\n🎉 TOGETHER.AI BILLING USAGE ENDPOINT VERIFIED & WORKING!\n');
}

runBillingTestSuite().catch((err) => {
  console.error('❌ Billing Test Suite Failed:', err);
  process.exit(1);
});
