/**
 * Test Suite for Together.ai Error Codes & Diagnostics
 * Official Reference: https://docs.together.ai/docs/error-codes
 * 
 * Verifies Service Layer, Gateway Layer, and Express Router Stack for:
 * - 400: Invalid Request
 * - 401: Authentication Error
 * - 402: Payment Required
 * - 403: Bad Request (Context Length Exceeded)
 * - 404: Not Found
 * - 429: Too Many Requests (Rate Limit & GPU Quota)
 * - 500: Server Error
 * - 503: Engine Overloaded
 * - 504: Timeout
 * - 524: Cloudflare Timeout
 * - 529: Server Overloaded
 * 
 * License: MIT
 */
import assert from 'assert';
import {
  TOGETHER_ERROR_CODES,
  llmGetErrorCodes,
  llmGetErrorCode,
  llmDiagnoseTogetherError,
  formatTogetherError,
} from '../src/app/services/llm.client.js';
import InferenceGateway from '../src/app/modules/inference/inference.gateway.js';
import router from '../src/app/modules/inference/inference.route.js';

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

async function runErrorCodesTestSuite() {
  console.log('🧪 Testing Together.ai Error Codes & Diagnostics Suite (11 Error Codes)...\n');

  // ==========================================
  // 1. SERVICE LAYER TESTS
  // ==========================================
  console.log('── 1. Service Layer Tests ──');

  // 1.1 Verify all 11 official error codes
  console.log('[Test 1.1] Verifying TOGETHER_ERROR_CODES catalog...');
  const expectedCodes = [400, 401, 402, 403, 404, 429, 500, 503, 504, 524, 529];
  for (const code of expectedCodes) {
    const entry = TOGETHER_ERROR_CODES[code];
    assert.ok(entry, `Error code ${code} must exist in catalog`);
    assert.strictEqual(entry.code, code);
    assert.ok(entry.name, `Code ${code} must have a name`);
    assert.ok(entry.cause, `Code ${code} must have a cause`);
    assert.ok(entry.solution, `Code ${code} must have a solution`);
    assert.ok(entry.sovereignRecovery, `Code ${code} must have sovereign recovery instructions`);
  }
  console.log(`✅ Service: All 11 official error codes verified in dictionary.`);

  // 1.2 llmGetErrorCodes
  console.log('\n[Test 1.2] Service: llmGetErrorCodes()...');
  const allCodes = await llmGetErrorCodes();
  assert.ok(allCodes && Array.isArray(allCodes.data));
  assert.strictEqual(allCodes.data.length, 11, 'Should return all 11 error codes');
  console.log(`✅ Service: llmGetErrorCodes returned ${allCodes.data.length} codes.`);

  // 1.3 llmGetErrorCode
  console.log('\n[Test 1.3] Service: llmGetErrorCode(429)...');
  const code429 = await llmGetErrorCode(429);
  assert.strictEqual(code429.code, 429);
  assert.strictEqual(code429.name, 'Too Many Requests');
  console.log(`✅ Service: Retrieved 429 details: "${code429.cause}".`);

  // 1.4 llmDiagnoseTogetherError
  console.log('\n[Test 1.4] Service: llmDiagnoseTogetherError()...');
  const diagnostic = await llmDiagnoseTogetherError({ statusCode: 403, message: 'context length exceeded' });
  assert.strictEqual(diagnostic.diagnosed, true);
  assert.strictEqual(diagnostic.statusCode, 403);
  assert.ok(diagnostic.solution.includes('max_tokens'));
  console.log(`✅ Service: Diagnosed 403 error. Solution: "${diagnostic.solution}".`);

  // 1.5 formatTogetherError
  console.log('\n[Test 1.5] Service: formatTogetherError()...');
  const formatted = formatTogetherError({ status: 503, message: 'Capacity full' });
  assert.ok(formatted.includes('503'));
  assert.ok(formatted.includes('Engine Overloaded'));
  console.log(`✅ Service: Formatted string: "${formatted}".`);

  // ==========================================
  // 2. GATEWAY LAYER TESTS
  // ==========================================
  console.log('\n── 2. Gateway Layer Tests ──');

  // 2.1 handleListErrorCodes
  console.log('[Test 2.1] Gateway: handleListErrorCodes()...');
  const resGwList = mockRes();
  await InferenceGateway.handleListErrorCodes({ query: {} }, resGwList);
  assert.strictEqual(resGwList.statusCode, 200);
  assert.strictEqual(resGwList.body.data.length, 11);
  console.log(`✅ Gateway: handleListErrorCodes returned ${resGwList.body.data.length} codes.`);

  // 2.2 handleGetErrorCode
  console.log('\n[Test 2.2] Gateway: handleGetErrorCode(401)...');
  const resGwGet = mockRes();
  await InferenceGateway.handleGetErrorCode({ params: { code: '401' } }, resGwGet);
  assert.strictEqual(resGwGet.statusCode, 200);
  assert.strictEqual(resGwGet.body.code, 401);
  assert.strictEqual(resGwGet.body.name, 'Authentication Error');
  console.log(`✅ Gateway: handleGetErrorCode(401) returned: ${resGwGet.body.name}.`);

  // 2.3 handleDiagnoseError
  console.log('\n[Test 2.3] Gateway: handleDiagnoseError()...');
  const resGwDiag = mockRes();
  await InferenceGateway.handleDiagnoseError({ body: { code: 524, message: 'Cloudflare edge timeout' } }, resGwDiag);
  assert.strictEqual(resGwDiag.statusCode, 200);
  assert.strictEqual(resGwDiag.body.statusCode, 524);
  assert.strictEqual(resGwDiag.body.matchedError, 'Cloudflare Timeout');
  console.log(`✅ Gateway: handleDiagnoseError(524) correctly matched Cloudflare Timeout.`);

  // ==========================================
  // 3. ROUTER STACK TESTS
  // ==========================================
  console.log('\n── 3. Router Stack Tests ──');
  const routes = [];
  router.stack.forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    }
  });

  const expectedRoutes = [
    { path: '/together/error-codes', method: 'GET' },
    { path: '/v1/together/error-codes', method: 'GET' },
    { path: '/together/error-codes/:code', method: 'GET' },
    { path: '/v1/together/error-codes/:code', method: 'GET' },
    { path: '/together/diagnose-error', method: 'POST' },
    { path: '/v1/together/diagnose-error', method: 'POST' },
  ];

  for (const exp of expectedRoutes) {
    const match = routes.find((r) => r.path === exp.path && r.methods.includes(exp.method));
    assert.ok(match, `Route ${exp.method} ${exp.path} must be registered in router`);
  }
  console.log(`✅ Router: All ${expectedRoutes.length} Together error codes and diagnostic routes verified.`);

  console.log('\n🎉 ALL TOGETHER.AI ERROR CODES & DIAGNOSTICS TESTS PASSED CLEANLY (11/11 CODES VERIFIED)!\n');
}

runErrorCodesTestSuite().catch((err) => {
  console.error('❌ Error Codes Test Suite Failed:', err);
  process.exit(1);
});
