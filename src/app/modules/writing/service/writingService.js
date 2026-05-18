import { llm } from '../llm.js'; // Using OpenAI for prompt engineering
import { anthropic } from '../llm.js';

/**
 * A generic function to interact with the Claude model for various coding tasks.
 * @param {string} systemPrompt - The system prompt to guide the model's behavior.
 * @param {Array<{role: 'user' | 'assistant', content: string}>} history - The conversation history.
 * @returns {Promise<string>} - The model's response.
 */
async function runClaudeTask(systemPrompt, message, stream = false) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-latest',
      system: systemPrompt,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: message,
        },
      ],
      stream: stream, // Enable or disable streaming based on the parameter
    });

    if (stream) {
      console.log('Streaming response from Anthropic API...', stream);

      return response; // Return the stream object directly
    }

    return response.content[0].text;
  } catch (error) {
    console.error('Error calling Anthropic API:', error);
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
