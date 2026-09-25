/**
 * Test Suite specifically verifying Together.ai Rerank API (POST /rerank & POST /v1/rerank)
 * Reference: https://docs.together.ai/reference/rerank
 * License: MIT
 */
import assert from 'assert';
import { llmRerank } from '../src/app/services/llm.client.js';
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

console.log('🧪 Testing Together.ai Rerank API (https://docs.together.ai/reference/rerank)...\n');

// Test 1: Simple string documents rerank
console.log('[Test 1] Simple string documents rerank...');
const docs1 = [
  'The giant panda is a bear species endemic to China.',
  'The llama is a domesticated South American camelid widely used by Andean cultures.',
  'Tokyo is the capital of Japan.',
];
const r1 = await llmRerank('What animals are native to South America?', docs1);
assert.ok(r1.model, 'Response should contain model');
assert.ok(Array.isArray(r1.results), 'Response should contain results array');
assert.strictEqual(r1.results.length, 3);
assert.ok(typeof r1.results[0].relevance_score === 'number');
assert.ok(r1.results[0].document && r1.results[0].document.text);
assert.ok(r1.usage && typeof r1.usage.total_tokens === 'number', 'Expected token usage');
console.log(`✅ Test 1 Passed: Top scored doc index = ${r1.results[0].index} (score: ${r1.results[0].relevance_score})`);

// Test 2: Structured documents with rank_fields
console.log('[Test 2] Structured documents with rank_fields...');
const docs2 = [
  { title: 'Paris Guide', text: 'Paris is the capital of France, known for the Eiffel Tower.' },
  { title: 'Machu Picchu', text: 'An Incan citadel set high in the Andes Mountains in Peru.' },
  { title: 'Berlin Wall', text: 'Historic monument located in Berlin, Germany.' },
];
const r2 = await llmRerank('Tell me about Peruvian Inca ruins', docs2, {
  rank_fields: ['title', 'text'],
  top_n: 2,
});
assert.strictEqual(r2.results.length, 2, 'Expected top_n: 2 to limit results to 2');
console.log('✅ Test 2 Passed: Structured documents with rank_fields and top_n = 2 verified.');

// Test 3: return_documents: false
console.log('[Test 3] return_documents: false...');
const r3 = await llmRerank('Capital cities in Europe', ['London', 'Madrid', 'Canberra'], {
  return_documents: false,
});
assert.strictEqual(r3.results.length, 3);
assert.strictEqual(r3.results[0].document, undefined, 'document should be omitted when return_documents: false');
console.log('✅ Test 3 Passed: return_documents: false correctly omitted document bodies.');

// Test 4: Gateway handler execution
console.log('[Test 4] InferenceGateway.handleRerank...');
const res4 = mockRes();
await InferenceGateway.handleRerank(
  {
    body: {
      model: 'mixedbread-ai/mxbai-rerank-large-v2',
      query: 'deep learning frameworks',
      documents: ['PyTorch is an open-source machine learning library.', 'Baking sourdough bread at home.'],
      top_n: 1,
    },
  },
  res4
);
assert.strictEqual(res4.statusCode, 200);
assert.strictEqual(res4.body.results.length, 1);
assert.strictEqual(res4.body.model, 'mixedbread-ai/mxbai-rerank-large-v2');
console.log('✅ Test 4 Passed: InferenceGateway handleRerank endpoint succeeded.');

// Test 5: Validation for missing query / documents
console.log('[Test 5] Validation error handling...');
const res5 = mockRes();
await InferenceGateway.handleRerank({ body: { query: 'test' } }, res5);
assert.strictEqual(res5.statusCode, 400);
assert.strictEqual(res5.body.error.type, 'invalid_request_error');
console.log('✅ Test 5 Passed: Missing documents validation returned 400.');

console.log('\n🎉 ALL 5 TOGETHER.AI RERANK TESTS PASSED CLEANLY!\n');
