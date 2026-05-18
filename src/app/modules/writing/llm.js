import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PredictionServiceClient } from '@google-cloud/aiplatform';
import Anthropic from '@anthropic-ai/sdk';
import config from '../../../../config/index.js';
import { PromptTemplate } from '@langchain/core/prompts';

export const llm = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  model: 'gemini-2.5-flash',
  temperature: 0.7,
});

export const anthropic = new Anthropic({
  apiKey: config.anthropicApiKey,
  baseURL: 'https://api.anthropic.com',
  timeout: 60000, // 60 seconds
});

export const isUserFinished = async (userResponse) => {
  if (!userResponse) return false;
  const prompt = PromptTemplate.fromTemplate(
    `Analyze the user's response to determine if they are finished providing details for the image.
        The user has been answering clarifying questions.
        If the user's message indicates they are done, satisfied, or want to proceed, respond with "YES".
        Examples of finished responses: "that's it", "I'm done", "go ahead and create it", "yes, that's all".
        If the user is providing more details or answering a question, respond with "NO".

        User response: "{response}"
        
        Your answer (must be YES or NO):`
  );
  const chain = prompt.pipe(llm);
  const result = await chain.invoke({ response: userResponse });
  return result.content.toUpperCase().includes('YES');
};
