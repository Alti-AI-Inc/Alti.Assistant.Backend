import { GoogleGenAI } from '@google/genai';
import config from '../../../../shared/config/index.js';
import { createLogger } from '../../../../shared/logging/index.js';

const { logger } = createLogger('audioService');

class AudioService {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    this.ttsModel = 'gemini-2.5-flash-preview-tts';
    this.scriptModel = 'gemini-3.5-flash';
    this.voices = {
      professional: 'Kore',
      warm: 'Aoede',
      energetic: 'Puck',
      calm: 'Charon',
      authoritative: 'Fenrir'
    };
  }

  async classifyAudioIntent(prompt) {
    logger.info('Classifying audio intent');
    const result = await this.ai.models.generateContent({
      model: this.scriptModel,
      contents: `Classify this audio request into one of these types: podcast, voiceover, commercial, narration. Request: ${prompt}. Only output the type string in lowercase.`,
    });
    const type = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase() || 'voiceover';
    return { audioType: type };
  }

  async generateScript(prompt, audioType, options = {}) {
    logger.info(`Generating script for type: ${audioType}`);
    const result = await this.ai.models.generateContent({
      model: this.scriptModel,
      contents: `Write a complete script for a ${audioType} based on this request: "${prompt}". Provide only the spoken text, without speaker labels or stage directions, so it can be directly fed into a text-to-speech engine.`,
    });
    const script = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || prompt;
    return { script, metadata: { generated: true } };
  }

  async synthesizeSpeech(text, voiceConfig = {}) {
    logger.info(`Synthesizing speech with voice: ${voiceConfig.voiceName || 'Kore'}`);
    try {
      const result = await this.ai.models.generateContent({
        model: this.ttsModel,
        contents: text,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceConfig.voiceName || 'Kore'
              }
            }
          }
        }
      });

      const audioPart = result.candidates[0].content.parts[0];
      if (!audioPart || !audioPart.inlineData) {
        throw new Error('No audio returned from model.');
      }
      
      const audioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
      return { audioBuffer, duration: 0, metadata: { model: this.ttsModel } };
    } catch (err) {
      logger.error('Error in TTS generation:', err);
      throw err;
    }
  }
}

export default new AudioService();
