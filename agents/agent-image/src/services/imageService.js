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
}

export default new ImageService();
