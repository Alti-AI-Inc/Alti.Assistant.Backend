import assert from 'assert';
import { llmCodeInterpreter, llmListCodeSessions } from '../src/app/services/llm.client.js';
import { InferenceGateway } from '../src/app/modules/inference/inference.gateway.js';

console.log('🧪 Testing Together.ai Code Interpreter (POST /tci/execute & GET /tci/sessions)...');

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

async function runTests() {
  // Test 1: llmCodeInterpreter python snippet execution
  console.log('[Test 1] llmCodeInterpreter execution...');
  const res1 = await llmCodeInterpreter('print(sum([x**2 for x in range(10)]))', {
    language: 'python',
    session_id: 'ses_test_001',
  });
  assert(res1 && typeof res1 === 'object', 'Response must be an object');
  assert(res1.data && typeof res1.data === 'object', 'Must have data object');
  assert.strictEqual(res1.data.status, 'success', 'Status must be success');
  assert(Array.isArray(res1.data.outputs), 'Outputs must be an array');
  assert(res1.data.outputs.length > 0, 'Outputs must have at least 1 item');
  assert(res1.output, 'Backward-compatible output field must exist');
  console.log('✅ Test 1 Passed: Code executed, session:', res1.data.session_id);

  // Test 2: llmListCodeSessions
  console.log('[Test 2] llmListCodeSessions...');
  const sessions = await llmListCodeSessions();
  assert(sessions && sessions.data && Array.isArray(sessions.data.sessions), 'Must have data.sessions array');
  assert(sessions.data.sessions.length > 0, 'Must have at least 1 active session');
  assert(sessions.data.sessions[0].id, 'Session must have id');
  console.log('✅ Test 2 Passed: Active code sessions retrieved:', sessions.data.sessions[0].id);

  // Test 3: InferenceGateway.handleExecuteCode via mock HTTP
  console.log('[Test 3] InferenceGateway.handleExecuteCode...');
  const httpRes = createMockRes();
  await InferenceGateway.handleExecuteCode(
    {
      body: {
        code: "import math\nprint(f'PI is {math.pi}')",
        language: 'python',
        session_id: 'ses_http_002',
      },
    },
    httpRes
  );
  assert.strictEqual(httpRes.statusCode, 200, 'Gateway should return 200');
  assert.strictEqual(httpRes.body.errors, null, 'Errors should be null on success');
  assert.strictEqual(httpRes.body.data.session_id, 'ses_http_002', 'Session ID should match');
  assert(httpRes.body.data.outputs[0].data, 'Output data should exist');
  console.log('✅ Test 3 Passed: Gateway code execution passed.');

  // Test 4: InferenceGateway.handleListCodeSessions via mock HTTP
  console.log('[Test 4] InferenceGateway.handleListCodeSessions...');
  const httpRes2 = createMockRes();
  await InferenceGateway.handleListCodeSessions({}, httpRes2);
  assert.strictEqual(httpRes2.statusCode, 200, 'Gateway should return 200');
  assert(Array.isArray(httpRes2.body.data.sessions), 'Sessions must be array');
  console.log('✅ Test 4 Passed: Gateway list sessions passed.');

  // Test 5: Missing code validation (400 Bad Request)
  console.log('[Test 5] Missing code validation...');
  const httpRes3 = createMockRes();
  await InferenceGateway.handleExecuteCode({ body: {} }, httpRes3);
  assert.strictEqual(httpRes3.statusCode, 400, 'Missing code should return 400');
  assert.strictEqual(httpRes3.body.errors[0].param, 'code');
  console.log('✅ Test 5 Passed: Validated code parameter requirement (400).');

  console.log('\n🎉 ALL 5 TOGETHER.AI CODE INTERPRETER TESTS PASSED CLEANLY!\n');
}

runTests().catch((err) => {
  console.error('❌ TCI test failed:', err);
  process.exit(1);
});
