/**
 * Dedicated Test Suite for the Complete Together.ai Fine-Tuning Suite (12 Endpoints)
 * References:
 * - https://docs.together.ai/reference/post-fine-tunes
 * - https://docs.together.ai/reference/post-fine-tunes-estimate-price
 * - https://docs.together.ai/reference/get-fine-tunes
 * - https://docs.together.ai/reference/get-fine-tunes-id
 * - https://docs.together.ai/reference/get-fine-tunes-id-events
 * - https://docs.together.ai/reference/get-fine-tunes-id-checkpoint
 * - https://docs.together.ai/reference/get-fine-tunes-id-metrics
 * - https://docs.together.ai/reference/get-fine-tunes-id-download-tokenized-dataset
 * - https://docs.together.ai/reference/get-finetune-download
 * - https://docs.together.ai/reference/post-fine-tunes-id-cancel
 * - https://docs.together.ai/reference/delete-fine-tunes-id
 * - https://docs.together.ai/reference/get-fine-tunes-models-limits
 * License: MIT
 */
import assert from 'assert';
import {
  llmCreateFineTune,
  llmEstimateFineTunePrice,
  llmListFineTunes,
  llmGetFineTune,
  llmListFineTuneEvents,
  llmListFineTuneCheckpoints,
  llmGetFineTuneMetrics,
  llmDownloadTokenizedDataset,
  llmDownloadFineTune,
  llmCancelFineTune,
  llmDeleteFineTune,
  llmGetModelLimits,
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

console.log('🧪 Testing Complete Together.ai Fine-Tuning 12-Endpoint Suite...\n');

// 1. POST /fine-tunes (Create Fine-Tune)
console.log('[Test 1] Create Fine-Tune (POST /fine-tunes)...');
const job = await llmCreateFineTune({
  training_file: 'file-train-001',
  model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  n_epochs: 3,
  batch_size: 4,
  learning_rate: 0.0001,
});
assert.ok(job.id, 'Expected job ID');
assert.ok(job.status);
console.log(`✅ Test 1 Passed: Fine-tune created (id: ${job.id})`);

// 2. POST /fine-tunes/estimate-price
console.log('[Test 2] Estimate Fine-Tune Price (POST /fine-tunes/estimate-price)...');
const price = await llmEstimateFineTunePrice({
  model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  training_file: 'file-train-001',
  token_count: 500000,
});
assert.ok(price.estimated_cost_usd !== undefined, 'Expected estimated cost in USD');
console.log(`✅ Test 2 Passed: Price estimated = $${price.estimated_cost_usd}`);

// 3. GET /fine-tunes (List Fine-Tunes)
console.log('[Test 3] List Fine-Tunes (GET /fine-tunes)...');
const list = await llmListFineTunes();
assert.ok(Array.isArray(list.data || list), 'Expected fine-tune list array');
console.log('✅ Test 3 Passed: Fine-tunes listed.');

// 4. GET /fine-tunes/:id (Retrieve Fine-Tune)
console.log('[Test 4] Retrieve Fine-Tune (GET /fine-tunes/:id)...');
const retrieved = await llmGetFineTune(job.id);
assert.strictEqual(retrieved.id, job.id);
console.log(`✅ Test 4 Passed: Retrieved fine-tune ${retrieved.id}`);

// 5. GET /fine-tunes/:id/events
console.log('[Test 5] List Events (GET /fine-tunes/:id/events)...');
const events = await llmListFineTuneEvents(job.id);
assert.ok(Array.isArray(events.data), 'Expected events array');
console.log(`✅ Test 5 Passed: Events retrieved (${events.data.length} events).`);

// 6. GET /fine-tunes/:id/checkpoints (or /checkpoint)
console.log('[Test 6] List Checkpoints (GET /fine-tunes/:id/checkpoints)...');
const checkpoints = await llmListFineTuneCheckpoints(job.id);
assert.ok(Array.isArray(checkpoints.data), 'Expected checkpoints array');
console.log(`✅ Test 6 Passed: Checkpoints retrieved (${checkpoints.data.length} checkpoints).`);

// 7. GET /fine-tunes/:id/metrics
console.log('[Test 7] Retrieve Metrics (GET /fine-tunes/:id/metrics)...');
const metrics = await llmGetFineTuneMetrics(job.id);
assert.ok(metrics && (metrics.metrics || metrics.data || metrics.id));
console.log('✅ Test 7 Passed: Metrics retrieved.');

// 8. GET /fine-tunes/:id/download-tokenized-dataset
console.log('[Test 8] Download Tokenized Dataset (GET /fine-tunes/:id/download-tokenized-dataset)...');
const tokenized = await llmDownloadTokenizedDataset(job.id);
assert.ok(tokenized && tokenized.id === job.id);
console.log('✅ Test 8 Passed: Tokenized dataset info retrieved.');

// 9. GET /fine-tunes/:id/download
console.log('[Test 9] Download Model Adapter (GET /fine-tunes/:id/download)...');
const download = await llmDownloadFineTune(job.id);
assert.ok(download && download.id === job.id);
console.log('✅ Test 9 Passed: Download artifact details verified.');

// 10. POST /fine-tunes/:id/cancel
console.log('[Test 10] Cancel Fine-Tune (POST /fine-tunes/:id/cancel)...');
const cancelled = await llmCancelFineTune(job.id);
assert.strictEqual(cancelled.id, job.id);
assert.ok(['cancelled', 'cancelling'].includes(cancelled.status));
console.log('✅ Test 10 Passed: Cancel fine-tune job succeeded.');

// 11. DELETE /fine-tunes/:id
console.log('[Test 11] Delete Fine-Tune (DELETE /fine-tunes/:id)...');
const deleted = await llmDeleteFineTune(job.id);
assert.strictEqual(deleted.id, job.id);
assert.strictEqual(deleted.deleted, true);
console.log('✅ Test 11 Passed: Delete fine-tune job succeeded.');

// 12. GET /fine-tunes/models/limits
console.log('[Test 12] Model Limits (GET /fine-tunes/models/limits)...');
const limits = await llmGetModelLimits('meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo');
assert.ok(limits.max_context_length > 0);
assert.ok(limits.max_batch_size > 0);
console.log(`✅ Test 12 Passed: Max context length = ${limits.max_context_length}, max batch size = ${limits.max_batch_size}`);

// Gateway End-to-End Handlers Verification
console.log('\n[Test 13] InferenceGateway handlers end-to-end...');
const gResPrice = mockRes();
await InferenceGateway.handleEstimateFineTunePrice({ body: { model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' } }, gResPrice);
assert.strictEqual(gResPrice.statusCode, 200);

const gResLimits = mockRes();
await InferenceGateway.handleGetFineTuneModelLimits({ params: { model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' } }, gResLimits);
assert.strictEqual(gResLimits.statusCode, 200);

const gResDownload = mockRes();
await InferenceGateway.handleDownloadFineTune({ params: { id: job.id } }, gResDownload);
assert.strictEqual(gResDownload.statusCode, 200);

const gResDelete = mockRes();
await InferenceGateway.handleDeleteFineTune({ params: { id: job.id } }, gResDelete);
assert.strictEqual(gResDelete.statusCode, 200);
console.log('✅ Test 13 Passed: Gateway handlers end-to-end verified.');

console.log('\n🎉 ALL 12 TOGETHER.AI FINE-TUNING SUITE TESTS PASSED CLEANLY!\n');
