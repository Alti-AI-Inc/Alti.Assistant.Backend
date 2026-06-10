/**
 * Core System Agents
 */

/**
 * @constant {object} generalChatAssistant - Configuration object for the Alti Core Assistant.
 *   This agent is designed to handle general conversational queries, providing clear and direct answers
 *   based on its defined system instructions. It serves as a foundational conversational AI.
 * @property {string} id - A unique identifier for the general chat assistant.
 * @property {string} name - The display name of the assistant.
 * @property {string} description - A brief description of the assistant's primary function.
 * @property {string} systemInstruction - Detailed instructions guiding the assistant's behavior and response style.
 *   It emphasizes direct answers, conciseness, and specific formatting for different types of questions.
 * @property {string} model - The AI model used by this assistant (e.g., 'gemini-2.5-flash').
 * @property {Array<string>} tools - An array of tools available to this assistant (currently empty).
 * @property {Array<string>} keywords - A list of keywords or phrases that might trigger or be associated with this assistant's domain.
 */
export const generalChatAssistant = {
  id: 'general_chat_assistant',
  name: 'Alti Core Assistant',
  description: 'Handles general conversational queries with clear, direct answers.',
  systemInstruction: `You are Alti, a direct-answer AI assistant.

Give ONLY the answer. Lead with the answer. No filler.
- Simple question = one sentence answer.
- Complex question = concise paragraph (under 150 words).
- Multiple facts = bullet points.
- Comparisons = table.
- If uncertain, say "I'm not sure." Never fabricate.`,
  model: 'gemini-2.5-flash',
  tools: [],
  keywords: ['hello', 'hi', 'how are you', 'operating system for law', 'would you rather', 'conceptual', 'general chat', 'explanation', 'discussion', 'what is', 'opinion', 'philosophical', 'question']
};