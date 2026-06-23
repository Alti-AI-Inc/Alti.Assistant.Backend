import { GoogleGenAI } from '@google/genai';
import config from '../../../../shared/config/index.js';
import { createLogger } from '../../../../shared/logging/index.js';
// Assuming shared storage module exists as per instructions
// import { uploadBuffer, getSignedUrl } from '../../../../shared/storage/index.js';

const { logger } = createLogger('imageService');

class ImageService {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    this.model = 'gemini-3.1-flash'; // Migrated to Gemini 3.1 Flash Image
    this.conversationalModel = 'gemini-3.5-flash';
  }

  async generateImage(prompt, userContext, options = {}) {
    logger.info(`Generating image for prompt: ${prompt.substring(0, 50)}...`);
    try {
      const result = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          temperature: 1.0,
          maxOutputTokens: 8192,
        }
      });

      let imageBuffer = null;
      let accompanimentText = '';

      for (const part of result.candidates[0].content.parts) {
        if (part.inlineData) {
          imageBuffer = Buffer.from(part.inlineData.data, 'base64');
        }
        if (part.text) {
          accompanimentText += part.text;
        }
      }

      if (!imageBuffer) {
        throw new Error('No image was returned by the model.');
      }

      // Placeholder for GCS upload
      // const imageUrl = await uploadBuffer(imageBuffer, `images/${Date.now()}.png`, 'image/png');
      const imageUrl = `https://storage.googleapis.com/placeholder-bucket/images/generated_${Date.now()}.png`;

      return { 
        imageUrl, 
        prompt, 
        text: accompanimentText,
        metadata: {
          model: this.model,
          timestamp: new Date().toISOString()
        } 
      };
    } catch (error) {
      logger.error('Error generating image:', error);
      throw error;
    }
  }

  async editImage(imageBase64, editPrompt, userContext) {
    logger.info('Editing existing image');
    // Placeholder implementation as native genai sdk image editing support varies
    return { imageUrl: 'edited_url_placeholder', editPrompt, metadata: {} };
  }

  async enhancePrompt(prompt) {
    logger.info('Enhancing prompt using Flash model');
    try {
      const result = await this.ai.models.generateContent({
        model: this.conversationalModel,
        contents: `Enhance this image prompt to be highly descriptive, specifying style, lighting, composition, and mood. Ensure it produces a high quality image. Original prompt: ${prompt}`,
      });
      return result.candidates?.[0]?.content?.parts?.[0]?.text || prompt;
    } catch (err) {
      logger.warn('Failed to enhance prompt, falling back to original', err);
      return prompt;
    }
  }

  async analyzeIntent(prompt, conversationHistory = []) {
    logger.info('Analyzing intent for details and confirmation');
    try {
      const historyText = conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      const systemInstruction = `You are a helpful assistant analyzing user requests to generate an image.
The user's latest prompt: "${prompt}"
Conversation history:
${historyText}

Determine the current state of the request:
1. "gather": If the user has NOT provided enough specific details (subject, action, environment, lighting, style).
2. "confirm": If the user HAS provided enough details, BUT has not explicitly confirmed to generate it yet (e.g. hasn't said "yes", "generate it", "looks good").
3. "generate": If the user HAS provided enough details AND has explicitly confirmed to generate it.

Respond ONLY with JSON in this format:
{
  "state": "gather" | "confirm" | "generate"
}`;

      const result = await this.ai.models.generateContent({
        model: this.conversationalModel,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });
      
      const parsed = JSON.parse(result.candidates[0].content.parts[0].text);
      return parsed.state || 'gather';
    } catch (err) {
      logger.error('Failed to analyze intent', err);
      return 'generate'; // Fallback
    }
  }

  async gatherDetails(prompt, conversationHistory = []) {
    logger.info('Formulating detail-gathering questions');
    try {
      const historyText = conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      const systemInstruction = `You are an expert AI image prompt engineer. 
The user wants an image but hasn't provided enough details.
Current prompt: "${prompt}"
History:
${historyText}

Formulate ONE brief, conversational response asking for specific missing details (e.g., lighting, style, setting, action). Be friendly and concise.`;

      const result = await this.ai.models.generateContent({
        model: this.conversationalModel,
        contents: systemInstruction,
        config: { temperature: 0.7 }
      });
      
      return result.candidates[0].content.parts[0].text;
    } catch (err) {
      logger.error('Failed to gather details', err);
      return "Could you provide a bit more detail about the setting, style, or lighting you want for this image?";
    }
  }

  async confirmDetails(prompt, conversationHistory = []) {
    logger.info('Formulating confirmation summary');
    try {
      const historyText = conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      const systemInstruction = `You are an expert AI image prompt engineer.
The user has provided enough details to generate the image, but we need final confirmation.
Current prompt: "${prompt}"
History:
${historyText}

Your task:
1. Combine all gathered details into a highly descriptive 'enhancedPrompt'.
2. Write a brief 'reply' summarizing the image you are about to create, and ask "Shall I go ahead and generate this?"

Respond ONLY with JSON in this format:
{
  "reply": "Summary and confirmation question...",
  "enhancedPrompt": "The highly descriptive final prompt"
}`;

      const result = await this.ai.models.generateContent({
        model: this.conversationalModel,
        contents: systemInstruction,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });
      
      const parsed = JSON.parse(result.candidates[0].content.parts[0].text);
      return parsed;
    } catch (err) {
      logger.error('Failed to confirm details', err);
      return { 
        reply: "Great, I have all the details. Shall I go ahead and generate this?",
        enhancedPrompt: prompt 
      };
    }
  }
}

export default new ImageService();
