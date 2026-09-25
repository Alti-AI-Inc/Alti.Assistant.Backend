/**
 * Aphura Sovereign Together.ai Transcription (STT) Inference Suite Service
 * Complete Implementation of Together AI Audio Transcription across 5 Core Domains:
 * 
 * 1. Overview & Models:                 https://docs.together.ai/docs/inference/transcription/overview
 *    - Whisper Large v3, NVIDIA Parakeet, Nemotron, 4h / 80MB upload / 1GB URL limits, formats, ISO codes
 * 2. Streaming Transcription:            https://docs.together.ai/docs/inference/transcription/streaming
 *    - Real-time WebSocket (wss://api.together.ai/v1/realtime), 16kHz PCM (pcm_s16le_16000), events & reconnect
 * 3. Speech Translation:                https://docs.together.ai/docs/inference/transcription/translation
 *    - Any language to English text (/v1/audio/translations), Whisper model, context prompt
 * 4. Voice Activity Detection (VAD):    https://docs.together.ai/docs/inference/transcription/voice-activity-detection
 *    - Server-side VAD, 5 parameters (threshold, min_silence_duration_ms, min_speech_duration_ms, max_speech_duration_s, speech_pad_ms), presets
 * 5. Features & Advanced Options:        https://docs.together.ai/docs/inference/transcription/features
 *    - Speaker diarization (diarize, min/max speakers), word/segment timestamps, json vs verbose_json, temperature
 * 
 * License: MIT
 */

import { executeSharedInference } from './together.inference.js';

// ── 1. Catalogs & Constants ──────────────────────────────────────────────────

export const TRANSCRIPTION_MODELS_CATALOG = [
  {
    id: 'openai/whisper-large-v3',
    name: 'OpenAI Whisper Large v3',
    family: 'whisper',
    type: 'Batch & Real-time Speech-to-Text & Translation',
    supported_tasks: ['transcription', 'translation'],
    supports_prompts: true,
    supports_diarization: true,
    supports_timestamps: true,
    sample_rate_hz: 16000,
    price_per_minute: 0.006,
    recommended_for: 'Highest multilingual accuracy, speaker diarization, word-level timestamps, and English translation.',
  },
  {
    id: 'nvidia/parakeet-tdt-0.6b-v3',
    name: 'NVIDIA Parakeet-TDT 0.6B v3',
    family: 'parakeet',
    type: 'Ultra-Fast Batch Speech-to-Text',
    supported_tasks: ['transcription'],
    supports_prompts: false, // Accepts parameter for compatibility, but ignores it
    supports_diarization: false,
    supports_timestamps: false,
    sample_rate_hz: 16000,
    price_per_minute: 0.004,
    recommended_for: 'Ultra-low latency English transcription with high throughput.',
  },
  {
    id: 'nvidia/nemotron-3-asr-streaming-0.6b',
    name: 'NVIDIA Nemotron 3 ASR Streaming 0.6B',
    family: 'nemotron',
    type: 'Streaming Real-time Speech-to-Text',
    supported_tasks: ['transcription'],
    supports_prompts: false,
    supports_diarization: false,
    supports_timestamps: false,
    sample_rate_hz: 16000,
    recommended_for: 'Real-time WebSocket streaming with low-memory footprint.',
  },
  {
    id: 'nvidia/nemotron-3.5-asr-streaming-0.6b',
    name: 'NVIDIA Nemotron 3.5 ASR Streaming 0.6B',
    family: 'nemotron',
    type: 'Enhanced Streaming Speech-to-Text',
    supported_tasks: ['transcription'],
    supports_prompts: false,
    supports_diarization: false,
    supports_timestamps: false,
    sample_rate_hz: 16000,
    recommended_for: 'Low latency real-time voice agents and telephony conversational streaming.',
  },
];

