/**
 * Comprehensive Verification Test for Together.ai Rerank & Embeddings Inference Suite
 * License: MIT
 */

import assert from 'assert';
import {
  RERANK_MODELS_CATALOG,
  EMBEDDING_MODELS_CATALOG,
  getRerankOverview,
  getEmbeddingsOverview,
  validateRerankParams,
  validateEmbeddingsParams,
  executeRerank,
  executeEmbeddings,
  executeRagPipeline,
} from '../src/app/services/together.rerank.js';
import { executeTogetherCliCommand } from '../src/app/services/together.cli.js';
import InferenceGateway from '../src/app/modules/inference/inference.gateway.js';

console.log('🧪 Starting Together.ai Rerank & Embeddings Inference Suite Verification...\n');

// ── 1. Rerank Overview & Models Catalog ───────────────────────────────────────
console.log('1️⃣ Testing Rerank Overview & Catalog...');
const rerankOv = getRerankOverview();
assert.strictEqual(rerankOv.success, true);
assert.strictEqual(rerankOv.recommended_model, 'mixedbread-ai/mxbai-rerank-large-v2');
assert.strictEqual(rerankOv.structured_json_model, 'Salesforce/Llama-Rank-V1');
assert(rerankOv.models.length >= 5);
assert(rerankOv.models.some(m => m.id === 'mixedbread-ai/mxbai-rerank-large-v2' && m.context_length === 8192));
assert(rerankOv.models.some(m => m.id === 'Salesforce/Llama-Rank-V1' && m.supports_structured_json === true));
assert(rerankOv.parameters_reference.some(p => p.name === 'rank_fields'));
console.log(`   ✅ Rerank catalog contains ${rerankOv.models.length} models, 8k context lengths, and JSON support.`);

// ── 2. Embeddings Overview & Catalog ─────────────────────────────────────────
console.log('\n2️⃣ Testing Embeddings Overview & Catalog...');
const embedOv = getEmbeddingsOverview();
assert.strictEqual(embedOv.success, true);
assert.strictEqual(embedOv.recommended_model, 'BAAI/bge-large-en-v1.5');
assert(embedOv.models.length >= 5);
assert(embedOv.models.some(m => m.id === 'BAAI/bge-large-en-v1.5' && m.dimensions === 1024));
assert(embedOv.models.some(m => m.id === 'togethercomputer/m2-bert-80M-8k-retrieval' && m.context_length === 8192));
console.log(`   ✅ Embeddings catalog contains ${embedOv.models.length} models with 1024/768 dims and 8k-32k context.`);

// ── 3. Text Reranking Parameter Validation ───────────────────────────────────
console.log('\n3️⃣ Testing Text Reranking Parameter Validation...');
const validTextRerank = validateRerankParams({
  model: 'mixedbread-ai/mxbai-rerank-large-v2',
  query: 'What animals can I find near Peru?',
  documents: [
    'The giant panda is endemic to China.',
    'The llama is a domesticated South American camelid widely used in Andean cultures.',
  ],
  top_n: 2,
});
assert.strictEqual(validTextRerank.valid, true);
assert.strictEqual(validTextRerank.document_count, 2);
assert.strictEqual(validTextRerank.has_structured_documents, false);

const invalidRerank = validateRerankParams({
  query: '',
  documents: [],
});
assert.strictEqual(invalidRerank.valid, false);
assert(invalidRerank.errors.some(e => e.includes('query')));
assert(invalidRerank.errors.some(e => e.includes('documents')));
console.log('   ✅ Valid text params passed and missing query/documents errors caught.');

// ── 4. Structured JSON Reranking Parameter Validation ────────────────────────
console.log('\n4️⃣ Testing Structured JSON Reranking with rank_fields...');
const validJsonRerank = validateRerankParams({
  model: 'Salesforce/Llama-Rank-V1',
  query: 'Which pricing did we get from Oracle?',
  documents: [
    { from: 'Oracle', subject: 'Cloud Contract', text: 'Pricing is $500/mo' },
    { from: 'Airline', subject: 'Flight', text: 'Booking confirmed' },
  ],
  rank_fields: ['from', 'subject', 'text'],
});
assert.strictEqual(validJsonRerank.valid, true);
assert.strictEqual(validJsonRerank.has_structured_documents, true);

