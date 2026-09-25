/**
 * Comprehensive Verification Test for Together.ai Text-to-Speech (TTS) Inference Suite
 * License: MIT
 */

import assert from 'assert';
import {
  TTS_MODELS_CATALOG,
  TTS_OUTPUT_FORMATS,
  getTTSOverview,
  getTTSStreamingDocs,
  getTTSWebSocketDocs,
  validateTTSParams,
  buildTTSWebSocketConfig,
  executeTTSSynthesis,
} from '../src/app/services/together.tts.js';
import { executeTogetherCliCommand } from '../src/app/services/together.cli.js';
import InferenceGateway from '../src/app/modules/inference/inference.gateway.js';

console.log('🧪 Starting Together.ai Text-to-Speech (TTS) Inference Suite Verification...\n');

// ── 1. Overview & Models Catalog ─────────────────────────────────────────────
console.log('1️⃣ Testing TTS Overview & Catalog...');
const overview = getTTSOverview();
assert.strictEqual(overview.success, true);
assert.strictEqual(overview.recommended_model, 'canopylabs/orpheus-3b-0.1-ft');
assert.strictEqual(overview.fallback_model, 'hexgrad/Kokoro-82M');
assert(overview.models.length >= 4);
assert(overview.output_formats.some(f => f.format === 'raw'));
assert(overview.output_formats.some(f => f.format === 'wav'));
assert(overview.output_formats.some(f => f.format === 'mp3'));
assert(overview.output_formats.some(f => f.format === 'mulaw'));
assert(overview.parameters_reference.some(p => p.name === 'voice'));
console.log(`   ✅ Catalog contains ${overview.models.length} models, 7 formats, and parameter reference.`);

// ── 2. Kokoro Voice Mixing & Validation ──────────────────────────────────────
console.log('\n2️⃣ Testing Kokoro Voice Mixing...');
const kokoroMixValid = validateTTSParams({
  model: 'hexgrad/Kokoro-82M',
  input: 'Blended voice test.',
  voice: 'af_bella(2)+af_heart(1)',
});
assert.strictEqual(kokoroMixValid.valid, true);
assert.strictEqual(kokoroMixValid.voice_mixed, true);

// Voice mixing on unsupported model should fail
const nonKokoroMix = validateTTSParams({
  model: 'canopylabs/orpheus-3b-0.1-ft',
  input: 'Invalid mix test.',
  voice: 'tara+leah',
});
assert.strictEqual(nonKokoroMix.valid, false);
assert(nonKokoroMix.errors.some(e => e.includes('Voice mixing')));
console.log('   ✅ Kokoro voice mixing verified and non-Kokoro models prevented from blending.');

// ── 3. HTTP Streaming (SSE) Documentation ────────────────────────────────────
console.log('\n3️⃣ Testing HTTP Streaming (SSE) Protocol Documentation...');
const streaming = getTTSStreamingDocs();
assert.strictEqual(streaming.success, true);
assert.strictEqual(streaming.required_flags.stream, true);
assert.strictEqual(streaming.required_flags.response_format, 'raw');
assert.strictEqual(streaming.required_flags.response_encoding, 'pcm_s16le');
assert(streaming.event_protocol.some(e => e.event === 'audio_delta'));
assert(streaming.event_protocol.some(e => e.event === 'word_timestamps'));
assert(streaming.event_protocol.some(e => e.event === 'stream_done'));
console.log('   ✅ SSE streaming protocol: raw pcm_s16le, audio_delta, word_timestamps, stream_done verified.');

