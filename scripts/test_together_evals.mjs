/**
 * Dedicated Test Suite for the Together.ai Evaluations Suite (5 Endpoints)
 * References:
 * - https://docs.together.ai/reference/create-evaluation
 * - https://docs.together.ai/reference/list-evaluations
 * - https://docs.together.ai/reference/get-evaluation
 * - https://docs.together.ai/reference/get-evaluation-status
 * - https://docs.together.ai/reference/list-evaluation-models
 * License: MIT
 */
import assert from 'assert';
import {
  llmCreateEval,
  llmListEvals,
  llmGetEval,
  llmGetEvalStatus,
  llmListEvalModels,
} from '../src/app/services/llm.client.js';

import { InferenceGateway } from '../src/app/modules/inference/inference.gateway.js';
import { inferenceRoutes } from '../src/app/modules/inference/inference.route.js';

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

console.log('🧪 Testing Together.ai Evaluations Suite (5 Endpoints)...\n');

// 1. POST /evaluation & POST /evaluations (Create Evaluation)
console.log('[Test 1] Create Evaluation Job (POST /evaluation)...');
const evalPayload = {
  type: 'classify',
  parameters: {
    judge: {
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      model_source: 'serverless',
      system_template: 'You are an expert evaluator...',
    },
    input_data_file_path: 'file-test-abc123',
    labels: ['pass', 'fail'],
    pass_labels: ['pass'],
    model_to_evaluate: 'deepseek-ai/DeepSeek-V4-Pro',
  },
};
const createdEval = await llmCreateEval(evalPayload);
assert.ok(createdEval.workflow_id || createdEval.id, 'Expected workflow_id or id');
assert.ok(createdEval.status, 'Expected status');
console.log(`✅ Service: Created evaluation job ID = ${createdEval.workflow_id || createdEval.id} (status: ${createdEval.status})`);

const resGatewayCreate = mockRes();
await InferenceGateway.handleCreateEval({ body: evalPayload }, resGatewayCreate);
assert.strictEqual(resGatewayCreate.statusCode, 200);
assert.ok(resGatewayCreate.body.workflow_id || resGatewayCreate.body.id);
console.log(`✅ Gateway: POST /evaluation handled successfully.`);

// 2. GET /evaluation & GET /evaluations (List Evaluations)
console.log('\n[Test 2] List Evaluation Jobs (GET /evaluation)...');
const evalList = await llmListEvals({ limit: 10 });
assert.ok(Array.isArray(evalList) || Array.isArray(evalList?.data), 'Expected array of evaluation jobs');
console.log(`✅ Service: Listed evaluation jobs count = ${Array.isArray(evalList) ? evalList.length : evalList.data.length}`);

const resGatewayList = mockRes();
await InferenceGateway.handleListEvals({ query: { limit: 10 } }, resGatewayList);
assert.strictEqual(resGatewayList.statusCode, 200);
assert.ok(Array.isArray(resGatewayList.body) || Array.isArray(resGatewayList.body?.data));
console.log(`✅ Gateway: GET /evaluation handled successfully.`);

// 3. GET /evaluation/model-list & GET /evaluations/models (List Evaluation Models)
console.log('\n[Test 3] List Evaluation Models (GET /evaluation/model-list & /evaluations/models)...');
const evalModels = await llmListEvalModels({ model_source: 'serverless' });
assert.ok(Array.isArray(evalModels?.model_list), 'Expected model_list array');
assert.ok(evalModels.model_list.length > 0, 'Expected non-empty model list');
console.log(`✅ Service: Listed ${evalModels.model_list.length} evaluation models (e.g. ${evalModels.model_list[0]})`);

const resGatewayModels = mockRes();
await InferenceGateway.handleListEvalModels({ query: { model_source: 'all' } }, resGatewayModels);
assert.strictEqual(resGatewayModels.statusCode, 200);
assert.ok(Array.isArray(resGatewayModels.body?.model_list));
console.log(`✅ Gateway: GET /evaluation/model-list handled successfully.`);

// 4. GET /evaluation/:id (Get Evaluation Details)
console.log('\n[Test 4] Get Evaluation Details (GET /evaluation/:id)...');
const testEvalId = createdEval.workflow_id || createdEval.id || 'eval-test-001';
const evalDetails = await llmGetEval(testEvalId);
assert.ok(evalDetails.workflow_id || evalDetails.id, 'Expected workflow_id or id in details');
assert.ok(evalDetails.status, 'Expected status in details');
console.log(`✅ Service: Retrieved evaluation details for ${testEvalId} (status: ${evalDetails.status})`);

const resGatewayGet = mockRes();
await InferenceGateway.handleGetEval({ params: { id: testEvalId } }, resGatewayGet);
assert.strictEqual(resGatewayGet.statusCode, 200);
assert.ok(resGatewayGet.body.workflow_id || resGatewayGet.body.id);
console.log(`✅ Gateway: GET /evaluation/:id handled successfully.`);

// 5. GET /evaluation/:id/status (Get Evaluation Status & Results)
console.log('\n[Test 5] Get Evaluation Status & Results (GET /evaluation/:id/status)...');
const evalStatus = await llmGetEvalStatus(testEvalId);
assert.ok(evalStatus.status, 'Expected evaluation status');
assert.ok(evalStatus.results, 'Expected evaluation results');
console.log(`✅ Service: Retrieved status = ${evalStatus.status} for ${testEvalId}`);

const resGatewayStatus = mockRes();
await InferenceGateway.handleGetEvalStatus({ params: { id: testEvalId } }, resGatewayStatus);
assert.strictEqual(resGatewayStatus.statusCode, 200);
assert.ok(resGatewayStatus.body.status);
assert.ok(resGatewayStatus.body.results);
console.log(`✅ Gateway: GET /evaluation/:id/status handled successfully.`);

// 6. Router Stack Verification
console.log('\n[Test 6] Verifying Express Router Stack for Evaluation Paths...');
const registeredRoutes = [];
inferenceRoutes.stack.forEach((layer) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase()).join(',');
    registeredRoutes.push(`${methods} ${layer.route.path}`);
  }
});

const requiredPaths = [
  'POST /evaluation',
  'POST /v1/evaluation',
  'POST /evaluations',
  'POST /v1/evaluations',
  'GET /evaluation/model-list',
  'GET /v1/evaluation/model-list',
  'GET /evaluations/models',
  'GET /v1/evaluations/models',
  'GET /evaluation',
  'GET /v1/evaluation',
  'GET /evaluations',
  'GET /v1/evaluations',
  'GET /evaluation/:id/status',
  'GET /v1/evaluation/:id/status',
  'GET /evaluations/:id/status',
  'GET /v1/evaluations/:id/status',
  'GET /evaluation/:id',
  'GET /v1/evaluation/:id',
  'GET /evaluations/:id',
  'GET /v1/evaluations/:id',
];

requiredPaths.forEach((path) => {
  assert.ok(
    registeredRoutes.includes(path),
    `Missing route: ${path} in registered routes`,
  );
});
console.log(`✅ Router: All ${requiredPaths.length} required evaluation paths registered properly in inferenceRoutes.`);

console.log('\n🎉 ALL 5 TOGETHER.AI EVALUATIONS ENDPOINTS VERIFIED & WORKING!\n');
