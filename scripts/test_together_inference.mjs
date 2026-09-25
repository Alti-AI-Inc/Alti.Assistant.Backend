/**
 * Automated Test Suite for Together.ai Inference Overview, OpenAI Compatibility, and Partner SDK Integrations
 * 
 * Verifies:
 * 1. Inference Overview:       https://docs.together.ai/docs/inference/overview
 *    - 3 Deployment Modes: Serverless, Provisioned Throughput, Dedicated Model Inference (DMI)
 *    - 9 Core Model Capabilities (Chat, Function Calling, Vision, Images, Videos, STT, TTS, Rerank, Evals)
 *    - Batch processing (up to 50% discount)
 *    - Shared Inference API across all modes
 * 2. OpenAI Compatibility:     https://docs.together.ai/docs/inference/openai-compatibility
 *    - Drop-in client setup (API key + base URL)
 *    - Endpoint compatibility matrix (16 methods mapped)
 *    - Dual cached tokens & reasoning tokens format
 * 3. Partner SDK Integrations: https://docs.together.ai/docs/inference/sdk-integrations
 *    - Hugging Face, Vercel AI, Mastra, Next.js, LangChain, LlamaIndex, LiteLLM, Helicone
 * 4. Gateway handlers & 20 Dual Express Routes
 * 5. Sovereign CLI executable subcommands
 * 
 * License: MIT
 */

import assert from 'assert';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  INFERENCE_MODES,
  MODEL_CAPABILITIES,
  OPENAI_COMPATIBILITY_MATRIX,
  PARTNER_SDK_INTEGRATIONS,
  getInferenceOverview,
  getOpenAiCompatibilityDocs,
  formatOpenAiCompatibleResponse,
  getPartnerSdkIntegrations,
  getPartnerSdkDoc,
  executeSharedInference,
} from '../src/app/services/together.inference.js';
import InferenceGateway from '../src/app/modules/inference/inference.gateway.js';
import router from '../src/app/modules/inference/inference.route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  };
}

