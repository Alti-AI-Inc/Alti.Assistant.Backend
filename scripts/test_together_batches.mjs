/**
 * Comprehensive Verification Test for Together.ai Batch Inference Suite
 * Covers:
 * 1. Overview & Rate Limits: https://docs.together.ai/docs/inference/batch/overview
 * 2. Tutorial & Workflows:   https://docs.together.ai/docs/inference/batch/tutorial
 * 3. Manage Jobs Reference:  https://docs.together.ai/docs/inference/batch/manage
 * 
 * License: MIT
 */

import assert from 'assert';
import {
  BATCH_LIMITS,
  BATCH_SUPPORTED_ENDPOINTS,
  BATCH_DISCOUNTED_MODELS,
  BATCH_STATUSES,
  getBatchOverview,
  getBatchTutorialDocs,
  getBatchManageDocs,
  validateBatchRequest,
  validateBatchJsonlLine,
  validateBatchInputDataset,
  createBatchJob,
  getBatchJob,
  listBatchJobs,
  cancelBatchJob,
} from '../src/app/services/together.batches.js';
import { executeTogetherCliCommand } from '../src/app/services/together.cli.js';
import InferenceGateway from '../src/app/modules/inference/inference.gateway.js';
import { inferenceRoutes } from '../src/app/modules/inference/inference.route.js';

console.log('🧪 Starting Together.ai Batch Inference Suite Verification...\n');

// ── 1. Batch Overview, Rate Limits, and Discounted Models ────────────────────
console.log('1️⃣ Testing Batch Overview, Rate Limits, and 50% Discounts...');
const overview = getBatchOverview();
assert.strictEqual(overview.success, true);
assert.strictEqual(overview.agent_skill, 'together-batch-inference');
assert.strictEqual(overview.rate_limits.max_requests_per_batch, 50000);
assert.strictEqual(overview.rate_limits.max_input_file_size_mb, 100);
assert.strictEqual(overview.rate_limits.max_line_size_mb, 10);
assert.strictEqual(overview.rate_limits.max_enqueued_tokens_per_model, 30000000000);
assert.strictEqual(overview.rate_limits.completion_window_hours, 24);

// Verify discounted models (50% off Llama 3.3 70B & Whisper Large v3)
const llamaDiscounted = overview.discounted_models.find(m => m.id === 'meta-llama/Llama-3.3-70B-Instruct-Turbo');
const whisperDiscounted = overview.discounted_models.find(m => m.id === 'openai/whisper-large-v3');
assert.ok(llamaDiscounted, 'Expected Llama 3.3 70B in discounted models');
assert.ok(whisperDiscounted, 'Expected Whisper Large v3 in discounted models');
assert(llamaDiscounted.discount.includes('50%'));
assert(whisperDiscounted.discount.includes('50%'));
console.log('   ✅ Overview, rate limits (50k requests, 100MB, 10MB/line, 30B tokens, 24h window), and 50% discount models verified.');

// ── 2. Batch Tutorial & 5-Step Workflow ──────────────────────────────────────
console.log('\n2️⃣ Testing Batch Tutorial, 5-Step Workflow, and Audio Batch Requirements...');
const tutorial = getBatchTutorialDocs();
assert.strictEqual(tutorial.success, true);
assert.strictEqual(tutorial.workflow_steps.length, 5);
assert.strictEqual(tutorial.workflow_steps[0].action, 'Prepare JSONL input file');
assert.strictEqual(tutorial.workflow_steps[1].action, 'Upload file');
assert.strictEqual(tutorial.workflow_steps[2].action, 'Create batch');
assert.strictEqual(tutorial.workflow_steps[3].action, 'Poll for completion');
assert.strictEqual(tutorial.workflow_steps[4].action, 'Retrieve results');

// Code snippets & Audio Batch format
assert(tutorial.code_snippets.cli_submit.includes('--api chat.completions'));
assert(tutorial.code_snippets.audio_batch_jsonl.includes('"method": "FILE"'));
assert(tutorial.code_snippets.audio_batch_jsonl.includes('openai/whisper-large-v3'));
assert(tutorial.code_snippets.python_end_to_end.includes('purpose="batch-api"'));
console.log('   ✅ 5-step tutorial workflow and audio batch method="FILE" requirement verified.');

