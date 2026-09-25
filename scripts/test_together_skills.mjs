/**
 * Automated Test Suite for Together.ai Coding Agent Skills & Docs MCP Server
 * 
 * Verifies:
 * 1. Agent Skills Official Documentation: https://docs.together.ai/docs/agent-skills
 *    - All 12 domain-specific skills:
 *      1.  together-chat-completions
 *      2.  together-images
 *      3.  together-video
 *      4.  together-audio
 *      5.  together-embeddings
 *      6.  together-fine-tuning
 *      7.  together-batch-inference
 *      8.  together-evaluations
 *      9.  together-sandboxes
 *      10. together-dedicated-model-inference
 *      11. together-dedicated-containers
 *      12. together-gpu-clusters
 *    - Multi-stage skill chaining
 * 2. Docs MCP Server: https://docs.together.ai/mcp
 *    - Server metadata and client configurations (Claude Code, Cursor, VS Code, Codex, OpenCode, Universal)
 *    - Tools: search_docs, get_doc_page, list_agent_skills, get_skill_spec
 * 3. Dual Express Routing & Gateway Handlers
 * 4. Sovereign CLI commands (together skills ..., together mcp ...)
 * 
 * License: MIT
 */

import assert from 'assert';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  TOGETHER_AGENT_SKILLS,
  DOCS_MCP_SERVER,
  listTogetherSkills,
  getTogetherSkill,
  getDocsMcpServerInfo,
  executeAgentSkill,
  executeSkillChain,
  handleMcpToolExecution,
} from '../src/app/services/together.skills.js';
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