async function runInferenceTestSuite() {
  console.log('🧪 Testing Together.ai Inference Overview, OpenAI Compatibility & Partner SDKs Suite...\n');

  // ==========================================
  // 1. SERVICE LAYER TESTS
  // ==========================================
  console.log('── 1. Service Layer Tests: Overview, OpenAI Compatibility & SDKs ──');

  // 1.1 Inference Overview
  console.log('[Test 1.1] Verifying getInferenceOverview()...');
  const overview = getInferenceOverview();
  assert.strictEqual(overview.success, true);
  assert.strictEqual(Object.keys(overview.modes).length, 3);
  assert.ok(overview.modes.serverless);
  assert.ok(overview.modes.provisioned_throughput);
  assert.ok(overview.modes.dedicated);
  assert.strictEqual(overview.capabilities.length, 9);
  assert.ok(overview.batch_processing.savings.includes('50%'));
  assert.ok(overview.shared_api.python_snippet.includes('moonshotai/Kimi-K3'));

  // 1.2 OpenAI Compatibility Matrix & Docs
  console.log('[Test 1.2] Verifying getOpenAiCompatibilityDocs()...');
  const compat = getOpenAiCompatibilityDocs();
  assert.strictEqual(compat.success, true);
  assert.strictEqual(compat.base_url, 'https://api.together.ai/v1');
  assert.strictEqual(compat.matrix.length, 16);
  assert.ok(compat.matrix.some(m => m.sdk_call === 'chat.completions.create' && m.status === 'Supported'));
  assert.ok(compat.matrix.some(m => m.sdk_call.includes('vision') && m.status === 'Supported'));
  assert.ok(compat.matrix.some(m => m.sdk_call.includes('assistants') && m.status === 'Not supported'));

  // 1.3 Format OpenAI Compatible Response (Dual cached tokens & reasoning)
  console.log('[Test 1.3] Verifying formatOpenAiCompatibleResponse()...');
  const sampleRaw = {
    id: 'test-raw-123',
    choices: [{ message: { role: 'assistant', content: 'Result', reasoning_content: 'Step 1 done' } }],
    usage: { prompt_tokens: 15, completion_tokens: 30, cached_tokens: 10, completion_tokens_details: { reasoning_tokens: 8 } },
  };
  const formatted = formatOpenAiCompatibleResponse(sampleRaw, { model: 'zai-org/GLM-5.2' });
  assert.strictEqual(formatted.object, 'chat.completion');
  assert.strictEqual(formatted.usage.cached_tokens, 10);
  assert.strictEqual(formatted.usage.prompt_tokens_details.cached_tokens, 10);
  assert.strictEqual(formatted.usage.completion_tokens_details.reasoning_tokens, 8);
  assert.strictEqual(formatted.choices[0].message.reasoning_content, 'Step 1 done');

  // 1.4 Partner SDK Integrations Catalog & Docs
  console.log('[Test 1.4] Verifying getPartnerSdkIntegrations() & getPartnerSdkDoc()...');
  const sdks = getPartnerSdkIntegrations();
  assert.strictEqual(sdks.success, true);
  assert.strictEqual(sdks.total_sdks, 8);
  const expectedSdkIds = ['huggingface', 'vercel_ai', 'mastra', 'nextjs', 'langchain', 'llamaindex', 'litellm', 'helicone'];
  for (const id of expectedSdkIds) {
    const doc = getPartnerSdkDoc(id);
    assert.strictEqual(doc.success, true);
    assert.strictEqual(doc.sdk.id, id);
    assert.ok(doc.sdk.install_command, `${id} must have install command`);
    assert.ok(doc.sdk.url, `${id} must have url`);
  }

  // 1.5 Shared Inference Execution
  console.log('[Test 1.5] Verifying executeSharedInference()...');
  const sharedRes = await executeSharedInference({
    model: 'moonshotai/Kimi-K3',
    prompt: 'Verify inference pipeline',
    dry_run: true,
  });
  assert.strictEqual(sharedRes.success, true);
  assert.strictEqual(sharedRes.model, 'moonshotai/Kimi-K3');
  assert.strictEqual(sharedRes.mode, 'serverless');
  console.log('  ✅ Shared inference execution simulation verified.');

  // ==========================================
  // 2. GATEWAY LAYER TESTS
  // ==========================================
  console.log('\n── 2. Gateway Layer Tests ──');

  // 2.1 handleGetInferenceOverview
  console.log('[Gateway 2.1] handleGetInferenceOverview...');
  const gwReq1 = {};
  const gwRes1 = mockRes();
  await InferenceGateway.handleGetInferenceOverview(gwReq1, gwRes1);
  assert.strictEqual(gwRes1.statusCode, 200);
  assert.strictEqual(gwRes1.body.capabilities.length, 9);

  // 2.2 handleGetOpenAiCompatibility
  console.log('[Gateway 2.2] handleGetOpenAiCompatibility...');
  const gwReq2 = {};
  const gwRes2 = mockRes();
  await InferenceGateway.handleGetOpenAiCompatibility(gwReq2, gwRes2);
  assert.strictEqual(gwRes2.statusCode, 200);
  assert.strictEqual(gwRes2.body.matrix.length, 16);

  // 2.3 handleGetPartnerSdks
  console.log('[Gateway 2.3] handleGetPartnerSdks...');
  const gwReq3 = {};
  const gwRes3 = mockRes();
  await InferenceGateway.handleGetPartnerSdks(gwReq3, gwRes3);
  assert.strictEqual(gwRes3.statusCode, 200);
  assert.strictEqual(gwRes3.body.total_sdks, 8);

  // 2.4 handleGetPartnerSdkDoc
  console.log('[Gateway 2.4] handleGetPartnerSdkDoc (mastra)...');
  const gwReq4 = { params: { sdk: 'mastra' } };
  const gwRes4 = mockRes();
  await InferenceGateway.handleGetPartnerSdkDoc(gwReq4, gwRes4);
  assert.strictEqual(gwRes4.statusCode, 200);
  assert.strictEqual(gwRes4.body.sdk.id, 'mastra');

  // 2.5 handleExecuteSharedInference
  console.log('[Gateway 2.5] handleExecuteSharedInference...');
  const gwReq5 = { body: { model: 'deepseek-ai/DeepSeek-V4-Flash', prompt: 'Hello', dry_run: true } };
  const gwRes5 = mockRes();
  await InferenceGateway.handleExecuteSharedInference(gwReq5, gwRes5);
  assert.strictEqual(gwRes5.statusCode, 200);
  assert.strictEqual(gwRes5.body.model, 'deepseek-ai/DeepSeek-V4-Flash');

  // ==========================================
  // 3. EXPRESS ROUTER STACK TESTS
  // ==========================================
  console.log('\n── 3. Express Router Stack Tests ──');
  const registeredRoutes = router.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).map(m => m.toUpperCase()),
    }));

  const expectedPaths = [
    { path: '/together/inference/overview', method: 'GET' },
    { path: '/v1/together/inference/overview', method: 'GET' },
    { path: '/inference/overview', method: 'GET' },
    { path: '/v1/inference/overview', method: 'GET' },
    { path: '/together/inference/openai-compatibility', method: 'GET' },
    { path: '/v1/together/inference/openai-compatibility', method: 'GET' },
    { path: '/inference/openai-compatibility', method: 'GET' },
    { path: '/v1/inference/openai-compatibility', method: 'GET' },
    { path: '/together/inference/sdk-integrations', method: 'GET' },
    { path: '/v1/together/inference/sdk-integrations', method: 'GET' },
    { path: '/inference/sdk-integrations', method: 'GET' },
    { path: '/v1/inference/sdk-integrations', method: 'GET' },
    { path: '/together/inference/sdk-integrations/:sdk', method: 'GET' },
    { path: '/v1/together/inference/sdk-integrations/:sdk', method: 'GET' },
    { path: '/inference/sdk-integrations/:sdk', method: 'GET' },
    { path: '/v1/inference/sdk-integrations/:sdk', method: 'GET' },
    { path: '/together/inference/execute', method: 'POST' },
    { path: '/v1/together/inference/execute', method: 'POST' },
    { path: '/inference/execute', method: 'POST' },
    { path: '/v1/inference/execute', method: 'POST' },
  ];

  for (const exp of expectedPaths) {
    const found = registeredRoutes.find(r => r.path === exp.path && r.methods.includes(exp.method));
    assert.ok(found, `Expected router to mount ${exp.method} ${exp.path}`);
  }
  console.log(`✅ All ${expectedPaths.length} dual Express inference routes verified mounted.`);

  // ==========================================
  // 4. CLI EXECUTABLE TESTS
  // ==========================================
  console.log('\n── 4. Executable CLI Script Tests ──');
  const scriptPath = path.join(__dirname, 'together_cli.mjs');

  const cliOut1 = execSync(`node "${scriptPath}" inference overview`, { encoding: 'utf-8' });
  assert.ok(cliOut1.includes('Serverless Models'));
  assert.ok(cliOut1.includes('Provisioned Throughput'));
  assert.ok(cliOut1.includes('Dedicated Model Inference'));

  const cliOut2 = execSync(`node "${scriptPath}" inference openai`, { encoding: 'utf-8' });
  assert.ok(cliOut2.includes('OpenAI Compatibility Layer'));
  assert.ok(cliOut2.includes('chat.completions.create'));

  const cliOut3 = execSync(`node "${scriptPath}" inference sdks`, { encoding: 'utf-8' });
  assert.ok(cliOut3.includes('Hugging Face Inference'));
  assert.ok(cliOut3.includes('Vercel AI SDK'));
  assert.ok(cliOut3.includes('LiteLLM'));

  const cliOut4 = execSync(`node "${scriptPath}" inference sdk vercel_ai`, { encoding: 'utf-8' });
  assert.ok(cliOut4.includes('@ai-sdk/togetherai'));
  assert.ok(cliOut4.includes('createTogetherAI'));

  const cliOut5 = execSync(`node "${scriptPath}" inference run --dry-run`, { encoding: 'utf-8' });
  assert.ok(cliOut5.includes('Executed shared inference successfully'));

  console.log('✅ CLI executable inference commands verified with exit code 0.');

  console.log('\n🎉 ALL TOGETHER.AI INFERENCE OVERVIEW, OPENAI COMPATIBILITY & SDK INTEGRATION TESTS PASSED.');
}

runInferenceTestSuite().catch(err => {
  console.error('❌ Inference Test Suite Failed:', err);
  process.exit(1);
});
