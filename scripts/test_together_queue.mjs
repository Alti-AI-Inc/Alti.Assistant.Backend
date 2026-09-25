/**
 * Test Suite for Together.ai Queue Suite (5 Endpoints)
 * Verifies both Service Layer and Gateway Layer with Sovereign Fallback
 * 
 * Endpoints:
 * 1. POST /queue/submit (Submit queued job)
 * 2. GET /queue/status (Poll job status)
 * 3. POST /queue/cancel (Cancel queued job)
 * 4. POST /queue/clear (Clear model queue)
 * 5. GET /queue/metrics (Get queue metrics)
 */
import assert from 'assert';
import {
  llmSubmitQueueJob,
  llmGetQueueJobStatus,
  llmCancelQueueJob,
  llmClearQueue,
  llmGetQueueMetrics,
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

async function runQueueTestSuite() {
  console.log('🧪 Testing Together.ai Queue Suite (5 Endpoints)...\n');

  const testModel = 'deepseek-ai/DeepSeek-V3';

  // 1. POST /queue/submit (Submit queued job)
  console.log('[Test 1] Submit Queued Job (POST /queue/submit)...');
  const submitPayload = {
    model: testModel,
    priority: 10,
    payload: {
      prompt: 'Synthesize optimal GPU scheduling plan for Liberty Center One',
      temperature: 0.7,
      max_tokens: 500,
    },
    info: {
      client: 'aphura-sovereign-frontend',
      cluster: 'liberty-cluster-01',
    },
  };

  const submitRes = await llmSubmitQueueJob(submitPayload);
  const reqId = submitRes.requestId || submitRes.request_id;
  assert.ok(reqId, 'Job submission must return a request identifier');
  console.log(`✅ Service: Submitted queue job ID = ${reqId} for model ${submitPayload.model}`);

  const resGatewaySubmit = mockRes();
  await InferenceGateway.handleSubmitQueueJob({ body: submitPayload }, resGatewaySubmit);
  assert.strictEqual(resGatewaySubmit.statusCode, 200);
  assert.ok(resGatewaySubmit.body.requestId || resGatewaySubmit.body.request_id);
  console.log(`✅ Gateway: POST /queue/submit handled successfully.`);

  // 2. GET /queue/status (Poll job status)
  console.log('\n[Test 2] Get Queue Job Status (GET /queue/status)...');
  const statusRes = await llmGetQueueJobStatus({ request_id: reqId, model: testModel });
  assert.ok(statusRes.status, 'Status response must contain status field');
  console.log(`✅ Service: Retrieved queue status for job ${reqId}: ${statusRes.status}`);

  const resGatewayStatus = mockRes();
  await InferenceGateway.handleGetQueueJobStatus(
    { query: { request_id: reqId, model: testModel } },
    resGatewayStatus,
  );
  assert.strictEqual(resGatewayStatus.statusCode, 200);
  assert.ok(resGatewayStatus.body.status);
  console.log(`✅ Gateway: GET /queue/status handled successfully.`);

  // 3. POST /queue/cancel (Cancel queued job)
  console.log('\n[Test 3] Cancel Queued Job (POST /queue/cancel)...');
  const cancelPayload = {
    request_id: reqId,
    model: testModel,
  };
  const cancelRes = await llmCancelQueueJob(cancelPayload);
  assert.ok(cancelRes.status);
  console.log(`✅ Service: Cancelled queue job ${reqId} (status: ${cancelRes.status})`);

  const resGatewayCancel = mockRes();
  await InferenceGateway.handleCancelQueueJob({ body: cancelPayload }, resGatewayCancel);
  assert.strictEqual(resGatewayCancel.statusCode, 200);
  assert.ok(resGatewayCancel.body.status);
  console.log(`✅ Gateway: POST /queue/cancel handled successfully.`);

  // 4. POST /queue/clear (Clear model queue)
  console.log('\n[Test 4] Clear Model Queue (POST /queue/clear)...');
  const clearPayload = { model: testModel };
  const clearRes = await llmClearQueue(clearPayload);
  assert.ok(typeof clearRes.canceled_count === 'number');
  console.log(`✅ Service: Cleared model queue for ${testModel} (canceled_count: ${clearRes.canceled_count})`);

  const resGatewayClear = mockRes();
  await InferenceGateway.handleClearQueue({ body: clearPayload }, resGatewayClear);
  assert.strictEqual(resGatewayClear.statusCode, 200);
  assert.ok(typeof resGatewayClear.body.canceled_count === 'number');
  console.log(`✅ Gateway: POST /queue/clear handled successfully.`);

  // 5. GET /queue/metrics (Get queue metrics)
  console.log('\n[Test 5] Get Queue Metrics (GET /queue/metrics)...');
  const metricsRes = await llmGetQueueMetrics({ model: testModel });
  assert.ok(typeof metricsRes.messages_running === 'number');
  assert.ok(typeof metricsRes.messages_waiting === 'number');
  assert.ok(typeof metricsRes.total_jobs === 'number');
  console.log(`✅ Service: Queue metrics for ${testModel}: waiting=${metricsRes.messages_waiting}, running=${metricsRes.messages_running}, total=${metricsRes.total_jobs}`);

  const resGatewayMetrics = mockRes();
  await InferenceGateway.handleGetQueueMetrics({ query: { model: testModel } }, resGatewayMetrics);
  assert.strictEqual(resGatewayMetrics.statusCode, 200);
  assert.ok(typeof resGatewayMetrics.body.total_jobs === 'number');
  console.log(`✅ Gateway: GET /queue/metrics handled successfully.`);

  // 6. Router Stack Verification
  console.log('\n[Test 6] Verifying Express Router Stack for Queue Paths...');
  const routes = [];
  router.stack.forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    }
  });

  const requiredRoutes = [
    { path: '/queue/submit', method: 'POST' },
    { path: '/v1/queue/submit', method: 'POST' },
    { path: '/queue/status', method: 'GET' },
    { path: '/v1/queue/status', method: 'GET' },
    { path: '/queue/cancel', method: 'POST' },
    { path: '/v1/queue/cancel', method: 'POST' },
    { path: '/queue/clear', method: 'POST' },
    { path: '/v1/queue/clear', method: 'POST' },
    { path: '/queue/metrics', method: 'GET' },
    { path: '/v1/queue/metrics', method: 'GET' },
  ];

  for (const reqRoute of requiredRoutes) {
    const match = routes.find(
      (r) => r.path === reqRoute.path && r.methods.includes(reqRoute.method),
    );
    assert.ok(match, `Route ${reqRoute.method} ${reqRoute.path} must be registered in router stack`);
  }
  console.log(`✅ Router: All ${requiredRoutes.length} required queue routes registered properly in inferenceRoutes.`);

  console.log('\n🎉 ALL 5 TOGETHER.AI QUEUE ENDPOINTS VERIFIED & WORKING!\n');
}

runQueueTestSuite().catch((err) => {
  console.error('❌ Queue Test Suite Failed:', err);
  process.exit(1);
});
