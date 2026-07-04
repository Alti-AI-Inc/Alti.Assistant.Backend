import { GoogleAuth } from 'google-auth-library';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * @file gcp-gemini-live.service.js
 * @module app/modules/gcp_native/gcp-gemini-live.service
 * @description Native Gemini Live API service for real-time multimodal bidirectional streaming.
 *   Supports audio/video/text streaming sessions with low-latency responses using the
 *   Gemini 2.0 Flash Experimental model via the Vertex AI Live API.
 *
 *   The Live API enables:
 *   - Real-time audio input and audio output (voice-to-voice)
 *   - Real-time video frame input (camera/screen share)
 *   - Text input and text/audio output
 *   - Persistent function calling during a session
 *   - Real-time interruption and barge-in support
 *
 *   Google Repository References (Apache 2.0):
 *   - https://github.com/google-gemini/gemini-api-cookbook (Live API demos)
 *   - https://github.com/googleapis/python-genai
 *
 * @see https://ai.google.dev/gemini-api/docs/live
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/live-api
 */

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

// ── Supported Live API models ───────────────────────────────────────────────
const LIVE_API_MODELS = {
  FLASH_LIVE: 'models/gemini-2.0-flash-live-001',
  FLASH_EXP: 'models/gemini-2.0-flash-exp',
  GEMINI_2_5_PRO: 'models/gemini-2.5-pro'
};

// ── Voice options for TTS output ────────────────────────────────────────────
const VOICE_OPTIONS = {
  AOEDE: 'Aoede',    // Bright, expressive female
  CHARON: 'Charon',  // Calm, authoritative male
  FENRIR: 'Fenrir',  // Strong, assertive male
  KORE: 'Kore',      // Warm, conversational female
  PUCK: 'Puck'       // Energetic, friendly neutral
};

/**
 * @typedef {object} LiveSessionConfig
 * @property {string} [model='models/gemini-2.0-flash-live-001'] - Gemini model to use for the live session.
 * @property {string} [voice='Aoede'] - Voice for audio output (Aoede, Charon, Fenrir, Kore, Puck).
 * @property {string} [systemInstruction] - System-level instruction that persists for the entire session.
 * @property {string} [responseModality='TEXT'] - Output modality: 'TEXT', 'AUDIO', or 'TEXT_AND_AUDIO'.
 * @property {string} [languageCode='en-US'] - Language code for speech recognition.
 * @property {Array<object>} [tools=[]] - Array of function declarations for the model to call.
 * @property {number} [speechActivityThreshold=0.5] - Threshold for voice activity detection (0.0-1.0).
 * @property {boolean} [enableSpeakerDiarization=false] - If true, separates multiple speakers.
 */

/**
 * Constructs a LiveGenerateContentSetup payload for the Gemini Live API WebSocket handshake.
 * This is the initial message sent immediately after establishing a WebSocket connection.
 *
 * @param {LiveSessionConfig} [config={}] - Configuration for the live session.
 * @returns {object} A JSON-serializable setup payload ready to be sent over WebSocket.
 */
const buildLiveSessionSetup = (sessionConfig = {}) => {
  const {
    model = LIVE_API_MODELS.FLASH_LIVE,
    voice = VOICE_OPTIONS.AOEDE,
    systemInstruction = 'You are Inso AI, a helpful AI assistant. Respond naturally, concisely, and in a conversational tone.',
    responseModality = 'AUDIO',
    languageCode = 'en-US',
    tools = [],
    speechActivityThreshold = 0.5
  } = sessionConfig;

  logger.info(`GCP GeminiLive: Building live session setup — model: ${model}, voice: ${voice}, modality: ${responseModality}`);

  const setup = {
    model,
    generationConfig: {
      responseModalities: responseModality === 'TEXT' ? ['TEXT']
        : responseModality === 'AUDIO' ? ['AUDIO']
        : ['TEXT', 'AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice }
        },
        languageCode
      }
    }
  };

  if (systemInstruction) {
    setup.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  if (tools && tools.length > 0) {
    setup.tools = tools.map(tool => ({
      functionDeclarations: Array.isArray(tool.functionDeclarations)
        ? tool.functionDeclarations
        : [tool]
    }));
  }

  // Voice Activity Detection (VAD) configuration
  setup.reinsoaimeInputConfig = {
    automaticActivityDetection: {
      disabled: false,
      startOfSpeechSensitivity: speechActivityThreshold > 0.7 ? 'START_SENSITIVITY_HIGH' : 'START_SENSITIVITY_LOW',
      endOfSpeechSensitivity: speechActivityThreshold > 0.7 ? 'END_SENSITIVITY_HIGH' : 'END_SENSITIVITY_LOW'
    }
  };

  return { setup };
};

