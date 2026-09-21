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
};

export default GroqService;