// ── 4. WebSocket Documentation & Real-Time Protocol ─────────────────────────
console.log('\n4️⃣ Testing WebSocket API Protocol Documentation...');
const wsDocs = getTTSWebSocketDocs();
assert.strictEqual(wsDocs.success, true);
assert.strictEqual(wsDocs.websocket_url, 'wss://api.together.ai/v1/audio/speech/websocket');
assert(wsDocs.client_messages.some(m => m.type === 'input_text_buffer.append'));
assert(wsDocs.client_messages.some(m => m.type === 'input_text_buffer.commit'));
assert(wsDocs.client_messages.some(m => m.type === 'input_text_buffer.clear'));
assert(wsDocs.server_messages.some(m => m.type === 'session.created'));
assert(wsDocs.server_messages.some(m => m.type === 'conversation.item.audio_output.delta'));
assert(wsDocs.server_messages.some(m => m.type === 'conversation.item.audio_output.done'));
console.log('   ✅ WebSocket messages (append, commit, clear, audio deltas) verified.');

// ── 5. Parameter Reference & Bitrate Validation ──────────────────────────────
console.log('\n5️⃣ Testing Bitrate & Required Parameter Validation...');
const validBitrate = validateTTSParams({
  model: 'cartesia/sonic',
  input: 'Bitrate check',
  voice: 'laidback woman',
  bit_rate: 128000,
});
assert.strictEqual(validBitrate.valid, true);

const invalidBitrate = validateTTSParams({
  model: 'cartesia/sonic',
  input: 'Invalid bitrate',
  voice: 'laidback woman',
  bit_rate: 50000,
});
assert.strictEqual(invalidBitrate.valid, false);
assert(invalidBitrate.errors.some(e => e.includes('Invalid bit_rate')));
console.log('   ✅ Valid bitrate (128000 bps) passed, invalid bitrate (50000 bps) rejected.');

// ── 6. Pronunciation Dictionary Validation ───────────────────────────────────
console.log('\n6️⃣ Testing Pronunciation Dictionary Validation...');
const validPronunciation = validateTTSParams({
  model: 'canopylabs/orpheus-3b-0.1-ft',
  input: 'I love ASAP and LOL',
  voice: 'tara',
  extra_params: {
    pronunciation_dict: ['ASAP/as soon as possible', 'LOL/laugh out loud'],
  },
});
assert.strictEqual(validPronunciation.valid, true);

const invalidPronunciation = validateTTSParams({
  model: 'canopylabs/orpheus-3b-0.1-ft',
  input: 'Testing bad dict',
  voice: 'tara',
  extra_params: {
    pronunciation_dict: 'not-an-array',
  },
});
assert.strictEqual(invalidPronunciation.valid, false);
assert(invalidPronunciation.errors.some(e => e.includes('pronunciation_dict must be an array')));
console.log('   ✅ Pronunciation dictionary array format validated.');

// ── 7. WebSocket Configuration Builder ───────────────────────────────────────
console.log('\n7️⃣ Testing WebSocket URL Configuration Builder...');
const wsConfig = buildTTSWebSocketConfig({
  model: 'hexgrad/Kokoro-82M',
  voice: 'af_heart',
  sample_rate: 24000,
});
assert(wsConfig.websocket_url.startsWith('wss://api.together.ai/v1/audio/speech/websocket?'));
assert(wsConfig.websocket_url.includes('model=hexgrad%2FKokoro-82M'));
assert(wsConfig.websocket_url.includes('voice=af_heart'));
assert(wsConfig.websocket_url.includes('sample_rate=24000'));
assert.strictEqual(wsConfig.headers.Authorization, 'Bearer $TOGETHER_API_KEY');
console.log('   ✅ WebSocket query URL and auth headers constructed accurately.');

// ── 8. Speech Synthesis Dispatcher (Dry-Run with Word Alignment) ─────────────
console.log('\n8️⃣ Testing Speech Synthesis Dispatcher (Dry-Run)...');
const synth = await executeTTSSynthesis({
  model: 'canopylabs/orpheus-3b-0.1-ft',
  input: 'Welcome to Aphura Sovereign Voice.',
  voice: 'tara',
  alignment: 'word',
  dry_run: true,
});
assert.strictEqual(synth.success, true);
assert.strictEqual(synth.dry_run, true);
assert(synth.audio_base64.length > 0);
assert(synth.words.length === 5);
assert.strictEqual(synth.words[0], 'Welcome');
assert.strictEqual(synth.words[4], 'Voice.');
assert(synth.start_seconds.length === 5);
assert(synth.end_seconds.length === 5);
console.log(`   ✅ Dry-run synthesis generated ${synth.byte_size} bytes with ${synth.words.length} aligned words.`);

