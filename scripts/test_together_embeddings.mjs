/**
 * Dedicated Test Suite for Together.ai Embeddings API (POST /embeddings & POST /v1/embeddings)
 * Official Reference: https://docs.together.ai/reference/embeddings
 * License: MIT
 */
import assert from 'assert';
import { llmCreateEmbeddings, llmEmbed } from '../src/app/services/llm.client.js';
import { InferenceGateway } from '../src/app/modules/inference/inference.gateway.js';

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

console.log('🧪 Testing Together.ai Embeddings API (https://docs.together.ai/reference/embeddings)...\n');

// Test 1: Single string input
console.log('[Test 1] Single string embeddings...');
const res1 = await llmCreateEmbeddings('The quick brown fox jumps over the lazy dog');
assert.strictEqual(res1.object, 'list');
assert.ok(Array.isArray(res1.data), 'Expected data array');
assert.strictEqual(res1.data.length, 1);
assert.strictEqual(res1.data[0].object, 'embedding');
assert.strictEqual(res1.data[0].index, 0);
assert.ok(Array.isArray(res1.data[0].embedding), 'Expected float array vector');
assert.ok(res1.data[0].embedding.length >= 768, 'Expected 768+ dimensions');
assert.ok(res1.usage && typeof res1.usage.prompt_tokens === 'number');
console.log(`✅ Test 1 Passed: Single string embedding generated (${res1.data[0].embedding.length} dims).`);

// Test 2: Array of strings batch embeddings
console.log('[Test 2] Batch array embeddings...');
const res2 = await llmCreateEmbeddings([
  'Together.ai serverless GPU cloud',
  'Aphura sovereign agent infrastructure',
  'Liberty Center One Detroit Tier III',
]);
assert.strictEqual(res2.data.length, 3);
assert.strictEqual(res2.data[0].index, 0);
assert.strictEqual(res2.data[1].index, 1);
assert.strictEqual(res2.data[2].index, 2);
console.log('✅ Test 2 Passed: Batch array of 3 embeddings returned.');

// Test 3: encoding_format = "base64"
console.log('[Test 3] encoding_format = "base64"...');
const res3 = await llmCreateEmbeddings('Binary base64 representation test', {
  encoding_format: 'base64',
});
assert.strictEqual(typeof res3.data[0].embedding, 'string', 'Expected base64 string');
assert.ok(res3.data[0].embedding.length > 50, 'Expected non-empty base64 string');
console.log('✅ Test 3 Passed: base64 encoded embedding output verified.');

// Test 4: Custom dimensions parameter
console.log('[Test 4] Custom dimensions truncation (dimensions = 512)...');
const res4 = await llmCreateEmbeddings('Dimensionality reduction test', {
  dimensions: 512,
});
assert.strictEqual(res4.data[0].embedding.length, 512, 'Expected 512 dimensions');
console.log('✅ Test 4 Passed: Exact 512 dimensions verified.');

// Test 5: Gateway handler execution
console.log('[Test 5] InferenceGateway.handleEmbeddings...');
const mockResObj = mockRes();
await InferenceGateway.handleEmbeddings(
  {
    body: {
      model: 'togethercomputer/m2-bert-80M-8k-retrieval',
      input: ['Test gateway embedding vector generation'],
    },
  },
  mockResObj
);
assert.strictEqual(mockResObj.statusCode, 200);
assert.strictEqual(mockResObj.body.object, 'list');
assert.strictEqual(mockResObj.body.data.length, 1);
console.log('✅ Test 5 Passed: Gateway embeddings endpoint handler succeeded.');

// Test 6: Missing input parameter validation
console.log('[Test 6] Validation for missing input parameter...');
const mockErrRes = mockRes();
await InferenceGateway.handleEmbeddings({ body: {} }, mockErrRes);
assert.strictEqual(mockErrRes.statusCode, 400);
assert.strictEqual(mockErrRes.body.error.param, 'input');
console.log('✅ Test 6 Passed: Validation correctly rejected missing input with 400.');

console.log('\n🎉 ALL 6 TOGETHER.AI EMBEDDINGS TESTS PASSED CLEANLY!\n');
