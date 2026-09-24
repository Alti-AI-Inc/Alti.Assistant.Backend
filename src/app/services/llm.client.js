import Together from 'together-ai';
import config from '../../../config/index.js';
import { logger } from '../shared/logger.js';

// 🛑 OEM HARD LAW: EXCLUSIVE PROVIDER LOCK
// Liberty Center One is strictly bound to Together.ai as the sole inference engine.
// Connecting to OpenAI, Anthropic, Google, or any other provider is mathematically forbidden.
const llmClient = new Together({
  apiKey: config.llm?.apiKey || process.env.TOGETHER_API_KEY || 'dummy_key',
  baseURL: 'https://api.together.xyz/v1', // Hardcoded base URL lock
  maxRetries: 3,
  timeout: 60 * 1000, 
});

/**
 * 🚀 OEM MAGIC: The Ultimate Mixture-of-Experts (MoE) Inference Factory
 * Maps the ENTIRE Together.ai serverless library to Liberty Center One.
 */
const TOGETHER_AI_FACTORY = {
  // 🧠 Extreme Reasoning & Coding (Cursor/Copilot Killers)
  CODE_HEAVY: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
  CODE_FAST: 'deepseek-ai/deepseek-coder-33b-instruct',
  
  // 🌐 Web Search & Data Extraction (Perplexity Killers)
  SEARCH_EXPERT: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
  DATA_MINER: 'mistralai/Mixtral-8x22B-Instruct-v0.1',
  
  // 👁️ Vision & Multimodal Analysis
  VISION_HEAVY: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
  VISION_FAST: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo',
  
  // ⚡ General Chat & Edge Speed (ChatGPT Speed Killers)
  CHAT_SPEED: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  CHAT_SMART: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',

  // 🎨 Image Generation
  IMAGE_GEN: 'black-forest-labs/FLUX.1-schnell',
};

function routeToExpert(messages, options = {}) {
  const requiredCapability = options.capability || 'text';
  if (requiredCapability === 'vision') return TOGETHER_AI_FACTORY.VISION_HEAVY;
  if (requiredCapability === 'image_gen') return TOGETHER_AI_FACTORY.IMAGE_GEN;
  
  // 🛠️ Internal Tool-Calling Lock
  if (options.tools && options.tools.length > 0) {
    logger.info('[MoE Factory] 🛠️ Dispatching to Llama 405B (Tool Calling Expert)');
    return TOGETHER_AI_FACTORY.CODE_HEAVY;
  }

  // 📝 Internal JSON Lock
  if (options.responseFormat?.type === 'json_object') {
    logger.info('[MoE Factory] 📝 Dispatching to Llama 70B (JSON Schema Expert)');
    return TOGETHER_AI_FACTORY.CHAT_SMART;
  }
  
  const lastMsg = messages[messages.length - 1]?.content;
  const prompt = (typeof lastMsg === 'string' ? lastMsg : JSON.stringify(lastMsg)).toLowerCase();
  
  if (prompt.match(/code|debug|refactor|script|function|build|deploy|terminal|shell|mcp/)) {
    logger.info('[MoE Factory] 🧠 Dispatching to DeepSeek/Llama 405B (Code Expert)');
    return TOGETHER_AI_FACTORY.CODE_HEAVY;
  }
  
  if (prompt.match(/search|news|latest|find|who|what|when|where|analyze data/)) {
    logger.info('[MoE Factory] 🌐 Dispatching to Qwen 72B (Search/Data Expert)');
    return TOGETHER_AI_FACTORY.SEARCH_EXPERT;
  }
  
  if (prompt.match(/finance|stock|market|sec|filing|revenue|earnings|crypto|bitcoin/)) {
    logger.info('[MoE Factory] 📈 Dispatching to Llama 405B (Financial/Quant Expert)');
    return TOGETHER_AI_FACTORY.CODE_HEAVY;
  }
  
  if (prompt.match(/sports|score|game|win|odds|bet|nfl|nba|soccer/)) {
    logger.info('[MoE Factory] 🏈 Dispatching to Qwen 72B (Sports/Odds Expert)');
    return TOGETHER_AI_FACTORY.SEARCH_EXPERT;
  }
  
  if (prompt.match(/deep research|report|analysis|compare|history|comprehensive/)) {
    logger.info('[MoE Factory] 📚 Dispatching to Qwen 72B (Deep Research Expert)');
    return TOGETHER_AI_FACTORY.SEARCH_EXPERT;
  }
  
  if (prompt.match(/explain|teach|summarize/)) {
    logger.info('[MoE Factory] ⚡ Dispatching to Llama 70B (General Intelligence)');
    return TOGETHER_AI_FACTORY.CHAT_SMART;
  }
  
  logger.info('[MoE Factory] 🏎️ Dispatching to Llama 8B Turbo (Edge Speed)');
  return TOGETHER_AI_FACTORY.CHAT_SPEED;
}

export async function llmChat(messages, options = {}) {
  const model = options.model || routeToExpert(messages, options);
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
  const model = options.model || routeToExpert(messages, options);
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
  const model = options.model || routeToExpert(messages, { ...options, responseFormat: { type: 'json_object' } });
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

export async function llmGenerateImage(prompt, options = {}) {
  try {
    logger.info(`[MoE Factory] 🎨 Dispatching Image Generation to Flux.1 Schnell`);
    const response = await llmClient.images.generate({
      model: TOGETHER_AI_FACTORY.IMAGE_GEN,
      prompt,
      width: options.width || 1024,
      height: options.height || 1024,
      steps: 4, 
      n: 1,
      response_format: "b64_json"
    });
    return response.data[0].b64_json;
  } catch (error) {
    logger.error(`[Together AI Image] Generation failed:`, error);
    throw error;
  }
}

export async function llmVisionChat(messages, options = {}) {
  // Pass capability='vision' to force the router to pick Llama 3.2 Vision 90B
  return llmChat(messages, { ...options, capability: 'vision' });
}

// ─── POLYFILLS FOR AGENT SERVICE TO PREVENT CRASHES ─────────────
export async function llmToolCall(messages, tools, options = {}) {
  // Using Llama 3.1 405B or 70B for tool calling (they are the best at it)
  const model = options.model || TOGETHER_AI_FACTORY.CODE_HEAVY; 
  return await llmClient.chat.completions.create({
    model,
    messages,
    tools,
    tool_choice: options.toolChoice || "auto",
    temperature: options.temperature ?? 0.1,
  });
}

export const llmStream = llmChatStream;

export async function llmImageToImage() { throw new Error("Not implemented in OEM backend yet"); }
export async function llmGenerateVideo() { throw new Error("Not implemented in OEM backend yet"); }
export async function llmGetVideoMetadata() { throw new Error("Not implemented in OEM backend yet"); }
export async function llmTextToSpeech() { throw new Error("Not implemented in OEM backend yet"); }
export async function llmStreamTTS() { throw new Error("Not implemented in OEM backend yet"); }
export async function llmCodeInterpreter() { throw new Error("Not implemented in OEM backend yet"); }
export async function llmReasoningChat(messages, options) { return llmChat(messages, { ...options, model: TOGETHER_AI_FACTORY.CODE_HEAVY }); }
export async function llmRerank() { throw new Error("Not implemented in OEM backend yet"); }
export async function llmTranscribeAudio() { throw new Error("Not implemented in OEM backend yet"); }
export const llmRealtimeTTSConfig = {};
export const llmRealtimeSTTConfig = {};
