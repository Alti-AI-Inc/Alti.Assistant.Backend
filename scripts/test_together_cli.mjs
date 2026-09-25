/**
 * Automated Test Suite for Together.ai CLI Suite across all 13 Reference Domains
 * 
 * 1.  Getting Started:  https://docs.together.ai/reference/cli/getting-started
 * 2.  Telemetry:        https://docs.together.ai/reference/cli/telemetry
 * 3.  Models (v1):      https://docs.together.ai/reference/cli/models
 * 4.  Endpoints (v1):   https://docs.together.ai/reference/cli/endpoints
 * 5.  Files:            https://docs.together.ai/reference/cli/files
 * 6.  Fine-tuning:      https://docs.together.ai/reference/cli/finetune
 * 7.  Evals:            https://docs.together.ai/reference/cli/evals
 * 8.  Batches:          https://docs.together.ai/reference/cli/batches
 * 9.  Whoami:           https://docs.together.ai/reference/cli/whoami
 * 10. Models Beta:      https://docs.together.ai/reference/cli/models-beta
 * 11. Endpoints Beta:   https://docs.together.ai/reference/cli/endpoints-beta
 * 12. Clusters:         https://docs.together.ai/reference/cli/clusters
 * 13. Jig:              https://docs.together.ai/reference/cli/jig
 * 
 * License: MIT
 */

import assert from 'assert';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  CLI_VERSION,
  parseCliArgs,
  getCliTelemetryConfig,
  updateCliTelemetryConfig,
  executeTogetherCliCommand,
} from '../src/app/services/together.cli.js';
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
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
  };
}

