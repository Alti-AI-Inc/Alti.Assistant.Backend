import { GoogleGenAI } from '@google/genai';
import config from '../../../../config/index.js';

const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });

const TogetherAiImgGenerationService = async (data) => {
  const { user, sessionId, prompt } = data;
  if (!prompt) throw new Error('Prompt is required for image generation.');
  
  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt: prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: '1:1',
    },
  });

  // Return in compatible format
  const generatedImage = response.generatedImages?.[0];
  if (!generatedImage?.image?.imageBytes) {
    throw new Error('Imagen 4 returned no image data.');
  }

  return {
    data: [{
      url: `data:image/png;base64,${Buffer.from(generatedImage.image.imageBytes).toString('base64')}`,
    }],
  };
};

export const TogetherAiService = {
  TogetherAiImgGenerationService,
};