// ── 3. Manage Reference, Statuses, and Error Codes ───────────────────────────
console.log('\n3️⃣ Testing Batch Manage Reference, Status Transitions, and Error Codes...');
const manageDocs = getBatchManageDocs();
assert.strictEqual(manageDocs.success, true);
assert.ok(manageDocs.endpoints.create_batch);
assert.ok(manageDocs.endpoints.retrieve_batch);
assert.ok(manageDocs.endpoints.cancel_batch);
assert.ok(manageDocs.endpoints.list_batches);

// Statuses
assert.ok(BATCH_STATUSES.VALIDATING);
assert.ok(BATCH_STATUSES.IN_PROGRESS);
assert.ok(BATCH_STATUSES.COMPLETED);
assert.ok(BATCH_STATUSES.FAILED);
assert.ok(BATCH_STATUSES.EXPIRED);
assert.ok(BATCH_STATUSES.CANCELLED);

// Error code reference: 400, 401, 404, 429, 500
const errorCodes = manageDocs.error_codes.map(e => e.code);
[400, 401, 404, 429, 500].forEach(code => {
  assert(errorCodes.includes(code), `Expected error code ${code} in manage reference`);
});
assert(manageDocs.error_file_format.schema.includes('custom_id'));
console.log('   ✅ Endpoints, lifecycle statuses, error codes (400, 401, 404, 429, 500), and error file schema verified.');

// ── 4. Batch Creation Request Validation ─────────────────────────────────────
console.log('\n4️⃣ Testing Batch Creation Request Validation...');
// Valid request
const validBatchReq = validateBatchRequest({
  input_file_id: 'file-batch-001',
  endpoint: '/v1/chat/completions',
});
assert.strictEqual(validBatchReq.valid, true);
assert.strictEqual(validBatchReq.errors.length, 0);

// Missing input_file_id
const missingFileReq = validateBatchRequest({
  endpoint: '/v1/chat/completions',
});
assert.strictEqual(missingFileReq.valid, false);
assert(missingFileReq.errors.some(e => e.includes('input_file_id')));

// Invalid endpoint
const invalidEndpointReq = validateBatchRequest({
  input_file_id: 'file-batch-002',
  endpoint: '/v1/unsupported_endpoint',
});
assert.strictEqual(invalidEndpointReq.valid, false);
assert(invalidEndpointReq.errors.some(e => e.includes('Invalid endpoint')));

// Completion window warning if non-24h
const windowReq = validateBatchRequest({
  input_file_id: 'file-batch-003',
  endpoint: '/v1/chat/completions',
  completion_window: '48h',
});
assert.strictEqual(windowReq.valid, true);
assert(windowReq.warnings.length > 0);
console.log('   ✅ Batch request parameter validation verified (required fields, endpoints, completion window).');

// ── 5. Batch JSONL Single Line Validation ────────────────────────────────────
console.log('\n5️⃣ Testing Batch JSONL Single Line Validation...');
// Valid Chat Line
const validChatLine = validateBatchJsonlLine({
  custom_id: 'req-101',
  body: {
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    messages: [{ role: 'user', content: 'Classify sentiment' }],
    max_tokens: 4,
    temperature: 0,
  },
}, '/v1/chat/completions');
assert.strictEqual(validChatLine.valid, true);

// Invalid: custom_id > 64 chars
const longIdLine = validateBatchJsonlLine({
  custom_id: 'a'.repeat(65),
  body: { model: 'test' },
});
assert.strictEqual(longIdLine.valid, false);
assert(longIdLine.errors.some(e => e.includes('exceeds 64 characters')));

// Audio without method="FILE"
const invalidAudioLine = validateBatchJsonlLine({
  custom_id: 'audio-req-1',
  body: {
    file: 'https://example.com/audio.wav',
    model: 'openai/whisper-large-v3',
  },
}, '/v1/audio/transcriptions');
assert.strictEqual(invalidAudioLine.valid, false);
assert(invalidAudioLine.errors.some(e => e.includes('method": "FILE"')));

// Audio with method="FILE" and body.file
const validAudioLine = validateBatchJsonlLine({
  custom_id: 'audio-req-2',
  method: 'FILE',
  body: {
    file: 'https://example.com/audio.wav',
    model: 'openai/whisper-large-v3',
  },
}, '/v1/audio/transcriptions');
assert.strictEqual(validAudioLine.valid, true);
console.log('   ✅ JSONL line validation verified (custom_id length, audio method="FILE", body.file URL).');

