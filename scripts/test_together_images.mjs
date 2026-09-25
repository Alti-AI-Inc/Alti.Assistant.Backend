/**
 * Test Suite: Aphura Sovereign Together.ai Images Inference Suite
 * Validates all 3 Images domains, Validation Engine, Dispatcher, Gateway Handlers, and CLI Commands
 */

import assert from 'node:assert';
import {
  IMAGE_MODELS_CATALOG,
  COMMON_RESOLUTIONS,
  MODEL_COMPATIBILITY_MATRIX,
  IMAGE_PARAMETERS_SCHEMA,
  getImagesOverview,
  getReferenceImagesDocs,
  getImageParametersDocs,
  validateImageParameters,
  executeImageGeneration,
} from '../src/app/services/together.images.js';
import { executeTogetherCliCommand } from '../src/app/services/together.cli.js';
import { InferenceGateway } from '../src/app/modules/inference/inference.gateway.js';

console.log('🧪 Starting Together.ai Images Inference Suite Validation...\n');

// 1. Text-to-Image Overview & Models
console.log('1. Testing Images Overview & Supported Models Catalog...');
const overview = getImagesOverview();
assert.strictEqual(overview.success, true);
assert.strictEqual(overview.recommended_model, 'black-forest-labs/FLUX.1.1-pro');
assert.strictEqual(overview.models.length, 7);
assert.strictEqual(overview.common_resolutions.length, 3);
assert.ok(IMAGE_MODELS_CATALOG.some(m => m.id === 'black-forest-labs/FLUX.2-dev'));
assert.ok(IMAGE_MODELS_CATALOG.some(m => m.id === 'black-forest-labs/FLUX.1-kontext-pro'));
assert.ok(overview.save_to_disk_pattern.recommendation.includes('base64'));
console.log('   ✅ Images Overview passed.');

// 2. Reference Images & Image-to-Image
console.log('2. Testing Reference Images & Img2Img Docs...');
const refDocs = getReferenceImagesDocs();
assert.strictEqual(refDocs.success, true);
assert.strictEqual(refDocs.parameters.length, 2);
assert.ok(refDocs.parameters.some(p => p.name === 'image_url'));
assert.ok(refDocs.parameters.some(p => p.name === 'reference_images'));
assert.ok(refDocs.rules.length >= 3);
assert.ok(refDocs.code_snippets.kontext_python.includes('image_url'));
assert.ok(refDocs.code_snippets.flux2_python.includes('reference_images'));
console.log('   ✅ Reference Images passed.');

// 3. Parameters, Troubleshooting & Compatibility
console.log('3. Testing Parameters, Troubleshooting & Compatibility Matrix...');
const paramsDocs = getImageParametersDocs();
assert.strictEqual(paramsDocs.success, true);
assert.ok('prompt' in paramsDocs.schema);
assert.ok('width' in paramsDocs.schema);
assert.ok('height' in paramsDocs.schema);
assert.ok('steps' in paramsDocs.schema);
assert.ok('guidance_scale' in paramsDocs.schema);
assert.ok('seed' in paramsDocs.schema);
assert.ok('n' in paramsDocs.schema);
assert.ok('response_format' in paramsDocs.schema);
assert.ok('disable_safety_checker' in paramsDocs.schema);
assert.ok('FLUX.2 Dev' in paramsDocs.compatibility_matrix);
assert.ok('Kontext Pro/Max' in paramsDocs.compatibility_matrix);
assert.ok(paramsDocs.quick_troubleshooting.length >= 6);
console.log('   ✅ Parameters, Troubleshooting & Compatibility passed.');

// 4. Parameter Validation Engine
console.log('4. Testing Image Parameter Validation Engine...');
// Valid parameters
const validParams = {
  prompt: 'A futuristic cybernetic garden at dawn',
  width: 1344,
  height: 768,
  steps: 25,
  n: 2,
  response_format: 'base64',
  output_format: 'png',
  guidance_scale: 7.5,
};
const valResult1 = validateImageParameters(validParams);
assert.strictEqual(valResult1.valid, true);
assert.strictEqual(valResult1.errors.length, 0);

