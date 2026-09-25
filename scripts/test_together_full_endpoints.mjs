/**
 * Comprehensive Test Suite for Together.ai Endpoints Entrenched in Aphura Backend
 * (Embeddings, Rerank, Audio Voices, Files, Fine-tuning, Batches, Endpoints, Evaluations)
 * License: MIT
 */
import assert from 'assert';
import {
  llmListVoices,
  llmCreateEmbeddings,
  llmRerank,
  llmUploadFile,
  llmListFiles,
  llmGetFile,
  llmDeleteFile,
  llmGetFileContent,
  llmCreateFineTune,
  llmListFineTunes,
  llmGetFineTune,
  llmCancelFineTune,
  llmListFineTuneEvents,
  llmListFineTuneCheckpoints,
  llmCreateBatch,
  llmListBatches,
  llmGetBatch,
  llmCancelBatch,
  llmCreateEndpoint,
  llmListEndpoints,
  llmGetEndpoint,
  llmUpdateEndpoint,
  llmDeleteEndpoint,
  llmListEndpointHardware,
  llmListEndpointAvzones,
  llmCreateEval,
  llmListEvals,
  llmGetEval,
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
    send(data) {
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

console.log('🧪 Testing Together.ai Full Entrenched Endpoints Suite...\n');

// 1. Audio Voices Test
console.log('[Test 1] Audio Voices (llmListVoices & Gateway)...');
const voicesRes = await llmListVoices();
assert.ok(voicesRes.voices && Array.isArray(voicesRes.voices), 'Expected voices array');
assert.ok(voicesRes.voices.length > 0, 'Expected at least 1 voice');

const res1 = mockRes();
await InferenceGateway.handleListVoices({}, res1);
assert.strictEqual(res1.statusCode, 200);
assert.ok(res1.body.voices, 'Gateway should return voices');
console.log(`✅ Test 1 Passed: Found ${voicesRes.voices.length} voices.`);

// 2. Embeddings Test
console.log('[Test 2] Embeddings (POST /embeddings)...');
const embRes = await llmCreateEmbeddings(['Hello sovereign world', 'Vector test']);
assert.ok(embRes.data && Array.isArray(embRes.data), 'Expected embedding data array');
assert.strictEqual(embRes.data.length, 2, 'Expected 2 embeddings');
assert.ok(Array.isArray(embRes.data[0].embedding), 'Expected vector in embedding 0');

const res2 = mockRes();
await InferenceGateway.handleEmbeddings({ body: { input: 'Single string test' } }, res2);
assert.strictEqual(res2.statusCode, 200);
assert.ok(res2.body.data && res2.body.data.length === 1);
console.log(`✅ Test 2 Passed: Embeddings dimensions = ${embRes.data[0].embedding.length}.`);

// 3. Rerank Test
console.log('[Test 3] Rerank (POST /rerank)...');
const rerankRes = await llmRerank('sovereign database', ['PostgreSQL database', 'Apple fruit pie', 'Liberty Center cloud']);
assert.ok(rerankRes.results && Array.isArray(rerankRes.results), 'Expected rerank results');
assert.strictEqual(rerankRes.results.length, 3);

const res3 = mockRes();
await InferenceGateway.handleRerank({ body: { query: 'test', documents: ['doc1', 'doc2'] } }, res3);
assert.strictEqual(res3.statusCode, 200);
assert.ok(res3.body.results && res3.body.results.length === 2);
console.log('✅ Test 3 Passed: Rerank results verified.');

// 4. Files Test
console.log('[Test 4] Files API (Upload, List, Retrieve, Content, Delete)...');
const uploadedFile = await llmUploadFile('/tmp/test_dataset.jsonl', { purpose: 'fine-tune' });
assert.ok(uploadedFile.id, 'Expected file ID');

const fileList = await llmListFiles();
assert.ok(Array.isArray(fileList.data || fileList), 'Expected files array');

const fileDetail = await llmGetFile(uploadedFile.id);
assert.ok(fileDetail.id, 'Expected file detail');

const fileContent = await llmGetFileContent(uploadedFile.id);
assert.ok(fileContent, 'Expected file content');

const fileDel = await llmDeleteFile(uploadedFile.id);
assert.ok(fileDel.deleted, 'Expected file deletion confirmation');

const res4 = mockRes();
await InferenceGateway.handleListFiles({}, res4);
assert.strictEqual(res4.statusCode, 200);
console.log('✅ Test 4 Passed: Files lifecycle verified.');

// 5. Fine-Tuning Test
console.log('[Test 5] Fine-Tuning API (Create, List, Retrieve, Events, Checkpoints, Cancel)...');
const ftJob = await llmCreateFineTune({ training_file: 'file-12345', model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' });
assert.ok(ftJob.id, 'Expected fine-tune job ID');

const ftList = await llmListFineTunes();
assert.ok(ftList, 'Expected fine-tune list');

const ftRetrieved = await llmGetFineTune(ftJob.id);
assert.ok(ftRetrieved.id, 'Expected retrieved fine-tune');

const ftEvents = await llmListFineTuneEvents(ftJob.id);
assert.ok(Array.isArray(ftEvents.data), 'Expected fine-tune events array');

const ftCheckpoints = await llmListFineTuneCheckpoints(ftJob.id);
assert.ok(Array.isArray(ftCheckpoints.data), 'Expected fine-tune checkpoints array');

const ftCancel = await llmCancelFineTune(ftJob.id);
assert.ok(ftCancel.status === 'cancelled', 'Expected cancelled status');

const res5 = mockRes();
await InferenceGateway.handleGetFineTune({ params: { id: ftJob.id } }, res5);
assert.strictEqual(res5.statusCode, 200);
console.log('✅ Test 5 Passed: Fine-tuning lifecycle verified.');

// 6. Batches Test
console.log('[Test 6] Batches API (Create, List, Retrieve, Cancel)...');
const batchJob = await llmCreateBatch({ input_file_id: 'file-batch-1', endpoint: '/v1/chat/completions' });
assert.ok(batchJob.id, 'Expected batch ID');

const batchList = await llmListBatches();
assert.ok(batchList, 'Expected batches list');

const batchRetrieved = await llmGetBatch(batchJob.id);
assert.ok(batchRetrieved.id, 'Expected batch detail');

const batchCancel = await llmCancelBatch(batchJob.id);
assert.strictEqual(batchCancel.status, 'cancelled');

const res6 = mockRes();
await InferenceGateway.handleCancelBatch({ params: { id: batchJob.id } }, res6);
assert.strictEqual(res6.statusCode, 200);
console.log('✅ Test 6 Passed: Batches lifecycle verified.');

// 7. Dedicated Endpoints Test
console.log('[Test 7] Dedicated Endpoints (Create, List, Retrieve, Update, Hardware, Avzones, Delete)...');
const epCreated = await llmCreateEndpoint({ model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', hardware: '8x_H100_SXM' });
assert.ok(epCreated.id, 'Expected endpoint ID');

const epList = await llmListEndpoints();
assert.ok(epList, 'Expected endpoints list');

const epDetail = await llmGetEndpoint(epCreated.id);
assert.ok(epDetail.id, 'Expected endpoint detail');

const epUpdated = await llmUpdateEndpoint(epCreated.id, { replicas: 2 });
assert.strictEqual(epUpdated.replicas, 2);

const epHardware = await llmListEndpointHardware();
assert.ok(Array.isArray(epHardware.hardware), 'Expected hardware list');

const epAvzones = await llmListEndpointAvzones();
assert.ok(Array.isArray(epAvzones.zones), 'Expected avzones list');

const epDeleted = await llmDeleteEndpoint(epCreated.id);
assert.ok(epDeleted.deleted, 'Expected endpoint deletion');

const res7 = mockRes();
await InferenceGateway.handleListHardware({}, res7);
assert.strictEqual(res7.statusCode, 200);
assert.ok(res7.body.hardware.length >= 2);
console.log('✅ Test 7 Passed: Dedicated Endpoints lifecycle verified.');

// 8. Evaluations Test
console.log('[Test 8] Evaluations (Create, List, Retrieve)...');
const evalCreated = await llmCreateEval({ model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', dataset_id: 'ds-test-1' });
assert.ok(evalCreated.id, 'Expected eval ID');

const evalList = await llmListEvals();
assert.ok(evalList, 'Expected eval list');

const evalDetail = await llmGetEval(evalCreated.id);
assert.ok(evalDetail.id, 'Expected eval detail');

const res8 = mockRes();
await InferenceGateway.handleGetEval({ params: { id: evalCreated.id } }, res8);
assert.strictEqual(res8.statusCode, 200);
console.log('✅ Test 8 Passed: Evaluations lifecycle verified.');

console.log('\n🎉 ALL 8 TOGETHER.AI ENTRENCHED SUITE TESTS PASSED CLEANLY!\n');
