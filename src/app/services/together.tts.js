/**
 * Aphura Sovereign Together.ai Text-to-Speech (TTS) Inference Suite Service
 * Complete Implementation of Together AI Text-to-Speech across 3 Core Delivery Modes:
 * 
 * 1. Overview & Models:                 https://docs.together.ai/docs/inference/text-to-speech/overview
 *    - Models (Orpheus, Kokoro, Cartesia, Minimax), voice catalog & Kokoro voice mixing (e.g. af_bella(2)+af_heart(1)), formats, pronunciation dict
 * 2. HTTP Streaming (SSE):              https://docs.together.ai/docs/inference/text-to-speech/streaming
 *    - Server-Sent Events, raw PCM (pcm_s16le), audio deltas, word alignment timestamps, fast TTFB
 * 3. Bidirectional Real-time WebSocket: https://docs.together.ai/docs/inference/text-to-speech/websocket
 *    - wss://api.together.ai/v1/audio/speech/websocket, text buffer append/commit/clear, audio delta/done events
 * 
 * License: MIT
 */

import { executeSharedInference } from './together.inference.js';

// ── 1. Models & Voices Catalog ───────────────────────────────────────────────

export const TTS_MODELS_CATALOG = [
  {
    id: 'canopylabs/orpheus-3b-0.1-ft',
    name: 'CanopyLabs Orpheus 3B 0.1 FT',
    type: 'High-Fidelity Conversational Voice Synthesis',
    sample_rates: [24000, 44100],
    default_sample_rate: 24000,
    supported_formats: ['mp3', 'wav', 'raw', 'mulaw'],
    voices: ['tara', 'leah', 'jess', 'leo', 'dan', 'mia', 'zac', 'zoe'],
    features: ['word_timestamps', 'streaming_sse', 'websocket', 'pronunciation_dict'],
    recommended_for: 'Ultra-natural conversational voice agents, podcasts, and audio storytelling.',
  },
  {
    id: 'hexgrad/Kokoro-82M',
    name: 'Hexgrad Kokoro 82M',
    type: 'Ultra-Fast Lightweight Multilingual Synthesis',
    sample_rates: [24000],
    default_sample_rate: 24000,
    supported_formats: ['mp3', 'wav', 'raw', 'mulaw'],
    voices: [
      'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore',
      'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky', 'am_adam',
      'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx',
      'am_puck', 'am_santa', 'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
      'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis', 'jf_alpha', 'zm_yunjian',
    ],
    features: ['voice_mixing', 'word_timestamps', 'streaming_sse', 'websocket'],
    voice_mixing_support: true,
    recommended_for: 'Lowest latency CPU/GPU voice synthesis and custom voice blending (e.g., af_bella(2)+af_heart(1)).',
  },
  {
    id: 'cartesia/sonic',
    name: 'Cartesia Sonic',
    type: 'Low-Latency Steerable Voice Synthesis',
    sample_rates: [24000, 44100],
    default_sample_rate: 24000,
    supported_formats: ['mp3', 'wav', 'raw'],
    supported_bitrates: [32000, 64000, 96000, 128000, 192000],
    features: ['bitrate_control', 'streaming_sse', 'websocket'],
    recommended_for: 'Telephony and bandwidth-constrained real-time voice streaming.',
  },
  {
    id: 'minimax/speech-01',
    name: 'MiniMax Speech-01',
    type: 'Multilingual High-Definition Synthesis',
    sample_rates: [16000, 24000, 32000, 48000],
    default_sample_rate: 24000,
    supported_formats: ['mp3', 'wav', 'raw', 'opus', 'aac', 'flac'],
    features: ['multilingual', 'extended_codecs'],
    recommended_for: 'Multi-codec distribution (Opus/AAC/FLAC) and international localization.',
  },
];

export const TTS_OUTPUT_FORMATS = [
  { format: 'mp3', ext: '.mp3', streaming_support: false, description: 'Compressed audio with customizable bitrate.' },
  { format: 'wav', ext: '.wav', streaming_support: false, description: 'Uncompressed audio (larger file size).' },
  { format: 'raw', ext: '.pcm', streaming_support: true, description: 'Raw PCM 16-bit little-endian audio (lowest latency).' },
  { format: 'mulaw', ext: '.ulaw', streaming_support: true, description: 'Logarithmic companding for telephony protocols.' },
  { format: 'opus', ext: '.opus', streaming_support: false, description: 'High-efficiency voice codec (MiniMax).' },
  { format: 'aac', ext: '.aac', streaming_support: false, description: 'Advanced Audio Coding (MiniMax).' },
  { format: 'flac', ext: '.flac', streaming_support: false, description: 'Free Lossless Audio Codec (MiniMax).' },
];

