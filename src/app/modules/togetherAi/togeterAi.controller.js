import httpStatus from 'http-status';
import { GoogleGenAI } from '@google/genai';
import config from '../../../../config/index.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { paymentController } from '../payment/payment.controller.js';

const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });

const TogetherAiImgGeneration = catchAsync(async (req, res) => {
  const { user, sessionId, prompt } = req.body;
  if (!prompt) throw new Error('Prompt is required for image generation.');

  const response = await ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt: prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: '1:1',
    },
  });

  const generatedImage = response.generatedImages?.[0];
  if (!generatedImage?.image?.imageBytes) {
    throw new Error('Imagen 4 returned no image data.');
  }

  const responseData = {
    data: [{
      url: `data:image/png;base64,${Buffer.from(generatedImage.image.imageBytes).toString('base64')}`,
    }],
  };

  // Increment images usage
  try {
    const paymentResult = await paymentController.incrementImagesUsed(user);
    if (!paymentResult.success) {
      return res
        .status(400)
        .json({ success: false, message: paymentResult.message });
    }
  } catch (error) {
    console.error('Error in incrementImagesUsed:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'An error occurred while updating image usage.',
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get Response successfully',
    data: responseData,
  });
});

export const TogetherAiController = {
  TogetherAiImgGeneration,
};
