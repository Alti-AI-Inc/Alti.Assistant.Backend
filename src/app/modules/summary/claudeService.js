import { anthropic } from "./llm.js";

/**
 * A generic function to interact with the Claude model for various coding tasks.
 * @param {string} systemPrompt - The system prompt to guide the model's behavior.
 * @param {Array<{role: 'user' | 'assistant', content: string}>} history - The conversation history.
 * @returns {Promise<string>} - The model's response.
 */
async function runClaudeTask(systemPrompt, history, stream = false) {
    const messages = history
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => ({
            role: msg.role,
            content: msg.content,
        }));

    try {
        const response = await anthropic.messages.create({
            model: 'claude-3-7-sonnet-latest',
            system: systemPrompt,
            max_tokens: 4096,
            messages: messages,
            stream: stream, // Enable or disable streaming based on the parameter
        });

        if (stream) {
            console.log("Streaming response from Anthropic API...", stream);
            
            return response; // Return the stream object directly
        }

        return response.content[0].text;
    } catch (error) {
        console.error("Error calling Anthropic API:", error);
        return "Sorry, I encountered an error while processing your request with the coding model. Please try again.";
    }
}

// Update all service functions to accept and pass the 'stream' parameter.

export const claudeSummarizer = async (history, stream) => {
    const systemPrompt = `You are an expert summarization assistant. Your task is to provide a clear, concise, and accurate summary of the provided content.
- Identify the key points, main arguments, and important conclusions.
- The summary should be neutral and objective.
- Structure the summary in well-organized paragraphs.
The content to summarize is below:
---
${history.map(h => `${h.role}: ${h.content}`).join('\n')}
---
    `;
    return runClaudeTask(systemPrompt, history, stream);
}