/**
 * Comprehensive Verification Test for Together.ai Vision Inference Suite
 * License: MIT
 */

import assert from 'assert';
import {
  VISION_MODELS_CATALOG,
  getVisionOverview,
  getVisionInputsDocs,
  getStructuredExtractionDocs,
  getVisionFunctionCallingDocs,
  calculateVisionTokens,
  formatMultimodalMessage,
  executeVisionCompletion,
} from '../src/app/services/together.vision.js';
import { executeTogetherCliCommand } from '../src/app/services/together.cli.js';
import InferenceGateway from '../src/app/modules/inference/inference.gateway.js';

console.log('🧪 Starting Together.ai Vision Inference Suite Verification...\n');

// ── 1. Vision Overview & Models Catalog ──────────────────────────────────────
console.log('1️⃣ Testing Vision Overview & Models Catalog...');
const overview = getVisionOverview();
assert.strictEqual(overview.success, true);
assert.strictEqual(overview.recommended_model, 'moonshotai/Kimi-K3');
assert(overview.models.length >= 4);
assert.strictEqual(overview.pricing_formula.tokens_per_tile, 1601);
assert.strictEqual(overview.pricing_formula.max_tokens, 6404);
console.log(`   ✅ Catalog contains ${overview.models.length} vision models.`);
console.log(`   ✅ Tile pricing formula verified: 1,601 tokens/tile, max 6,404 tokens.`);

// ── 2. Vision Inputs & Formats Docs ──────────────────────────────────────────
console.log('\n2️⃣ Testing Vision Inputs Documentation...');
const inputs = getVisionInputsDocs();
assert.strictEqual(inputs.success, true);
assert(inputs.input_types.some(t => t.type === 'hosted_url'));
assert(inputs.input_types.some(t => t.type === 'base64_data_url'));
assert(inputs.input_types.some(t => t.type === 'multi_image'));
assert(inputs.input_types.some(t => t.type === 'video_url'));
assert(inputs.code_snippets.base64_python.includes('data:image/jpeg;base64'));
assert(inputs.code_snippets.video_url_python.includes('Qwen/Qwen3-VL-8B-Instruct'));
console.log('   ✅ Hosted URLs, Base64 data URLs, Multi-Image, and Video URLs verified.');

// ── 3. Structured Extraction with Vision ─────────────────────────────────────
console.log('\n3️⃣ Testing Structured Extraction with Vision...');
const structured = getStructuredExtractionDocs();
assert.strictEqual(structured.success, true);
assert.strictEqual(structured.recommended_model, 'moonshotai/Kimi-K3');
assert.strictEqual(structured.critical_configuration.reasoning.enabled, false);
assert(structured.code_snippets.python.includes('response_format'));
assert(structured.code_snippets.typescript.includes('ReceiptJsonSchema'));
console.log('   ✅ Structured extraction verified with reasoning disabled for Kimi-K3.');

// ── 4. Vision-Language Function Calling ──────────────────────────────────────
console.log('\n4️⃣ Testing Vision-Language Function Calling...');
const fc = getVisionFunctionCallingDocs();
assert.strictEqual(fc.success, true);
assert(fc.supported_models.includes('moonshotai/Kimi-K3'));
assert.strictEqual(fc.workflow.length, 5);
assert(fc.code_snippets.python.includes('get_current_stock_price'));
console.log('   ✅ 5-step VLM function calling flow & schema verified.');

// ── 5. Token Calculation Formula Math ────────────────────────────────────────
console.log('\n5️⃣ Testing 560px Tile Grid Token Calculation...');
// Case 1: 500x500 -> 1x1 tile = 1601 tokens
const tok1 = calculateVisionTokens(500, 500);
assert.strictEqual(tok1.total_tiles, 1);
assert.strictEqual(tok1.total_tokens, 1601);

// Case 2: 1200x500 -> 2x1 tiles = 3202 tokens
const tok2 = calculateVisionTokens(1200, 500);
assert.strictEqual(tok2.tiles_x, 2);
assert.strictEqual(tok2.tiles_y, 1);
assert.strictEqual(tok2.total_tokens, 3202);

// Case 3: 2000x2000 -> 2x2 tiles = 6404 tokens (capped)
const tok3 = calculateVisionTokens(2000, 2000);
assert.strictEqual(tok3.tiles_x, 2);
assert.strictEqual(tok3.tiles_y, 2);
assert.strictEqual(tok3.total_tokens, 6404);
console.log('   ✅ Math verified: 1x1=1601, 2x1=3202, 2x2=6404 tokens.');

