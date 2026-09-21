import Groq from 'groq-sdk';
import config from '../../../config/index.js';

const groqClient = new Groq({
  apiKey: config.groq.apiKey,
});

/**
 * Chat completion using Groq
 * @param {Array} messages - Array of {role, content} message objects
 * @param {Object} options - Optional overrides (model, temperature, max_tokens, tools, etc.)
 * @returns {Object} Groq chat completion response
 */
export async function groqChat(messages, options = {}) {
  const response = await groqClient.chat.completions.create({
    model: options.model || config.groq.model,
    messages,
    temperature: options.temperature ?? config.groq.temperature,
    max_tokens: options.max_tokens || 8192,
    ...options,
  });
  return response;
}

/**
 * Streaming chat completion using Groq
 * @param {Array} messages - Array of {role, content} message objects
 * @param {Object} options - Optional overrides
 * @returns {AsyncIterable} Stream of completion chunks
 */
export async function groqStream(messages, options = {}) {
  const stream = await groqClient.chat.completions.create({
    model: options.model || config.groq.model,
    messages,
    temperature: options.temperature ?? config.groq.temperature,
    max_tokens: options.max_tokens || 8192,
    stream: true,
    ...options,
  });
  return stream;
}

/**
 * Simple text completion (wraps chat with single user message)
 * @param {string} prompt - The prompt text
 * @param {Object} options - Optional overrides
 * @returns {string} The completion text
 */
export async function groqComplete(prompt, options = {}) {
  const response = await groqChat(
    [{ role: 'user', content: prompt }],
    options
  );
  return response.choices[0]?.message?.content || '';
}

/**
 * Chat completion with tool/function calling
 * @param {Array} messages - Conversation messages
 * @param {Array} tools - Tool definitions in OpenAI format
 * @param {Object} options - Optional overrides
 * @returns {Object} Groq response with tool calls
 */
export async function groqToolCall(messages, tools, options = {}) {
  const response = await groqClient.chat.completions.create({
    model: options.model || config.groq.model,
    messages,
    tools,
    tool_choice: options.tool_choice || 'auto',
    temperature: options.temperature ?? config.groq.temperature,
    max_tokens: options.max_tokens || 8192,
    ...options,
  });
  return response;
}

/**
 * Lightweight chat completion using gpt-oss-20b (fast, cheap, 1200 tok/s)
 * Use for: classification, evaluation, prompt analysis, simple Q&A
 * @param {Array} messages
 * @param {Object} options
 * @returns {Object}
 */
export async function groqLightChat(messages, options = {}) {
  const response = await groqClient.chat.completions.create({
    model: options.model || config.groq.lightModel || 'gpt-oss-20b',
    messages,
    temperature: options.temperature ?? config.groq.temperature,
    max_tokens: options.max_tokens || 4096,
    ...options,
  });
  return response;
}

/**
 * Lightweight streaming using gpt-oss-20b
 */
export async function groqLightStream(messages, options = {}) {
  const stream = await groqClient.chat.completions.create({
    model: options.model || config.groq.lightModel || 'gpt-oss-20b',
    messages,
    temperature: options.temperature ?? config.groq.temperature,
    max_tokens: options.max_tokens || 4096,
    stream: true,
    ...options,
  });
  return stream;
}

/**
 * Lightweight tool calling using gpt-oss-20b
 */
export async function groqLightToolCall(messages, tools, options = {}) {
  const response = await groqClient.chat.completions.create({
    model: options.model || config.groq.lightModel || 'gpt-oss-20b',
    messages,
    tools,
    tool_choice: options.tool_choice || 'auto',
    temperature: options.temperature ?? config.groq.temperature,
    max_tokens: options.max_tokens || 4096,
    ...options,
  });
  return response;
}

export function getGroqClient() {
  return groqClient;
}

export { groqClient };
export default groqClient;