// ── 2. Overview Documentation ────────────────────────────────────────────────

export function getTTSOverview() {
  return {
    success: true,
    title: 'Together AI Text-to-Speech (TTS) Inference Overview',
    docs_url: 'https://docs.together.ai/docs/inference/text-to-speech/overview',
    recommended_model: 'canopylabs/orpheus-3b-0.1-ft',
    fallback_model: 'hexgrad/Kokoro-82M',
    models: TTS_MODELS_CATALOG,
    output_formats: TTS_OUTPUT_FORMATS,
    parameters_reference: [
      { name: 'model', type: 'string', required: true, description: 'The TTS model to use.' },
      { name: 'input', type: 'string', required: true, description: 'The text to generate audio for.' },
      { name: 'voice', type: 'string', required: true, description: 'Voice ID or Kokoro voice blend (e.g., tara or af_bella(2)+af_heart(1)).' },
      { name: 'response_format', type: 'string', required: false, default: 'wav', description: 'mp3, wav, raw (PCM), mulaw, opus, aac, flac.' },
      { name: 'sample_rate', type: 'integer', required: false, default: 24000, description: 'Audio sample rate in Hz (e.g. 24000, 44100).' },
      { name: 'bit_rate', type: 'integer', required: false, default: 128000, description: 'MP3 bitrate in bps (32000, 64000, 96000, 128000, 192000).' },
      { name: 'language', type: 'string', required: false, description: 'Locale or language code (e.g. en, fr, zh-hk).' },
      { name: 'alignment', type: 'string', required: false, default: 'none', description: 'Controls word timestamp generation: "word" or "none".' },
      { name: 'segment', type: 'string', required: false, default: 'sentence', description: 'Segmentation strategy: "sentence", "immediate", "never".' },
      { name: 'extra_params.pronunciation_dict', type: 'array', required: false, description: 'Array of "<source>/<replacement>" rules (e.g. ["omg/oh my god"]).' },
    ],
    voice_mixing_guide: {
      model: 'hexgrad/Kokoro-82M',
      equal_weights_example: 'af_bella+af_heart',
      custom_weights_example: 'af_bella(2)+af_heart(1)',
      description: 'Combine two or more Kokoro voices into a blended custom voice using "+" and weight multipliers.',
    },
    code_snippets: {
      python: `from together import Together
client = Together()

with client.audio.speech.with_streaming_response.create(
    model="canopylabs/orpheus-3b-0.1-ft",
    input="Today is a wonderful day to build something people love!",
    voice="tara",
    response_format="mp3",
) as response:
    response.stream_to_file("speech.mp3")`,
      typescript: `import Together from 'together-ai';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';

const together = new Together();
const res = await together.audio.speech.create({
  input: 'Hello, how are you today?',
  voice: 'tara',
  response_format: 'mp3',
  sample_rate: 24000,
  stream: false,
  model: 'canopylabs/orpheus-3b-0.1-ft',
});`,
      curl: `curl -X POST "https://api.together.ai/v1/audio/speech" \\
  -H "Authorization: Bearer $TOGETHER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "canopylabs/orpheus-3b-0.1-ft",
    "input": "The quick brown fox jumps over the lazy dog",
    "voice": "tara",
    "response_format": "mp3"
  }' \\
  --output speech.mp3`,
    },
  };
}

// ── 3. Streaming Documentation (Server-Sent Events) ──────────────────────────