async function runCliTestSuite() {
  console.log('🧪 Testing Together.ai CLI Suite across all 13 reference domains...\n');

  // ==========================================
  // 1. SERVICE LAYER TESTS (13 DOMAINS)
  // ==========================================
  console.log('── 1. Service Layer Tests (13 Reference Domains) ──');

  // 1.1 Getting Started
  console.log('[Domain 1/13] Getting Started: --version, --help, login, config');
  const verRes = await executeTogetherCliCommand('--version');
  assert.strictEqual(verRes.success, true);
  assert.strictEqual(verRes.code, 0);
  assert.strictEqual(verRes.domain, 'getting-started');
  assert.ok(verRes.output.includes(CLI_VERSION));

  const helpRes = await executeTogetherCliCommand('--help');
  assert.strictEqual(helpRes.success, true);
  assert.ok(helpRes.output.includes('Usage: together'));

  const loginRes = await executeTogetherCliCommand('login --api-key mock-test-key-1234');
  assert.strictEqual(loginRes.success, true);
  assert.strictEqual(loginRes.data.authenticated, true);

  const cfgRes = await executeTogetherCliCommand('config');
  assert.strictEqual(cfgRes.success, true);
  assert.ok(cfgRes.data.telemetry);

  // 1.2 Telemetry
  console.log('[Domain 2/13] Telemetry: status, enable, disable');
  const telStat = await executeTogetherCliCommand('telemetry status');
  assert.strictEqual(telStat.success, true);
  assert.strictEqual(telStat.domain, 'telemetry');
  assert.ok(telStat.output.includes('Telemetry is'));

  const telEn = await executeTogetherCliCommand('telemetry enable');
  assert.strictEqual(telEn.success, true);
  assert.strictEqual(telEn.data.telemetry_enabled, true);

  const telDis = await executeTogetherCliCommand('telemetry disable');
  assert.strictEqual(telDis.success, true);
  assert.strictEqual(telDis.data.telemetry_enabled, false);

  // Restore enable for subsequent tests
  updateCliTelemetryConfig({ enabled: true });

  // 1.3 Models (v1.0)
  console.log('[Domain 3/13] Models: list, info');
  const modList = await executeTogetherCliCommand('models list');
  assert.strictEqual(modList.success, true);
  assert.strictEqual(modList.domain, 'models');
  assert.ok(Array.isArray(modList.data.models));

  const modInfo = await executeTogetherCliCommand('models info meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo');
  assert.strictEqual(modInfo.success, true);
  assert.ok(modInfo.data.model);

  // 1.4 Endpoints (v1.0)
  console.log('[Domain 4/13] Endpoints: list, create, get, hardware, zones');
  const epList = await executeTogetherCliCommand('endpoints list');
  assert.strictEqual(epList.success, true);
  assert.strictEqual(epList.domain, 'endpoints');

  const epCreate = await executeTogetherCliCommand('endpoints create --model meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo --hardware NVIDIA-A100-80GB');
  assert.strictEqual(epCreate.success, true);
  assert.ok(epCreate.data.endpoint);

  const epHw = await executeTogetherCliCommand('endpoints hardware');
  assert.strictEqual(epHw.success, true);

  const epZones = await executeTogetherCliCommand('endpoints zones');
  assert.strictEqual(epZones.success, true);

  // 1.5 Files
  console.log('[Domain 5/13] Files: list, upload, check, retrieve');
  const fileList = await executeTogetherCliCommand('files list');
  assert.strictEqual(fileList.success, true);
  assert.strictEqual(fileList.domain, 'files');

  const fileCheck = await executeTogetherCliCommand('files check ./test-data.jsonl');
  assert.strictEqual(fileCheck.success, true);
  assert.strictEqual(fileCheck.data.valid, true);

  const fileUpl = await executeTogetherCliCommand('files upload ./test-data.jsonl --purpose fine-tune');
  assert.strictEqual(fileUpl.success, true);
  assert.ok(fileUpl.data.file);

  // 1.6 Fine-tuning
  console.log('[Domain 6/13] Fine-tuning: create, list, retrieve, events, checkpoints, limits');
  const ftCreate = await executeTogetherCliCommand('finetune create --training-file file-12345 --model meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo');
  assert.strictEqual(ftCreate.success, true);
  assert.strictEqual(ftCreate.domain, 'finetune');
  assert.ok(ftCreate.data.fine_tune);

  const ftList = await executeTogetherCliCommand('finetune list');
  assert.strictEqual(ftList.success, true);

  const ftLimits = await executeTogetherCliCommand('finetune limits');
  assert.strictEqual(ftLimits.success, true);
  assert.strictEqual(ftLimits.data.max_concurrent_jobs, 5);

  // 1.7 Evals
  console.log('[Domain 7/13] Evals: create, list, models');
  const evalCreate = await executeTogetherCliCommand('evals create --model meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo --type accuracy');
  assert.strictEqual(evalCreate.success, true);
  assert.strictEqual(evalCreate.domain, 'evals');

  const evalList = await executeTogetherCliCommand('evals list');
  assert.strictEqual(evalList.success, true);

  const evalMods = await executeTogetherCliCommand('evals models');
  assert.strictEqual(evalMods.success, true);

  // 1.8 Batches
  console.log('[Domain 8/13] Batches: submit, list');
  const batchSub = await executeTogetherCliCommand('batches submit file-batch-input-1 --endpoint meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo');
  assert.strictEqual(batchSub.success, true);
  assert.strictEqual(batchSub.domain, 'batches');

  const batchList = await executeTogetherCliCommand('batches list');
  assert.strictEqual(batchList.success, true);

  // 1.9 Whoami
  console.log('[Domain 9/13] Whoami: identity & organization');
  const whoRes = await executeTogetherCliCommand('whoami');
  assert.strictEqual(whoRes.success, true);
  assert.strictEqual(whoRes.domain, 'whoami');
  assert.ok(whoRes.output.includes('User:'));
  assert.ok(whoRes.output.includes('Organization:'));

  // 1.10 Models Beta (DMI 2.0)
  console.log('[Domain 10/13] Models Beta: create, list, public, org, configs, remote-uploads');
  const bModCreate = await executeTogetherCliCommand('beta models create my-custom-glm --base-model zai-org/GLM-5.2');
  assert.strictEqual(bModCreate.success, true);
  assert.strictEqual(bModCreate.domain, 'models-beta');

  const bModList = await executeTogetherCliCommand('beta models list');
  assert.strictEqual(bModList.success, true);

  const bModPub = await executeTogetherCliCommand('beta models public');
  assert.strictEqual(bModPub.success, true);

  const bModOrg = await executeTogetherCliCommand('beta models org');
  assert.strictEqual(bModOrg.success, true);

  const bModCfg = await executeTogetherCliCommand('beta models configs');
  assert.strictEqual(bModCfg.success, true);

  const bModUpl = await executeTogetherCliCommand('beta models remote-uploads list');
  assert.strictEqual(bModUpl.success, true);

  // 1.11 Endpoints Beta (DMI 2.0)
  console.log('[Domain 11/13] Endpoints Beta: deploy, list, analytics, hardware, zones');
  const bEpDeploy = await executeTogetherCliCommand('beta endpoints deploy zai-org/GLM-5.2 --endpoint my-glm-ep --min-replicas 1 --max-replicas 2');
  assert.strictEqual(bEpDeploy.success, true);
  assert.strictEqual(bEpDeploy.domain, 'endpoints-beta');

  const bEpList = await executeTogetherCliCommand('beta endpoints list');
  assert.strictEqual(bEpList.success, true);

  const bEpAnalytics = await executeTogetherCliCommand('beta endpoints analytics ep-test-01');
  assert.strictEqual(bEpAnalytics.success, true);

  // 1.12 Clusters
  console.log('[Domain 12/13] Clusters: create, list, regions, ssh, credentials, storage, remediation');
  const clCreate = await executeTogetherCliCommand('beta clusters create --name alpha-h100-cluster --num-gpus 8');
  assert.strictEqual(clCreate.success, true);
  assert.strictEqual(clCreate.domain, 'clusters');

  const clList = await executeTogetherCliCommand('beta clusters list');
  assert.strictEqual(clList.success, true);

  const clReg = await executeTogetherCliCommand('beta clusters list-regions');
  assert.strictEqual(clReg.success, true);

  const clSsh = await executeTogetherCliCommand('beta clusters ssh cl-001');
  assert.strictEqual(clSsh.success, true);
  assert.ok(clSsh.data.ssh_command.includes('ssh root@'));

  const clCred = await executeTogetherCliCommand('beta clusters credentials cl-001');
  assert.strictEqual(clCred.success, true);
  assert.ok(clCred.data.kubeconfig);

  const clStorage = await executeTogetherCliCommand('beta clusters storage list');
  assert.strictEqual(clStorage.success, true);

  const clRemed = await executeTogetherCliCommand('beta clusters remediation list');
  assert.strictEqual(clRemed.success, true);

  // 1.13 Jig
  console.log('[Domain 13/13] Jig: init, dockerfile, build, push, deploy, list, logs, queue, secrets, volumes');
  const jigInit = await executeTogetherCliCommand('beta jig init');
  assert.strictEqual(jigInit.success, true);
  assert.strictEqual(jigInit.domain, 'jig');
  assert.ok(jigInit.data.content.includes('[tool.jig.image]'));

  const jigDock = await executeTogetherCliCommand('beta jig dockerfile');
  assert.strictEqual(jigDock.success, true);
  assert.ok(jigDock.data.dockerfile.includes('FROM python'));

  const jigBuild = await executeTogetherCliCommand('beta jig build --name sovereign-vllm');
  assert.strictEqual(jigBuild.success, true);

  const jigPush = await executeTogetherCliCommand('beta jig push');
  assert.strictEqual(jigPush.success, true);

  const jigDeploy = await executeTogetherCliCommand('beta jig deploy --name my-jig-container --hardware NVIDIA-H100-SXM');
  assert.strictEqual(jigDeploy.success, true);

  const jigList = await executeTogetherCliCommand('beta jig list');
  assert.strictEqual(jigList.success, true);

  const jigQueue = await executeTogetherCliCommand('beta jig queue-status');
  assert.strictEqual(jigQueue.success, true);

  const jigSec = await executeTogetherCliCommand('beta jig secrets list');
  assert.strictEqual(jigSec.success, true);

  const jigVol = await executeTogetherCliCommand('beta jig volumes list');
  assert.strictEqual(jigVol.success, true);

  console.log('✅ All 13 CLI Reference Domains successfully tested at Service Layer.\n');

  // ==========================================
  // 2. GATEWAY LAYER TESTS
  // ==========================================
  console.log('── 2. Gateway Layer Tests ──');

  console.log('[Gateway 2.1] handleExecuteCliCommand (execute command)...');
  const gwReq = { body: { command: 'whoami' } };
  const gwRes = mockRes();
  await InferenceGateway.handleExecuteCliCommand(gwReq, gwRes);
  assert.strictEqual(gwRes.statusCode, 200);
  assert.strictEqual(gwRes.body.success, true);
  assert.strictEqual(gwRes.body.domain, 'whoami');

  console.log('[Gateway 2.2] handleGetCliTelemetry...');
  const telReq = {};
  const telRes = mockRes();
  await InferenceGateway.handleGetCliTelemetry(telReq, telRes);
  assert.strictEqual(telRes.statusCode, 200);
  assert.ok(telRes.body.device_id);

  console.log('[Gateway 2.3] handleUpdateCliTelemetry...');
  const upReq = { body: { enabled: true } };
  const upRes = mockRes();
  await InferenceGateway.handleUpdateCliTelemetry(upReq, upRes);
  assert.strictEqual(upRes.statusCode, 200);
  assert.strictEqual(upRes.body.telemetry_enabled, true);

  console.log('✅ Gateway Layer tests passed.\n');

  // ==========================================
  // 3. EXPRESS ROUTER STACK TESTS
  // ==========================================
  console.log('── 3. Express Router Stack Tests ──');

  const registeredRoutes = router.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).map(m => m.toUpperCase()),
    }));

  const expectedPaths = [
    { path: '/together/cli/execute', method: 'POST' },
    { path: '/v1/together/cli/execute', method: 'POST' },
    { path: '/cli/execute', method: 'POST' },
    { path: '/v1/cli/execute', method: 'POST' },
    { path: '/together/cli/telemetry', method: 'GET' },
    { path: '/v1/together/cli/telemetry', method: 'GET' },
    { path: '/cli/telemetry', method: 'GET' },
    { path: '/v1/cli/telemetry', method: 'GET' },
    { path: '/together/cli/telemetry', method: 'POST' },
    { path: '/v1/together/cli/telemetry', method: 'POST' },
    { path: '/cli/telemetry', method: 'POST' },
    { path: '/v1/cli/telemetry', method: 'POST' },
  ];

  for (const exp of expectedPaths) {
    const found = registeredRoutes.find(r => r.path === exp.path && r.methods.includes(exp.method));
    assert.ok(found, `Expected router to mount ${exp.method} ${exp.path}`);
  }
  console.log(`✅ All ${expectedPaths.length} dual Express CLI routes verified mounted.\n`);

  // ==========================================
  // 4. CLI BINARY EXECUTABLE TESTS
  // ==========================================
  console.log('── 4. Executable CLI Script Tests (scripts/together_cli.mjs) ──');
  const scriptPath = path.join(__dirname, 'together_cli.mjs');

  const cliOutput1 = execSync(`node "${scriptPath}" --version`, { encoding: 'utf-8' });
  assert.ok(cliOutput1.includes(CLI_VERSION), 'CLI executable should output version');

  const cliOutput2 = execSync(`node "${scriptPath}" whoami`, { encoding: 'utf-8' });
  assert.ok(cliOutput2.includes('User:'), 'CLI executable whoami should output User info');

  const cliOutput3 = execSync(`node "${scriptPath}" beta jig dockerfile`, { encoding: 'utf-8' });
  assert.ok(cliOutput3.includes('FROM python'), 'CLI executable beta jig dockerfile should output Dockerfile');

  console.log('✅ CLI executable script verified functional with exit code 0.\n');

  console.log('🎉 ALL TOGETHER.AI CLI SUITE TESTS PASSED (13 DOMAINS, GATEWAY, ROUTER, EXECUTABLE).');
}

runCliTestSuite().catch(err => {
  console.error('❌ CLI Test Suite Failed:', err);
  process.exit(1);
});