export const AUDIO_FORMATS = [
  { ext: '.wav', mime: 'audio/wav', label: 'WAV Audio' },
  { ext: '.mp3', mime: 'audio/mpeg', label: 'MP3 Audio' },
  { ext: '.m4a', mime: 'audio/mp4', label: 'M4A Audio' },
  { ext: '.webm', mime: 'audio/webm', label: 'WebM Audio' },
  { ext: '.flac', mime: 'audio/flac', label: 'FLAC Audio' },
  { ext: '.ogg', mime: 'audio/ogg', label: 'OGG Audio' },
  { ext: '.opus', mime: 'audio/opus', label: 'Opus Audio' },
  { ext: '.aac', mime: 'audio/aac', label: 'AAC Audio' },
];

export const TRANSCRIPTION_LIMITS = {
  max_duration_seconds: 14400, // 4 hours
  max_duration_hours: 4,
  max_binary_upload_bytes: 80 * 1024 * 1024, // 80 MB
  max_binary_upload_mb: 80,
  max_url_fetch_bytes: 1024 * 1024 * 1024, // 1 GB
  max_url_fetch_gb: 1,
  default_sample_rate_hz: 16000,
  wire_format: 'pcm_s16le_16000',
  error_codes: {
    AUDIO_TOO_LONG: 'audio_too_long', // Audio exceeds 4 hours
    REQUEST_TOO_LARGE: 'request_too_large', // Direct binary upload exceeds 80 MB (HTTP 413)
    NO_HEALTHY_WORKERS: 'no_healthy_workers', // WS close code 4503
  },
};

export const VAD_PRESETS = {
  conversational: {
    type: 'server_vad',
    threshold: 0.3,
    min_silence_duration_ms: 500,
    min_speech_duration_ms: 250,
    max_speech_duration_s: 5.0,
    speech_pad_ms: 250,
    description: 'Optimized for clean microphone audio at 16kHz with turn-taking between speakers.',
  },
  phone_call_low_quality: {
    type: 'server_vad',
    threshold: 0.01,
    min_silence_duration_ms: 1000,
    min_speech_duration_ms: 500,
    max_speech_duration_s: 60.0,
    speech_pad_ms: 10,
    description: 'Optimized for 8kHz telephony or noisy audio with low SNR and mid-sentence pauses.',
  },
  disabled: {
    type: 'none',
    description: 'VAD disabled. The server will not segment speech automatically. Use manual commit.',
  },
};

// ── 2. Overview Documentation ────────────────────────────────────────────────

export function getTranscriptionOverview() {
  return {
    success: true,
    title: 'Together AI Audio Transcription (Speech-to-Text) Overview',
    docs_url: 'https://docs.together.ai/docs/inference/transcription/overview',
    recommended_model: 'openai/whisper-large-v3',
    fallback_model: 'nvidia/parakeet-tdt-0.6b-v3',
    models: TRANSCRIPTION_MODELS_CATALOG,
    supported_formats: AUDIO_FORMATS,
    limits: TRANSCRIPTION_LIMITS,
    input_methods: [
      {
        method: 'local_file_path',
        sdk_syntax: 'file=Path("audio.mp3")',
        description: 'Upload a local file path using the SDK or file stream.',
      },
      {
        method: 'file_like_object',
        sdk_syntax: 'with open("audio.mp3", "rb") as f: file=f',
        description: 'Pass any binary readable stream or buffer.',
      },
      {
        method: 'remote_https_url',
        curl_syntax: '-F "file=https://example.com/audio.mp3"',
        description: 'Pass a public HTTPS URL directly. Essential for audio files between 80 MB and 1 GB.',
      },
    ],
    common_language_codes: [
      { code: 'auto', name: 'Auto-detect language (default)' },
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'ja', name: 'Japanese' },
      { code: 'zh', name: 'Chinese' },
    ],
    multipart_optimization_tip: 'When sending a binary upload, put the "model" form field BEFORE the "file" field so the server can dispatch without buffering the full audio payload.',
    code_snippets: {
      python: `from pathlib import Path
from together import Together

client = Together()

response = client.audio.transcriptions.create(
    file=Path("audio.mp3"),
    model="openai/whisper-large-v3",
    language="en",
)
print("Transcription:", response.text)`,
      typescript: `import { createReadStream } from 'fs';
import Together from 'together-ai';

const together = new Together();
const transcription = await together.audio.transcriptions.create({
  file: createReadStream('audio.mp3'),
  model: 'openai/whisper-large-v3',
  language: 'en',
});
console.log('Transcription:', transcription.text);`,
      curl: `curl https://api.together.ai/v1/audio/transcriptions \\
  -H "Authorization: Bearer $TOGETHER_API_KEY" \\
  -F "model=openai/whisper-large-v3" \\
  -F "file=@audio.mp3" \\
  -F "language=en"`,
    },
  };
}

