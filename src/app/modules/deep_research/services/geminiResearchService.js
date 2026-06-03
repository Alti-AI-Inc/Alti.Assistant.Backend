import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../../config/index.js';

const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-3.5-flash',
  apiKey: config.gemini_secret_key || process.env.GEMINI_API_KEY,
  temperature: 0,
  maxRetries: 2,
});

export const runSimpleGeminiResearchTask = async (state, stream = false) => {
  try {
    console.log('Running Gemini deep research task with search results:', state.searchResults);

    const query = `
    Think you are an expert research assistant.
    Your task is to synthesize the provided search results into a comprehensive, well-written answer for the user's query.
    Write only the summary of the search results in a concise manner.
    Add references to the original search results where necessary.
    Make sure to include all relevant information.
    Do not include any additional information or commentary.
    Make the answer clear and easy to understand.
    Make the answer concise and to the point.
    Check the search results and query below for context:
    Search query: ${state.query}
    :\n\n${state.searchResults}\n\n`;
    const messages = [
      {
        role: 'system',
        content: `You are an expert research assistant. Your task is to synthesize the provided search results into a comprehensive, well-written answer for the user's query.
- Do not add any additional information or commentary.
- Write only the summary of the search results in a concise manner.
- Do not say "I am an AI language model" or similar phrases.
- Do not mention you are synthesizing search results.
- Do not mention you are actually summarizing search results.
- Just do summarization. Do not mention you are checking the sources. At the end of your answer, provide a "Sources" section listing the URLs corresponding to your citations.
- I want only the answer from the search results.
- Do not just list the search results. Weave them together into a coherent narrative.
- At the end of your answer, provide a "Sources" section listing the URLs corresponding to your citations`,
      },
      {
        role: 'user',
        content: `state.searchResults: ${state.searchResults}\n\nQuery: ${state.query}`,
      },
    ];
    const response = await llm.invoke(messages);
    return response.content;
  } catch (error) {
    console.error('Error calling Gemini deep research API:', error);
    return 'Sorry, I encountered an error while processing your request with the coding model. Please try again.';
  }
};

export const runGeminiResearchTask = async (systemPrompt, messages, stream = false) => {
  try {
    // Convert messages to proper LangChain message format
    const formattedMessages = [
      new SystemMessage(systemPrompt),
      ...messages.map((msg) => {
        if (msg.role === 'user' || msg.role === 'human') {
          return new HumanMessage(msg.content);
        } else if (msg.role === 'assistant' || msg.role === 'ai') {
          return new SystemMessage(msg.content); // or AIMessage if available
        } else {
          return new HumanMessage(msg.content); // fallback
        }
      }),
    ];

    if (stream) {
      const response = await llm.stream(formattedMessages);
      console.log('Streaming response from Gemini deep research API...', response);
      return response; // Return the stream object directly
    } else {
      const response = await llm.invoke(formattedMessages);
      return response.content;
    }
  } catch (error) {
    console.error('Error calling Gemini deep research API:', error);
    return 'Sorry, I encountered an error while processing your request with the coding model. Please try again.';
  }
};