// ── 9. Sovereign CLI Commands ────────────────────────────────────────────────
console.log('\n9️⃣ Testing Together Sovereign CLI TTS Commands...');
const cliOverview = await executeTogetherCliCommand('together tts overview');
assert.strictEqual(cliOverview.success, true);
assert.strictEqual(cliOverview.domain, 'tts');
assert(cliOverview.output.includes('Together AI Text-to-Speech (TTS) Inference Overview'));

const cliStreaming = await executeTogetherCliCommand('tg tts streaming');
assert.strictEqual(cliStreaming.success, true);
assert(cliStreaming.output.includes('Together AI Text-to-Speech HTTP Streaming (SSE)'));

const cliWs = await executeTogetherCliCommand('together tts websocket');
assert.strictEqual(cliWs.success, true);
assert(cliWs.output.includes('Together AI Real-Time Text-to-Speech WebSocket API'));

const cliVal = await executeTogetherCliCommand('together tts validate --voice af_bella(2)+af_heart(1) --model hexgrad/Kokoro-82M');
assert.strictEqual(cliVal.success, true);
assert(cliVal.output.includes('Status: VALID ✅'));

const cliWsConf = await executeTogetherCliCommand('tg tts ws-config --voice tara --model canopylabs/orpheus-3b-0.1-ft');
assert.strictEqual(cliWsConf.success, true);
assert(cliWsConf.output.includes('WebSocket Real-Time TTS Configuration'));

const cliRun = await executeTogetherCliCommand('together tts run --input "Hello Sovereign World" --voice tara --alignment word --dry-run');
assert.strictEqual(cliRun.success, true);
assert(cliRun.output.includes('TTS Speech Synthesis Result'));
console.log('   ✅ All 6 CLI commands executed with domain "tts".');

// ── 10. Gateway Handlers ─────────────────────────────────────────────────────
console.log('\n🔟 Testing Inference Gateway TTS Handlers...');
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
await InferenceGateway.handleGetTTSOverview({}, mockRes1);
assert.strictEqual(mockRes1.statusCode, 200);
assert.strictEqual(mockRes1.body.success, true);

const mockRes2 = createMockRes();
await InferenceGateway.handleGetTTSStreamingDocs({}, mockRes2);
assert.strictEqual(mockRes2.statusCode, 200);
assert.strictEqual(mockRes2.body.success, true);

const mockRes3 = createMockRes();
await InferenceGateway.handleGetTTSWebSocketDocs({}, mockRes3);
assert.strictEqual(mockRes3.statusCode, 200);
assert.strictEqual(mockRes3.body.success, true);

const mockRes4 = createMockRes();
await InferenceGateway.handleValidateTTSParams({ body: { input: 'Test', voice: 'tara' } }, mockRes4);
assert.strictEqual(mockRes4.statusCode, 200);
assert.strictEqual(mockRes4.body.valid, true);

const mockRes5 = createMockRes();
await InferenceGateway.handleGetTTSWebSocketConfig({ query: { voice: 'af_heart' } }, mockRes5);
assert.strictEqual(mockRes5.statusCode, 200);
assert(mockRes5.body.websocket_url.includes('af_heart'));

const mockRes6 = createMockRes();
await InferenceGateway.handleExecuteTTSSynthesis({ body: { dry_run: true } }, mockRes6);
assert.strictEqual(mockRes6.statusCode, 200);
assert.strictEqual(mockRes6.body.dry_run, true);
console.log('   ✅ All 6 Gateway handlers tested and responded with HTTP 200.');

console.log('\n🎉 ALL 10 VERIFICATION PHASES PASSED WITH ZERO ERRORS!');
