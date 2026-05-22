import { GoogleGenAI } from '@google/genai';

export const searchWithGemini = async (query) => {
  const ai = new GoogleGenAI({});

  const groundingTool = {
    googleSearch: {},
  };

  const config = {
    tools: [groundingTool],
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: query,
    config,
  });

  console.log(response.text);
};
