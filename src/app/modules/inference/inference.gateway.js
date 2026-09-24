import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';

// The full Together AI Serverless Library available to Liberty Center One
const MODELS = {
  CODE_HEAVY: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
  CODE_FAST: 'deepseek-ai/deepseek-coder-33b-instruct',
  SEARCH_EXPERT: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
  CHAT_SMART: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  CHAT_SPEED: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  VISION: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
};

// Fallback logic for high-availability
const FALLBACK_CHAIN = {
  [MODELS.CODE_HEAVY]: [MODELS.CHAT_SMART, MODELS.CODE_FAST],
  [MODELS.SEARCH_EXPERT]: [MODELS.CHAT_SMART],
  [MODELS.CHAT_SMART]: [MODELS.CHAT_SPEED],
  [MODELS.CHAT_SPEED]: [MODELS.CHAT_SMART], // If edge is down, go to core
};

export const InferenceGateway = {
  /**
   * Evaluates the cognitive demand of the prompt array to select the optimal engine.
   */
  classifyIntent(messages) {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return MODELS.CHAT_SPEED;

    // Detect Vision
    if (Array.isArray(lastMsg.content) && lastMsg.content.some(c => c.type === 'image_url')) {
      return MODELS.VISION;
    }

    const text = (typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content)).toLowerCase();
    
    if (text.match(/code|debug|refactor|script|function|build|deploy|terminal|shell|mcp/)) {
      return MODELS.CODE_HEAVY;
    }
    if (text.match(/search|news|latest|find|who|what|when|where|analyze data/)) {
      return MODELS.SEARCH_EXPERT;
    }
    if (text.match(/explain|teach|summarize/)) {
      return MODELS.CHAT_SMART;
    }
    return MODELS.CHAT_SPEED;
  },

  /**
   * Acts as our internal OpenRouter for Together AI. 
   * Handles dynamic routing, streaming, and automatic fallbacks.
   */
  async streamChatCompletion(reqBody, res) {
    const originalModel = reqBody.model || this.classifyIntent(reqBody.messages);
    let attempts = [originalModel, ...(FALLBACK_CHAIN[originalModel] || [])];
    
    const TOGETHER_API_KEY = config.llm?.apiKey || process.env.TOGETHER_API_KEY;

    for (let i = 0; i < attempts.length; i++) {
      const targetModel = attempts[i];
      
      // 🛑 OEM HARD LAW: EXCLUSIVE PROVIDER LOCK
      // Ensure that under no circumstances can the target model be routed outside Together AI.
      const TOGETHER_ENDPOINT = 'https://api.together.xyz/v1/chat/completions';
      
      logger.info(`[Inference Gateway] Routing to: ${targetModel} on Together.ai (Attempt ${i + 1}/${attempts.length})`);

      try {
        const response = await fetch(TOGETHER_ENDPOINT, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${TOGETHER_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...reqBody,
            model: targetModel,
            stream: true
          }),
          // Important: Don't timeout too early on massive reasoning tasks
          signal: AbortSignal.timeout(60000) 
        });

        if (!response.ok) {
          throw new Error(`Together API returned ${response.status}`);
        }

        // Pipe the raw Together.ai stream directly back to our client
        // This is a zero-copy passthrough proxy for maximum edge speed
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        for await (const chunk of response.body) {
          res.write(chunk);
        }
        res.end();
        return; // Success! Exit the fallback loop.

      } catch (error) {
        logger.warn(`[Inference Gateway] Model ${targetModel} failed: ${error.message}. Routing to fallback...`);
        if (i === attempts.length - 1) {
          logger.error(`[Inference Gateway] All models in fallback chain failed.`);
          if (!res.headersSent) {
            res.status(502).json({ error: 'All upstream inference engines failed.' });
          } else {
            res.end();
          }
        }
      }
    }
  }
};