/**
 * Constructs a real-time audio input message for an active Live API session.
 * Audio must be 16-bit PCM at 16kHz, mono channel, base64 encoded.
 *
 * @param {Buffer|string} audioData - Raw PCM audio buffer or base64-encoded audio string.
 * @param {string} [mimeType='audio/pcm;rate=16000'] - MIME type of the audio data.
 * @returns {object} A JSON-serializable reinsoaime input message.
 */
const buildAudioInputMessage = (audioData, mimeType = 'audio/pcm;rate=16000') => {
  const base64Audio = Buffer.isBuffer(audioData)
    ? audioData.toString('base64')
    : audioData;

  return {
    reinsoaimeInput: {
      audio: {
        mimeType,
        data: base64Audio
      }
    }
  };
};

/**
 * Constructs a real-time video frame input message for an active Live API session.
 * Supports JPEG and PNG frames from camera or screen capture.
 *
 * @param {Buffer|string} frameData - Image buffer or base64-encoded frame data.
 * @param {string} [mimeType='image/jpeg'] - MIME type of the image frame.
 * @returns {object} A JSON-serializable reinsoaime input message.
 */
const buildVideoFrameMessage = (frameData, mimeType = 'image/jpeg') => {
  const base64Frame = Buffer.isBuffer(frameData)
    ? frameData.toString('base64')
    : frameData;

  return {
    reinsoaimeInput: {
      video: {
        mimeType,
        data: base64Frame
      }
    }
  };
};

/**
 * Constructs a text input message for an active Live API session.
 * Can be used for text-to-text or text-to-audio conversational turns.
 *
 * @param {string} text - The user's text input.
 * @param {boolean} [endOfTurn=true] - Whether this marks the end of a user turn (triggers model response).
 * @returns {object} A JSON-serializable client content message.
 */
const buildTextInputMessage = (text, endOfTurn = true) => {
  return {
    clientContent: {
      turns: [{
        role: 'user',
        parts: [{ text }]
      }],
      turnComplete: endOfTurn
    }
  };
};

/**
 * Constructs a tool response message for returning function call results back to the model.
 * Used when the Live API model issues a function call and you've executed the function.
 *
 * @param {string} functionCallId - The ID of the function call issued by the model.
 * @param {string} functionName - The name of the function that was called.
 * @param {object} response - The response object to return to the model.
 * @returns {object} A JSON-serializable tool response message.
 */
const buildToolResponseMessage = (functionCallId, functionName, response) => {
  return {
    toolResponse: {
      functionResponses: [{
        id: functionCallId,
        name: functionName,
        response: { output: response }
      }]
    }
  };
};

/**
 * Generates the Vertex AI Live API WebSocket URL for connecting to a real-time session.
 * This URL requires a bearer token in the Authorization header.
 *
 * @returns {Promise<object>} Connection info including the WebSocket URL and access token.
 */
