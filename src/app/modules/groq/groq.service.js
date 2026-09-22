import fs from 'fs';
import {
  groqChat,
  groqStream,
  groqComplete,
  groqToolCall,
  groqLightChat,
  groqLightStream,
  groqLightToolCall,
  getGroqClient,
} from '../../services/groq.client.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

export const GroqService = {
  /**
   * Heavy chat completion using gpt-oss-120b (reasoning, code, complex tasks)
   */
  async chat(messages, options = {}) {
    const model = options.model || config.groq?.model || 'gpt-oss-120b';
    return await groqChat(messages, { ...options, model });
  },

  /**
   * Light chat completion using gpt-oss-20b (classification, evaluation, simple Q&A)
   */
  async lightChat(messages, options = {}) {
    const model = options.model || config.groq?.lightModel || 'gpt-oss-20b';
    return await groqLightChat(messages, { ...options, model });
  },

  /**
   * Heavy streaming using gpt-oss-120b
   */
  async stream(messages, options = {}) {
    const model = options.model || config.groq?.model || 'gpt-oss-120b';
    return await groqStream(messages, { ...options, model });
  },

  /**
   * Light streaming using gpt-oss-20b
   */
  async lightStream(messages, options = {}) {
    const model = options.model || config.groq?.lightModel || 'gpt-oss-20b';
    return await groqLightStream(messages, { ...options, model });
  },

  /**
   * Heavy tool/function calling with gpt-oss-120b
   */
  async toolCall(messages, tools, options = {}) {
    const model = options.model || config.groq?.model || 'gpt-oss-120b';
    return await groqToolCall(messages, tools, { ...options, model });
  },

  /**
   * Light tool/function calling with gpt-oss-20b
   */
  async lightToolCall(messages, tools, options = {}) {
    const model = options.model || config.groq?.lightModel || 'gpt-oss-20b';
    return await groqLightToolCall(messages, tools, { ...options, model });
  },

  /**
   * Speech-to-Text audio transcription using whisper-large-v3-turbo
   */
  async transcribeAudio(fileStreamOrPath, options = {}) {
    const client = getGroqClient();
    const model = options.model || config.groq?.sttModel || 'whisper-large-v3-turbo';

    const file =
      typeof fileStreamOrPath === 'string'
        ? fs.createReadStream(fileStreamOrPath)
        : fileStreamOrPath;

    try {
      const transcription = await client.audio.transcriptions.create({
        file,
        model,
        prompt: options.prompt,
        response_format: options.response_format || 'json',
        language: options.language,
        temperature: options.temperature || 0.0,
      });
      return transcription;
    } catch (err) {
      logger.error('[Groq STT] Transcription failed:', err.message);
      throw err;
    }
  },

  /**
   * Speech-to-Text audio translation to English using whisper-large-v3-turbo
   */
  async translateAudio(fileStreamOrPath, options = {}) {
    const client = getGroqClient();
    const model = options.model || config.groq?.sttModel || 'whisper-large-v3-turbo';

    const file =
      typeof fileStreamOrPath === 'string'
        ? fs.createReadStream(fileStreamOrPath)
        : fileStreamOrPath;

    try {
      const translation = await client.audio.translations.create({
        file,
        model,
        prompt: options.prompt,
        response_format: options.response_format || 'json',
        temperature: options.temperature || 0.0,
      });
      return translation;
    } catch (err) {
      logger.error('[Groq STT] Translation failed:', err.message);
      throw err;
    }
  },

  /**
   * List available Groq models
   */
  async listModels() {
    try {
      const client = getGroqClient();
      const res = await client.models.list();
      return res.data;
    } catch (err) {
      // Fallback model catalog if offline
      return [
        {
          id: 'gpt-oss-120b',
          object: 'model',
          owned_by: 'groq',
          active: true,
          context_window: 131072,
          speed_tok_s: 500,
          tier: 'heavy',
          description: 'Primary text generation, agent reasoning, code generation, and complex tasks',
        },
        {
          id: 'gpt-oss-20b',
          object: 'model',
          owned_by: 'groq',
          active: true,
          context_window: 131072,
          speed_tok_s: 1200,
          tier: 'light',
          description: 'Fast classification, evaluation, prompt analysis, simple Q&A, and smart routing',
        },
        {
          id: 'whisper-large-v3-turbo',
          object: 'model',
          owned_by: 'groq',
          active: true,
          context_window: 448,
          tier: 'stt',
          description: 'High-speed Whisper V3 Turbo speech-to-text transcription and translation',
        },
      ];
    }
  },

  /**
   * Get a single model by ID
   */
  async getModel(modelId) {
    const client = getGroqClient();
    const res = await client.models.retrieve(modelId);
    return res;
  },

  // ── Audio Speech (TTS) — Orpheus ───────────────────────────────────────────

  /**
   * Text-to-Speech using Groq Orpheus TTS
   * @param {string} input - Text to convert to speech
   * @param {Object} options - voice, model, response_format, speed
   * @returns {ReadableStream} Audio stream
   */
  async textToSpeech(input, options = {}) {
    const client = getGroqClient();
    try {
      const response = await client.audio.speech.create({
        model: options.model || 'playai-tts',
        input,
        voice: options.voice || 'Fritz-PlayAI',
        response_format: options.response_format || 'wav',
        speed: options.speed || 1.0,
      });
      return response;
    } catch (err) {
      logger.error('[Groq TTS] Speech generation failed:', err.message);
      throw err;
    }
  },

  // ── Embeddings ─────────────────────────────────────────────────────────────

  /**
   * Generate embeddings for text input
   * @param {string|Array<string>} input - Text(s) to embed
   * @param {Object} options - model, encoding_format
   * @returns {Object} Embedding response
   */
  async createEmbedding(input, options = {}) {
    const client = getGroqClient();
    try {
      const response = await client.embeddings.create({
        model: options.model || 'llama3-embedding-large',
        input,
        encoding_format: options.encoding_format,
      });
      return response;
    } catch (err) {
      logger.error('[Groq Embeddings] Failed:', err.message);
      throw err;
    }
  },

  // ── Batches ────────────────────────────────────────────────────────────────

  /**
   * Create an async batch job
   */
  async createBatch(payload) {
    const client = getGroqClient();
    const response = await client.batches.create(payload);
    return response;
  },

  /**
   * List all batch jobs
   */
  async listBatches() {
    const client = getGroqClient();
    const response = await client.batches.list();
    return response;
  },

  /**
   * Get a batch job by ID
   */
  async getBatch(batchId) {
    const client = getGroqClient();
    const response = await client.batches.retrieve(batchId);
    return response;
  },

  /**
   * Cancel a batch job
   */
  async cancelBatch(batchId) {
    const client = getGroqClient();
    const response = await client.batches.cancel(batchId);
    return response;
  },

  // ── Files ──────────────────────────────────────────────────────────────────

  /**
   * Upload a file for batch processing
   */
  async uploadFile(file, purpose = 'batch') {
    const client = getGroqClient();
    const fileStream =
      typeof file === 'string' ? fs.createReadStream(file) : file;
    const response = await client.files.create({
      file: fileStream,
      purpose,
    });
    return response;
  },

  /**
   * List all uploaded files
   */
  async listFiles() {
    const client = getGroqClient();
    const response = await client.files.list();
    return response;
  },

  /**
   * Get file metadata by ID
   */
  async getFile(fileId) {
    const client = getGroqClient();
    const response = await client.files.retrieve(fileId);
    return response;
  },

  /**
   * Delete a file
   */
  async deleteFile(fileId) {
    const client = getGroqClient();
    const response = await client.files.del(fileId);
    return response;
  },

  /**
   * Get file content
   */
  async getFileContent(fileId) {
    const client = getGroqClient();
    const response = await client.files.content(fileId);
    return response;
  },
};

export default GroqService;