// ── 6. Multimodal Message Formatter ──────────────────────────────────────────
console.log('\n6️⃣ Testing Multimodal Message Formatter...');
const formattedMsg = formatMultimodalMessage({
  text: 'Analyze the logo and scene',
  imageUrls: ['https://example.com/logo.png'],
  base64Images: ['iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='],
  videoUrls: ['https://example.com/motion.mp4'],
});
assert.strictEqual(formattedMsg.role, 'user');
assert.strictEqual(formattedMsg.content.length, 4);
assert.strictEqual(formattedMsg.content[0].type, 'text');
assert.strictEqual(formattedMsg.content[1].type, 'image_url');
assert.strictEqual(formattedMsg.content[2].type, 'image_url');
assert(formattedMsg.content[2].image_url.url.startsWith('data:image/jpeg;base64,'));
assert.strictEqual(formattedMsg.content[3].type, 'video_url');
console.log('   ✅ Multimodal message successfully formatted with 4 distinct content blocks.');

// ── 7. Vision Completion Dispatcher (Dry-Run & Structured & Tools) ───────────
console.log('\n7️⃣ Testing Vision Completion Dispatcher (Dry-Run)...');
const plainComp = await executeVisionCompletion({
  model: 'moonshotai/Kimi-K3',
  prompt: 'What is this image?',
  image_url: 'https://example.com/test.jpg',
  dry_run: true,
});
assert.strictEqual(plainComp.success, true);
assert.strictEqual(plainComp.dry_run, true);
assert(plainComp.choices[0].message.content.includes('Vision Analysis'));

const structComp = await executeVisionCompletion({
  model: 'moonshotai/Kimi-K3',
  prompt: 'Extract receipt',
  image_url: 'https://example.com/receipt.jpg',
  response_format: { type: 'json_schema', json_schema: { name: 'receipt' } },
  dry_run: true,
});
assert.strictEqual(structComp.success, true);
const parsedStruct = JSON.parse(structComp.choices[0].message.content);
assert.strictEqual(parsedStruct.status, 'extracted');

const toolComp = await executeVisionCompletion({
  model: 'moonshotai/Kimi-K3',
  prompt: 'Find stock ticker',
  image_url: 'https://example.com/logo.jpg',
  tools: [{ type: 'function', function: { name: 'get_stock_quote' } }],
  dry_run: true,
});
assert.strictEqual(toolComp.success, true);
assert(toolComp.choices[0].message.tool_calls.length > 0);
assert.strictEqual(toolComp.choices[0].message.tool_calls[0].function.name, 'get_stock_quote');
console.log('   ✅ Vision completion dry-run, structured extraction, and tool calling simulated successfully.');

// ── 8. CLI Command Execution ─────────────────────────────────────────────────
console.log('\n8️⃣ Testing Together Sovereign CLI Vision Commands...');
const cliOverview = await executeTogetherCliCommand('together vision overview');
assert.strictEqual(cliOverview.success, true);
assert.strictEqual(cliOverview.domain, 'vision');
assert(cliOverview.output.includes('Together AI Vision-Language Models Overview'));

const cliInputs = await executeTogetherCliCommand('tg vis inputs');
assert.strictEqual(cliInputs.success, true);
assert(cliInputs.output.includes('Vision Input Formats & Methods'));

const cliStructured = await executeTogetherCliCommand('together vision structured');
assert.strictEqual(cliStructured.success, true);
assert(cliStructured.output.includes('Structured Extraction with Vision'));

const cliFc = await executeTogetherCliCommand('together vision fc');
assert.strictEqual(cliFc.success, true);
assert(cliFc.output.includes('Vision-Language Function Calling'));

const cliTokens = await executeTogetherCliCommand('together vision tokens --width 1920 --height 1080');
assert.strictEqual(cliTokens.success, true);
assert(cliTokens.output.includes('Tokens: 3202 tokens'));

const cliRun = await executeTogetherCliCommand('together vision run --prompt "Test prompt" --dry-run');
assert.strictEqual(cliRun.success, true);
assert(cliRun.output.includes('Vision Inference Completion'));
console.log('   ✅ All 6 CLI commands (overview, inputs, structured, fc, tokens, run) executed cleanly.');

// ── 9. Gateway Handlers ──────────────────────────────────────────────────────
console.log('\n9️⃣ Testing Inference Gateway Vision Handlers...');
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
await InferenceGateway.handleGetVisionOverview({}, mockRes1);
assert.strictEqual(mockRes1.statusCode, 200);
assert.strictEqual(mockRes1.body.success, true);

const mockRes2 = createMockRes();
await InferenceGateway.handleCalculateVisionTokens({ body: { width: 1024, height: 768 } }, mockRes2);
assert.strictEqual(mockRes2.statusCode, 200);
assert.strictEqual(mockRes2.body.total_tokens, 1601);

const mockRes3 = createMockRes();
await InferenceGateway.handleExecuteVisionCompletion({ body: { prompt: 'Test', dry_run: true } }, mockRes3);
assert.strictEqual(mockRes3.statusCode, 200);
assert.strictEqual(mockRes3.body.success, true);
console.log('   ✅ Gateway handlers tested and responded with HTTP 200.');

console.log('\n🎉 ALL 9 VERIFICATION PHASES PASSED WITH ZERO ERRORS!');
