import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { geminiClient, llm } from './llm.js';

export const getUrlFromUserInputUsingAi = async (userInput) => {
  const prompt = PromptTemplate.fromTemplate(
    `You are an AI assistant helping a user find a URL to summarize.
    The user has provided the following input:
    "{user_input}"

    Your task is to extract the most relevant URL from this input. And check if it is a YouTube URL.
    If the input contains a valid URL, return it in the format:
    {{"url": "https://example.com", "isYoutubeUrl": true/false}}
    If the input does not contain a valid URL, only return:
    {{"url": null, "isYoutubeUrl": false}}
    If the input is a YouTube URL, set "isYoutubeUrl" to true.
    `
  );
  const chain = prompt.pipe(geminiClient);
  const result = await chain.invoke({ user_input: userInput });
  return result.content;
};
