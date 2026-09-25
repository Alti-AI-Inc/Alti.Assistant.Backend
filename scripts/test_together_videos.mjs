/**
 * Test Suite: Aphura Sovereign Together.ai Videos Inference Suite
 * Validates all 4 Video domains, Keyframe Mathematics, Audio Input Specs, Validation Engine,
 * Job Lifecycle & Dispatcher, Gateway Handlers, and CLI Commands
 */

import assert from 'node:assert';
import {
  VIDEO_MODELS_CATALOG,
  JOB_STATUSES,
  MEDIA_OBJECT_SCHEMA,
  VIDEO_PARAMETERS_SCHEMA,
  getVideosOverview,
  getReferenceAndKeyframesDocs,
  getAudioInputDocs,
  getVideoParametersDocs,
  calculateKeyframeNumber,
  validateVideoParameters,
  createVideoJob,
  retrieveVideoJob,
} from '../src/app/services/together.videos.js';
import { executeTogetherCliCommand } from '../src/app/services/together.cli.js';
import { InferenceGateway } from '../src/app/modules/inference/inference.gateway.js';

console.log('🧪 Starting Together.ai Videos Inference Suite Validation...\n');

// 1. Overview & Asynchronous Lifecycle
console.log('1. Testing Videos Overview & Async Lifecycle...');
const overview = getVideosOverview();
assert.strictEqual(overview.success, true);
assert.strictEqual(overview.recommended_model, 'minimax/video-01-director');
assert.strictEqual(overview.models.length, 5);
assert.strictEqual(overview.job_lifecycle.length, 5);
assert.ok(VIDEO_MODELS_CATALOG.some(m => m.id === 'minimax/video-01-director'));
assert.ok(VIDEO_MODELS_CATALOG.some(m => m.id === 'Wan-AI/wan2.7-t2v'));
assert.ok(overview.polling_rule.includes('asynchronous'));
console.log('   ✅ Videos Overview passed.');

// 2. Reference Images, Keyframes & Mathematics
console.log('2. Testing Reference Images, Keyframes & Calculation Formula...');
const kfDocs = getReferenceAndKeyframesDocs();
assert.strictEqual(kfDocs.success, true);
assert.ok(kfDocs.formula.includes('seconds * fps'));
assert.ok(kfDocs.deprecation_notice.includes('deprecated'));
assert.strictEqual(kfDocs.capabilities.keyframe_control.types.length, 3);

// Formula test: frame = seconds * fps
const kf1 = calculateKeyframeNumber(6, 24);
assert.strictEqual(kf1, 144);
const kf2 = calculateKeyframeNumber('10', 30);
assert.strictEqual(kf2, 300);
const kfNull = calculateKeyframeNumber('invalid', 24);
assert.strictEqual(kfNull, null);
console.log('   ✅ Reference Images and Keyframe Math passed.');

// 3. Audio-Driven Video Generation
console.log('3. Testing Audio Input for Video Generation...');
const audioDocs = getAudioInputDocs();
assert.strictEqual(audioDocs.success, true);
assert.strictEqual(audioDocs.field, 'media.audio_inputs');
assert.ok(audioDocs.supported_models.includes('Wan-AI/wan2.7-t2v'));
assert.strictEqual(audioDocs.audio_constraints.max_file_size_mb, 15);
assert.deepStrictEqual(audioDocs.audio_constraints.formats, ['WAV', 'MP3']);
assert.deepStrictEqual(audioDocs.audio_constraints.duration_range_seconds, [3, 30]);
console.log('   ✅ Audio Input passed.');

// 4. Video Parameters Reference & Unified Media Schema
console.log('4. Testing Video Parameters Reference & Media Schema...');
const paramsDocs = getVideoParametersDocs();
assert.strictEqual(paramsDocs.success, true);
assert.ok('prompt' in paramsDocs.schema);
assert.ok('seconds' in paramsDocs.schema);
assert.ok('fps' in paramsDocs.schema);
assert.ok('steps' in paramsDocs.schema);
assert.ok('guidance_scale' in paramsDocs.schema);
assert.ok('output_format' in paramsDocs.schema);
assert.ok('media' in paramsDocs.schema);
assert.ok('frame_images' in paramsDocs.media_schema);
assert.ok('audio_inputs' in paramsDocs.media_schema);
assert.ok(paramsDocs.quick_troubleshooting.length >= 6);
console.log('   ✅ Video Parameters passed.');

// 5. Parameter Validation Engine
console.log('5. Testing Video Parameter Validation Engine...');
// Valid parameters
const validParams = {
  prompt: 'Drone shot flying over coastal cliffs at golden hour',
  seconds: '6',
  fps: 24,
  steps: 25,
  guidance_scale: 8.5,
  output_format: 'MP4',
  media: {
    audio_inputs: ['https://example.com/soundtrack.mp3'],
    frame_images: [{ input_image: 'https://example.com/start.jpg', frame: 'first' }],
  },
};
const valResult1 = validateVideoParameters(validParams);
assert.strictEqual(valResult1.valid, true);
assert.strictEqual(valResult1.errors.length, 0);

