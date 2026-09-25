/**
 * Comprehensive Verification Test for Together.ai Code Execution Suite
 * Covers:
 * 1. Code Interpreter: https://docs.together.ai/docs/together-code-interpreter
 * 2. Code Sandbox:     https://docs.together.ai/docs/together-code-sandbox
 * 
 * License: MIT
 */

import assert from 'assert';
import {
  TCI_SPEC,
  SANDBOX_BOOTUP_TYPES,
  SANDBOX_VM_TIERS,
  SANDBOX_PLANS,
  SANDBOX_CREDIT_RATE_USD,
  getCodeExecutionOverview,
  getCodeInterpreterDocs,
  getCodeSandboxDocs,
  estimateSandboxCost,
  validateTciParams,
  validateSandboxParams,
  executeCodeInterpreter,
  listCodeInterpreterSessions,
} from '../src/app/services/together.code.js';
import { executeTogetherCliCommand } from '../src/app/services/together.cli.js';
import InferenceGateway from '../src/app/modules/inference/inference.gateway.js';
import { inferenceRoutes } from '../src/app/modules/inference/inference.route.js';

console.log('🧪 Starting Together.ai Code Execution Suite Verification...\n');

// ── 1. Code Execution Suite Overview & Decision Matrix ───────────────────────
console.log('1️⃣ Testing Code Execution Suite Overview & Decision Matrix...');
const overview = getCodeExecutionOverview();
assert.strictEqual(overview.success, true);
assert.ok(overview.products.code_interpreter);
assert.ok(overview.products.code_sandbox);
assert.strictEqual(overview.products.code_interpreter.pricing, '$0.03 per session (60-minute lifespan)');
assert(overview.decision_matrix.length >= 4);
console.log('   ✅ Overview and TCI vs Code Sandbox decision matrix verified.');

// ── 2. Code Interpreter (TCI) Reference & 30 Preinstalled Packages ───────────
console.log('\n2️⃣ Testing Together Code Interpreter (TCI) Reference & Packages...');
const tciDocs = getCodeInterpreterDocs();
assert.strictEqual(tciDocs.success, true);
assert.strictEqual(tciDocs.pricing, '$0.03/session');
assert.strictEqual(tciDocs.lifespan, '60 minutes');
assert.strictEqual(tciDocs.agent_skill, 'together-sandboxes');
assert.strictEqual(tciDocs.mcp_server, '@togethercomputer/mcp-server-tci');
assert.strictEqual(tciDocs.preinstalled_packages.length, 30);
assert(tciDocs.preinstalled_packages.includes('numpy'));
assert(tciDocs.preinstalled_packages.includes('pandas'));
assert(tciDocs.preinstalled_packages.includes('matplotlib'));
assert(tciDocs.preinstalled_packages.includes('sympy'));
assert.strictEqual(tciDocs.runtime_package_install, '!pip install <package>');
assert(tciDocs.code_snippets.typescript.includes('client.codeInterpreter.execute'));
console.log('   ✅ TCI specs, 60-min lifespan, $0.03 pricing, and 30 packages verified.');

// ── 3. Code Sandbox Reference, 7 VM Tiers & Bootup Types ─────────────────────
console.log('\n3️⃣ Testing Together Code Sandbox Reference, 7 VM Tiers & Bootup Types...');
const sandboxDocs = getCodeSandboxDocs();
assert.strictEqual(sandboxDocs.success, true);
assert.strictEqual(sandboxDocs.sdk_package, '@codesandbox/sdk');
assert.strictEqual(sandboxDocs.startup_time, '< 3 seconds (template snapshot cloning)');
assert.strictEqual(sandboxDocs.credit_cost_usd, 0.01486);

// Verify all 7 VM Tiers
const tiers = Object.keys(SANDBOX_VM_TIERS);
['Pico', 'Nano', 'Micro', 'Small', 'Medium', 'Large', 'XLarge'].forEach(t => {
  assert(tiers.includes(t), `Expected VM tier ${t}`);
});
assert.strictEqual(SANDBOX_VM_TIERS.Nano.credits_per_hour, 10);
assert.strictEqual(SANDBOX_VM_TIERS.Nano.cost_per_hour, 0.1486);
assert.strictEqual(SANDBOX_VM_TIERS.Nano.cpu_cores, 2);
assert.strictEqual(SANDBOX_VM_TIERS.Nano.ram_gb, 4);

// Verify Bootup Types: FORK, RUNNING, RESUME, CLEAN
assert.ok(SANDBOX_BOOTUP_TYPES.FORK);
assert.ok(SANDBOX_BOOTUP_TYPES.RUNNING);
assert.ok(SANDBOX_BOOTUP_TYPES.RESUME);
assert.ok(SANDBOX_BOOTUP_TYPES.CLEAN);
console.log('   ✅ Code Sandbox specs, 7 VM tiers, and 4 bootup types (FORK/RUNNING/RESUME/CLEAN) verified.');

