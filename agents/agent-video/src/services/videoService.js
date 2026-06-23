import { GoogleGenAI } from '@google/genai';
import config from '../../../../shared/config/index.js';
import { createLogger } from '../../../../shared/logging/index.js';

const { logger } = createLogger('videoService');

class VideoService {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    this.scriptModel = 'gemini-3.5-flash';
  }

  async enhancePrompt(prompt) {
    logger.info('Enhancing video prompt');
    try {
      const result = await this.ai.models.generateContent({
        model: this.scriptModel,
        contents: `Enhance this video prompt with cinematic details, camera movements, and lighting. Keep it concise but highly descriptive: ${prompt}`
      });
      return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || prompt;
    } catch (err) {
      logger.warn('Failed to enhance prompt, using original');
      return prompt;
    }
  }

  selectModel(tier) {
    // Default to veo-2.0
    return {
      modelName: 'veo-2.0-generate-001',
      config: {
        numberOfVideos: 1,
        durationSeconds: 8,
        aspectRatio: '16:9',
        personGeneration: 'dont_allow'
      }
    };
  }

  async generateVideo(prompt, userContext, options = {}) {
    logger.info(`Starting async video generation for prompt: ${prompt.substring(0, 50)}...`);
    try {
      const enhancedPrompt = await this.enhancePrompt(prompt);
      const { modelName, config: modelConfig } = this.selectModel('standard');

      const operation = await this.ai.models.generateVideos({
        model: modelName,
        prompt: enhancedPrompt,
        config: modelConfig
      });

      // Poll for completion
      logger.info(`Polling for operation ${operation.name}`);
      let result = operation;
      while (!result.done) {
        await new Promise(r => setTimeout(r, 5000));
        result = await this.ai.operations.get({ operation: result });
      }

      if (result.response?.generatedVideos?.length > 0) {
        const video = result.response.generatedVideos[0];
        return { 
          videoUrl: video.video?.uri || 'generated_video_placeholder_uri', 
          prompt, 
          enhancedPrompt,
          duration: modelConfig.durationSeconds, 
          metadata: { operationName: operation.name } 
        };
      } else {
        throw new Error('No video generated in response');
      }
    } catch (err) {
      logger.error('Error generating video:', err);
      throw err;
    }
  }

  async checkStatus(operationName) {
    logger.info(`Checking status for ${operationName}`);
    try {
      const result = await this.ai.operations.get({ operation: { name: operationName } });
      let videoUrl = null;
      if (result.done && result.response?.generatedVideos?.length > 0) {
        videoUrl = result.response.generatedVideos[0].video?.uri;
      }
      return { status: result.done ? 'completed' : 'processing', videoUrl };
    } catch (err) {
      logger.error('Error checking status', err);
      throw err;
    }
  }
}

export default new VideoService();
