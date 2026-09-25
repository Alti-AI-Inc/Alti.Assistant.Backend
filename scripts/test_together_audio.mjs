import assert from 'assert';
import {
  llmTextToSpeech,
  llmStreamTTS,
  llmTranscribeAudio,
  llmTranslateAudio,
  llmRealtimeTTSConfig,
  llmRealtimeSTTConfig,
  createFallbackWav,
} from '../src/app/services/llm.client.js';
import { InferenceGateway } from '../src/app/modules/inference/inference.gateway.js';

console.log('🧪 Testing Together.ai Audio Endpoints & Modalities...');

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
    send(data) {
      this.body = data;
      return this;
    },
    write(chunk) {
      if (!this.body) this.body = '';
      this.body += chunk;
      return true;
    },
    end() {
      return this;
    },
  };
}

async function runTests() {
  // Test 1: createFallbackWav creates a valid 44-byte WAV header
  console.log('[Test 1] createFallbackWav header check...');
  const wav = createFallbackWav(1.0, 24000);
  assert(Buffer.isBuffer(wav), 'Must be a Buffer');
  assert.strictEqual(wav.toString('ascii', 0, 4), 'RIFF', 'WAV magic RIFF');
  assert.strictEqual(wav.toString('ascii', 8, 12), 'WAVE', 'WAV format WAVE');
  assert.strictEqual(wav.readUInt32LE(24), 24000, 'Sample rate 24000');
  console.log('✅ Test 1 Passed: Valid WAV buffer generated, byte length:', wav.length);

  // Test 2: llmTextToSpeech returns audio buffer
  console.log('[Test 2] llmTextToSpeech...');
  const ttsRes = await llmTextToSpeech('Sovereign audio synthesis ready.');
  assert(Buffer.isBuffer(ttsRes), 'Should return audio buffer');
  assert(ttsRes.length > 100, 'Audio buffer must contain data');
  console.log('✅ Test 2 Passed: TTS buffer length:', ttsRes.length);

  // Test 3: llmStreamTTS returns chunk stream
  console.log('[Test 3] llmStreamTTS...');
  const stream = await llmStreamTTS('Streaming audio chunk synthesis.');
  let chunkCount = 0;
  for await (const chunk of stream) {
    chunkCount++;
    assert(chunk.object === 'audio.tts.chunk', 'Chunk object must be audio.tts.chunk');
    assert(typeof chunk.b64 === 'string', 'Chunk must have b64 string');
  }
  assert(chunkCount > 0, 'Stream must produce at least 1 chunk');
  console.log('✅ Test 3 Passed: TTS Stream produced chunk(s).');

  // Test 4: llmTranscribeAudio standard and verbose
  console.log('[Test 4] llmTranscribeAudio...');
  const trans1 = await llmTranscribeAudio('https://example.com/audio.wav');
  assert(typeof trans1.text === 'string', 'Should return text');
  const transVerbose = await llmTranscribeAudio('https://example.com/audio.wav', { response_format: 'verbose_json' });
  assert(transVerbose.task === 'transcribe', 'Should be transcribe task');
  assert(Array.isArray(transVerbose.segments), 'Should have segments array');
  console.log('✅ Test 4 Passed: Transcribe returned valid schema.');

  // Test 5: llmTranslateAudio
  console.log('[Test 5] llmTranslateAudio...');
  const trans2 = await llmTranslateAudio('https://example.com/audio.wav', { response_format: 'verbose_json' });
  assert(trans2.task === 'translate', 'Should be translate task');
  assert(typeof trans2.text === 'string', 'Should return translated text');
  console.log('✅ Test 5 Passed: Translation returned valid schema.');

  // Test 6: Realtime configs
  console.log('[Test 6] Realtime WebSocket configs...');
  const ttsConfig = llmRealtimeTTSConfig({ voice: 'tara' });
  assert(ttsConfig.url.startsWith('wss://api.together.ai/v1/audio/speech/websocket'), 'TTS WS URL matches spec');
  const sttConfig = llmRealtimeSTTConfig({ model: 'openai/whisper-large-v3' });
  assert(sttConfig.url.startsWith('wss://api.together.ai/v1/realtime'), 'STT WS URL matches spec');
  console.log('✅ Test 6 Passed: Realtime WebSocket URLs verified.');

  // Test 7: InferenceGateway.handleSpeech non-streaming & streaming
  console.log('[Test 7] InferenceGateway.handleSpeech...');
  const res1 = createMockRes();
  await InferenceGateway.handleSpeech({ body: { input: 'Testing speech synthesis endpoint' } }, res1);
  assert.strictEqual(res1.statusCode, 200, 'Status should be 200');
  assert.strictEqual(res1.headers['content-type'], 'audio/wav', 'Content type should be audio/wav');
  assert(Buffer.isBuffer(res1.body), 'Response body should be WAV buffer');

  const resStream = createMockRes();
  await InferenceGateway.handleSpeech({ body: { input: 'Testing streaming speech', stream: true } }, resStream);
  assert(resStream.body.includes('audio.tts.chunk'), 'Streaming body must include audio.tts.chunk event');
  assert(resStream.body.includes('[DONE]'), 'Streaming body must terminate with [DONE]');
  console.log('✅ Test 7 Passed: Gateway speech endpoint (sync + SSE stream) passed.');

  // Test 8: InferenceGateway.handleTranscriptions and handleTranslations
  console.log('[Test 8] InferenceGateway transcriptions and translations...');
  const resTrans = createMockRes();
  await InferenceGateway.handleTranscriptions({ body: { file: 'https://example.com/audio.wav', response_format: 'verbose_json' } }, resTrans);
  assert.strictEqual(resTrans.statusCode, 200);
  assert.strictEqual(resTrans.body.task, 'transcribe');

  const resTransl = createMockRes();
  await InferenceGateway.handleTranslations({ body: { file: 'https://example.com/audio.wav' } }, resTransl);
  assert.strictEqual(resTransl.statusCode, 200);
  assert(typeof resTransl.body.text === 'string');
  console.log('✅ Test 8 Passed: Gateway transcriptions and translations passed.');

  // Test 9: Input validation errors
  console.log('[Test 9] Missing input/file validation...');
  const resErr1 = createMockRes();
  await InferenceGateway.handleSpeech({ body: {} }, resErr1);
  assert.strictEqual(resErr1.statusCode, 400);
  assert.strictEqual(resErr1.body.error.param, 'input');

  const resErr2 = createMockRes();
  await InferenceGateway.handleTranscriptions({ body: {} }, resErr2);
  assert.strictEqual(resErr2.statusCode, 400);
  assert.strictEqual(resErr2.body.error.param, 'file');
  console.log('✅ Test 9 Passed: Validated parameter requirements.');

  console.log('\n🎉 ALL 9 TOGETHER.AI AUDIO ENDPOINT TESTS PASSED CLEANLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Audio test failed:', err);
  process.exit(1);
});