// ── 3. Streaming Documentation & WebSocket Protocol ─────────────────────────

export function getTranscriptionStreamingDocs() {
  return {
    success: true,
    title: 'Together AI Real-Time WebSocket Streaming Transcription',
    docs_url: 'https://docs.together.ai/docs/inference/transcription/streaming',
    websocket_url: 'wss://api.together.ai/v1/realtime',
    url_template: 'wss://api.together.ai/v1/realtime?model={model}&input_audio_format=pcm_s16le_16000',
    required_headers: {
      Authorization: 'Bearer $TOGETHER_API_KEY',
      'OpenAI-Beta': 'realtime=v1',
    },
    wire_audio_format: {
      format: 'pcm_s16le_16000',
      sample_rate_hz: 16000,
      channels: 1, // mono
      bit_depth: 16, // 16-bit PCM little endian
    },
    client_events: [
      {
        type: 'input_audio_buffer.append',
        description: 'Appends raw PCM audio chunk encoded as base64 string.',
        payload_example: {
          type: 'input_audio_buffer.append',
          audio: '<base64-encoded-audio-chunk>',
        },
      },
      {
        type: 'input_audio_buffer.commit',
        description: 'Forces transcription of any remaining audio in the server-side buffer.',
        payload_example: {
          type: 'input_audio_buffer.commit',
        },
      },
    ],
    server_events: [
      {
        type: 'conversation.item.input_audio_transcription.delta',
        description: 'Interim transcription result while speech is ongoing; overrides previous delta.',
        payload_example: {
          type: 'conversation.item.input_audio_transcription.delta',
          delta: 'The quick brown fox jumps',
        },
      },
      {
        type: 'conversation.item.input_audio_transcription.completed',
        description: 'Finalized, high-confidence transcript for one segmented utterance.',
        payload_example: {
          type: 'conversation.item.input_audio_transcription.completed',
          transcript: 'The quick brown fox jumps over the lazy dog',
        },
      },
    ],
    session_events: [
      { name: 'SessionStarted', description: 'Session established with session_id for server log correlation.' },
      { name: 'TranscriptDelta', description: 'Interim text chunk as words are actively spoken.' },
      { name: 'TranscriptCompleted', description: 'Finalized utterance text.' },
      { name: 'TranscriptFailed', description: 'Utterance failed on server; session continues.' },
      { name: 'Reconnecting', description: 'Transient network failure; SDK is retrying with backoff.' },
      { name: 'Reconnected', description: 'Connection restored; replayed_seconds reports replayed audio.' },
      { name: 'BufferGap', description: 'Outage exceeded retention window; dropped_seconds lost.' },
    ],
    failover_strategy: {
      error_class: 'RealtimeConnectionError',
      unhealthy_worker_code: 'no_healthy_workers', // WS 4503
      advice: 'Catch RealtimeConnectionError, call session.pending_audio() to retrieve untranscribed speech, and rotate to failover endpoint.',
    },
  };
}

// ── 4. Speech Translation Documentation ─────────────────────────────────────

