import { claudeSummarizer } from "./claudeService.js";


/**
 * Generates a summary for the given content using Claude.
 * @param {string} content - The text content to be summarized.
 * @param {Array} history - The conversation history.
 * @param {boolean} stream - Whether to stream the response.
 * @returns {Promise<Object|string>} - The streaming object or the final string.
 */
export const generateSummary = async (content, history, stream) => {
    const systemPrompt = `You are an expert summarization assistant. Your task is to provide a clear, concise, and accurate summary of the provided website content.
- Identify the key points, main arguments, and important conclusions.
- The summary should be neutral and objective.
- Structure the summary in well-organized paragraphs.

The website content to summarize is below:
---
${content.substring(0, 20000)}
---
`; // Truncate content to fit within model context limits

    return claudeSummarizer(history.concat({ role: 'system', content: systemPrompt }), stream);
};