// Invalid parameters: seconds > 10, fps < 15, steps > 50, missing prompt, bad audio URL
const invalidParams = {
  seconds: '15',
  fps: 10,
  steps: 80,
  guidance_scale: 14.0, // warning
  media: {
    audio_inputs: ['not-a-valid-url'],
  },
};
const valResult2 = validateVideoParameters(invalidParams);
assert.strictEqual(valResult2.valid, false);
assert.ok(valResult2.errors.length >= 4);
assert.ok(valResult2.warnings.length > 0);
console.log('   ✅ Video Parameter Validation passed.');

// 6. Asynchronous Job Creation and Polling (Dry Run)
console.log('6. Testing Video Job Creation & Retrieval (Dry Run)...');
const createRes = await createVideoJob({
  prompt: 'A sleek dolphin swimming in tropical waters',
  seconds: '5',
  fps: 30,
  dry_run: true,
});
assert.strictEqual(createRes.success, true);
assert.strictEqual(createRes.dry_run, true);
assert.strictEqual(createRes.status, JOB_STATUSES.QUEUED);
assert.ok(createRes.id.startsWith('vid_'));

// Retrieve and poll completion
const retrieveRes = await retrieveVideoJob(createRes.id);
assert.strictEqual(retrieveRes.success, true);
assert.strictEqual(retrieveRes.status, JOB_STATUSES.COMPLETED);
assert.ok(retrieveRes.outputs.video_url.includes('.mp4'));
console.log('   ✅ Video Job Lifecycle passed.');

// 7. Together CLI Subcommands
console.log('7. Testing Together CLI Video Subcommands...');
const cliOverview = await executeTogetherCliCommand(['videos', 'overview']);
assert.ok(cliOverview.output.includes('Together AI Video Generation Overview & Async Lifecycle:'));

const cliKeyframes = await executeTogetherCliCommand(['videos', 'keyframes']);
assert.ok(cliKeyframes.output.includes('Video Reference Images & Keyframe Control:'));

const cliAudio = await executeTogetherCliCommand(['videos', 'audio']);
assert.ok(cliAudio.output.includes('Audio Input for Video Generation:'));

const cliParams = await executeTogetherCliCommand(['videos', 'parameters']);
assert.ok(cliParams.output.includes('Video Generation Parameters & Media Schema:'));

const cliValidate = await executeTogetherCliCommand(['videos', 'validate']);
assert.ok(cliValidate.output.includes('Video Parameters Validation:'));
assert.ok(cliValidate.output.includes('VALID ✅'));

const cliCreate = await executeTogetherCliCommand(['videos', 'create', '--dry-run', '--prompt', 'Ocean sunset', '--seconds', '6']);
assert.ok(cliCreate.output.includes('Video Generation Job Created'));

const cliRetrieve = await executeTogetherCliCommand(['videos', 'retrieve', createRes.id]);
assert.ok(cliRetrieve.output.includes('Video Generation Job Status:'));
assert.ok(cliRetrieve.output.includes('completed'));
console.log('   ✅ Together CLI Video subcommands passed.');

// 8. Inference Gateway Handlers
console.log('8. Testing Inference Gateway Handlers...');
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
await InferenceGateway.handleGetVideosOverview({}, mockRes1);
assert.strictEqual(mockRes1.statusCode, 200);
assert.strictEqual(mockRes1.body.success, true);

const mockRes2 = createMockRes();
await InferenceGateway.handleGetReferenceAndKeyframesDocs({}, mockRes2);
assert.strictEqual(mockRes2.statusCode, 200);
assert.strictEqual(mockRes2.body.success, true);

const mockRes3 = createMockRes();
await InferenceGateway.handleGetAudioInputDocs({}, mockRes3);
assert.strictEqual(mockRes3.statusCode, 200);
assert.strictEqual(mockRes3.body.success, true);

const mockRes4 = createMockRes();
await InferenceGateway.handleGetVideoParametersDocs({}, mockRes4);
assert.strictEqual(mockRes4.statusCode, 200);
assert.strictEqual(mockRes4.body.success, true);

const mockRes5 = createMockRes();
await InferenceGateway.handleValidateVideoParameters({ body: validParams }, mockRes5);
assert.strictEqual(mockRes5.statusCode, 200);
assert.strictEqual(mockRes5.body.valid, true);

const mockRes6 = createMockRes();
await InferenceGateway.handleCreateVideoJob({ body: { dry_run: true, prompt: 'Flying eagle' } }, mockRes6);
assert.strictEqual(mockRes6.statusCode, 200);
assert.strictEqual(mockRes6.body.dry_run, true);

const mockRes7 = createMockRes();
await InferenceGateway.handleRetrieveVideoJob({ params: { jobId: createRes.id } }, mockRes7);
assert.strictEqual(mockRes7.statusCode, 200);
assert.strictEqual(mockRes7.body.status, JOB_STATUSES.COMPLETED);
console.log('   ✅ Inference Gateway Handlers passed.');

console.log('\n🎉 ALL 8 VIDEOS INFERENCE TEST SUITES COMPLETED WITH 100% SUCCESS!');