// ── 6. Batch Dataset Validation (Duplicate custom_id & Sizing) ───────────────
console.log('\n6️⃣ Testing Batch Dataset Validation...');
// Valid dataset
const validDataset = validateBatchInputDataset([
  { custom_id: 'req-1', body: { model: 'm1' } },
  { custom_id: 'req-2', body: { model: 'm2' } },
], '/v1/chat/completions');
assert.strictEqual(validDataset.valid, true);
assert.strictEqual(validDataset.unique_ids, 2);

// Invalid: duplicate custom_id
const duplicateDataset = validateBatchInputDataset([
  { custom_id: 'dup-id-1', body: { model: 'm1' } },
  { custom_id: 'dup-id-1', body: { model: 'm2' } },
], '/v1/chat/completions');
assert.strictEqual(duplicateDataset.valid, false);
assert(duplicateDataset.errors.some(e => e.includes('Duplicate custom_id')));
console.log('   ✅ Dataset validation caught duplicates and enforced uniqueness across batch.');

// ── 7. Batch Job Creation & Dispatchers ──────────────────────────────────────
console.log('\n7️⃣ Testing Batch Job Lifecycle Dispatchers...');
const newBatchJob = await createBatchJob({
  input_file_id: 'file-test-suite-001',
  endpoint: '/v1/chat/completions',
});
assert.ok(newBatchJob.id);
assert.strictEqual(newBatchJob.object, 'batch');

const retrievedJob = await getBatchJob(newBatchJob.id);
assert.strictEqual(retrievedJob.id, newBatchJob.id);

const batchList = await listBatchJobs();
assert.ok(Array.isArray(batchList) || Array.isArray(batchList.data));

const cancelledJob = await cancelBatchJob(newBatchJob.id);
assert.strictEqual(cancelledJob.id, newBatchJob.id);
console.log(`   ✅ Batch lifecycle dispatchers verified: created (${newBatchJob.id}), retrieved, listed, and cancelled.`);

// ── 8. Inference Gateway Handlers End-to-End ─────────────────────────────────
console.log('\n8️⃣ Testing Inference Gateway Batch Handlers...');
function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

// Overview handler
const resOv = createMockRes();
await InferenceGateway.handleGetBatchOverview({}, resOv);
assert.strictEqual(resOv.statusCode, 200);
assert.strictEqual(resOv.body.agent_skill, 'together-batch-inference');

// Tutorial handler
const resTut = createMockRes();
await InferenceGateway.handleGetBatchTutorialDocs({}, resTut);
assert.strictEqual(resTut.statusCode, 200);
assert.strictEqual(resTut.body.workflow_steps.length, 5);

// Manage handler
const resMg = createMockRes();
await InferenceGateway.handleGetBatchManageDocs({}, resMg);
assert.strictEqual(resMg.statusCode, 200);
assert.ok(resMg.body.endpoints.create_batch);

// Validate request handler
const resValReq = createMockRes();
await InferenceGateway.handleValidateBatchRequest({ body: { input_file_id: 'f1', endpoint: '/v1/chat/completions' } }, resValReq);
assert.strictEqual(resValReq.statusCode, 200);
assert.strictEqual(resValReq.body.valid, true);

// Validate dataset handler
const resValDs = createMockRes();
await InferenceGateway.handleValidateBatchDataset({
  body: {
    records: [
      { custom_id: 'id-1', body: { model: 'm' } },
      { custom_id: 'id-1', body: { model: 'm' } },
    ],
  },
}, resValDs);
assert.strictEqual(resValDs.statusCode, 200);
assert.strictEqual(resValDs.body.valid, false);
console.log('   ✅ All 5 Inference Gateway batch handlers returned expected HTTP 200 responses.');

// ── 9. Express Dual Route Registrations ──────────────────────────────────────
console.log('\n9️⃣ Testing Dual Route Registrations in Inference Router...');
const registeredRoutes = inferenceRoutes.stack
  .filter(r => r.route)
  .map(r => ({
    path: r.route.path,
    method: Object.keys(r.route.methods)[0].toUpperCase(),
  }));

