import { GoogleGenAI } from '@google/genai';
import config from '../../../../../config/index.js';

/**
 * @typedef {Object} ChatMessage
 * @property {'user' | 'assistant' | 'model'} role - The role of the message sender.
 * @property {string} content - The content of the message.
 */

/**
 * Initializes the GoogleGenAI client for interacting with Vertex AI.
 * This client is configured to use a specific GCP project and region for Gemini model interactions.
 * @type {GoogleGenAI}
 */
const ai = new GoogleGenAI({
  vertexAI: {
    project: config.google.gcp_project_id,
    location: config.google.vertex_ai_region || 'us-central1',
  },
});

/**
 * A helper function to interact with Google Gemini 3.1 Pro on Vertex AI for various coding tasks.
 * It handles the conversation history and system instructions to guide the model's behavior.
 *
 * @param {string} systemPrompt - The system prompt to guide the model's behavior and define its persona.
 * @param {Array<ChatMessage>} history - The conversation history, an array of message objects.
 *   Each message object should have a `role` ('user', 'assistant', or 'model') and `content` (the message text).
 * @returns {Promise<string>} A promise that resolves to the model's generated text response.
 *   Returns 'No reply generated' if the model returns an empty response.
 *   Returns an error message string if an exception occurs during the API call.
 * @throws {Error} If there's an issue with the Google Vertex AI API call.
 */
async function runGeminiTask(systemPrompt, history) {
  try {
    // Translate user and assistant roles to Gemini's expected formats ('user' and 'model')
    const contents = history
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'model')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user', // Map 'assistant' to 'model' for Gemini
        parts: [{ text: msg.content }],
      }));

    const result = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview', // Specifies the Gemini 3.1 Pro model
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2, // Lower temperature for more focused and less creative responses
      },
    });

    return result?.text || 'No reply generated';
  } catch (error) {
    console.error('Error calling Google Vertex AI for coding task:', error);
    return 'Sorry, I encountered an error while processing your request with the coding model. Please try again.';
  }
}

/**
 * An exported function that acts as a specialized code generation assistant using Gemini.
 * It takes a conversation history and generates code based on the user's request,
 * including instructions on how to run the generated code.
 *
 * @param {Array<ChatMessage>} history - The conversation history leading up to the code generation request.
 * @returns {Promise<string>} A promise that resolves to the generated code and running instructions in markdown format.
 */
export const codeGenerator = (history) => {
  const systemPrompt = `You are an expert code generation assistant. Your task is to generate clean, efficient, and well-documented code based on the user's request.
- Analyze the user's request from the conversation history.
- Provide the code in a clear markdown block.
- After the code block, provide a section titled "How to Run" that includes step-by-step commands for running the code.
- This section must include any necessary dependency installation commands (e.g., 'npm install axios', 'pip install requests') and the exact command to execute the code (e.g., 'node index.js', 'python app.py').
- If any other setup is needed (like creating a file or setting environment variables), explain that as well.`;
  return runGeminiTask(systemPrompt, history);
};

/**
 * An exported function that acts as a specialized code explanation assistant using Gemini.
 * It takes a conversation history and explains a piece of code provided by the user.
 *
 * @param {Array<ChatMessage>} history - The conversation history containing the code to be explained.
 * @returns {Promise<string>} A promise that resolves to a detailed explanation of the code.
 */
export const codeExplainer = (history) => {
  const systemPrompt = `You are an expert code explanation assistant. Your task is to explain a piece of code provided by the user.
- Analyze the user's request and the provided code from the conversation history.
- Break down the code into logical parts and explain each part clearly.
- Use analogies if they help clarify complex concepts.`;
  return runGeminiTask(systemPrompt, history);
};

/**
 * An exported function that acts as a specialized code debugging assistant using Gemini.
 * It takes a conversation history, identifies bugs in the provided code, suggests fixes,
 * and explains the cause and resolution of the bug.
 *
 * @param {Array<ChatMessage>} history - The conversation history containing the problematic code and bug description.
 * @returns {Promise<string>} A promise that resolves to the debugging analysis, corrected code, and explanations.
 */
export const codeDebugger = (history) => {
  const systemPrompt = `You are an expert code debugging assistant. Your task is to help the user find and fix bugs in their code.
- Analyze the user's problem description and the provided code from the conversation history.
- Identify the likely cause of the bug.
- Suggest a corrected version of the code, highlighting the changes.
- Explain why the bug occurred and how the fix resolves it.`;
  return runGeminiTask(systemPrompt, history);
};

/**
 * An exported function that acts as a specialized best practices advisor using Gemini.
 * It reviews user-provided code and suggests improvements based on software engineering best practices.
 *
 * @param {Array<ChatMessage>} history - The conversation history containing the code to be reviewed.
 * @returns {Promise<string>} A promise that resolves to suggestions for improving code quality, readability, performance, security, and maintainability.
 */
export const bestPracticesAdvisor = (history) => {
  const systemPrompt = `You are an expert software engineering advisor. Your task is to review the user's code and suggest improvements based on best practices.
- Analyze the provided code from the conversation history.
- Suggest improvements related to readability, performance, security, and maintainability.
- Provide code examples for your suggestions.`;
  return runGeminiTask(systemPrompt, history);
};

/**
 * An exported function that acts as a general-purpose AI coding assistant using Gemini.
 * It engages in a versatile conversation, answering follow-up questions, refining code,
 * and maintaining context for broad coding assistance.
 *
 * @param {Array<ChatMessage>} history - The ongoing conversation history with the user.
 * @returns {Promise<string>} A promise that resolves to a helpful and context-aware response from the assistant.
 */
export const generalCodeAssistant = (history) => {
  const systemPrompt = `You are a helpful and versatile AI coding assistant. Engage in a conversation with the user about their coding needs.
- Answer follow-up questions.
- Refine previously generated code.
- Maintain the context of the conversation to provide relevant and accurate assistance.`;
  return runGeminiTask(systemPrompt, history);
};

/**
 * An exported function that acts as a code refinement assistant using Gemini.
 * It improves user-provided code based on their feedback, focusing on quality, readability, and performance.
 *
 * @param {Array<ChatMessage>} history - The conversation history containing the code and user feedback for refinement.
 * @returns {Promise<string>} A promise that resolves to a revised version of the code with explanations for the changes.
 */
export const refineCode = (history) => {
  const systemPrompt = `You are a code refinement assistant. Your task is to improve the user's code based on their feedback.
- Analyze the user's feedback and the provided code from the conversation history.
- Suggest improvements to enhance code quality, readability, and performance.
- Provide a revised version of the code with explanations for the changes made.`;
  return runGeminiTask(systemPrompt, history);
};