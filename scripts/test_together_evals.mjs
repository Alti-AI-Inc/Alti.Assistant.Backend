/**
 * Comprehensive Verification Test for Together.ai AI Evaluations Suite
 * Covers:
 * 1. Overview & Evaluation Types: https://docs.together.ai/docs/ai-evaluations
 * 2. Run an Evaluation Guide:     https://docs.together.ai/docs/run-an-evaluation
 * 3. Evaluations Reference:       https://docs.together.ai/docs/evaluations-reference
 * 4. Supported Models:           https://docs.together.ai/docs/evaluations-supported-models
 * License: MIT
 */

import assert from 'assert';
import {
  EVALUATION_TYPES,
  EVALUATION_SUPPORTED_MODELS,
  DEFAULT_JUDGE_TEMPLATES,
  getEvaluationsOverview,
  getRunEvaluationDocs,
  getEvaluationsReferenceDocs,
  getSupportedModelsDocs,
  validateEvaluationParams,
  validateDatasetColumns,
  createEvaluationJob,
  getEvaluationJobStatus,
  getEvaluationJobDetails,
  listEvaluationJobs,
  listSupportedEvaluationModels,
} from '../src/app/services/together.evaluations.js';
import { executeTogetherCliCommand } from '../src/app/services/together.cli.js';
import InferenceGateway from '../src/app/modules/inference/inference.gateway.js';
import { inferenceRoutes } from '../src/app/modules/inference/inference.route.js';

console.log('🧪 Starting Together.ai AI Evaluations Suite Verification...\n');

// ── 1. Overview & 3 Evaluation Types ─────────────────────────────────────────
console.log('1️⃣ Testing AI Evaluations Overview & 3 Evaluation Types...');
const overview = getEvaluationsOverview();
assert.strictEqual(overview.success, true);
assert.strictEqual(overview.recommended_judge, 'openai/gpt-oss-120b');
assert.strictEqual(overview.agent_skill, 'together-evaluations');
assert.ok(overview.evaluation_types.classify);
assert.ok(overview.evaluation_types.score);
assert.ok(overview.evaluation_types.compare);
assert.strictEqual(overview.dataset_rules.format, 'JSONL or CSV');
console.log(`   ✅ 3 evaluation types (classify, score, compare) and dataset rules verified.`);

// ── 2. Run an Evaluation Guide & Code Snippets ──────────────────────────────
console.log('\n2️⃣ Testing Run an Evaluation Guide & Workflows...');
const guide = getRunEvaluationDocs();
assert.strictEqual(guide.success, true);
assert.strictEqual(guide.workflow_steps.length, 5);
assert.strictEqual(guide.workflow_steps[0].action, 'Prepare dataset');
assert.strictEqual(guide.workflow_steps[1].action, 'Upload dataset');
assert(guide.code_snippets.python_classify.includes('purpose="eval"'));
assert(guide.code_snippets.typescript_compare.includes('disable_position_bias_correction'));
console.log('   ✅ 5-step workflow (prepare, upload, create, monitor, download) and snippets verified.');

// ── 3. Evaluations Reference & Result Formats ────────────────────────────────
console.log('\n3️⃣ Testing Evaluations Reference & Schemas...');
const ref = getEvaluationsReferenceDocs();
assert.strictEqual(ref.success, true);
assert(ref.lifecycle_states.includes('pending'));
assert(ref.lifecycle_states.includes('completed'));
assert(ref.lifecycle_states.includes('user_error'));
assert(ref.result_schemas.classify.fields.includes('label_counts'));
assert(ref.result_schemas.classify.fields.includes('pass_percentage'));
assert(ref.result_schemas.score.fields.includes('aggregated_scores.mean_score'));
assert(ref.result_schemas.compare.fields.includes('A_wins'));
assert(ref.result_schemas.compare.fields.includes('B_wins'));
assert(ref.result_schemas.compare.fields.includes('Ties'));
console.log('   ✅ Lifecycle states and result schemas (classify, score, compare) verified.');

// ── 4. Supported Models Catalog ──────────────────────────────────────────────
console.log('\n4️⃣ Testing Supported Models Catalog...');
const modelsDocs = getSupportedModelsDocs();
assert.strictEqual(modelsDocs.success, true);
const serverless = modelsDocs.models.serverless_allowlist;
assert(serverless.some(m => m.id === 'openai/gpt-oss-120b' && m.default_judge === true));
assert(serverless.some(m => m.id === 'meta-llama/Llama-3.3-70B-Instruct-Turbo'));
assert(serverless.some(m => m.id === 'Qwen/Qwen3.5-9B' && m.vision === true));
assert(modelsDocs.models.external_shortcuts.anthropic.length >= 6);
assert(modelsDocs.models.external_shortcuts.google.length >= 6);
assert(modelsDocs.models.external_shortcuts.openai.length >= 8);
console.log(`   ✅ Serverless allowlist (${serverless.length} models), vision support, and external shortcuts verified.`);

