import config from '../../../../../config/index.js';

export const createImageController = (
  sessionManager,
  imageService,
  promptService
) => {
  return {
    editImage: async (req, res) => {
      try {
        const { prompt, imageBase64 } = req.body;

        if (!prompt) {
          return res.status(400).json({
            success: false,
            error: 'prompt is required',
          });
        }

        if (!imageBase64) {
          return res.status(400).json({
            success: false,
            error: 'imageBase64 is required',
          });
        }

        // Import imagen3 service
        const { editImageWithImagen3 } = await import(
          '../utils/imagen3.service.js'
        );
        const apiKey = config.gemini_secret_key;

        const timestamp = Date.now();
        const filename = `image-edit-${timestamp}.png`;

        // Edit image using Imagen3
        const imageResult = await editImageWithImagen3(
          prompt,
          imageBase64,
          filename,
          apiKey
        );

        res.json({
          success: true,
          image: imageResult,
          prompt,
        });
      } catch (error) {
        console.error('Error editing image:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },

    generateImage: async (req, res) => {
      try {
        const { sessionId, prompt: customPrompt } = req.body;

        if (!sessionId) {
          return res.status(400).json({
            success: false,
            error: 'sessionId is required',
          });
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found',
          });
        }

        // Use custom prompt or build enhanced prompt
        let finalPrompt = customPrompt;
        if (!finalPrompt) {
          const conversationHistory =
            sessionManager.getConversationHistory(sessionId);
          finalPrompt =
            await promptService.buildEnhancedPrompt(conversationHistory);
        }

        const timestamp = Date.now();
        const filename = `image-${sessionId}-${timestamp}.png`;

        // Generate image
        const imageResult = await imageService.generateImage(
          finalPrompt,
          filename
        );

        // Clean up session
        sessionManager.deleteSession(sessionId);

        res.json({
          success: true,
          image: imageResult,
          prompt: finalPrompt,
        });
      } catch (error) {
        console.error('Error generating image:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },

    generateImageDirect: async (req, res) => {
      try {
        const { prompt } = req.body;

        if (!prompt) {
          return res.status(400).json({
            success: false,
            error: 'prompt is required',
          });
        }

        const timestamp = Date.now();
        const filename = `image-direct-${timestamp}.png`;

        // Generate image
        const imageResult = await imageService.generateImage(prompt, filename);

        res.json({
          success: true,
          image: imageResult,
          prompt,
        });
      } catch (error) {
        console.error('Error generating image:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    },
  };
};
