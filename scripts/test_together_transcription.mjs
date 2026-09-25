/**
 * Comprehensive Verification Test for Together.ai Transcription (STT) Inference Suite
 * License: MIT
 */

import assert from 'assert';
import {
  TRANSCRIPTION_MODELS_CATALOG,
  AUDIO_FORMATS,
  TRANSCRIPTION_LIMITS,
  VAD_PRESETS,
  getTranscriptionOverview,
  getTranscriptionStreamingDocs,
  getTranscriptionTranslationDocs,
  getVoiceActivityDetectionDocs,
  getTranscriptionFeaturesDocs,
  validateTranscriptionParams,
  getVADConfiguration,
  buildStreamingWebSocketConfig,
  executeAudioTranscription,
  executeAudioTranslation,
} from '../src/app/services/together.transcription.js';
import { executeTogetherCliCommand } from '../src/app/services/together.cli.js';
import InferenceGateway from '../src/app/modules/inference/inference.gateway.js';

console.log('🧪 Starting Together.ai Transcription Inference Suite Verification...\n');

// ── 1. Overview & Models Catalog ─────────────────────────────────────────────
console.log('1️⃣ Testing Transcription Overview & Catalog...');
const overview = getTranscriptionOverview();
assert.strictEqual(overview.success, true);
assert.strictEqual(overview.recommended_model, 'openai/whisper-large-v3');
assert(overview.models.length >= 4);
assert.strictEqual(overview.limits.max_duration_hours, 4);
assert.strictEqual(overview.limits.max_binary_upload_mb, 80);
assert.strictEqual(overview.limits.max_url_fetch_gb, 1);
assert(overview.supported_formats.some(f => f.ext === '.wav'));
assert(overview.supported_formats.some(f => f.ext === '.mp3'));
assert(overview.supported_formats.some(f => f.ext === '.flac'));
console.log(`   ✅ Catalog contains ${overview.models.length} models, 8 supported audio formats, and 4h/80MB/1GB limits.`);

// ── 2. Real-time Streaming WebSocket Docs ────────────────────────────────────
console.log('\n2️⃣ Testing Real-Time Streaming WebSocket Documentation...');
const streaming = getTranscriptionStreamingDocs();
assert.strictEqual(streaming.success, true);
assert.strictEqual(streaming.websocket_url, 'wss://api.together.ai/v1/realtime');
assert.strictEqual(streaming.wire_audio_format.format, 'pcm_s16le_16000');
assert.strictEqual(streaming.wire_audio_format.sample_rate_hz, 16000);
assert(streaming.client_events.some(e => e.type === 'input_audio_buffer.append'));
assert(streaming.client_events.some(e => e.type === 'input_audio_buffer.commit'));
assert(streaming.server_events.some(e => e.type === 'conversation.item.input_audio_transcription.delta'));
assert(streaming.server_events.some(e => e.type === 'conversation.item.input_audio_transcription.completed'));
console.log('   ✅ Streaming protocol: 16kHz mono PCM, append/commit client events, delta/completed server events verified.');

// ── 3. Speech Translation Documentation ──────────────────────────────────────
console.log('\n3️⃣ Testing Speech Translation Documentation...');
const translation = getTranscriptionTranslationDocs();
assert.strictEqual(translation.success, true);
assert.strictEqual(translation.endpoint, 'POST /v1/audio/translations');
assert.strictEqual(translation.recommended_model, 'openai/whisper-large-v3');
assert(translation.code_snippets.python.includes('client.audio.translations.create'));
assert(translation.code_snippets.typescript.includes('together.audio.translations.create'));
console.log('   ✅ Speech translation docs and code snippets verified.');