const badRankFields = validateRerankParams({
  model: 'Salesforce/Llama-Rank-V1',
  query: 'Pricing?',
  documents: [{ text: 'doc1' }],
  rank_fields: 'invalid-string-not-array',
});
assert.strictEqual(badRankFields.valid, false);
assert(badRankFields.errors.some(e => e.includes('rank_fields')));
console.log('   ✅ Structured JSON documents and rank_fields array validation verified.');

// ── 5. Embeddings Parameter Validation ───────────────────────────────────────
console.log('\n5️⃣ Testing Embeddings Parameter Validation...');
const validEmbed = validateEmbeddingsParams({
  model: 'BAAI/bge-large-en-v1.5',
  input: ['Aphura AI', 'Sovereign Core'],
  encoding_format: 'float',
  dimensions: 1024,
});
assert.strictEqual(validEmbed.valid, true);

const invalidEmbed = validateEmbeddingsParams({
  input: '',
  encoding_format: 'unsupported_format',
});
assert.strictEqual(invalidEmbed.valid, false);
assert(invalidEmbed.errors.some(e => e.includes('input')));
assert(invalidEmbed.errors.some(e => e.includes('encoding_format')));
console.log('   ✅ Embeddings parameter validation verified for array inputs and format restrictions.');

// ── 6. Dry-run Rerank Execution ──────────────────────────────────────────────
console.log('\n6️⃣ Testing Rerank Execution (Dry-Run Heuristic)...');
const rerankRes = await executeRerank({
  model: 'mixedbread-ai/mxbai-rerank-large-v2',
  query: 'What animals can I find near Peru?',
  documents: [
    'The giant panda (Ailuropoda melanoleuca) is a bear species endemic to China.',
    'The llama is a domesticated South American camelid, widely used in Andean cultures.',
    'The wild Bactrian camel is endemic to Northwest China.',
    'The guanaco is a camelid native to South America, closely related to the llama.',
  ],
  top_n: 2,
  return_documents: true,
  dry_run: true,
});
assert.strictEqual(rerankRes.success, true);
assert.strictEqual(rerankRes.dry_run, true);
assert.strictEqual(rerankRes.results.length, 2);
assert(rerankRes.results[0].relevance_score >= rerankRes.results[1].relevance_score);
assert(rerankRes.results[0].document.text.length > 0);
console.log(`   ✅ Rerank returned ${rerankRes.results.length} top ranked documents sorted by relevance score.`);

// ── 7. Dry-run Embeddings Execution ──────────────────────────────────────────
console.log('\n7️⃣ Testing Embeddings Execution (Dry-Run Vector Generation)...');
const embedRes = await executeEmbeddings({
  model: 'BAAI/bge-large-en-v1.5',
  input: ['New York City', 'San Francisco'],
  encoding_format: 'float',
  dry_run: true,
});
assert.strictEqual(embedRes.success, true);
assert.strictEqual(embedRes.dry_run, true);
assert.strictEqual(embedRes.data.length, 2);
assert.strictEqual(embedRes.data[0].embedding.length, 1024);
assert.strictEqual(embedRes.data[1].embedding.length, 1024);

const embedBase64 = await executeEmbeddings({
  model: 'BAAI/bge-base-en-v1.5',
  input: 'Test base64',
  encoding_format: 'base64',
  dry_run: true,
});
assert.strictEqual(embedBase64.success, true);
assert.strictEqual(typeof embedBase64.data[0].embedding, 'string');
console.log('   ✅ Embeddings generated 1024-dim float vectors and base64 encoded vectors.');

// ── 8. End-to-End Two-Stage RAG Pipeline ─────────────────────────────────────
console.log('\n8️⃣ Testing Two-Stage RAG Pipeline Execution...');
const ragRes = await executeRagPipeline({
  query: 'Which pricing did we get from Oracle?',
  candidates: [
    'We are happy to give you the following pricing for your Oracle project.',
    'Airline travel booking status is confirmed.',
    'Generative AI is growing fast.',
    'Re: previous correspondence on Oracle pricing, 5% discount applied.',
  ],
  top_n: 2,
  dry_run: true,
});
assert.strictEqual(ragRes.success, true);
assert.strictEqual(ragRes.candidate_count, 4);
assert.strictEqual(ragRes.selected_count, 2);
assert(ragRes.top_documents[0].relevance_score >= ragRes.top_documents[1].relevance_score);
console.log(`   ✅ Two-stage RAG filtered 4 candidates down to top 2 relevant documents.`);