// ── 4. Sandbox Cost Estimator (Official Example Exact Match) ─────────────────
console.log('\n4️⃣ Testing Sandbox Cost Estimator (Official Documentation Example)...');
// Official example: 80 Nano VMs, 3 hrs/day, 30 days, Scale plan ($170/mo, 1100 free credits)
// Expected: 72,000 credits - 1,100 free = 70,900 credits * 0.01486 = $1053.57 + $170 = $1223.57
const estimate = estimateSandboxCost({
  vmTier: 'Nano',
  hoursPerDay: 3,
  days: 30,
  concurrentVms: 80,
  plan: 'Scale',
});
assert.strictEqual(estimate.total_runtime_hours, 7200);
assert.strictEqual(estimate.total_vm_credits, 72000);
assert.strictEqual(estimate.plan_included_credits, 1100);
assert.strictEqual(estimate.billable_credits, 70900);
assert.strictEqual(estimate.credits_cost_usd, 1053.57);
assert.strictEqual(estimate.plan_base_price_usd, 170);
assert.strictEqual(estimate.total_estimated_monthly_bill_usd, 1223.57);
console.log(`   ✅ Cost estimator matches official doc example exactly ($1223.57/mo).`);

// ── 5. TCI Parameter Validation ──────────────────────────────────────────────
console.log('\n5️⃣ Testing Together Code Interpreter Parameter Validation...');
// Valid request
const validTci = validateTciParams({
  code: 'print("hello sovereign")',
  language: 'python',
  session_id: 'ses_123',
});
assert.strictEqual(validTci.valid, true);

// Missing code
const missingCode = validateTciParams({ language: 'python' });
assert.strictEqual(missingCode.valid, false);
assert(missingCode.errors.some(e => e.includes('code')));

// Unsupported language
const unsupportedLang = validateTciParams({ code: 'console.log(1)', language: 'javascript' });
assert.strictEqual(unsupportedLang.valid, false);
assert(unsupportedLang.errors.some(e => e.includes('Unsupported language')));

// Valid files payload
const validFiles = validateTciParams({
  code: '!python script.py',
  files: [{ name: 'script.py', encoding: 'string', content: 'print(42)' }],
});
assert.strictEqual(validFiles.valid, true);
assert.strictEqual(validFiles.file_count, 1);
console.log('   ✅ TCI validation caught missing code, non-python languages, and verified file inputs.');

// ── 6. Code Sandbox Parameter Validation ─────────────────────────────────────
console.log('\n6️⃣ Testing Code Sandbox Parameter Validation...');
const validSandbox = validateSandboxParams({
  vmTier: 'Micro',
  source: 'template',
  ports: [5173],
});
assert.strictEqual(validSandbox.valid, true);

const invalidSandboxTier = validateSandboxParams({ vmTier: 'Giga' });
assert.strictEqual(invalidSandboxTier.valid, false);
assert(invalidSandboxTier.errors.some(e => e.includes('Invalid vmTier')));
console.log('   ✅ Sandbox validation verified valid/invalid VM tiers and ports.');

// ── 7. Code Interpreter Job Dispatchers ──────────────────────────────────────
console.log('\n7️⃣ Testing Code Interpreter Dispatchers...');
const execRes = await executeCodeInterpreter({
  code: 'x = [i**2 for i in range(5)]; print(x)',
  language: 'python',
});
assert(execRes.data);
assert.ok(execRes.data.session_id);
assert.ok(execRes.data.outputs.length > 0);

const sessionsRes = await listCodeInterpreterSessions();
assert(sessionsRes.data);
assert(Array.isArray(sessionsRes.data.sessions));
console.log(`   ✅ Code interpreter dispatchers executed cleanly (session: ${execRes.data.session_id}).`);

// ── 8. Inference Gateway Handlers ────────────────────────────────────────────
console.log('\n8️⃣ Testing Inference Gateway Code Handlers...');
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

const resOv = createMockRes();
await InferenceGateway.handleGetCodeOverview({}, resOv);
assert.strictEqual(resOv.statusCode, 200);
assert(resOv.body.products.code_interpreter);

const resTci = createMockRes();
await InferenceGateway.handleGetCodeInterpreterDocs({}, resTci);
assert.strictEqual(resTci.statusCode, 200);
assert.strictEqual(resTci.body.pricing, '$0.03/session');

const resCs = createMockRes();
await InferenceGateway.handleGetCodeSandboxDocs({}, resCs);
assert.strictEqual(resCs.statusCode, 200);
assert.strictEqual(resCs.body.sdk_package, '@codesandbox/sdk');