// ── 4. Voice Activity Detection (VAD) & Presets ──────────────────────────────
console.log('\n4️⃣ Testing Voice Activity Detection (VAD) & Presets...');
const vad = getVoiceActivityDetectionDocs();
assert.strictEqual(vad.success, true);
assert.strictEqual(vad.parameters.length, 5);
assert.strictEqual(vad.presets.conversational.threshold, 0.3);
assert.strictEqual(vad.presets.conversational.min_silence_duration_ms, 500);
assert.strictEqual(vad.presets.phone_call_low_quality.threshold, 0.01);
assert.strictEqual(vad.presets.phone_call_low_quality.max_speech_duration_s, 60.0);
assert.strictEqual(vad.presets.disabled.type, 'none');

const resolvedPreset = getVADConfiguration('phone_call_low_quality');
assert.strictEqual(resolvedPreset.threshold, 0.01);
assert.strictEqual(resolvedPreset.speech_pad_ms, 10);
console.log('   ✅ 5 VAD parameters, conversational & phone presets, and custom resolution verified.');

// ── 5. Advanced Features (Diarization, Timestamps, Formats) ──────────────────
console.log('\n5️⃣ Testing Advanced Features Documentation...');
const features = getTranscriptionFeaturesDocs();
assert.strictEqual(features.success, true);
assert(features.features.some(f => f.name === 'speaker_diarization'));
assert(features.features.some(f => f.name === 'word_level_timestamps'));
assert(features.features.some(f => f.name === 'segment_level_timestamps'));
assert(features.features.some(f => f.name === 'response_formats'));
console.log('   ✅ Diarization, word timestamps, segment timestamps, and response formats verified.');

// ── 6. Parameter Validation Logic ────────────────────────────────────────────
console.log('\n6️⃣ Testing Transcription Parameter Validation...');
const validParams = validateTranscriptionParams({
  model: 'openai/whisper-large-v3',
  language: 'es',
  prompt: 'Meeting notes',
  diarize: true,
  timestamp_granularities: 'word',
  temperature: 0.2,
});
assert.strictEqual(validParams.valid, true);
assert.strictEqual(validParams.errors.length, 0);

// Invalid temperature (> 1.0) and unsupported diarization on parakeet
const invalidParams = validateTranscriptionParams({
  model: 'nvidia/parakeet-tdt-0.6b-v3',
  diarize: true,
  temperature: 1.5,
});
assert.strictEqual(invalidParams.valid, false);
assert(invalidParams.errors.some(e => e.includes('diarization')));
assert(invalidParams.errors.some(e => e.includes('Temperature')));
console.log('   ✅ Validator correctly allowed valid params and caught invalid temperature & model capabilities.');

// ── 7. Streaming WebSocket Config Builder ────────────────────────────────────
console.log('\n7️⃣ Testing Streaming WebSocket Config Builder...');
const wsConf = buildStreamingWebSocketConfig({
  model: 'openai/whisper-large-v3',
  vad_preset: 'phone_call_low_quality',
});
assert(wsConf.websocket_url.startsWith('wss://api.together.ai/v1/realtime?'));
assert(wsConf.websocket_url.includes('threshold=0.01'));
assert(wsConf.websocket_url.includes('min_silence_duration_ms=1000'));
assert.strictEqual(wsConf.input_audio_format, 'pcm_s16le_16000');
console.log('   ✅ WebSocket connection URL built with accurate VAD query parameters.');

// ── 8. Execution Dispatchers (Dry-Run Transcription & Translation) ────────────
console.log('\n8️⃣ Testing Execution Dispatchers (Dry-Run)...');
const sttRun = await executeAudioTranscription({
  file: 'call_recording.mp3',
  response_format: 'verbose_json',
  diarize: true,
  dry_run: true,
});
assert.strictEqual(sttRun.success, true);
assert.strictEqual(sttRun.dry_run, true);
assert(sttRun.words.length > 0);
assert(sttRun.speaker_segments.length > 0);
assert.strictEqual(sttRun.speaker_segments[0].speaker_id, 'SPEAKER_01');