// ── 9. Sovereign Together CLI Commands ───────────────────────────────────────
console.log('\n9️⃣ Testing Together Sovereign CLI Rerank & Embeddings Commands...');
const cliRerankOv = await executeTogetherCliCommand('together rerank overview');
assert.strictEqual(cliRerankOv.success, true);
assert.strictEqual(cliRerankOv.domain, 'rerank');
assert(cliRerankOv.output.includes('Together AI Rerank & Embeddings Overview'));

const cliRerankVal = await executeTogetherCliCommand('tg rerank validate --model mixedbread-ai/mxbai-rerank-large-v2');
assert.strictEqual(cliRerankVal.success, true);
assert(cliRerankVal.output.includes('Status: VALID ✅'));

const cliRerankRun = await executeTogetherCliCommand('together rerank run --query "Peru animals" --top-n 2 --dry-run');
assert.strictEqual(cliRerankRun.success, true);
assert(cliRerankRun.output.includes('Together AI Rerank Result'));

const cliRag = await executeTogetherCliCommand('tg rerank rag-pipeline --query "Oracle contract" --top-n 2 --dry-run');
assert.strictEqual(cliRag.success, true);
assert(cliRag.output.includes('Two-Stage RAG Pipeline'));

const cliEmbedOv = await executeTogetherCliCommand('together embeddings overview');
assert.strictEqual(cliEmbedOv.success, true);
assert.strictEqual(cliEmbedOv.domain, 'embeddings');
assert(cliEmbedOv.output.includes('Together AI Embeddings Inference Overview'));

const cliEmbedVal = await executeTogetherCliCommand('tg embeddings validate --input "Sovereign AI"');
assert.strictEqual(cliEmbedVal.success, true);
assert(cliEmbedVal.output.includes('Status: VALID ✅'));

const cliEmbedRun = await executeTogetherCliCommand('together embeddings run --input "New York City" --dry-run');
assert.strictEqual(cliEmbedRun.success, true);
assert(cliEmbedRun.output.includes('Together AI Embeddings Result'));
console.log('   ✅ All 7 CLI commands executed with domains "rerank" and "embeddings".');

// ── 10. Gateway Handlers ─────────────────────────────────────────────────────
console.log('\n🔟 Testing Inference Gateway Rerank & Embeddings Handlers...');
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

const mockRes1 = createMockRes();
await InferenceGateway.handleGetRerankOverview({}, mockRes1);
assert.strictEqual(mockRes1.statusCode, 200);
assert.strictEqual(mockRes1.body.success, true);

const mockRes2 = createMockRes();
await InferenceGateway.handleGetEmbeddingsOverview({}, mockRes2);
assert.strictEqual(mockRes2.statusCode, 200);
assert.strictEqual(mockRes2.body.success, true);

const mockRes3 = createMockRes();
await InferenceGateway.handleValidateRerankParams({ body: { query: 'test', documents: ['doc1'] } }, mockRes3);
assert.strictEqual(mockRes3.statusCode, 200);
assert.strictEqual(mockRes3.body.valid, true);

const mockRes4 = createMockRes();
await InferenceGateway.handleValidateEmbeddingsParams({ body: { input: 'test' } }, mockRes4);
assert.strictEqual(mockRes4.statusCode, 200);
assert.strictEqual(mockRes4.body.valid, true);

const mockRes5 = createMockRes();
await InferenceGateway.handleExecuteRerank({ body: { dry_run: true } }, mockRes5);
assert.strictEqual(mockRes5.statusCode, 200);
assert.strictEqual(mockRes5.body.dry_run, true);

const mockRes6 = createMockRes();
await InferenceGateway.handleExecuteEmbeddings({ body: { dry_run: true } }, mockRes6);
assert.strictEqual(mockRes6.statusCode, 200);
assert.strictEqual(mockRes6.body.dry_run, true);

const mockRes7 = createMockRes();
await InferenceGateway.handleExecuteRagPipeline({ body: { query: 'rag test', dry_run: true } }, mockRes7);
assert.strictEqual(mockRes7.statusCode, 200);
assert.strictEqual(mockRes7.body.success, true);
console.log('   ✅ All 7 Gateway handlers tested and responded with HTTP 200.');

console.log('\n🎉 ALL 10 VERIFICATION PHASES PASSED WITH ZERO ERRORS!');