export function getTranscriptionTranslationDocs() {
  return {
    success: true,
    title: 'Together AI Speech Translation (Audio to English Text)',
    docs_url: 'https://docs.together.ai/docs/inference/transcription/translation',
    endpoint: 'POST /v1/audio/translations',
    recommended_model: 'openai/whisper-large-v3',
    description: 'Converts speech in any language directly into translated English text.',
    limits: {
      max_duration_seconds: 14400, // 4 hours
      max_binary_upload_mb: 80,
      max_url_fetch_gb: 1,
    },
    code_snippets: {
      python: `from pathlib import Path
from together import Together

client = Together()

response = client.audio.translations.create(
    file=Path("spanish_audio.mp3"),
    model="openai/whisper-large-v3",
    prompt="This is a business meeting discussing quarterly sales results.",
)
print("English translation:", response.text)`,
      typescript: `import { createReadStream } from 'fs';
import Together from 'together-ai';

const together = new Together();
const translation = await together.audio.translations.create({
  file: createReadStream('french_audio.mp3'),
  model: 'openai/whisper-large-v3',
});
console.log('English translation:', translation.text);`,
      curl: `curl https://api.together.ai/v1/audio/translations \\
  -H "Authorization: Bearer $TOGETHER_API_KEY" \\
  -F "model=openai/whisper-large-v3" \\
  -F "file=@foreign_audio.mp3"`,
    },
  };
}

// ── 5. Voice Activity Detection (VAD) Documentation ─────────────────────────

export function getVoiceActivityDetectionDocs() {
  return {
    success: true,
    title: 'Together AI Real-Time Voice Activity Detection (VAD)',
    docs_url: 'https://docs.together.ai/docs/inference/transcription/voice-activity-detection',
    description: 'Server-side VAD model automatically segments streaming audio into utterances based on speech probability.',
    parameters: [
      {
        name: 'threshold',
        type: 'float',
        default: 0.3,
        range: '0.0 - 1.0',
        description: 'Speech probability threshold. Frames above this are classified as speech.',
      },
      {
        name: 'min_silence_duration_ms',
        type: 'integer',
        default: 500,
        description: 'How long silence must last in ms before a speech segment ends.',
      },
      {
        name: 'min_speech_duration_ms',
        type: 'integer',
        default: 250,
        description: 'Minimum segment length in ms. Shorter segments are filtered as noise.',
      },
      {
        name: 'max_speech_duration_s',
        type: 'float',
        default: 5.0,
        description: 'Maximum segment length in seconds. Longer segments are split at internal silence.',
      },
      {
        name: 'speech_pad_ms',
        type: 'integer',
        default: 250,
        description: 'Padding added to start/end of each segment to avoid clipping phonemes.',
      },
    ],
    presets: VAD_PRESETS,
    configuration_methods: [
      {
        method: 'query_parameters_at_connect',
        example: 'wss://api.together.ai/v1/realtime?model=openai/whisper-large-v3&input_audio_format=pcm_s16le_16000&threshold=0.01&min_silence_duration_ms=1000',
        disable_syntax: 'turn_detection=none',
      },
      {
        method: 'session_message_after_connect',
        example: {
          type: 'transcription_session.updated',
          session: {
            turn_detection: VAD_PRESETS.phone_call_low_quality,
          },
        },
        disable_syntax: {
          type: 'transcription_session.updated',
          session: { turn_detection: null },
        },
      },
    ],
  };
}

// ── 6. Advanced Features (Diarization, Timestamps, Formats) ──────────────────

export function getTranscriptionFeaturesDocs() {
  return {
    success: true,
    title: 'Together AI Transcription Advanced Features & Parameters',
    docs_url: 'https://docs.together.ai/docs/inference/transcription/features',
    features: [
      {
        name: 'speaker_diarization',
        parameter: 'diarize=true',
        optional_params: ['min_speakers', 'max_speakers'],
        supported_model: 'openai/whisper-large-v3',
        description: 'Identifies speakers (e.g. SPEAKER_01, SPEAKER_02) and timestamps each speaker turn.',
      },
      {
        name: 'word_level_timestamps',
        parameter: 'timestamp_granularities="word"',
        description: 'Returns start and end times for every single spoken word.',
      },
      {
        name: 'segment_level_timestamps',
        parameter: 'timestamp_granularities="segment"',
        description: 'Returns start and end times for each conversational sentence or clause.',
      },
      {
        name: 'response_formats',
        options: [
          { format: 'json', description: 'Simple object containing only text field (default).' },
          { format: 'verbose_json', description: 'Rich object containing text, language, duration, words[], and segments[].' },
        ],
      },
      {
        name: 'temperature_control',
        parameter: 'temperature',
        range: '0.0 (deterministic) - 1.0 (creative)',
        description: 'Temperature sampling for decoder. 0.0 is recommended for verbatim transcriptions.',
      },
    ],
    code_snippets: {
      diarization_python: `response = client.audio.transcriptions.create(
    file=Path("meeting.mp3"),
    model="openai/whisper-large-v3",
    response_format="verbose_json",
    diarize="true",
    min_speakers=1,
    max_speakers=5,
)
for segment in response.speaker_segments:
    print(f"[{segment.start:.2f}s - {segment.end:.2f}s] {segment.speaker_id}: {segment.text}")`,
      word_timestamps_python: `response = client.audio.transcriptions.create(
    file=Path("audio.mp3"),
    model="openai/whisper-large-v3",
    response_format="verbose_json",
    timestamp_granularities="word",
)
for word in response.words:
    print(f"'{word['word']}' [{word['start']:.2f}s - {word['end']:.2f}s]")`,
    },
  };
}

