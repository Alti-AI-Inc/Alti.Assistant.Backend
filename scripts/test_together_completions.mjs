/**
 * Dedicated Test Suite for Together.ai Completions API (POST /completions & POST /v1/completions)
 * Official Reference: https://docs.together.ai/reference/completions
 * License: MIT
 */
import assert from 'assert';
import { llmComplete } from '../src/app/services/llm.client.js';
import { InferenceGateway } from '../src/app/modules/inference/inference.gateway.js';

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    written: [],
    ended: false,
    headersSent: false,
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
      this.headersSent = true;
      return this;
    },
    write(chunk) {
      this.written.push(chunk);
      return true;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  return res;
}

console.log('🧪 Testing Together.ai Completions API (https://docs.together.ai/reference/completions)...\n');

// Test 1: llmComplete direct call
console.log('[Test 1] llmComplete direct execution...');
const text1 = await llmComplete('Once upon a time in a sovereign datacenter');
assert.ok(typeof text1 === 'string' && text1.length > 0, 'Expected non-empty string completion');
console.log(`✅ Test 1 Passed: Generated text: "${text1.slice(0, 60)}..."`);

// Test 2: Gateway non-streaming text completion
console.log('[Test 2] InferenceGateway.handleTextCompletion (non-streaming)...');
const res2 = mockRes();
await InferenceGateway.handleTextCompletion(
  {
    model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    prompt: 'Define zero-trust sovereign AI security architecture.',
    max_tokens: 64,
    temperature: 0.5,
  },
  res2
);
assert.strictEqual(res2.statusCode, 200);
assert.strictEqual(res2.body.object, 'text_completion');
assert.ok(Array.isArray(res2.body.choices) && res2.body.choices.length > 0);
assert.strictEqual(res2.body.choices[0].finish_reason, 'stop');
assert.ok(res2.body.usage && typeof res2.body.usage.total_tokens === 'number');
console.log('✅ Test 2 Passed: Non-streaming text completion schema verified.');

// Test 3: Gateway streaming text completion (stream: true)
console.log('[Test 3] InferenceGateway.handleTextCompletion (streaming)...');
const res3 = mockRes();
await InferenceGateway.handleTextCompletion(
  {
    prompt: 'Stream continuous tokens test',
    stream: true,
  },
  res3
);
assert.strictEqual(res3.headers['Content-Type'], 'text/event-stream');
assert.ok(res3.written.length >= 2, 'Expected at least 2 SSE chunks');
assert.ok(res3.written.some((chunk) => chunk.includes('data: [DONE]')), 'Expected [DONE] terminator');
assert.strictEqual(res3.ended, true);
console.log(`✅ Test 3 Passed: Streamed ${res3.written.length} SSE chunks successfully.`);

// Test 4: echo: true option
console.log('[Test 4] echo: true parameter...');
const res4 = mockRes();
const testPrompt = 'Echo this prompt back:';
await InferenceGateway.handleTextCompletion(
  {
    prompt: testPrompt,
    echo: true,
  },
  res4
);
assert.strictEqual(res4.statusCode, 200);
assert.ok(res4.body.choices[0].text.startsWith(testPrompt), 'Text should start with prompt when echo is true');
console.log('✅ Test 4 Passed: echo parameter verified.');

// Test 5: Missing prompt validation (400)
console.log('[Test 5] Validation for missing prompt parameter...');
const res5 = mockRes();
await InferenceGateway.handleTextCompletion({}, res5);
assert.strictEqual(res5.statusCode, 400);
assert.strictEqual(res5.body.error.type, 'invalid_request_error');
assert.strictEqual(res5.body.error.param, 'prompt');
console.log('✅ Test 5 Passed: Missing prompt correctly returned 400.');

console.log('\n🎉 ALL 5 TOGETHER.AI COMPLETIONS TESTS PASSED CLEANLY!\n');
