import { anthropic } from '../llm.js';

/**
 * A generic function to interact with the Claude model for various coding tasks.
 * @param {string} systemPrompt - The system prompt to guide the model's behavior.
 * @param {Array<{role: 'user' | 'assistant', content: string}>} history - The conversation history.
 * @returns {Promise<string>} - The model's response.
 */
async function runClaudeTask(systemPrompt, history) {
  // Claude expects the history to alternate between user and assistant.
  // We filter out any system messages from our internal history for the API call.
  const messages = history
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-latest',
      system: systemPrompt,
      max_tokens: 4096,
      messages: messages,
    });
    return response.content[0].text;
  } catch (error) {
    console.error('Error calling Anthropic API:', error);
    return 'Sorry, I encountered an error while processing your request with the coding model. Please try again.';
  }
}

export const codeGenerator = (history, stream) => {
  const systemPrompt = `You are an expert code generation assistant. Your task is to generate clean, efficient, and well-documented code based on the user's request.
- Analyze the user's request from the conversation history.
- Provide the code in a clear markdown block.
- After the code block, provide a section titled "How to Run" that includes step-by-step commands for running the code.
- This section must include any necessary dependency installation commands (e.g., 'npm install axios', 'pip install requests') and the exact command to execute the code (e.g., 'node index.js', 'python app.py').
- If any other setup is needed (like creating a file or setting environment variables), explain that as well.`;
  return runClaudeTask(systemPrompt, history, stream);
};

export const codeExplainer = (history) => {
  const systemPrompt = `You are an expert code explanation assistant. Your task is to explain a piece of code provided by the user.
- Analyze the user's request and the provided code from the conversation history.
- Break down the code into logical parts and explain each part clearly.
- Use analogies if they help clarify complex concepts.`;
  return runClaudeTask(systemPrompt, history);
};

export const codeDebugger = (history) => {
  const systemPrompt = `You are an expert code debugging assistant. Your task is to help the user find and fix bugs in their code.
- Analyze the user's problem description and the provided code from the conversation history.
- Identify the likely cause of the bug.
- Suggest a corrected version of the code, highlighting the changes.
- Explain why the bug occurred and how the fix resolves it.`;
  return runClaudeTask(systemPrompt, history);
};

export const bestPracticesAdvisor = (history) => {
  const systemPrompt = `You are an expert software engineering advisor. Your task is to review the user's code and suggest improvements based on best practices.
- Analyze the provided code from the conversation history.
- Suggest improvements related to readability, performance, security, and maintainability.
- Provide code examples for your suggestions.`;
  return runClaudeTask(systemPrompt, history);
};

export const generalCodeAssistant = (history) => {
  const systemPrompt = `You are a helpful and versatile AI coding assistant. Engage in a conversation with the user about their coding needs.
- Answer follow-up questions.
- Refine previously generated code.
- Maintain the context of the conversation to provide relevant and accurate assistance.`;
  return runClaudeTask(systemPrompt, history);
};

export const refineCode = (history) => {
  const systemPrompt = `You are a code refinement assistant. Your task is to improve the user's code based on their feedback.
- Analyze the user's feedback and the provided code from the conversation history.
- Suggest improvements to enhance code quality, readability, and performance.
- Provide a revised version of the code with explanations for the changes made.`;
  return runClaudeTask(systemPrompt, history);
};
