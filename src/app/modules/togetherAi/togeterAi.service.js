import Together from 'together-ai';

const together = new Together();

const TogetherAiImgGenerationService = async (data) => {
  const { user, sessionId, prompt } = data;
  if (!prompt) throw new Error('Prompt is required for image generation.');
  const response = await together.images.create({
    model: 'black-forest-labs/FLUX.1-depth',
    width: 1024,
    height: 1024,
    steps: 28,
    prompt: prompt,
    // @ts-ignore
    image_url: 'https://github.com/nutlope.png',
  });
  return response;
};

export const TogetherAiService = {
  TogetherAiImgGenerationService,
};