export function getTTSStreamingDocs() {
  return {
    success: true,
    title: 'Together AI Text-to-Speech HTTP Streaming (SSE)',
    docs_url: 'https://docs.together.ai/docs/inference/text-to-speech/streaming',
    stream_endpoint: 'POST https://api.together.ai/v1/audio/speech',
    required_flags: {
      stream: true,
      response_format: 'raw',
      response_encoding: 'pcm_s16le',
    },
    event_protocol: [
      {
        event: 'audio_delta',
        format: 'data: {"type":"conversation.item.audio_output.delta","item_id":"tts_1","delta":"<base64_encoded_audio>"}',
        description: 'Emits incremental base64-encoded PCM audio chunks as text tokens are synthesized.',
      },
      {
        event: 'word_timestamps',
        format: 'data: {"type":"conversation.item.word_timestamps","words":["Hello","world"],"start_seconds":[0.0,0.4],"end_seconds":[0.4,0.8]}',
        condition: 'Emitted when alignment="word" is specified.',
      },
      {
        event: 'stream_done',
        format: 'data: [DONE]',
        description: 'Marks the end of the server-sent events audio stream.',
      },
    ],
    code_snippets: {
      python: `from together import Together
client = Together()

with client.audio.speech.with_streaming_response.create(
    model="canopylabs/orpheus-3b-0.1-ft",
    input="The quick brown fox jumps over the lazy dog",
    voice="tara",
    stream=True,
    response_format="raw",
    response_encoding="pcm_s16le",
) as response:
    response.stream_to_file("speech_streaming.pcm")`,
      typescript: `const response = await together.audio.speech.create({
  model: 'canopylabs/orpheus-3b-0.1-ft',
  input: 'The quick brown fox jumps over the lazy dog',
  voice: 'tara',
  stream: true,
  response_format: 'raw',
  response_encoding: 'pcm_s16le',
});`,
    },
  };
}

// ── 4. WebSocket Documentation & Real-Time Protocol ─────────────────────────

export function getTTSWebSocketDocs() {
  return {
    success: true,
    title: 'Together AI Real-Time Text-to-Speech WebSocket API',
    docs_url: 'https://docs.together.ai/docs/inference/text-to-speech/websocket',
    websocket_url: 'wss://api.together.ai/v1/audio/speech/websocket',
    url_template: 'wss://api.together.ai/v1/audio/speech/websocket?model={model}&voice={voice}&response_format=pcm&sample_rate={hz}',
    auth_methods: [
      { type: 'header', header: 'Authorization: Bearer $TOGETHER_API_KEY' },
      { type: 'query_param', query: '?api_key=<your_api_key>' },
    ],
    client_messages: [
      {
        type: 'input_text_buffer.append',
        description: 'Appends text to the input stream buffer.',
        example: { type: 'input_text_buffer.append', text: 'Hello, this is a test sentence.' },
      },
      {
        type: 'input_text_buffer.commit',
        description: 'Forces processing of all buffered text; marks end of utterance.',
        example: { type: 'input_text_buffer.commit' },
      },
      {
        type: 'input_text_buffer.clear',
        description: 'Discards un-synthesized buffered text immediately (user barge-in / interruption).',
        example: { type: 'input_text_buffer.clear' },
      },
      {
        type: 'tts_session.updated',
        description: 'Dynamically updates voice or synthesis parameters mid-session.',
        example: { type: 'tts_session.updated', session: { voice: 'af_heart' } },
      },
    ],
    server_messages: [
      {
        type: 'session.created',
        description: 'Session handshake confirmation returning session UUID, model, and active voice.',
      },
      {
        type: 'conversation.item.input_text.received',
        description: 'Acknowledgment of received input text chunk.',
      },
      {
        type: 'conversation.item.audio_output.delta',
        description: 'Base64-encoded streaming audio chunk (16-bit PCM).',
      },
      {
        type: 'conversation.item.audio_output.done',
        description: 'Audio generation finished for the committed item.',
      },
      {
        type: 'conversation.item.word_timestamps',
        description: 'Word-level alignment timestamps when alignment=word is set.',
      },
      {
        type: 'conversation.item.tts.failed',
        description: 'Error emitted if synthesis fails.',
      },
    ],
  };
}

// ── 5. Helpers & Validation ──────────────────────────────────────────────────

/**
 * Validates text-to-speech parameters against official constraints
 */
