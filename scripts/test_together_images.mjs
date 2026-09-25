import assert from 'assert';
import { llmGenerateImage, llmImageToImage } from '../src/app/services/llm.client.js';
import { InferenceGateway } from '../src/app/modules/inference/inference.gateway.js';

console.log('🧪 Testing Together.ai Image Generation (POST /v1/images/generations)...');

// Mock Express res
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
      this.headers[k] = v;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

async function runTests() {
  // Test 1: llmGenerateImage default base64 return
  console.log('[Test 1] llmGenerateImage base64...');
  const b64 = await llmGenerateImage('a futuristic city in sunset');
  assert(typeof b64 === 'string', 'Should return a string base64');
  assert(b64.length > 50, 'Base64 string should have content');
  console.log('✅ Test 1 Passed: Generated base64 image length:', b64.length);

  // Test 2: llmGenerateImage URL format return
  console.log('[Test 2] llmGenerateImage url format...');
  const urlRes = await llmGenerateImage('quantum computer core', { response_format: 'url' });
  assert(typeof urlRes === 'string', 'Should return a string URL or data URI');
  assert(urlRes.startsWith('data:image/') || urlRes.startsWith('http'), 'Should be a valid URL/URI');
  console.log('✅ Test 2 Passed: Generated URL/URI:', urlRes.slice(0, 40) + '...');

  // Test 3: llmGenerateImage raw response object
  console.log('[Test 3] llmGenerateImage raw response object...');
  const rawRes = await llmGenerateImage('neural network nodes glowing', {
    raw: true,
    model: 'black-forest-labs/FLUX.1-schnell',
    width: 512,
    height: 512,
    steps: 4,
    seed: 42,
    n: 2,
  });
  assert(rawRes && rawRes.object === 'list', 'Should have object: list');
  assert(Array.isArray(rawRes.data), 'data should be an array');
  assert.strictEqual(rawRes.data.length, 2, 'Should generate 2 images');
  assert.strictEqual(rawRes.data[0].index, 0, 'First index should be 0');
  assert.strictEqual(rawRes.data[1].index, 1, 'Second index should be 1');
  console.log('✅ Test 3 Passed: Raw list object with 2 items and seed 42.');

  // Test 4: llmImageToImage with conditioning image_url
  console.log('[Test 4] llmImageToImage...');
  const img2img = await llmImageToImage('make it cyberpunk style', {
    image_url: 'https://example.com/input.png',
    raw: true,
  });
  assert(img2img && img2img.object === 'list', 'Should return image list');
  console.log('✅ Test 4 Passed: Image-to-image returned successfully.');

  // Test 5: InferenceGateway.handleImageGeneration with b64_json
  console.log('[Test 5] InferenceGateway.handleImageGeneration b64_json...');
  const res1 = createMockRes();
  await InferenceGateway.handleImageGeneration(
    {
      prompt: 'cybernetic lion in neon lights',
      model: 'black-forest-labs/FLUX.1.1-pro',
      width: 1024,
      height: 1024,
      response_format: 'b64_json',
      steps: 20,
      guidance_scale: 7.5,
    },
    res1
  );
  assert.strictEqual(res1.statusCode, 200, 'Status should be 200');
  assert(res1.body.object === 'list', 'Body object should be list');
  assert(res1.body.data[0].b64_json, 'Should contain b64_json in data');
  console.log('✅ Test 5 Passed: Gateway returned 200 with list schema.');

  // Test 6: InferenceGateway.handleImageGeneration with url format
  console.log('[Test 6] InferenceGateway.handleImageGeneration url...');
  const res2 = createMockRes();
  await InferenceGateway.handleImageGeneration(
    {
      prompt: 'hyper-realistic satellite orbiting earth',
      model: 'black-forest-labs/FLUX.1-schnell',
      response_format: 'url',
      n: 1,
    },
    res2
  );
  assert.strictEqual(res2.statusCode, 200, 'Status should be 200');
  assert(res2.body.data[0].url, 'Should contain url in data');
  console.log('✅ Test 6 Passed: Gateway returned URL image data.');

  // Test 7: Missing prompt validation
  console.log('[Test 7] Missing prompt error handling...');
  const res3 = createMockRes();
  await InferenceGateway.handleImageGeneration({}, res3);
  assert.strictEqual(res3.statusCode, 400, 'Should return 400');
  assert.strictEqual(res3.body.error.param, 'prompt', 'Param should be prompt');
  console.log('✅ Test 7 Passed: Validated prompt requirement (400).');

  console.log('\n🎉 ALL 7 TOGETHER.AI IMAGE GENERATION TESTS PASSED CLEANLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
