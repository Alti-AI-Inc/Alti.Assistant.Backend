import httpStatus from 'http-status';
import Together from 'together-ai';
import config from '../../../../config/index.js';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { paymentController } from '../payment/payment.controller.js';

const together = new Together({ apiKey: config.together_secret_key });

const TogetherAiImgGeneration = catchAsync(async (req, res) => {
  //   const responseData = await TogetherAiService.TogetherAiImgGenerationService(
  //     req.body,
  //   );

  const { user, sessionId, prompt } = req.body;
  if (!prompt) throw new Error('Prompt is required for image generation.');
  const responseData = await together.images.create({
    model: 'black-forest-labs/FLUX.1-dev-lora',
    width: 1024,
    height: 1024,
    steps: 28,
    prompt: prompt,
    n: 1,
    image_url: 'https://github.com/nutlope.png',
    response_format: 'url',
    // image_loras:[
    //     {"path": "https://replicate.com/fofr/flux-black-light", "scale": 0.8},
    //     {"path": "https://huggingface.co/XLabs-AI/flux-RealismLora", "scale": 0.8},
    // ],
    image_loras: [
      { path: 'https://huggingface.co/multimodalart/flux-tarot-v1', scale: 1 },
      {
        path: 'https://huggingface.co/Shakker-Labs/FLUX.1-dev-LoRA-add-details',
        scale: 0.8,
      },
    ],
  });

  // *✅ Increment images usage only if AI generates a response*
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
