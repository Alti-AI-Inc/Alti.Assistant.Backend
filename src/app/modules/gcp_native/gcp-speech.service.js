import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../../shared/logger.js';

// Initialize auth helper with scopes
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

/**
 * Synthesizes speech from a text input using GCP Text-to-Speech.
 * Exposes access to ultra-premium Wavenet and Neural2 voices.
 * 
 * @param {string} text - Text content to synthesize
 * @param {object} options - Voice configuration options
 * @returns {Promise<object>} Speech synthesis output containing base64 audio content
 */
const synthesizeSpeech = async (text, options = {}) => {
  try {
    const languageCode = options.languageCode || 'en-US';
    const voiceName = options.voiceName || 'en-US-Neural2-F'; // Default to premium Neural2 female voice
    const ssmlGender = options.gender || 'FEMALE';
    const audioEncoding = options.audioEncoding || 'MP3';

    logger.info(`Speech API: Synthesizing text to speech using voice: ${voiceName}`);

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

    return {
      success: true,
      audioContent, // Base64 encoded audio
      encoding: audioEncoding,
      voice: voiceName,
      textLength: text.length
    };
  } catch (err) {
    logger.error('GCP Text-to-Speech Service Error:', err);
    throw new Error(`GCP Speech Synthesis failed: ${err.message}`);
  }
};

/**
 * Transcribes audio content to text using GCP Speech-to-Text.
 * 
 * @param {Buffer} audioBuffer - Binary audio file buffer
 * @param {object} options - Speech-to-Text options (mimetype/encoding)
 * @returns {Promise<object>} Transcription results
 */
const transcribeSpeech = async (audioBuffer, options = {}) => {
  try {
    const languageCode = options.languageCode || 'en-US';
    // Match common audio formats
    const encoding = options.encoding || 'WEBM_OPUS'; 
    const sampleRateHertz = options.sampleRateHertz || 48000;

    logger.info(`Speech API: Transcribing audio with encoding: ${encoding}, sampleRate: ${sampleRateHertz}`);

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

    return {
      success: true,
      transcript,
      confidence: results[0]?.alternatives?.[0]?.confidence || 0,
      raw: results
    };
  } catch (err) {
    logger.error('GCP Speech-to-Text Service Error:', err);
    throw new Error(`GCP Speech Transcription failed: ${err.message}`);
  }
};

export const GcpSpeechService = {
  synthesizeSpeech,
  transcribeSpeech
};
