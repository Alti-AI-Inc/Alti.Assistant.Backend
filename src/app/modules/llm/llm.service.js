import fs from 'fs';
import {
  llmChat,
  llmStream,
  llmComplete,
  llmToolCall,
  llmLightChat,
  llmLightStream,
  llmLightToolCall,
  getLlmClient,
} from '../../services/llm.client.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

export const LlmService = {
  /**
   * Heavy chat completion using gpt-oss-120b (reasoning, code, complex tasks)
   */
  async chat(messages, options = {}) {
    const model = options.model || config.llm?.model || 'gpt-oss-120b';
    return await llmChat(messages, { ...options, model });
  },

  /**
   * Light chat completion using gpt-oss-20b (classification, evaluation, simple Q&A)
   */
  async lightChat(messages, options = {}) {
    const model = options.model || config.llm?.lightModel || 'gpt-oss-20b';
    return await llmLightChat(messages, { ...options, model });
  },

  /**
   * Heavy streaming using gpt-oss-120b
   */
  async stream(messages, options = {}) {
    const model = options.model || config.llm?.model || 'gpt-oss-120b';
    return await llmStream(messages, { ...options, model });
  },

  /**
   * Light streaming using gpt-oss-20b
   */
  async lightStream(messages, options = {}) {
    const model = options.model || config.llm?.lightModel || 'gpt-oss-20b';
    return await llmLightStream(messages, { ...options, model });
  },

  /**
   * Heavy tool/function calling with gpt-oss-120b
   */
  async toolCall(messages, tools, options = {}) {
    const model = options.model || config.llm?.model || 'gpt-oss-120b';
    return await llmToolCall(messages, tools, { ...options, model });
  },

  /**
   * Light tool/function calling with gpt-oss-20b
   */
  async lightToolCall(messages, tools, options = {}) {
    const model = options.model || config.llm?.lightModel || 'gpt-oss-20b';
    return await llmLightToolCall(messages, tools, { ...options, model });
  },

  /**
   * Speech-to-Text audio transcription using whisper-large-v3-turbo
   */
  async transcribeAudio(fileStreamOrPath, options = {}) {
    const client = getLlmClient();
    const model = options.model || config.llm?.sttModel || 'whisper-large-v3-turbo';

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
      logger.error('[Llm STT] Transcription failed:', err.message);
      throw err;
    }
  },

  /**
   * Speech-to-Text audio translation to English using whisper-large-v3-turbo
   */
  async translateAudio(fileStreamOrPath, options = {}) {
    const client = getLlmClient();
    const model = options.model || config.llm?.sttModel || 'whisper-large-v3-turbo';

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
      logger.error('[Llm STT] Translation failed:', err.message);
      throw err;
    }
  },

  /**
   * List available Llm models
   */
  async listModels() {
    try {
      const client = getLlmClient();
      const res = await client.models.list();
      return res.data;
    } catch (err) {
      // Fallback model catalog if offline
      return [
        {
          id: 'gpt-oss-120b',
          object: 'model',
          owned_by: 'llm',
          active: true,
          context_window: 131072,
          speed_tok_s: 500,
          tier: 'heavy',
          description: 'Primary text generation, agent reasoning, code generation, and complex tasks',
        },
        {
          id: 'gpt-oss-20b',
          object: 'model',
          owned_by: 'llm',
          active: true,
          context_window: 131072,
          speed_tok_s: 1200,
          tier: 'light',
          description: 'Fast classification, evaluation, prompt analysis, simple Q&A, and smart routing',
        },
        {
          id: 'whisper-large-v3-turbo',
          object: 'model',
          owned_by: 'llm',
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
    const client = getLlmClient();
    const res = await client.models.retrieve(modelId);
    return res;
  },

  // ── Audio Speech (TTS) — Orpheus ───────────────────────────────────────────

  /**
   * Text-to-Speech using Llm Orpheus TTS
   * @param {string} input - Text to convert to speech
   * @param {Object} options - voice, model, response_format, speed
   * @returns {ReadableStream} Audio stream
   */
  async textToSpeech(input, options = {}) {
    const client = getLlmClient();
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
      logger.error('[Llm TTS] Speech generation failed:', err.message);
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
    const client = getLlmClient();
    try {
      const response = await client.embeddings.create({
        model: options.model || 'llama3-embedding-large',
        input,
        encoding_format: options.encoding_format,
      });
      return response;
    } catch (err) {
      logger.error('[Llm Embeddings] Failed:', err.message);
      throw err;
    }
  },

  // ── Batches ────────────────────────────────────────────────────────────────

  /**
   * Create an async batch job
   */
  async createBatch(payload) {
    const client = getLlmClient();
    const response = await client.batches.create(payload);
    return response;
  },

  /**
   * List all batch jobs
   */
  async listBatches() {
    const client = getLlmClient();
    const response = await client.batches.list();
    return response;
  },

  /**
   * Get a batch job by ID
   */
  async getBatch(batchId) {
    const client = getLlmClient();
    const response = await client.batches.retrieve(batchId);
    return response;
  },

  /**
   * Cancel a batch job
   */
  async cancelBatch(batchId) {
    const client = getLlmClient();
    const response = await client.batches.cancel(batchId);
    return response;
  },

  // ── Files ──────────────────────────────────────────────────────────────────

  /**
   * Upload a file for batch processing
   */
  async uploadFile(file, purpose = 'batch') {
    const client = getLlmClient();
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
    const client = getLlmClient();
    const response = await client.files.list();
    return response;
  },

  /**
   * Get file metadata by ID
   */
  async getFile(fileId) {
    const client = getLlmClient();
    const response = await client.files.retrieve(fileId);
    return response;
  },

  /**
   * Delete a file
   */
  async deleteFile(fileId) {
    const client = getLlmClient();
    const response = await client.files.del(fileId);
    return response;
  },

  /**
   * Get file content
   */
  async getFileContent(fileId) {
    const client = getLlmClient();
    const response = await client.files.content(fileId);
    return response;
  },
};

export default LlmService;