export function validateTTSParams(params = {}) {
  const errors = [];
  const warnings = [];

  const {
    model = 'canopylabs/orpheus-3b-0.1-ft',
    input,
    voice,
    response_format = 'wav',
    sample_rate,
    bit_rate,
    alignment,
    extra_params,
  } = params;

  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    errors.push('The "input" text parameter is required and cannot be empty.');
  }

  if (!voice || typeof voice !== 'string' || voice.trim().length === 0) {
    errors.push('The "voice" parameter is required.');
  }

  const knownModel = TTS_MODELS_CATALOG.find(m => m.id === model);
  if (!knownModel) {
    warnings.push(`Model '${model}' is not in the official catalog. Verify that it is deployed on Together AI.`);
  }

  // Kokoro Voice Mixing validation
  if (voice && voice.includes('+')) {
    if (model !== 'hexgrad/Kokoro-82M') {
      errors.push(`Voice mixing (joining voices with '+') is only supported on 'hexgrad/Kokoro-82M'. Model '${model}' does not support voice blending.`);
    }
  }

  // Format validation
  const validFormats = knownModel?.supported_formats || ['mp3', 'wav', 'raw', 'mulaw'];
  if (response_format && !validFormats.includes(response_format)) {
    warnings.push(`Response format '${response_format}' may not be supported by model '${model}'. Supported formats: ${validFormats.join(', ')}.`);
  }

  // Bitrate validation for Cartesia
  if (bit_rate) {
    const validBitrates = [32000, 64000, 96000, 128000, 192000];
    if (!validBitrates.includes(bit_rate)) {
      errors.push(`Invalid bit_rate '${bit_rate}'. Valid values: ${validBitrates.join(', ')}.`);
    }
  }

  // Pronunciation dictionary validation
  if (extra_params?.pronunciation_dict) {
    if (!Array.isArray(extra_params.pronunciation_dict)) {
      errors.push('extra_params.pronunciation_dict must be an array of strings in the format "source/replacement".');
    } else {
      extra_params.pronunciation_dict.forEach((rule) => {
        if (typeof rule !== 'string' || !rule.includes('/')) {
          warnings.push(`Pronunciation rule '${rule}' does not follow the "source/replacement" pattern.`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    model,
    voice,
    voice_mixed: Boolean(voice && voice.includes('+')),
    response_format,
  };
}

/**
 * Builds WebSocket configuration for Real-time TTS
 */
export function buildTTSWebSocketConfig(params = {}) {
  const model = params.model || 'hexgrad/Kokoro-82M';
  const voice = params.voice || 'af_alloy';
  const responseFormat = params.response_format || 'pcm';
  const sampleRate = params.sample_rate || 24000;

  const queryParams = new URLSearchParams({
    model,
    voice,
    response_format: responseFormat,
    sample_rate: String(sampleRate),
  });

  return {
    websocket_url: `wss://api.together.ai/v1/audio/speech/websocket?${queryParams.toString()}`,
    model,
    voice,
    response_format: responseFormat,
    sample_rate: sampleRate,
    headers: {
      Authorization: 'Bearer $TOGETHER_API_KEY',
    },
  };
}

// ── 6. Synthesis Dispatcher & Execution ──────────────────────────────────────

export async function executeTTSSynthesis(params = {}) {
  const {
    model = 'canopylabs/orpheus-3b-0.1-ft',
    input = 'Welcome to Aphura Sovereign Voice.',
    voice = 'tara',
    response_format = 'wav',
    sample_rate = 24000,
    stream = false,
    alignment = 'none',
    dry_run = false,
  } = params;

  if (dry_run) {
    const mockPcmBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    const hasWordAlignment = alignment === 'word';

    const mockResponse = {
      success: true,
      dry_run: true,
      model,
      voice,
      response_format,
      sample_rate,
      audio_base64: mockPcmBase64,
      duration_seconds: 2.45,
      byte_size: 117600,
    };

    if (hasWordAlignment) {
      mockResponse.words = ['Welcome', 'to', 'Aphura', 'Sovereign', 'Voice.'];
      mockResponse.start_seconds = [0.0, 0.45, 0.70, 1.35, 1.95];
      mockResponse.end_seconds = [0.45, 0.68, 1.30, 1.90, 2.45];
    }

    return mockResponse;
  }

  // Live dispatch via executeSharedInference
  return executeSharedInference({
    endpoint: 'audio/speech',
    body: {
      model,
      input,
      voice,
      response_format,
      sample_rate,
      stream,
      alignment,
      ...params,
    },
  });
}