// ── 7. Helpers & Validation ──────────────────────────────────────────────────

/**
 * Validates audio transcription parameters against official constraints
 */
export function validateTranscriptionParams(params = {}) {
  const errors = [];
  const warnings = [];

  const {
    model = 'openai/whisper-large-v3',
    file,
    file_url,
    language,
    prompt,
    diarize,
    timestamp_granularities,
    response_format,
    temperature,
  } = params;

  // Validate model
  const knownModel = TRANSCRIPTION_MODELS_CATALOG.find(m => m.id === model);
  if (!knownModel) {
    warnings.push(`Model '${model}' is not in the official catalog. Ensure it is a valid Together AI endpoint.`);
  }

  // Model-specific prompt support warning
  if (prompt && knownModel && !knownModel.supports_prompts) {
    warnings.push(`Model '${model}' does not support custom prompts. The prompt field will be ignored by the server.`);
  }

  // Model-specific diarization support warning
  if (diarize && knownModel && !knownModel.supports_diarization) {
    errors.push(`Model '${model}' does not support speaker diarization. Only Whisper-family models support diarize=true.`);
  }

  // Model-specific timestamps support
  if (timestamp_granularities && knownModel && !knownModel.supports_timestamps) {
    warnings.push(`Model '${model}' does not emit word-level timestamps.`);
  }

  // Language code check
  if (language && language !== 'auto' && !/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
    warnings.push(`Language '${language}' may not be a standard ISO 639-1 code (e.g., 'en', 'es', 'fr').`);
  }

  // Temperature check
  if (temperature !== undefined && (temperature < 0.0 || temperature > 1.0)) {
    errors.push(`Temperature must be between 0.0 and 1.0 (received ${temperature}).`);
  }

  // Response format check
  if (response_format && !['json', 'verbose_json', 'text'].includes(response_format)) {
    warnings.push(`Unexpected response_format '${response_format}'. Use 'json' or 'verbose_json'.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    model,
    diarization_enabled: Boolean(diarize),
    timestamps_enabled: Boolean(timestamp_granularities),
  };
}

/**
 * Resolves VAD configuration from a preset name or custom parameters
 */
export function getVADConfiguration(presetOrCustom) {
  if (typeof presetOrCustom === 'string') {
    const preset = VAD_PRESETS[presetOrCustom];
    if (preset) return { ...preset, preset_name: presetOrCustom };
  }

  if (typeof presetOrCustom === 'object' && presetOrCustom !== null) {
    return {
      type: presetOrCustom.type || 'server_vad',
      threshold: presetOrCustom.threshold ?? 0.3,
      min_silence_duration_ms: presetOrCustom.min_silence_duration_ms ?? 500,
      min_speech_duration_ms: presetOrCustom.min_speech_duration_ms ?? 250,
      max_speech_duration_s: presetOrCustom.max_speech_duration_s ?? 5.0,
      speech_pad_ms: presetOrCustom.speech_pad_ms ?? 250,
    };
  }

  return { ...VAD_PRESETS.conversational, preset_name: 'conversational' };
}

/**
 * Builds WebSocket configuration for Real-time Streaming
 */
export function buildStreamingWebSocketConfig(params = {}) {
  const model = params.model || 'openai/whisper-large-v3';
  const vad = getVADConfiguration(params.vad || params.vad_preset);
  const inputAudioFormat = params.input_audio_format || TRANSCRIPTION_LIMITS.wire_format;

  const queryParams = new URLSearchParams({
    model,
    input_audio_format: inputAudioFormat,
  });

  if (vad.type === 'none') {
    queryParams.set('turn_detection', 'none');
  } else {
    queryParams.set('threshold', String(vad.threshold));
    queryParams.set('min_silence_duration_ms', String(vad.min_silence_duration_ms));
    queryParams.set('min_speech_duration_ms', String(vad.min_speech_duration_ms));
    queryParams.set('max_speech_duration_s', String(vad.max_speech_duration_s));
    queryParams.set('speech_pad_ms', String(vad.speech_pad_ms));
  }

  return {
    websocket_url: `wss://api.together.ai/v1/realtime?${queryParams.toString()}`,
    model,
    input_audio_format: inputAudioFormat,
    vad_config: vad,
    headers: {
      Authorization: 'Bearer $TOGETHER_API_KEY',
      'OpenAI-Beta': 'realtime=v1',
    },
  };
}

// ── 8. Execution Dispatchers (Transcription & Translation) ────────────────────

export async function executeAudioTranscription(params = {}) {
  const {
    model = 'openai/whisper-large-v3',
    file = null,
    file_url = null,
    language = 'en',
    prompt = null,
    response_format = 'json',
    diarize = false,
    min_speakers = null,
    max_speakers = null,
    timestamp_granularities = null,
    temperature = 0.0,
    dry_run = false,
  } = params;

  if (dry_run) {
    const isVerbose = response_format === 'verbose_json';
    const hasDiarization = Boolean(diarize);
    const mockText = 'Aphura Sovereign real-time transcription operational on Liberty Center One infrastructure.';

    const mockResponse = {
      text: mockText,
      dry_run: true,
      model,
    };

    if (isVerbose) {
      mockResponse.language = language || 'en';
      mockResponse.duration = 4.82;
      mockResponse.words = [
        { word: 'Aphura', start: 0.0, end: 0.65 },
        { word: 'Sovereign', start: 0.70, end: 1.35 },
        { word: 'real-time', start: 1.40, end: 1.95 },
        { word: 'transcription', start: 2.00, end: 2.85 },
        { word: 'operational', start: 2.90, end: 3.65 },
        { word: 'on', start: 3.70, end: 3.85 },
        { word: 'Liberty', start: 3.90, end: 4.30 },
        { word: 'Center', start: 4.35, end: 4.60 },
        { word: 'One', start: 4.65, end: 4.82 },
      ];
      mockResponse.segments = [
        {
          id: 0,
          start: 0.0,
          end: 4.82,
          text: mockText,
        },
      ];
    }

    if (hasDiarization) {
      mockResponse.speaker_segments = [
        {
          id: 1,
          speaker_id: 'SPEAKER_01',
          start: 0.0,
          end: 4.82,
          text: mockText,
          words: mockResponse.words || [],
        },
      ];
    }

    return {
      success: true,
      ...mockResponse,
    };
  }

  // Live dispatch via executeSharedInference
  return executeSharedInference({
    endpoint: 'audio/transcriptions',
    body: {
      model,
      file: file_url || file,
      language,
      prompt,
      response_format,
      diarize,
      min_speakers,
      max_speakers,
      timestamp_granularities,
      temperature,
    },
  });
}

export async function executeAudioTranslation(params = {}) {
  const {
    model = 'openai/whisper-large-v3',
    file = null,
    file_url = null,
    prompt = null,
    response_format = 'json',
    temperature = 0.0,
    dry_run = false,
  } = params;

  if (dry_run) {
    return {
      success: true,
      dry_run: true,
      model,
      text: 'Translated English text: The quarterly financial metrics indicate robust growth across cloud compute nodes.',
    };
  }

  return executeSharedInference({
    endpoint: 'audio/translations',
    body: {
      model,
      file: file_url || file,
      prompt,
      response_format,
      temperature,
    },
  });
}
