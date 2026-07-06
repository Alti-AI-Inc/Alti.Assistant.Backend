import { GoogleGenAI } from '@google/genai';
import config from '../../../../shared/config/index.js';
import { createLogger } from '../../../../shared/logging/index.js';

const { logger } = createLogger('audioService');

class AudioService {
  constructor() {
    this.ai = new GoogleGenAI({ 
      vertexai: { project: config.gcp.projectId, location: config.gcp.vertexAiRegion } 
    });
    this.ttsModel = 'gemini-3.1-pro';
    this.scriptModel = 'gemini-3.1-pro';
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
      contents: `Classify this audio request into one of these types: podcast, voiceover, commercial, narration, music. Request: ${prompt}. Only output the type string in lowercase.`,
    });
    const type = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase() || 'voiceover';
    return { audioType: type };
  }

  async enhancePrompt(prompt) {
    logger.info('Enhancing prompt using Flash model');
    try {
      const result = await this.ai.models.generateContent({
        model: this.scriptModel,
        contents: `Enhance this audio prompt to be highly descriptive. If it's speech, specify tone, pacing, and emotion. If it's music, specify genre, tempo, instruments, and mood. Original prompt: ${prompt}`,
      });
      return result.candidates?.[0]?.content?.parts?.[0]?.text || prompt;
    } catch (err) {
      logger.warn('Failed to enhance prompt, falling back to original', err);
      return prompt;
    }
  }

  async generateMusic(prompt) {
    logger.info('Generating music');
    // Placeholder for MusicFX / external music generation API
    // Since native sdk doesn't support MusicFX yet, we mock a response
    const mockAudioBuffer = Buffer.from('mock-music-data');
    return { audioBuffer: mockAudioBuffer, duration: 30, metadata: { type: 'music', prompt } };
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

  async analyzeIntent(prompt, conversationHistory = []) {
    logger.info('Analyzing intent for audio details and confirmation');
    try {
      const historyText = conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      const systemInstruction = `You are a helpful assistant analyzing user requests to generate an audio segment (podcast, commercial, narration, voiceover).
The user's latest prompt: "${prompt}"
Conversation history:
${historyText}

Determine the current state of the request:
1. "gather": If the user has NOT provided enough specific details (voice type, pacing, background context, tone, duration).
2. "confirm": If the user HAS provided enough details, BUT has not explicitly confirmed to generate it yet (e.g. hasn't said "yes", "generate it", "looks good").
3. "generate": If the user HAS provided enough details AND has explicitly confirmed to generate it.

Respond ONLY with JSON in this format:
{
  "state": "gather" | "confirm" | "generate"
}`;

      const result = await this.ai.models.generateContent({
        model: this.scriptModel,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });
      
      const parsed = JSON.parse(result.candidates[0].content.parts[0].text);
      return parsed.state || 'gather';
    } catch (err) {
      logger.error('Failed to analyze audio intent', err);
      return 'generate'; // Fallback
    }
  }

  async gatherDetails(prompt, conversationHistory = []) {
    logger.info('Formulating audio detail-gathering questions');
    try {
      const historyText = conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      const systemInstruction = `You are an expert AI audio scriptwriter and producer. 
The user wants an audio track but hasn't provided enough details.
Current prompt: "${prompt}"
History:
${historyText}

Formulate ONE brief, conversational response asking for specific missing details (e.g., voice style, tone, pacing, what kind of audio). Be friendly and concise.`;

      const result = await this.ai.models.generateContent({
        model: this.scriptModel,
        contents: systemInstruction,
        config: { temperature: 0.7 }
      });
      
      return result.candidates[0].content.parts[0].text;
    } catch (err) {
      logger.error('Failed to gather audio details', err);
      return "Could you provide a bit more detail about the tone, style, or specific content you'd like for this audio?";
    }
  }

  async confirmDetails(prompt, conversationHistory = []) {
    logger.info('Formulating audio confirmation summary');
    try {
      const historyText = conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      const systemInstruction = `You are an expert AI audio scriptwriter and producer.
The user has provided enough details to generate the audio, but we need final confirmation.
Current prompt: "${prompt}"
History:
${historyText}

Your task:
1. Combine all gathered details into a highly descriptive 'enhancedPrompt'.
2. Write a brief 'reply' summarizing the audio you are about to create, and ask "Shall I go ahead and generate this?"

Respond ONLY with JSON in this format:
{
  "reply": "Summary and confirmation question...",
  "enhancedPrompt": "The highly descriptive final prompt"
}`;

      const result = await this.ai.models.generateContent({
        model: this.scriptModel,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });
      
      const parsed = JSON.parse(result.candidates[0].content.parts[0].text);
      return parsed;
    } catch (err) {
      logger.error('Failed to confirm audio details', err);
      return { 
        reply: "Great, I have all the details. Shall I go ahead and generate this audio?",
        enhancedPrompt: prompt 
      };
    }
  }
}

export default new AudioService();
