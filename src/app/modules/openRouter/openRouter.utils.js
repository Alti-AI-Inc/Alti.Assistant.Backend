import fetch from 'node-fetch';
import OpenAI from 'openai';

export const getSupportedModelNames = async (req, res) => {
  const response = await fetch('https://openrouter.ai/api/v1/models');
  const json = await response.json();
  const modelIds = json.data.map(m => m.id);
  return modelIds;
};
export const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});