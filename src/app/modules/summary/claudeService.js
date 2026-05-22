import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import config from '../../../../config/index.js';
import { anthropic } from './llm.js';
import { GoogleGenAI } from '@google/genai';

/**
 * A generic function to interact with the Claude model for various coding tasks.
 * @param {string} systemPrompt - The system prompt to guide the model's behavior.
 * @param {Array<{role: 'user' | 'assistant', content: string}>} history - The conversation history.
 * @returns {Promise<string>} - The model's response.
 */
async function runClaudeTask(content, history) {
  const messages = history
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

  try {
    const response = await anthropic.messages.create({
      model: 'claude-4.5-sonnet-latest',
      system: content,
      max_tokens: 4096,
      messages: messages,
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Error calling Anthropic API:', error);
    return 'Sorry, I encountered an error while processing your request with the coding model. Please try again.';
  }
}

const ai = new GoogleGenAI({ apiKey: config.gemini_secret_key });

async function runGeminiTask(content, history) {
  const contents = [
    ...history.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    })),
    {
      role: 'user',
      parts: [{ text: content }],
    },
  ];
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: contents,
      config: {
        maxOutputTokens: 4096,
        temperature: 0.7,
        topP: 0.95,
      },
    });

    return response.text;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return 'Sorry, I encountered an error while processing your request with the coding model. Please try again.';
  }
}

export const claudeSummarizer = async (history, content) => {
  const systemPrompt = `You are an expert summarization assistant. Your task is to provide a clear, concise, and accurate summary of the provided content.
- Identify the key points, main arguments, and important conclusions.
- The summary should be neutral and objective.
- Structure the summary in well-organized paragraphs.
    `;
  return runGeminiTask(content, history);
};