// ── 5. Evaluation Parameter Validation ───────────────────────────────────────
console.log('\n5️⃣ Testing Evaluation Parameter Validation...');
// Valid classify
const validClassify = validateEvaluationParams({
  type: 'classify',
  parameters: {
    input_data_file_path: 'file-12345',
    judge: {
      model: 'openai/gpt-oss-120b',
      model_source: 'serverless',
      system_template: DEFAULT_JUDGE_TEMPLATES.classify_harmful,
    },
    labels: ['Harmful', 'Not Harmful'],
    pass_labels: ['Not Harmful'],
    model_to_evaluate: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
});
assert.strictEqual(validClassify.valid, true);

// Invalid classify (pass_label not in labels)
const invalidClassify = validateEvaluationParams({
  type: 'classify',
  parameters: {
    input_data_file_path: 'file-12345',
    judge: {
      model: 'openai/gpt-oss-120b',
      model_source: 'serverless',
      system_template: 'judge...',
    },
    labels: ['Harmful', 'Not Harmful'],
    pass_labels: ['Safe'], // 'Safe' is not in labels
    model_to_evaluate: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
});
assert.strictEqual(invalidClassify.valid, false);
assert(invalidClassify.errors.some(e => e.includes('Safe')));

// Invalid score (pass_threshold outside min_score and max_score)
const invalidScore = validateEvaluationParams({
  type: 'score',
  parameters: {
    input_data_file_path: 'file-12345',
    judge: {
      model: 'openai/gpt-oss-120b',
      model_source: 'serverless',
      system_template: 'judge...',
    },
    min_score: 1,
    max_score: 10,
    pass_threshold: 15, // Out of bounds
    model_to_evaluate: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
});
assert.strictEqual(invalidScore.valid, false);
assert(invalidScore.errors.some(e => e.includes('pass_threshold')));
console.log('   ✅ Valid classify passed, and label mismatch / out-of-range thresholds caught.');

// ── 6. Dataset Column Usage Rules Validation ─────────────────────────────────
console.log('\n6️⃣ Testing Dataset Column Usage Rules Validation...');
// Valid: prompt is in template, response_a and response_b are named columns, image_data_urls is vision column
const validDataset = validateDatasetColumns(
  ['prompt', 'response_a', 'response_b', 'image_data_urls'],
  ['Compare response for: {{prompt}}'],
  ['response_a', 'response_b']
);
assert.strictEqual(validDataset.valid, true);
assert.strictEqual(validDataset.unused_columns.length, 0);

// Invalid: id and category are not referenced
const invalidDataset = validateDatasetColumns(
  ['prompt', 'id', 'category'],
  ['Evaluate prompt: {{prompt}}'],
  []
);
assert.strictEqual(invalidDataset.valid, false);
assert.strictEqual(invalidDataset.unused_columns.length, 2);
assert(invalidDataset.unused_columns.includes('id'));
assert(invalidDataset.unused_columns.includes('category'));
assert(invalidDataset.error.includes('Unsupported dataset column(s)'));
console.log('   ✅ Dataset column rules validated; unused metadata columns properly flagged.');

// ── 7. Evaluation Job Creation & Dispatch ────────────────────────────────────
console.log('\n7️⃣ Testing Job Creation & Dispatch...');
const createdJob = await createEvaluationJob({
  type: 'classify',
  parameters: {
    input_data_file_path: 'file-test-sample',
    judge: {
      model: 'openai/gpt-oss-120b',
      model_source: 'serverless',
      system_template: DEFAULT_JUDGE_TEMPLATES.classify_harmful,
    },
    labels: ['Harmful', 'Not Harmful'],
    pass_labels: ['Not Harmful'],
    model_to_evaluate: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
});
assert.ok(createdJob.workflow_id || createdJob.id);
assert.strictEqual(createdJob.status, 'pending');
console.log(`   ✅ Created evaluation job: ${createdJob.workflow_id || createdJob.id} (status: ${createdJob.status}).`);

// ── 8. Job Lifecycle & Status Tracking ───────────────────────────────────────
console.log('\n8️⃣ Testing Job Lifecycle & Status Tracking...');
const workflowId = createdJob.workflow_id || createdJob.id;
const jobStatus = await getEvaluationJobStatus(workflowId);
assert.ok(jobStatus.status);
assert.ok(jobStatus.results);

const jobDetails = await getEvaluationJobDetails(workflowId);
assert.ok(jobDetails.workflow_id || jobDetails.id);

const jobList = await listEvaluationJobs({ limit: 5 });
assert.ok(Array.isArray(jobList) || Array.isArray(jobList.data));
console.log(`   ✅ Status, details, and list retrieval verified for job ${workflowId}.`);

// ── 9. Sovereign Together CLI Commands ───────────────────────────────────────
console.log('\n9️⃣ Testing Together Sovereign CLI Evals Commands...');
const cliOverview = await executeTogetherCliCommand('together evals overview');
assert.strictEqual(cliOverview.success, true);
assert(cliOverview.output.includes('Together AI AI Evaluations Overview'));

const cliGuide = await executeTogetherCliCommand('tg evals guide');
assert.strictEqual(cliGuide.success, true);
assert(cliGuide.output.includes('Run an Evaluation Guide'));

const cliRef = await executeTogetherCliCommand('together evals reference');
assert.strictEqual(cliRef.success, true);
assert(cliRef.output.includes('Together AI Evaluations Reference'));

const cliModels = await executeTogetherCliCommand('tg evals models');
assert.strictEqual(cliModels.success, true);
assert(cliModels.output.includes('Serverless Allowlist'));

const cliVal = await executeTogetherCliCommand('together evals validate --type classify --labels "Safe,Unsafe" --pass-labels "Safe"');
assert.strictEqual(cliVal.success, true);
assert(cliVal.output.includes('Status: VALID ✅'));

const cliValDataset = await executeTogetherCliCommand('tg evals validate-dataset --columns "prompt,id" --template "{{prompt}}"');
assert.strictEqual(cliValDataset.success, true);
assert(cliValDataset.output.includes('Unused: [id]'));

const cliCreate = await executeTogetherCliCommand('together evals create --type classify --file file-test-cli --labels "Pass,Fail" --pass-labels "Pass"');
assert.strictEqual(cliCreate.success, true);
assert(cliCreate.output.includes('Evaluation job created successfully'));

const cliList = await executeTogetherCliCommand('tg evals list');
assert.strictEqual(cliList.success, true);
assert(cliList.output.includes('WORKFLOW ID'));
console.log('   ✅ All 8 CLI evals commands executed cleanly with expected output.');

// ── 10. Inference Gateway Handlers & Express Routes ──────────────────────────
console.log('\n🔟 Testing Inference Gateway Evals Handlers & Express Routes...');
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

const mockRes1 = createMockRes();
await InferenceGateway.handleGetEvaluationsOverview({}, mockRes1);
assert.strictEqual(mockRes1.statusCode, 200);
assert.strictEqual(mockRes1.body.success, true);

const mockRes2 = createMockRes();
await InferenceGateway.handleGetRunEvaluationDocs({}, mockRes2);
assert.strictEqual(mockRes2.statusCode, 200);
assert.strictEqual(mockRes2.body.success, true);

const mockRes3 = createMockRes();
await InferenceGateway.handleGetEvaluationsReferenceDocs({}, mockRes3);
assert.strictEqual(mockRes3.statusCode, 200);
assert.strictEqual(mockRes3.body.success, true);

const mockRes4 = createMockRes();
await InferenceGateway.handleGetSupportedModelsDocs({}, mockRes4);
assert.strictEqual(mockRes4.statusCode, 200);
assert.strictEqual(mockRes4.body.success, true);

const mockRes5 = createMockRes();
await InferenceGateway.handleValidateEvaluationParams({
  body: {
    type: 'score',
    parameters: {
      input_data_file_path: 'file-123',
      judge: { model: 'openai/gpt-oss-120b', model_source: 'serverless', system_template: 'test' },
      min_score: 1,
      max_score: 10,
      pass_threshold: 8,
      model_to_evaluate: 'test-model',
    },
  },
}, mockRes5);
assert.strictEqual(mockRes5.statusCode, 200);
assert.strictEqual(mockRes5.body.valid, true);

const mockRes6 = createMockRes();
await InferenceGateway.handleValidateDatasetColumns({
  body: {
    columns: ['prompt', 'unused_meta'],
    templates: ['{{prompt}}'],
  },
}, mockRes6);
assert.strictEqual(mockRes6.statusCode, 200);
assert.strictEqual(mockRes6.body.valid, false);

// Check routes
const registeredRoutes = [];
inferenceRoutes.stack.forEach((layer) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase()).join(',');
    registeredRoutes.push(`${methods} ${layer.route.path}`);
  }
});

const requiredEvalRoutes = [
  'GET /together/ai-evaluations',
  'GET /v1/together/ai-evaluations',
  'GET /together/run-an-evaluation',
  'GET /v1/together/run-an-evaluation',
  'GET /together/evaluations-reference',
  'GET /v1/together/evaluations-reference',
  'GET /together/evaluations-supported-models',
  'GET /v1/together/evaluations-supported-models',
  'POST /together/evaluations/validate',
  'POST /together/evaluations/validate-dataset',
  'POST /evaluation',
  'GET /evaluations',
];

requiredEvalRoutes.forEach((route) => {
  assert(registeredRoutes.includes(route), `Missing expected route: ${route}`);
});
console.log(`   ✅ Gateway handlers and all ${requiredEvalRoutes.length} required evaluation routes verified.`);

console.log('\n🎉 ALL 10 VERIFICATION PHASES PASSED WITH ZERO ERRORS!');
