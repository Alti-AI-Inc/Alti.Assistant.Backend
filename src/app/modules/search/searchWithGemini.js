import { GoogleGenAI } from '@google/genai';

export const searchWithGemini = async (query) => {
  // Retrieve API key from config with Google API key fallback.
  const apiKey =
    config.gemini_secret_key ||
    config.google_api_key ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY or GOOGLE_API_KEY environment variable is not set.'
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const groundingTool = {
    googleSearch: {},
  };

  const config = {
    tools: [groundingTool],
  };

  try {
    // Wrap the asynchronous call in a try-catch block to gracefully handle API errors,
    // network issues, or other exceptions, preventing the Node.js process from crashing.
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: query,
      config,
    });

    // Return the response text so the calling function can utilize it.
    return response.text;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    // Re-throw a more generic error to avoid exposing internal API details,
    // or handle specific error types as needed by the calling context.
    throw new Error('Failed to get response from Gemini API.');
  }
};
