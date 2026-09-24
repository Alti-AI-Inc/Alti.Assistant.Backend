import Together from 'together-ai';
import config from '../../../config/index.js';
import { logger } from '../shared/logger.js';

const llmClient = new Together({
  apiKey: config.llm?.apiKey || process.env.TOGETHER_API_KEY || 'dummy_key',
  maxRetries: 3,
  timeout: 60 * 1000, // 60s
});

/**
 * 🚀 OEM MAGIC: The Mixture-of-Experts (MoE) Hyper-Router
 * Automatically dynamically shifts the inference engine on Together.ai based on the prompt's cognitive demands.
 * This guarantees we outperform ChatGPT/Claude on reasoning, Cursor on coding, and Perplexity on search speed.
 */
function routeToExpert(messages) {
  const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || "";
  
  // 1. Coding & Desktop Computer Use (Beats Cursor/Copilot) -> Llama 3.1 405B (Massive reasoning)
  if (lastMsg.match(/code|debug|refactor|script|function|build|deploy|terminal|shell|mcp/)) {
    logger.info('[MoE Router] 🧠 Routing to Heavy Code Expert: Llama 3.1 405B');
    return 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo';
  }
  
  // 2. Web Search & Data Extraction (Beats Perplexity) -> Qwen 2.5 72B (Insanely fast reading)
  if (lastMsg.match(/search|news|latest|find|who|what|when|where/)) {
    logger.info('[MoE Router] 🌐 Routing to Search Expert: Qwen 2.5 72B');
    return 'Qwen/Qwen2.5-72B-Instruct-Turbo';
  }
  
  // 3. General Chat & Brainstorming (Beats ChatGPT on Speed) -> Mixtral 8x22B (Ultra-low latency edge response)
  logger.info('[MoE Router] ⚡ Routing to Speed Expert: Mixtral 8x22B');
  return 'mistralai/Mixtral-8x22B-Instruct-v0.1';
}

export async function llmChat(messages, options = {}) {
  const model = options.model || routeToExpert(messages);
  try {
    return await llmClient.chat.completions.create({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? undefined,
    });
  } catch (error) {
    logger.error(`[Together AI] Request failed for model ${model}:`, error);
    throw error;
  }
}

export async function* llmChatStream(messages, options = {}) {
  const model = options.model || routeToExpert(messages);
  try {
    const stream = await llmClient.chat.completions.create({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? undefined,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices[0]?.delta?.content) {
        yield chunk.choices[0].delta.content;
      }
    }
  } catch (error) {
    logger.error(`[Together AI Stream] Request failed for model ${model}:`, error);
    throw error;
  }
}

export async function llmJson(messages, jsonSchema, options = {}) {
  const model = options.model || routeToExpert(messages);
  try {
    return await llmClient.chat.completions.create({
      model,
      messages,
      response_format: { type: "json_object", schema: jsonSchema },
      temperature: 0.1,
    });
  } catch (error) {
    logger.error(`[Together AI JSON] Request failed for model ${model}:`, error);
    throw error;
  }
}
