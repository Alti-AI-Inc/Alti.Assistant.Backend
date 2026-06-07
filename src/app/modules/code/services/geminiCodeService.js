import { GoogleGenAI } from '@google/genai';
import config from '../../../../../config/index.js';

// Initialize the unified SDK client in Vertex AI mode
const ai = new GoogleGenAI({
  vertexAI: {
    project: config.google.gcp_project_id,
    location: config.google.vertex_ai_region || 'us-central1',
  },
});

/**
 * A helper function to interact with Google Gemini 2.5 Pro for various coding tasks on Vertex AI.
 * @param {string} systemPrompt - The system prompt to guide the model's behavior.
 * @param {Array<{role: 'user' | 'assistant' | 'model', content: string}>} history - The conversation history.
 * @returns {Promise<string>} - The model's response.
 */
async function runGeminiTask(systemPrompt, history) {
  try {
    // Translate user and assistant roles to Gemini's expected formats
    const contents = history
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'model')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
      },
    });

    return result?.text || 'No reply generated';
  } catch (error) {
    console.error('Error calling Google Vertex AI for coding task:', error);
    return 'Sorry, I encountered an error while processing your request with the coding model. Please try again.';
  }
}

export const codeGenerator = (history) => {
  const systemPrompt = `You are an expert code generation assistant. Your task is to generate clean, efficient, and well-documented code based on the user's request.
- Analyze the user's request from the conversation history.
- Provide the code in a clear markdown block.
- After the code block, provide a section titled "How to Run" that includes step-by-step commands for running the code.
- This section must include any necessary dependency installation commands (e.g., 'npm install axios', 'pip install requests') and the exact command to execute the code (e.g., 'node index.js', 'python app.py').
- If any other setup is needed (like creating a file or setting environment variables), explain that as well.`;
  return runGeminiTask(systemPrompt, history);
};

export const codeExplainer = (history) => {
  const systemPrompt = `You are an expert code explanation assistant. Your task is to explain a piece of code provided by the user.
- Analyze the user's request and the provided code from the conversation history.
- Break down the code into logical parts and explain each part clearly.
- Use analogies if they help clarify complex concepts.`;
  return runGeminiTask(systemPrompt, history);
};

export const codeDebugger = (history) => {
  const systemPrompt = `You are an expert code debugging assistant. Your task is to help the user find and fix bugs in their code.
- Analyze the user's problem description and the provided code from the conversation history.
- Identify the likely cause of the bug.
- Suggest a corrected version of the code, highlighting the changes.
- Explain why the bug occurred and how the fix resolves it.`;
  return runGeminiTask(systemPrompt, history);
};

export const bestPracticesAdvisor = (history) => {
  const systemPrompt = `You are an expert software engineering advisor. Your task is to review the user's code and suggest improvements based on best practices.
- Analyze the provided code from the conversation history.
- Suggest improvements related to readability, performance, security, and maintainability.
- Provide code examples for your suggestions.`;
  return runGeminiTask(systemPrompt, history);
};

export const generalCodeAssistant = (history) => {
  const systemPrompt = `You are a helpful and versatile AI coding assistant. Engage in a conversation with the user about their coding needs.
- Answer follow-up questions.
- Refine previously generated code.
- Maintain the context of the conversation to provide relevant and accurate assistance.`;
  return runGeminiTask(systemPrompt, history);
};

export const refineCode = (history) => {
  const systemPrompt = `You are a code refinement assistant. Your task is to improve the user's code based on their feedback.
- Analyze the user's feedback and the provided code from the conversation history.
- Suggest improvements to enhance code quality, readability, and performance.
- Provide a revised version of the code with explanations for the changes made.`;
  return runGeminiTask(systemPrompt, history);
};
