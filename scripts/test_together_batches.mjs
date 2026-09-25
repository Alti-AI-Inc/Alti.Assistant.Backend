/**
 * Dedicated Test Suite for Together.ai Batches API
 * References:
 * - https://docs.together.ai/reference/batch-create
 * - https://docs.together.ai/reference/batch-list
 * - https://docs.together.ai/reference/batch-get
 * - https://docs.together.ai/reference/batch-cancel
 * License: MIT
 */
import assert from 'assert';
import {
  llmCreateBatch,
  llmListBatches,
  llmGetBatch,
  llmCancelBatch,
} from '../src/app/services/llm.client.js';
import { InferenceGateway } from '../src/app/modules/inference/inference.gateway.js';

function mockRes() {
  const res = {
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
  return res;
}

console.log('🧪 Testing Together.ai Batches API Suite...\n');

// Test 1: Batch Create (POST /batches & POST /v1/batches)
console.log('[Test 1] Batch Create (POST /batches)...');
const newBatch = await llmCreateBatch({
  input_file_id: 'file-batch-test-001',
  endpoint: '/v1/chat/completions',
  completion_window: '24h',
  metadata: { project: 'aphura-batch-test' },
});
assert.ok(newBatch.id, 'Expected batch ID');
assert.strictEqual(newBatch.object, 'batch');
assert.strictEqual(newBatch.input_file_id, 'file-batch-test-001');
assert.strictEqual(newBatch.endpoint, '/v1/chat/completions');
console.log(`✅ Test 1 Passed: Created batch ID = ${newBatch.id} (status: ${newBatch.status})`);

// Test 2: Batch List (GET /batches & GET /v1/batches)
console.log('[Test 2] Batch List (GET /batches)...');
const batchList = await llmListBatches();
assert.ok(batchList.object === 'list', 'Expected object: list');
assert.ok(Array.isArray(batchList.data), 'Expected data array');
assert.ok(batchList.data.length > 0, 'Expected at least 1 batch in list');
console.log(`✅ Test 2 Passed: Retrieved ${batchList.data.length} batches from list.`);

// Test 3: Batch Get (GET /batches/:id & GET /v1/batches/:id)
console.log('[Test 3] Batch Retrieve (GET /batches/:id)...');
const retrieved = await llmGetBatch(newBatch.id);
assert.strictEqual(retrieved.id, newBatch.id);
assert.strictEqual(retrieved.object, 'batch');
console.log(`✅ Test 3 Passed: Successfully retrieved batch details for ${retrieved.id}`);

// Test 4: Batch Cancel (POST /batches/:id/cancel & POST /v1/batches/:id/cancel)
console.log('[Test 4] Batch Cancel (POST /batches/:id/cancel)...');
const cancelled = await llmCancelBatch(newBatch.id);
assert.strictEqual(cancelled.id, newBatch.id);
assert.ok(['cancelled', 'cancelling'].includes(cancelled.status));
console.log(`✅ Test 4 Passed: Batch cancelled successfully (${cancelled.status})`);

// Test 5: InferenceGateway Handlers End-to-End
console.log('[Test 5] InferenceGateway batch lifecycle handlers...');
const resCreate = mockRes();
await InferenceGateway.handleCreateBatch(
  {
    body: {
      input_file_id: 'file-gateway-test-123',
      endpoint: '/v1/completions',
    },
  },
  resCreate
);
assert.strictEqual(resCreate.statusCode, 200);
assert.ok(resCreate.body.id);

const resList = mockRes();
await InferenceGateway.handleListBatches({ query: { limit: 5 } }, resList);
assert.strictEqual(resList.statusCode, 200);
assert.ok(Array.isArray(resList.body.data));

const resGet = mockRes();
await InferenceGateway.handleGetBatch({ params: { id: resCreate.body.id } }, resGet);
assert.strictEqual(resGet.statusCode, 200);
assert.strictEqual(resGet.body.id, resCreate.body.id);

const resCancel = mockRes();
await InferenceGateway.handleCancelBatch({ params: { id: resCreate.body.id } }, resCancel);
assert.strictEqual(resCancel.statusCode, 200);
console.log('✅ Test 5 Passed: Gateway batch lifecycle handlers verified.');

// Test 6: Validation Errors Handling
console.log('[Test 6] Validation error handling...');
const resErr1 = mockRes();
await InferenceGateway.handleCreateBatch({ body: { endpoint: '/v1/chat/completions' } }, resErr1);
assert.strictEqual(resErr1.statusCode, 400);
assert.strictEqual(resErr1.body.error.param, 'input_file_id');

const resErr2 = mockRes();
await InferenceGateway.handleCreateBatch({ body: { input_file_id: 'file-123' } }, resErr2);
assert.strictEqual(resErr2.statusCode, 400);
assert.strictEqual(resErr2.body.error.param, 'endpoint');
console.log('✅ Test 6 Passed: Parameter validation rejected missing fields with 400.');

console.log('\n🎉 ALL 6 TOGETHER.AI BATCHES API TESTS PASSED CLEANLY!\n');
