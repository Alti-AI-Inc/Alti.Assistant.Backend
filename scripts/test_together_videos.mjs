import assert from 'assert';
import { llmGenerateVideo, llmGetVideoMetadata } from '../src/app/services/llm.client.js';
import { InferenceGateway } from '../src/app/modules/inference/inference.gateway.js';

console.log('🧪 Testing Together.ai Video Endpoints (POST /videos & GET /videos/{id})...');

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
  // Test 1: llmGenerateVideo produces compliant VideoJob
  console.log('[Test 1] llmGenerateVideo VideoJob schema...');
  const job1 = await llmGenerateVideo('A cinematic flyover of a futuristic quantum data center', {
    model: 'tencent/HunyuanVideo',
    width: 1280,
    height: 720,
    fps: 24,
    seconds: '5',
    steps: 30,
    guidance_scale: 7.0,
  });
  assert(job1 && typeof job1 === 'object', 'Job must be an object');
  assert(job1.id && typeof job1.id === 'string', 'Job must have id');
  assert.strictEqual(job1.object, 'video', 'Object must be video');
  assert.strictEqual(job1.model, 'tencent/HunyuanVideo', 'Model must match');
  assert(typeof job1.created_at === 'number', 'created_at must be timestamp');
  assert(job1.outputs && typeof job1.outputs.video_url === 'string', 'outputs.video_url must exist');
  console.log('✅ Test 1 Passed: Generated video job ID:', job1.id);

  // Test 2: llmGetVideoMetadata produces compliant VideoJob
  console.log('[Test 2] llmGetVideoMetadata...');
  const metadata = await llmGetVideoMetadata(job1.id);
  assert.strictEqual(metadata.id, job1.id, 'Metadata ID must match');
  assert.strictEqual(metadata.object, 'video', 'Metadata object must be video');
  assert(metadata.status === 'completed' || metadata.status === 'in_progress', 'Valid status');
  console.log('✅ Test 2 Passed: Retrieved video metadata for ID:', metadata.id);

  // Test 3: InferenceGateway.handleCreateVideo via mock HTTP
  console.log('[Test 3] InferenceGateway.handleCreateVideo...');
  const res1 = createMockRes();
  await InferenceGateway.handleCreateVideo(
    {
      body: {
        model: 'tencent/HunyuanVideo',
        prompt: 'Autonomous space drone navigating an asteroid field',
        width: 1280,
        height: 720,
        fps: 24,
        seconds: '4',
        steps: 25,
      },
    },
    res1
  );
  assert.strictEqual(res1.statusCode, 200, 'Gateway should return 200');
  assert.strictEqual(res1.body.object, 'video', 'Body object must be video');
  assert(res1.body.id.length > 5, 'Body must have video id');
  assert(res1.body.outputs.video_url, 'Outputs must have video_url');
  console.log('✅ Test 3 Passed: Gateway created video job:', res1.body.id);

  // Test 4: InferenceGateway.handleGetVideo via mock HTTP
  console.log('[Test 4] InferenceGateway.handleGetVideo...');
  const res2 = createMockRes();
  await InferenceGateway.handleGetVideo({ params: { id: res1.body.id } }, res2);
  assert.strictEqual(res2.statusCode, 200, 'Gateway should return 200');
  assert.strictEqual(res2.body.id, res1.body.id, 'Metadata id must match requested id');
  assert.strictEqual(res2.body.object, 'video');
  console.log('✅ Test 4 Passed: Gateway retrieved video job metadata.');

  // Test 5: Missing prompt validation (400 Bad Request)
  console.log('[Test 5] Missing prompt validation...');
  const res3 = createMockRes();
  await InferenceGateway.handleCreateVideo({ body: {} }, res3);
  assert.strictEqual(res3.statusCode, 400, 'Missing prompt should return 400');
  assert.strictEqual(res3.body.error.param, 'prompt', 'Param must be prompt');
  console.log('✅ Test 5 Passed: Validated prompt requirement (400).');

  console.log('\n🎉 ALL 5 TOGETHER.AI VIDEO TESTS PASSED CLEANLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Video test failed:', err);
  process.exit(1);
});