const resEst = createMockRes();
await InferenceGateway.handleEstimateSandboxCost({
  body: { vmTier: 'Nano', hoursPerDay: 3, days: 30, concurrentVms: 80, plan: 'Scale' },
}, resEst);
assert.strictEqual(resEst.statusCode, 200);
assert.strictEqual(resEst.body.total_estimated_monthly_bill_usd, 1223.57);

const resValTci = createMockRes();
await InferenceGateway.handleValidateTciRequest({ body: { code: 'print("ok")' } }, resValTci);
assert.strictEqual(resValTci.statusCode, 200);
assert.strictEqual(resValTci.body.valid, true);

const resValCs = createMockRes();
await InferenceGateway.handleValidateSandboxRequest({ body: { vmTier: 'Nano' } }, resValCs);
assert.strictEqual(resValCs.statusCode, 200);
assert.strictEqual(resValCs.body.valid, true);
console.log('   ✅ All 6 Inference Gateway code handlers verified.');

// ── 9. Express Dual Route Registrations ──────────────────────────────────────
console.log('\n9️⃣ Testing Dual Route Registrations in Express Router...');
const registeredRoutes = inferenceRoutes.stack
  .filter(r => r.route)
  .map(r => ({
    path: r.route.path,
    method: Object.keys(r.route.methods)[0].toUpperCase(),
  }));

const expectedEndpoints = [
  { path: '/together/code/overview', method: 'GET' },
  { path: '/v1/together/code/overview', method: 'GET' },
  { path: '/together/code-interpreter', method: 'GET' },
  { path: '/v1/together/code-interpreter', method: 'GET' },
  { path: '/together/tci/docs', method: 'GET' },
  { path: '/together/code-sandbox', method: 'GET' },
  { path: '/v1/together/code-sandbox', method: 'GET' },
  { path: '/together/sandbox/docs', method: 'GET' },
  { path: '/together/code-sandbox/estimate', method: 'POST' },
  { path: '/together/code-sandbox/estimate', method: 'GET' },
  { path: '/together/code-interpreter/validate', method: 'POST' },
  { path: '/together/code-sandbox/validate', method: 'POST' },
  { path: '/tci/execute', method: 'POST' },
  { path: '/v1/tci/execute', method: 'POST' },
  { path: '/tci/sessions', method: 'GET' },
  { path: '/v1/tci/sessions', method: 'GET' },
];

expectedEndpoints.forEach(expected => {
  const found = registeredRoutes.some(r => r.path === expected.path && r.method === expected.method);
  assert(found, `Expected route ${expected.method} ${expected.path} to be registered`);
});
console.log(`   ✅ Verified ${expectedEndpoints.length} dual-mounted code execution routes.`);

// ── 10. Together Sovereign CLI Commands ──────────────────────────────────────
console.log('\n🔟 Testing Together Sovereign CLI Code Commands...');
const cliOv = await executeTogetherCliCommand('together code overview');
assert.strictEqual(cliOv.success, true);
assert(cliOv.output.includes('Together AI Code Execution Suite Overview'));

const cliTci = await executeTogetherCliCommand('tg code interpreter');
assert.strictEqual(cliTci.success, true);
assert(cliTci.output.includes('Together Code Interpreter (TCI) Reference'));
assert(cliTci.output.includes('30 packages'));

const cliCs = await executeTogetherCliCommand('together code sandbox');
assert.strictEqual(cliCs.success, true);
assert(cliCs.output.includes('Together Code Sandbox Reference'));
assert(cliCs.output.includes('CodeSandbox SDK'));

const cliEst = await executeTogetherCliCommand('tg code estimate --tier Nano --hours 3 --vms 80 --days 30 --plan Scale');
assert.strictEqual(cliEst.success, true);
assert(cliEst.output.includes('Total Monthly Bill: $1223.57'));

const cliVal = await executeTogetherCliCommand('together code validate --code "x = 42"');
assert.strictEqual(cliVal.success, true);
assert(cliVal.output.includes('Status: VALID ✅'));

const cliExec = await executeTogetherCliCommand('together code execute --code "print(10 + 20)"');
assert.strictEqual(cliExec.success, true);
assert(cliExec.output.includes('Code Interpreter Execution'));

const cliSess = await executeTogetherCliCommand('tg code sessions');
assert.strictEqual(cliSess.success, true);
assert(cliSess.output.includes('Active Code Interpreter Sessions'));
console.log('   ✅ All 7 Together Sovereign CLI code commands verified cleanly.');

console.log('\n🎉 ALL 10 TOGETHER.AI CODE EXECUTION SUITE VERIFICATION PHASES PASSED CLEANLY!\n');