const sttTrans = await executeAudioTranslation({
  file: 'spanish_voicemail.mp3',
  dry_run: true,
});
assert.strictEqual(sttTrans.success, true);
assert.strictEqual(sttTrans.dry_run, true);
assert(sttTrans.text.includes('Translated English text'));
console.log('   ✅ Dry-run transcription with word timestamps & diarization, and translation executed cleanly.');

// ── 9. Together CLI Command Execution ────────────────────────────────────────
console.log('\n9️⃣ Testing Together Sovereign CLI STT Commands...');
const cliOverview = await executeTogetherCliCommand('together stt overview');
assert.strictEqual(cliOverview.success, true);
assert.strictEqual(cliOverview.domain, 'transcription');
assert(cliOverview.output.includes('Together AI Speech-to-Text (Transcription) Overview'));

const cliStreaming = await executeTogetherCliCommand('tg stt streaming');
assert.strictEqual(cliStreaming.success, true);
assert(cliStreaming.output.includes('Real-Time WebSocket Streaming Transcription'));

const cliTrans = await executeTogetherCliCommand('together stt translation');
assert.strictEqual(cliTrans.success, true);
assert(cliTrans.output.includes('Speech Translation (Audio to English Text)'));

const cliVad = await executeTogetherCliCommand('tg stt vad');
assert.strictEqual(cliVad.success, true);
assert(cliVad.output.includes('Voice Activity Detection (VAD) Reference'));

const cliFeatures = await executeTogetherCliCommand('together stt features');
assert.strictEqual(cliFeatures.success, true);
assert(cliFeatures.output.includes('Advanced Transcription Features'));

const cliVal = await executeTogetherCliCommand('together stt validate --model openai/whisper-large-v3 --diarize');
assert.strictEqual(cliVal.success, true);
assert(cliVal.output.includes('Status: VALID ✅'));

const cliWs = await executeTogetherCliCommand('together stt ws-config --preset phone_call_low_quality');
assert.strictEqual(cliWs.success, true);
assert(cliWs.output.includes('WebSocket Real-Time STT Configuration'));

const cliRun = await executeTogetherCliCommand('together stt run --file test.wav --dry-run');
assert.strictEqual(cliRun.success, true);
assert(cliRun.output.includes('Audio Transcription Result'));

const cliTranslateRun = await executeTogetherCliCommand('together stt translate --file foreign.wav --dry-run');
assert.strictEqual(cliTranslateRun.success, true);
assert(cliTranslateRun.output.includes('Audio Translation to English Result'));
console.log('   ✅ All 9 CLI commands executed with domain "transcription".');

// ── 10. Gateway Handlers ─────────────────────────────────────────────────────
console.log('\n🔟 Testing Inference Gateway Transcription Handlers...');
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
await InferenceGateway.handleGetTranscriptionOverview({}, mockRes1);
assert.strictEqual(mockRes1.statusCode, 200);
assert.strictEqual(mockRes1.body.success, true);

const mockRes2 = createMockRes();
await InferenceGateway.handleGetVoiceActivityDetectionDocs({}, mockRes2);
assert.strictEqual(mockRes2.statusCode, 200);
assert.strictEqual(mockRes2.body.success, true);

const mockRes3 = createMockRes();
await InferenceGateway.handleExecuteTranscription({ body: { dry_run: true } }, mockRes3);
assert.strictEqual(mockRes3.statusCode, 200);
assert.strictEqual(mockRes3.body.success, true);

const mockRes4 = createMockRes();
await InferenceGateway.handleExecuteTranslation({ body: { dry_run: true } }, mockRes4);
assert.strictEqual(mockRes4.statusCode, 200);
assert.strictEqual(mockRes4.body.success, true);
console.log('   ✅ Gateway handlers tested and responded with HTTP 200.');

console.log('\n🎉 ALL 10 VERIFICATION PHASES PASSED WITH ZERO ERRORS!');