const getLiveApiConnectionInfo = async () => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';

  if (!projectId) throw new Error('GCP Project ID is not configured.');

  logger.info('GCP GeminiLive: Generating Live API connection credentials...');
  const client = await auth.getClient();
  const accessToken = (await client.getAccessToken()).token;

  // Vertex AI Live API WebSocket endpoint
  const wsUrl = `wss://${location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiStreamingService/BidiGenerateContent`;

  // Google AI Studio (for non-Vertex) — alternative endpoint
  const studioWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`;

  logger.info('GCP GeminiLive: Connection info generated successfully.');

  return {
    success: true,
    vertexAiWebSocketUrl: wsUrl,
    googleAiStudioWebSocketUrl: studioWsUrl,
    // Return token for frontend to establish WS connection
    // NOTE: tokens expire in ~1h; do not cache longer than that
    accessToken,
    projectId,
    location,
    expiresAt: new Date(Date.now() + 55 * 60 * 1000).toISOString(), // 55-min buffer
    models: LIVE_API_MODELS,
    voices: VOICE_OPTIONS,
    instructions: {
      connect: 'Establish a WebSocket connection to vertexAiWebSocketUrl with Authorization: Bearer {accessToken}',
      setup: 'Send the setup payload (from buildLiveSessionSetup) as the first message after connection.',
      audio: 'Send PCM 16kHz 16-bit mono audio chunks as reinsoaimeInput.audio messages.',
      video: 'Send JPEG frames as reinsoaimeInput.video messages at up to 1fps.',
      text: 'Send clientContent messages with turnComplete: true to trigger responses.'
    }
  };
};

/**
 * Runs a simple text-based Live API exchange via the standard REST generateContent endpoint.
 * This is the synchronous (non-WebSocket) fallback for text-only conversations.
 * Use WebSocket mode for true real-time multimodal sessions.
 *
 * @param {string} text - User input text.
 * @param {LiveSessionConfig} [sessionConfig={}] - Model and voice configuration.
 * @returns {Promise<object>} The model's text response.
 */
const generateTextResponse = async (text, sessionConfig = {}) => {
  const projectId = config.google?.gcp_project_id || process.env.GCP_PROJECT_ID;
  const location = config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1';

  if (!projectId) throw new Error('GCP Project ID is not configured.');
  if (!text) throw new Error('Input text is required.');

  const model = sessionConfig.model || LIVE_API_MODELS.FLASH_LIVE;
  const systemInstruction = sessionConfig.systemInstruction
    || 'You are Inso AI, a helpful AI assistant. Respond naturally and concisely.';

  logger.info(`GCP GeminiLive: Generating text response using model: ${model}`);
  const client = await auth.getClient();

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/${model}:generateContent`;

  const body = {
    contents: [{ role: 'user', parts: [{ text }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024
    }
  };

  const response = await client.request({ url, method: 'POST', data: body });

  const candidate = response.data?.candidates?.[0];
  const textOutput = candidate?.content?.parts?.[0]?.text || '';
  const finishReason = candidate?.finishReason || 'STOP';

  logger.info(`GCP GeminiLive: Text response generated — ${textOutput.length} chars, finish: ${finishReason}`);

  return {
    success: true,
    model,
    input: text,
    output: textOutput,
    finishReason,
    usageMetadata: response.data?.usageMetadata || null
  };
};

/**
 * Parses and decodes a Live API audio output chunk from a WebSocket message.
 * Audio output arrives as base64-encoded PCM data in serverContent.modelTurn.parts.
 *
 * @param {object} wsMessage - Parsed WebSocket message object from the Gemini Live API.
 * @returns {object} Decoded audio buffer and metadata, or null if no audio in message.
 */
const parseLiveAudioOutput = (wsMessage) => {
  if (!wsMessage || typeof wsMessage !== 'object') {
    return { hasAudio: false, audioBuffer: null, text: null };
  }

  const parts = wsMessage?.serverContent?.modelTurn?.parts || [];
  let audioBuffer = null;
  let text = null;
  let functionCalls = [];

  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith('audio/')) {
      audioBuffer = Buffer.from(part.inlineData.data, 'base64');
    } else if (part.text) {
      text = part.text;
    } else if (part.functionCall) {
      functionCalls.push(part.functionCall);
    }
  }

  const turnComplete = wsMessage?.serverContent?.turnComplete || false;
  const interrupted = wsMessage?.serverContent?.interrupted || false;

  return {
    hasAudio: audioBuffer !== null,
    hasText: text !== null,
    hasFunctionCalls: functionCalls.length > 0,
    audioBuffer,
    audioMimeType: 'audio/pcm;rate=24000', // Gemini Live outputs 24kHz PCM
    text,
    functionCalls,
    turnComplete,
    interrupted
  };
};

/**
 * Validates a Live API WebSocket message structure for proper routing.
 *
 * @param {object} wsMessage - The parsed message object.
 * @returns {object} Message type classification and validation result.
 */
const classifyLiveMessage = (wsMessage) => {
  if (!wsMessage || typeof wsMessage !== 'object') {
    return { type: 'UNKNOWN', valid: false };
  }

  if (wsMessage.setupComplete) {
    return { type: 'SETUP_COMPLETE', valid: true };
  }
  if (wsMessage.serverContent) {
    if (wsMessage.serverContent.modelTurn) {
      return { type: 'MODEL_TURN', valid: true };
    }
    if (wsMessage.serverContent.turnComplete) {
      return { type: 'TURN_COMPLETE', valid: true };
    }
    if (wsMessage.serverContent.interrupted) {
      return { type: 'INTERRUPTED', valid: true };
    }
  }
  if (wsMessage.toolCall) {
    return { type: 'TOOL_CALL', valid: true };
  }
  if (wsMessage.toolCallCancellation) {
    return { type: 'TOOL_CALL_CANCELLATION', valid: true };
  }
  if (wsMessage.error) {
    return { type: 'ERROR', valid: false, error: wsMessage.error };
  }

  return { type: 'UNKNOWN', valid: false };
};

/**
 * @namespace GcpGeminiLiveService
 * @description Native service for the Gemini Live API — real-time multimodal bidirectional
 * streaming with audio, video, and text. Provides WebSocket connection management, message
 * builders, and audio/frame parsing utilities for integration with frontend WebSocket proxies.
 */
export const GcpGeminiLiveService = {
  // Configuration builders
  buildLiveSessionSetup,
  buildAudioInputMessage,
  buildVideoFrameMessage,
  buildTextInputMessage,
  buildToolResponseMessage,

  // Connection management
  getLiveApiConnectionInfo,

  // REST fallback (text-only)
  generateTextResponse,

  // Response parsing
  parseLiveAudioOutput,
  classifyLiveMessage,

  // Constants
  LIVE_API_MODELS,
  VOICE_OPTIONS
};
