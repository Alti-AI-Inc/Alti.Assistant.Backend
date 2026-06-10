import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../../shared/logger.js';
// Integration fix: Import the UsageService to track API consumption against tenants
// and users, which is critical for enforcing limits and enabling proper billing.
import { UsageService } from '../usage/usage.service.js';

// Initialize auth helper with scopes
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Synthesizes speech from a text input using GCP Text-to-Speech.
 * Exposes access to ultra-premium Wavenet and Neural2 voices.
 * 
 * @param {object} userContext - The context of the user making the request, containing userId and tenantId.
 * @param {string} text - Text content to synthesize
 * @param {object} options - Voice configuration options
 * @returns {Promise<object>} Speech synthesis output containing base64 audio content
 */
const synthesizeSpeech = async (userContext, text, options = {}) => {
  // Integration fix: Validate user context to ensure all actions are associated
  // with a valid user and tenant, preventing unauthorized or untracked usage.
  if (!userContext || !userContext.userId || !userContext.tenantId) {
    // This is a critical security and integration check.
    throw new Error('Invalid user context provided. Action cannot be authorized or tracked.');
  }

  try {
    // Bug fix: Add input validation for text length and type to prevent API errors,
    // resource waste, and provide clearer error messages.
    // GCP Text-to-Speech API typically has a character limit (e.g., 5000 characters for synchronous requests).
    const MAX_TEXT_LENGTH = 5000; 
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Text input is required and cannot be empty.');
    }
    if (text.length > MAX_TEXT_LENGTH) {
      throw new Error(`Text input exceeds the maximum allowed length of ${MAX_TEXT_LENGTH} characters.`);
    }

    // Integration fix: Check usage limits before making the expensive API call.
    // This prevents tenants from exceeding their subscribed plan quotas.
    // The usage metric here is the number of characters for Text-to-Speech.
    await UsageService.checkLimit(userContext.tenantId, 'gcp_tts_characters', text.length);

    const languageCode = options.languageCode || 'en-US';
    const voiceName = options.voiceName || 'en-US-Neural2-F'; // Default to premium Neural2 female voice
    const ssmlGender = options.gender || 'FEMALE';
    const audioEncoding = options.audioEncoding || 'MP3';

    logger.info(`Speech API: Synthesizing text for tenant ${userContext.tenantId} using voice: ${voiceName}`);

    const client = await auth.getClient();
    
    const requestBody = {
      input: { text },
      voice: { languageCode, name: voiceName, ssmlGender },
      audioConfig: { audioEncoding }
    };

    const response = await client.request({
      url: 'https://texttospeech.googleapis.com/v1/text:synthesize',
      method: 'POST',
      data: requestBody
    });

    const audioContent = response.data?.audioContent;
    if (!audioContent) {
      throw new Error('GCP Text-to-Speech API did not return audioContent.');
    }

    // Integration fix: Record the successful usage against the tenant and user.
    // This is critical for billing, analytics, and ensuring limits are updated.
    // This is a fire-and-forget operation to avoid delaying the response to the user.
    UsageService.recordUsage(
      userContext.tenantId,
      userContext.userId,
      'gcp_tts_characters',
      text.length
    ).catch(err => logger.error(`Failed to record TTS usage for tenant ${userContext.tenantId}:`, err));

    return {
      success: true,
      audioContent, // Base64 encoded audio
      encoding: audioEncoding,
      voice: voiceName,
      textLength: text.length
    };
  } catch (err) {
    logger.error(`GCP Text-to-Speech Service Error for tenant ${userContext?.tenantId}:`, err);
    // Integration fix: Propagate specific limit-exceeded errors clearly so the controller
    // can return a proper HTTP status code (e.g., 429 or 402).
    if (err.name === 'LimitExceededError') {
        throw err;
    }
    throw new Error(`GCP Speech Synthesis failed: ${err.message}`);
  }
};

/**
 * Transcribes audio content to text using GCP Speech-to-Text.
 * 
 * @param {object} userContext - The context of the user making the request, containing userId and tenantId.
 * @param {Buffer} audioBuffer - Binary audio file buffer
 * @param {object} options - Speech-to-Text options (mimetype/encoding)
 * @returns {Promise<object>} Transcription results
 */
const transcribeSpeech = async (userContext, audioBuffer, options = {}) => {
  // Integration fix: Validate user context for authorization and tenancy.
  if (!userContext || !userContext.userId || !userContext.tenantId) {
    throw new Error('Invalid user context provided. Action cannot be authorized or tracked.');
  }

  try {
    // Bug fix: Add input validation for audioBuffer to ensure it's a valid non-empty buffer.
    if (!audioBuffer || !Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      throw new Error('Audio buffer is required and cannot be empty.');
    }
    
    // Integration fix: Enforce a maximum buffer size to prevent abuse and align with
    // synchronous API limits (e.g., ~60 seconds of audio, which is ~10MB for many formats).
    const MAX_AUDIO_BUFFER_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
    if (audioBuffer.length > MAX_AUDIO_BUFFER_SIZE_BYTES) {
      throw new Error(`Audio buffer exceeds the maximum allowed size of ${MAX_AUDIO_BUFFER_SIZE_BYTES / (1024 * 1024)} MB.`);
    }

    // Integration fix: Check usage limits before making the API call.
    // For transcription, we will track usage on a per-request basis.
    await UsageService.checkLimit(userContext.tenantId, 'gcp_stt_requests', 1);

    const languageCode = options.languageCode || 'en-US';
    const encoding = options.encoding || 'WEBM_OPUS'; 
    const sampleRateHertz = options.sampleRateHertz || 48000;

    logger.info(`Speech API: Transcribing audio for tenant ${userContext.tenantId} with encoding: ${encoding}, sampleRate: ${sampleRateHertz}`);

    const client = await auth.getClient();
    
    const base64Audio = audioBuffer.toString('base64');

    const requestBody = {
      config: {
        encoding,
        sampleRateHertz,
        languageCode,
        enableAutomaticPunctuation: true
      },
      audio: {
        content: base64Audio
      }
    };

    const response = await client.request({
      url: 'https://speech.googleapis.com/v1/speech:recognize',
      method: 'POST',
      data: requestBody
    });

    const results = response.data?.results || [];
    const transcript = results
      .map(result => result.alternatives?.[0]?.transcript || '')
      .join(' ')
      .trim();

    // Integration fix: Record the successful usage for the tenant and user.
    UsageService.recordUsage(
      userContext.tenantId,
      userContext.userId,
      'gcp_stt_requests',
      1
    ).catch(err => logger.error(`Failed to record STT usage for tenant ${userContext.tenantId}:`, err));

    return {
      success: true,
      transcript,
      confidence: results[0]?.alternatives?.[0]?.confidence || 0,
      raw: results
    };
  } catch (err) {
    logger.error(`GCP Speech-to-Text Service Error for tenant ${userContext?.tenantId}:`, err);
    // Integration fix: Propagate specific limit-exceeded errors clearly.
    if (err.name === 'LimitExceededError') {
        throw err;
    }
    throw new Error(`GCP Speech Transcription failed: ${err.message}`);
  }
};

export const GcpSpeechService = {
  synthesizeSpeech,
  transcribeSpeech
};