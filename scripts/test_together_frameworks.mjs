/**
 * Automated Test Suite for Together.ai Framework Integrations & Official Documentation
 * 
 * Verifies:
 * 1. Intro & Foundation: https://docs.together.ai/intro
 * 2. Composio:           https://docs.together.ai/docs/composio
 * 3. CrewAI:             https://docs.together.ai/docs/crewai
 * 4. LangGraph:          https://docs.together.ai/docs/langgraph
 * 5. DSPy:               https://docs.together.ai/docs/dspy
 * 6. PydanticAI:         https://docs.together.ai/docs/pydanticai
 * 7. AutoGen:            https://docs.together.ai/docs/autogen
 * 8. Agno:               https://docs.together.ai/docs/agno
 * 
 * License: MIT
 */

import assert from 'assert';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  FRAMEWORKS_CATALOG,
  getFrameworksCatalog,
  getFrameworkDoc,
  executeFrameworkAgent,
} from '../src/app/services/together.frameworks.js';
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

async function runFrameworksTestSuite() {
  console.log('🧪 Testing Together.ai Official Framework Integrations Suite (8 Frameworks)...\n');

  // ==========================================
  // 1. SERVICE LAYER TESTS
  // ==========================================
  console.log('── 1. Service Layer Tests: Catalog, Docs, and Execution ──');

  const frameworks = ['intro', 'composio', 'crewai', 'langgraph', 'dspy', 'pydanticai', 'autogen', 'agno'];

  // 1.1 Verify Catalog
  console.log('[Test 1.1] Verifying getFrameworksCatalog()...');
  const cat = getFrameworksCatalog();
  assert.strictEqual(cat.success, true);
  assert.strictEqual(cat.total_frameworks, 8);
  for (const f of frameworks) {
    const found = cat.frameworks.find(item => item.id === f);
    assert.ok(found, `Framework ${f} must exist in catalog`);
    assert.ok(found.name);
    assert.ok(found.url);
    assert.ok(found.description);
  }

  // 1.2 Verify Individual Docs & Code Snippets
  console.log('[Test 1.2] Verifying getFrameworkDoc() for all 8 frameworks...');
  for (const f of frameworks) {
    const doc = getFrameworkDoc(f);
    assert.strictEqual(doc.success, true);
    assert.ok(doc.framework.python_snippet, `${f} must have python_snippet`);
    assert.ok(doc.framework.typescript_snippet, `${f} must have typescript_snippet`);
    assert.ok(doc.framework.url.includes('docs.together.ai'));
  }

  // 1.3 Verify Execution for each framework
  console.log('[Test 1.3] Executing agent/workflow simulation for each framework...');
  for (const f of frameworks) {
    const res = await executeFrameworkAgent(f, {
      objective: 'Sovereign multi-agent architecture benchmark',
      prompt: 'Verify Liberty Center One inference latency',
      query: 'Latest developments in AI model routing',
    });
    assert.strictEqual(res.success, true, `Execution of ${f} should succeed`);
    assert.strictEqual(res.framework, f);
    assert.ok(res.data, `${f} execution result should contain data`);
    console.log(`  ✅ Framework [${f.padEnd(10)}] executed successfully (${res.duration_ms}ms)`);
  }

  // ==========================================
  // 2. GATEWAY LAYER TESTS
  // ==========================================
  console.log('\n── 2. Gateway Layer Tests ──');

  // 2.1 handleGetFrameworksDocs
  console.log('[Gateway 2.1] handleGetFrameworksDocs...');
  const gwReq1 = {};
  const gwRes1 = mockRes();
  await InferenceGateway.handleGetFrameworksDocs(gwReq1, gwRes1);
  assert.strictEqual(gwRes1.statusCode, 200);
  assert.strictEqual(gwRes1.body.total_frameworks, 8);

  // 2.2 handleGetFrameworkDoc
  console.log('[Gateway 2.2] handleGetFrameworkDoc (crewai)...');
  const gwReq2 = { params: { framework: 'crewai' } };
  const gwRes2 = mockRes();
  await InferenceGateway.handleGetFrameworkDoc(gwReq2, gwRes2);
  assert.strictEqual(gwRes2.statusCode, 200);
  assert.strictEqual(gwRes2.body.framework.id, 'crewai');

  // 2.3 handleExecuteFrameworkAgent
  console.log('[Gateway 2.3] handleExecuteFrameworkAgent (pydanticai)...');
  const gwReq3 = { body: { framework: 'pydanticai', payload: { prompt: 'Verify NVDA metrics' } } };
  const gwRes3 = mockRes();
  await InferenceGateway.handleExecuteFrameworkAgent(gwReq3, gwRes3);
  assert.strictEqual(gwRes3.statusCode, 200);
  assert.strictEqual(gwRes3.body.framework, 'pydanticai');

  // 2.4 handleGetFrameworksConfig
  console.log('[Gateway 2.4] handleGetFrameworksConfig...');
  const gwReq4 = {};
  const gwRes4 = mockRes();
  await InferenceGateway.handleGetFrameworksConfig(gwReq4, gwRes4);
  assert.strictEqual(gwRes4.statusCode, 200);
  assert.strictEqual(gwRes4.body.supported_frameworks.length, 8);

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
    { path: '/together/frameworks/docs', method: 'GET' },
    { path: '/v1/together/frameworks/docs', method: 'GET' },
    { path: '/frameworks/docs', method: 'GET' },
    { path: '/v1/frameworks/docs', method: 'GET' },
    { path: '/together/frameworks/docs/:framework', method: 'GET' },
    { path: '/v1/together/frameworks/docs/:framework', method: 'GET' },
    { path: '/frameworks/docs/:framework', method: 'GET' },
    { path: '/v1/frameworks/docs/:framework', method: 'GET' },
    { path: '/together/frameworks/execute', method: 'POST' },
    { path: '/v1/together/frameworks/execute', method: 'POST' },
    { path: '/frameworks/execute', method: 'POST' },
    { path: '/v1/frameworks/execute', method: 'POST' },
    { path: '/together/frameworks/config', method: 'GET' },
    { path: '/v1/together/frameworks/config', method: 'GET' },
    { path: '/frameworks/config', method: 'GET' },
    { path: '/v1/frameworks/config', method: 'GET' },
  ];

  for (const exp of expectedPaths) {
    const found = registeredRoutes.find(r => r.path === exp.path && r.methods.includes(exp.method));
    assert.ok(found, `Expected router to mount ${exp.method} ${exp.path}`);
  }
  console.log(`✅ All ${expectedPaths.length} dual Express framework routes verified mounted.`);

  // ==========================================
  // 4. CLI EXECUTABLE TESTS
  // ==========================================
  console.log('\n── 4. Executable CLI Script Tests ──');
  const scriptPath = path.join(__dirname, 'together_cli.mjs');

  const cliOut1 = execSync(`node "${scriptPath}" frameworks list`, { encoding: 'utf-8' });
  assert.ok(cliOut1.includes('Composio Tooling & Integrations'));
  assert.ok(cliOut1.includes('CrewAI Multi-Agent Swarms'));
  assert.ok(cliOut1.includes('LangGraph Stateful Agent Graphs'));
  assert.ok(cliOut1.includes('DSPy Programmatic Prompt Optimization'));
  assert.ok(cliOut1.includes('PydanticAI Type-Safe Agents'));
  assert.ok(cliOut1.includes('AutoGen (AG2) Conversational Agents'));
  assert.ok(cliOut1.includes('Agno (formerly Phidata)'));

  const cliOut2 = execSync(`node "${scriptPath}" frameworks docs crewai`, { encoding: 'utf-8' });
  assert.ok(cliOut2.includes('Framework: CrewAI Multi-Agent Swarms'));
  assert.ok(cliOut2.includes('from crewai import LLM'));

  console.log('✅ CLI executable frameworks commands verified with exit code 0.');

  console.log('\n🎉 ALL TOGETHER.AI FRAMEWORK INTEGRATION TESTS PASSED (8/8 FRAMEWORKS VERIFIED).');
}

runFrameworksTestSuite().catch(err => {
  console.error('❌ Frameworks Test Suite Failed:', err);
  process.exit(1);
});
