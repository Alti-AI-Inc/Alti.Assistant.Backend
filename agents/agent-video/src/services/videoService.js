import { GoogleGenAI } from '@google/genai';
import config from '../../../../shared/config/index.js';
import { createLogger } from '../../../../shared/logging/index.js';

const { logger } = createLogger('videoService');

class VideoService {
  constructor() {
    this.ai = new GoogleGenAI({ 
      vertexai: { project: config.gcp.projectId, location: config.gcp.vertexAiRegion } 
    });
    this.scriptModel = 'gemini-1.5-pro';
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

  async createStoryboard(prompt) {
    logger.info('Creating storyboard');
    try {
      const result = await this.ai.models.generateContent({
        model: this.scriptModel,
        contents: `Create a 3-shot storyboard for a short video based on this prompt: "${prompt}". Output JSON with an array "shots", each containing "description", "cameraAngle", and "duration".`,
        config: { responseMimeType: 'application/json' }
      });
      const data = JSON.parse(result.candidates[0].content.parts[0].text);
      return data.shots || [];
    } catch (err) {
      logger.warn('Failed to create storyboard', err);
      return [];
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

  async analyzeIntent(prompt, conversationHistory = []) {
    logger.info('Analyzing intent for video details and confirmation');
    try {
      const historyText = conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      const systemInstruction = `You are a helpful assistant analyzing user requests to generate a video.
The user's latest prompt: "${prompt}"
Conversation history:
${historyText}

Determine the current state of the request:
1. "gather": If the user has NOT provided enough specific details (subject action, cinematic style, lighting, camera movement).
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
      logger.error('Failed to analyze video intent', err);
      return 'generate'; // Fallback
    }
  }

  async gatherDetails(prompt, conversationHistory = []) {
    logger.info('Formulating video detail-gathering questions');
    try {
      const historyText = conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      const systemInstruction = `You are an expert AI video director. 
The user wants a video but hasn't provided enough details.
Current prompt: "${prompt}"
History:
${historyText}

Formulate ONE brief, conversational response asking for specific missing details (e.g., lighting, camera angle, action, style). Be friendly and concise.`;

      const result = await this.ai.models.generateContent({
        model: this.scriptModel,
        contents: systemInstruction,
        config: { temperature: 0.7 }
      });
      
      return result.candidates[0].content.parts[0].text;
    } catch (err) {
      logger.error('Failed to gather video details', err);
      return "Could you provide a bit more detail about the setting, camera movement, or lighting you want for this video?";
    }
  }

  async confirmDetails(prompt, conversationHistory = []) {
    logger.info('Formulating video confirmation summary');
    try {
      const historyText = conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      const systemInstruction = `You are an expert AI video director.
The user has provided enough details to generate the video, but we need final confirmation.
Current prompt: "${prompt}"
History:
${historyText}

Your task:
1. Combine all gathered details into a highly descriptive 'enhancedPrompt'.
2. Write a brief 'reply' summarizing the video you are about to create, and ask "Shall I go ahead and generate this?"

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
      logger.error('Failed to confirm video details', err);
      return { 
        reply: "Great, I have all the details. Shall I go ahead and generate this video?",
        enhancedPrompt: prompt 
      };
    }
  }
}

export default new VideoService();
