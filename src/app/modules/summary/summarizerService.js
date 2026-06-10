import { claudeSummarizer } from './claudeService.js';

/**
 * Generates a summary for the given content using Claude.
 * @param {string} content - The text content to be summarized.
 * @param {Array} history - The conversation history.
 * @returns {Promise<string>} - The summary text.
 */
export const generateSummary = async (content, history) => {
  // Define the system prompt, which sets the persona and general instructions for the summarizer.
  // This prompt should be kept clean and free from user-provided content to mitigate prompt injection risks.
  const systemPrompt = `You are an expert summarization assistant. Your task is to provide a clear, concise, and accurate summary of the provided website content.
- Identify the key points, main arguments, and important conclusions.
- The summary should be neutral and objective.
- Structure the summary in well-organized paragraphs.

The content to summarize is provided in the user message.`;

  // Append the current content to be summarized as a new user message in the conversation history.
  // This separates the user's input from the system's instructions, significantly reducing
  // the risk of prompt injection where malicious user input could override system directives.
  const messages = [
    ...history,
    { role: 'user', content: `Please summarize the following content:\n---\n${content}\n---` }
  ];

  // Call the Claude summarizer with the updated message history and the clean system prompt.
  return claudeSummarizer(messages, systemPrompt);
};