const expectedEndpoints = [
  { path: '/together/inference/batch/overview', method: 'GET' },
  { path: '/v1/together/inference/batch/overview', method: 'GET' },
  { path: '/together/batch/overview', method: 'GET' },
  { path: '/v1/together/batch/overview', method: 'GET' },
  { path: '/together/inference/batch/tutorial', method: 'GET' },
  { path: '/v1/together/inference/batch/tutorial', method: 'GET' },
  { path: '/together/batch/tutorial', method: 'GET' },
  { path: '/v1/together/batch/tutorial', method: 'GET' },
  { path: '/together/inference/batch/manage', method: 'GET' },
  { path: '/v1/together/inference/batch/manage', method: 'GET' },
  { path: '/together/batch/manage', method: 'GET' },
  { path: '/v1/together/batch/manage', method: 'GET' },
  { path: '/together/inference/batch/validate', method: 'POST' },
  { path: '/v1/together/inference/batch/validate', method: 'POST' },
  { path: '/together/batch/validate', method: 'POST' },
  { path: '/v1/together/batch/validate', method: 'POST' },
  { path: '/together/inference/batch/validate-dataset', method: 'POST' },
  { path: '/v1/together/inference/batch/validate-dataset', method: 'POST' },
  { path: '/together/batch/validate-dataset', method: 'POST' },
  { path: '/v1/together/batch/validate-dataset', method: 'POST' },
  { path: '/batches', method: 'POST' },
  { path: '/v1/batches', method: 'POST' },
  { path: '/batches', method: 'GET' },
  { path: '/v1/batches', method: 'GET' },
];

expectedEndpoints.forEach(expected => {
  const found = registeredRoutes.some(r => r.path === expected.path && r.method === expected.method);
  assert(found, `Expected route ${expected.method} ${expected.path} to be registered`);
});
console.log(`   ✅ Verified ${expectedEndpoints.length} dual-mounted batch routes in Express router.`);

// ── 10. Together Sovereign CLI Commands ──────────────────────────────────────
console.log('\n🔟 Testing Together Sovereign CLI Batch Commands...');
const cliOv = await executeTogetherCliCommand('together batches overview');
assert.strictEqual(cliOv.success, true);
assert(cliOv.output.includes('Together AI Batch Processing Overview'));
assert(cliOv.output.includes('50% Off'));

const cliTut = await executeTogetherCliCommand('tg batches tutorial');
assert.strictEqual(cliTut.success, true);
assert(cliTut.output.includes('Together AI Batch Processing Tutorial'));
assert(cliTut.output.includes('tg batches submit'));

const cliMg = await executeTogetherCliCommand('together batches manage');
assert.strictEqual(cliMg.success, true);
assert(cliMg.output.includes('Together AI Manage Batch Jobs Reference'));
assert(cliMg.output.includes('429: Rate limit exceeded'));

const cliVal = await executeTogetherCliCommand('together batches validate --input-file file-123 --api chat.completions');
assert.strictEqual(cliVal.success, true);
assert(cliVal.output.includes('Status: VALID ✅'));

const cliValDs = await executeTogetherCliCommand('tg batches validate-dataset --records \'[{"custom_id":"c1","body":{"model":"m1"}},{"custom_id":"c1","body":{"model":"m2"}}]\'');
assert.strictEqual(cliValDs.success, true);
assert(cliValDs.output.includes('Status: INVALID ❌'));
assert(cliValDs.output.includes('Duplicate custom_id'));

const cliSubmit = await executeTogetherCliCommand('together batches submit file-cli-batch --api chat.completions');
assert.strictEqual(cliSubmit.success, true);
assert(cliSubmit.output.includes('Batch submitted successfully'));

const cliList = await executeTogetherCliCommand('tg batches list');
assert.strictEqual(cliList.success, true);
assert(cliList.output.includes('BATCH ID'));

const cliGet = await executeTogetherCliCommand('together batches get batch_sov_001');
assert.strictEqual(cliGet.success, true);
assert(cliGet.output.includes('Batch: batch_sov_001'));

const cliCancel = await executeTogetherCliCommand('tg batches cancel batch_sov_001');
assert.strictEqual(cliCancel.success, true);
assert(cliCancel.output.includes('cancelled'));
console.log('   ✅ All 9 Together Sovereign CLI batch commands verified cleanly.');

console.log('\n🎉 ALL 10 TOGETHER.AI BATCH INFERENCE SUITE VERIFICATION PHASES PASSED CLEANLY!\n');
