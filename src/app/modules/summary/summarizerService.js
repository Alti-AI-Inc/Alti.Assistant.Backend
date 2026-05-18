import { claudeSummarizer } from './claudeService.js';

/**
 * Generates a summary for the given content using Claude.
 * @param {string} content - The text content to be summarized.
 * @param {Array} history - The conversation history.
 * @returns {Promise<string>} - The summary text.
 */
export const generateSummary = async (content, history) => {
  const systemPrompt = `You are an expert summarization assistant. Your task is to provide a clear, concise, and accurate summary of the provided website content.
- Identify the key points, main arguments, and important conclusions.
- The summary should be neutral and objective.
- Structure the summary in well-organized paragraphs.

The content to summarize is below:
---
${content}
---
`;

  return claudeSummarizer(history, systemPrompt);
};