async function runSkillsTestSuite() {
  console.log('🧪 Testing Together.ai Agent Skills & Docs MCP Server Suite...\n');

  // ==========================================
  // 1. SERVICE LAYER TESTS: 12 SKILLS
  // ==========================================
  console.log('── 1. Service Layer Tests: The 12 Official Coding Agent Skills ──');

  const expectedSkills = [
    'together-chat-completions',
    'together-images',
    'together-video',
    'together-audio',
    'together-embeddings',
    'together-fine-tuning',
    'together-batch-inference',
    'together-evaluations',
    'together-sandboxes',
    'together-dedicated-model-inference',
    'together-dedicated-containers',
    'together-gpu-clusters',
  ];

  // 1.1 Verify Catalog
  console.log('[Test 1.1] Verifying listTogetherSkills()...');
  const catalog = listTogetherSkills();
  assert.strictEqual(catalog.success, true);
  assert.strictEqual(catalog.total_skills, 12);
  assert.strictEqual(catalog.skills.length, 12);

  for (const sName of expectedSkills) {
    const s = catalog.skills.find(item => item.name === sName);
    assert.ok(s, `Skill ${sName} must exist in catalog`);
    assert.ok(s.title, `${sName} must have a title`);
    assert.ok(s.description, `${sName} must have a description`);
    assert.ok(Array.isArray(s.recommended_models), `${sName} must have recommended_models`);
    assert.ok(Array.isArray(s.triggers), `${sName} must have triggers`);
    assert.ok(s.specification_url.startsWith('https://github.com/togethercomputer/skills/tree/main/skills/'));
  }

  // 1.2 Verify Individual Specs & SKILL.md
  console.log('[Test 1.2] Verifying getTogetherSkill() & SKILL.md specs for all 12 skills...');
  for (const sName of expectedSkills) {
    const spec = getTogetherSkill(sName);
    assert.strictEqual(spec.name, sName);
    assert.ok(spec.skill_md.includes(`name: ${sName}`), `SKILL.md must declare name ${sName}`);
    assert.ok(spec.skill_md.startsWith('---'), 'SKILL.md must contain frontmatter');
  }

  // 1.3 Verify Execution of all 12 skills
  console.log('[Test 1.3] Executing all 12 agent skills via executeAgentSkill()...');
  for (const sName of expectedSkills) {
    const res = await executeAgentSkill(sName, {
      prompt: 'Verify sovereign Liberty Center One execution',
      text: 'Sample input for evaluation or embeddings',
      input: 'Test token sequence',
      dry_run: true,
    });
    assert.strictEqual(res.success, true, `Skill ${sName} execution must succeed`);
    assert.strictEqual(res.skill, sName);
    assert.ok(res.data, `${sName} execution must return data`);
    console.log(`  ✅ Skill [${sName.padEnd(35)}] executed in ${res.duration_ms}ms`);
  }

  // 1.4 Verify Skill Chaining
  console.log('[Test 1.4] Testing multi-stage skill chaining with executeSkillChain()...');
  const chainPlan = ['together-embeddings', 'together-chat-completions', 'together-evaluations'];
  const chainRes = await executeSkillChain(chainPlan, { prompt: 'Verify RAG pipeline accuracy', dry_run: true });
  assert.strictEqual(chainRes.success, true);
  assert.strictEqual(chainRes.chain_length, 3);
  assert.strictEqual(chainRes.steps.length, 3);
  assert.strictEqual(chainRes.status, 'chain_completed');
  console.log(`  ✅ Successfully chained ${chainRes.steps.length} skills sequentially`);

  // ==========================================
  // 2. DOCS MCP SERVER TESTS
  // ==========================================
  console.log('\n── 2. Docs MCP Server Tests (Specification & Tools) ──');

  // 2.1 Server Info & Client Configs
  console.log('[Test 2.1] Verifying getDocsMcpServerInfo()...');
  const mcpInfo = getDocsMcpServerInfo();
  assert.strictEqual(mcpInfo.success, true);
  assert.strictEqual(mcpInfo.server.name, 'TogetherAIDocs');
  assert.strictEqual(mcpInfo.server.docs_url, 'https://docs.together.ai/mcp');
  assert.strictEqual(mcpInfo.tools.length, 4);
  assert.ok(mcpInfo.client_configs.claude_code);
  assert.ok(mcpInfo.client_configs.cursor);
  assert.ok(mcpInfo.client_configs.vscode);
  assert.ok(mcpInfo.client_configs.codex);
  assert.ok(mcpInfo.client_configs.opencode);
  assert.ok(mcpInfo.client_configs.universal);

  // 2.2 Tool Execution
  console.log('[Test 2.2] Testing Docs MCP Server tools via handleMcpToolExecution()...');
  // Tool: search_docs
  const searchRes = await handleMcpToolExecution('search_docs', { query: 'video' });
  assert.ok(searchRes.matches.length >= 1);
  assert.ok(searchRes.matches.some(m => m.name === 'together-video'));

  // Tool: get_doc_page
  const pageRes = await handleMcpToolExecution('get_doc_page', { path: '/docs/agent-skills' });
  assert.strictEqual(pageRes.url, 'https://docs.together.ai/docs/agent-skills');

  // Tool: list_agent_skills
  const listRes = await handleMcpToolExecution('list_agent_skills', {});
  assert.strictEqual(listRes.total_skills, 12);

  // Tool: get_skill_spec
  const specRes = await handleMcpToolExecution('get_skill_spec', { skill_name: 'together-images' });
  assert.strictEqual(specRes.name, 'together-images');

  console.log('  ✅ All 4 Docs MCP Server tools executed successfully');

  // ==========================================
  // 3. GATEWAY LAYER TESTS
  // ==========================================
  console.log('\n── 3. Gateway Layer Tests ──');

  // 3.1 handleListAgentSkills
  console.log('[Gateway 3.1] handleListAgentSkills...');
  const gwReq1 = {};
  const gwRes1 = mockRes();
  await InferenceGateway.handleListAgentSkills(gwReq1, gwRes1);
  assert.strictEqual(gwRes1.statusCode, 200);
  assert.strictEqual(gwRes1.body.total_skills, 12);

  // 3.2 handleGetAgentSkill
  console.log('[Gateway 3.2] handleGetAgentSkill (together-sandboxes)...');
  const gwReq2 = { params: { skill: 'together-sandboxes' } };
  const gwRes2 = mockRes();
  await InferenceGateway.handleGetAgentSkill(gwReq2, gwRes2);
  assert.strictEqual(gwRes2.statusCode, 200);
  assert.strictEqual(gwRes2.body.name, 'together-sandboxes');

  // 3.3 handleExecuteAgentSkill
  console.log('[Gateway 3.3] handleExecuteAgentSkill (together-dedicated-containers)...');
  const gwReq3 = { body: { skill: 'together-dedicated-containers', params: { image: 'test:latest', dry_run: true } } };
  const gwRes3 = mockRes();
  await InferenceGateway.handleExecuteAgentSkill(gwReq3, gwRes3);
  assert.strictEqual(gwRes3.statusCode, 200);
  assert.strictEqual(gwRes3.body.skill, 'together-dedicated-containers');

  // 3.4 handleGetMcpServerInfo
  console.log('[Gateway 3.4] handleGetMcpServerInfo...');
  const gwReq4 = {};
  const gwRes4 = mockRes();
  await InferenceGateway.handleGetMcpServerInfo(gwReq4, gwRes4);
  assert.strictEqual(gwRes4.statusCode, 200);
  assert.strictEqual(gwRes4.body.server.name, 'TogetherAIDocs');

  // 3.5 handleMcpToolsCall
  console.log('[Gateway 3.5] handleMcpToolsCall...');
  const gwReq5 = { body: { tool: 'search_docs', arguments: { query: 'fine-tuning' } } };
  const gwRes5 = mockRes();
  await InferenceGateway.handleMcpToolsCall(gwReq5, gwRes5);
  assert.strictEqual(gwRes5.statusCode, 200);
  assert.ok(gwRes5.body.matches.some(m => m.name === 'together-fine-tuning'));

  // ==========================================
  // 4. EXPRESS ROUTER STACK TESTS
  // ==========================================
  console.log('\n── 4. Express Router Stack Tests ──');
  const registeredRoutes = router.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).map(m => m.toUpperCase()),
    }));

  const expectedPaths = [
    { path: '/together/skills', method: 'GET' },
    { path: '/v1/together/skills', method: 'GET' },
    { path: '/skills', method: 'GET' },
    { path: '/v1/skills', method: 'GET' },
    { path: '/together/skills/:skill', method: 'GET' },
    { path: '/v1/together/skills/:skill', method: 'GET' },
    { path: '/skills/:skill', method: 'GET' },
    { path: '/v1/skills/:skill', method: 'GET' },
    { path: '/together/skills/execute', method: 'POST' },
    { path: '/v1/together/skills/execute', method: 'POST' },
    { path: '/skills/execute', method: 'POST' },
    { path: '/v1/skills/execute', method: 'POST' },
    { path: '/together/mcp', method: 'GET' },
    { path: '/v1/together/mcp', method: 'GET' },
    { path: '/mcp', method: 'GET' },
    { path: '/v1/mcp', method: 'GET' },
    { path: '/together/mcp/tools', method: 'POST' },
    { path: '/v1/together/mcp/tools', method: 'POST' },
    { path: '/mcp/tools', method: 'POST' },
    { path: '/v1/mcp/tools', method: 'POST' },
  ];

  for (const exp of expectedPaths) {
    const found = registeredRoutes.find(r => r.path === exp.path && r.methods.includes(exp.method));
    assert.ok(found, `Expected router to mount ${exp.method} ${exp.path}`);
  }
  console.log(`✅ All ${expectedPaths.length} dual Express skills & MCP routes verified mounted.`);

  // ==========================================
  // 5. CLI EXECUTABLE TESTS
  // ==========================================
  console.log('\n── 5. Executable CLI Script Tests ──');
  const scriptPath = path.join(__dirname, 'together_cli.mjs');

  const cliOut1 = execSync(`node "${scriptPath}" skills list`, { encoding: 'utf-8' });
  assert.ok(cliOut1.includes('together-chat-completions'));
  assert.ok(cliOut1.includes('together-images'));
  assert.ok(cliOut1.includes('together-video'));
  assert.ok(cliOut1.includes('together-audio'));
  assert.ok(cliOut1.includes('together-gpu-clusters'));

  const cliOut2 = execSync(`node "${scriptPath}" skills info together-audio`, { encoding: 'utf-8' });
  assert.ok(cliOut2.includes('Skill: together-audio'));
  assert.ok(cliOut2.includes('Audio Speech & Transcriptions'));

  const cliOut3 = execSync(`node "${scriptPath}" mcp info`, { encoding: 'utf-8' });
  assert.ok(cliOut3.includes('Docs MCP Server: TogetherAIDocs'));
  assert.ok(cliOut3.includes('search_docs'));

  const cliOut4 = execSync(`node "${scriptPath}" mcp search embeddings`, { encoding: 'utf-8' });
  assert.ok(cliOut4.includes('together-embeddings'));

  console.log('✅ CLI executable skills and mcp commands verified with exit code 0.');

  console.log('\n🎉 ALL TOGETHER.AI AGENT SKILLS & DOCS MCP SERVER TESTS PASSED (12/12 SKILLS & MCP VERIFIED).');
}

runSkillsTestSuite().catch(err => {
  console.error('❌ Skills Test Suite Failed:', err);
  process.exit(1);
});