// Invalid parameters: width not multiple of 8, n > 4, missing prompt
const invalidParams = {
  width: 1005, // not multiple of 8
  n: 10,       // exceeds max 4
};
const valResult2 = validateImageParameters(invalidParams);
assert.strictEqual(valResult2.valid, false);
assert.ok(valResult2.errors.length >= 3);
assert.ok(valResult2.errors.some(e => e.includes('multiple of 8')));
assert.ok(valResult2.errors.some(e => e.includes('prompt is required')));
console.log('   ✅ Image Parameter Validation passed.');

// 5. Image Generation Execution (Dry Run)
console.log('5. Testing Image Generation Execution (Dry Run)...');
// URL mode
const resUrl = await executeImageGeneration({
  prompt: 'Alpine meadow with snowcapped peaks',
  dry_run: true,
  n: 1,
});
assert.strictEqual(resUrl.success, true);
assert.strictEqual(resUrl.dry_run, true);
assert.strictEqual(resUrl.data.length, 1);
assert.ok(resUrl.data[0].url.startsWith('https://'));

// Base64 mode with 3 variations
const resB64 = await executeImageGeneration({
  prompt: 'Floating islands in the sky',
  response_format: 'base64',
  n: 3,
  dry_run: true,
});
assert.strictEqual(resB64.success, true);
assert.strictEqual(resB64.data.length, 3);
assert.ok(resB64.data[0].b64_json.length > 20);
console.log('   ✅ Image Generation Execution passed.');

// 6. Together CLI Subcommands
console.log('6. Testing Together CLI Image Subcommands...');
const cliOverview = await executeTogetherCliCommand(['images', 'overview']);
assert.ok(cliOverview.output.includes('Together AI Text-to-Image Generation Overview:'));

const cliRef = await executeTogetherCliCommand(['images', 'reference']);
assert.ok(cliRef.output.includes('Image-to-Image with Reference Images:'));

const cliParams = await executeTogetherCliCommand(['images', 'parameters']);
assert.ok(cliParams.output.includes('Image Generation Parameters & Troubleshooting Reference:'));

const cliValidate = await executeTogetherCliCommand(['images', 'validate']);
assert.ok(cliValidate.output.includes('Image Parameters Validation:'));
assert.ok(cliValidate.output.includes('VALID ✅'));

const cliGen = await executeTogetherCliCommand(['images', 'generate', '--dry-run', '--prompt', 'Cyberpunk city', '--n', '2', '--b64']);
assert.ok(cliGen.output.includes('Image Generation'));
assert.ok(cliGen.output.includes('Images Generated (2)'));
console.log('   ✅ Together CLI Image subcommands passed.');

// 7. Inference Gateway Handlers
console.log('7. Testing Inference Gateway Handlers...');
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
await InferenceGateway.handleGetImagesOverview({}, mockRes1);
assert.strictEqual(mockRes1.statusCode, 200);
assert.strictEqual(mockRes1.body.success, true);

const mockRes2 = createMockRes();
await InferenceGateway.handleGetReferenceImagesDocs({}, mockRes2);
assert.strictEqual(mockRes2.statusCode, 200);
assert.strictEqual(mockRes2.body.success, true);

const mockRes3 = createMockRes();
await InferenceGateway.handleGetImageParametersDocs({}, mockRes3);
assert.strictEqual(mockRes3.statusCode, 200);
assert.strictEqual(mockRes3.body.success, true);

const mockRes4 = createMockRes();
await InferenceGateway.handleValidateImageParameters({ body: validParams }, mockRes4);
assert.strictEqual(mockRes4.statusCode, 200);
assert.strictEqual(mockRes4.body.valid, true);

const mockRes5 = createMockRes();
await InferenceGateway.handleExecuteImageGeneration({ body: { dry_run: true, prompt: 'Serene sea' } }, mockRes5);
assert.strictEqual(mockRes5.statusCode, 200);
assert.strictEqual(mockRes5.body.dry_run, true);
console.log('   ✅ Inference Gateway Handlers passed.');

console.log('\n🎉 ALL 7 IMAGES INFERENCE TEST SUITES COMPLETED WITH 100% SUCCESS!');
