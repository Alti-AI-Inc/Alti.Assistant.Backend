import { ChatOpenAI } from '@langchain/openai';
import config from '../../../../config/index.js';

export const llm = new ChatOpenAI({
  apiKey: config.openai_secret_key,
  model: 'gpt-4o',
  temperature: 0.7,
});
