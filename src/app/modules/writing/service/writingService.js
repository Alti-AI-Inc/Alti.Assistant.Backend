import { GoogleGenerativeAI } from '@google/generative-ai';
import { llm } from '../llm.js';
import config from '../../../../../config/index.js';

/**
 * A generic function to interact with the Gemini model mapped as Claude for writing tasks.
 * @param {string} systemPrompt - The system prompt to guide the model's behavior.
 * @param {string|Array} message - The conversation history or query message.
 * @param {boolean} stream - Whether to stream the response.
 * @returns {Promise<any>} - The model's response or stream generator.
 */
async function runClaudeTask(systemPrompt, message, stream = false) {
  try {
    const apiKey = config.gemini_secret_key || process.env.GEMINI_API_KEY;
    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: 'gemini-3.5-flash',
      systemInstruction: systemPrompt
    });

    const contents = [];
    if (typeof message === 'string') {
      contents.push({ role: 'user', parts: [{ text: message }] });
    } else if (Array.isArray(message)) {
      for (const msg of message) {
        let role = msg.role;
        if (role === 'assistant') {
          role = 'model';
        } else if (role !== 'user' && role !== 'model') {
          role = 'user';
        }
        const text = typeof msg.content === 'string' ? msg.content : (msg.content?.[0]?.text || '');
        if (!text) continue;

        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts.push({ text });
        } else {
          contents.push({ role, parts: [{ text }] });
        }
      }
    }

    if (contents.length > 0 && contents[0].role === 'model') {
      contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    if (stream) {
      console.log('Streaming response from Gemini API inside writing service...', stream);
      const resultStream = await model.generateContentStream({ contents });
      
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            yield {
              type: 'content_block_delta',
              delta: {
                type: 'text_delta',
                text: chunkText
              }
            };
          }
        }
      };
      return mockStream;
    }

    const result = await model.generateContent({ contents });
    return result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (error) {
    console.error('Error calling Gemini API in writing service:', error);
    return 'Sorry, I encountered an error while processing your request with the coding model. Please try again.';
  }
}
/**
 * Analyzes the user's initial topic and generates clarifying questions.
 */
export const generateWritingQuestions = async (topic) => {
  const prompt = `A user wants to write something about: "${topic}".
    To help them, generate 3-5 insightful, open-ended questions to understand their needs better.
    Consider asking about: target audience, desired format (e.g., essay, blog post, social media update), key points to include, and desired tone (e.g., formal, casual, persuasive).
    Return ONLY a JSON object with a single key "questions" which is an array of strings.`;

  const parser = new (
    await import('@langchain/core/output_parsers')
  ).JsonOutputParser();
  const chain = llm.pipe(parser);
  const result = await chain.invoke(prompt);
  return result.questions || [];
};

/**
 * Updates the writing brief with new details from the user.
 */
export const updateWritingBrief = async (
  currentBrief,
  userResponse,
  history
) => {
  const historyString = history
    .map((h) => `${h.role}: ${h.content}`)
    .join('\n');
  const prompt = `You are an AI assistant helping a user build a detailed brief for a writing task.
    The current brief is:
    ---
    ${currentBrief}
    ---
    The user has just provided new information: "${userResponse}".
    Integrate this new information into the brief, creating a more detailed and cohesive set of instructions for a writer.
    
    Full Conversation History (for context):
    ${historyString}

    Return ONLY the new, updated brief.`;
  const result = await llm.invoke(prompt);
  return result.content;
};

/**
 * Generates the final written content using Claude.
 */
export const generateFinalContent = (brief, history, stream) => {
  const systemPrompt = `You are an expert writer. Your task is to write a high-quality piece of content based on the user's detailed brief.
    Adhere strictly to all instructions in the brief regarding format, tone, audience, and key points.
    
    The final, detailed brief is:
    ---
    ${brief}
    ---
    
    Now, write the final piece.`;

  // We can reuse the general Claude assistant function for this task.
  return runClaudeTask(systemPrompt, history, stream);
};
