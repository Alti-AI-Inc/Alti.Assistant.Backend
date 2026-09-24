import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';

// The full Together AI Serverless Library available to Aphura
const MODELS = {
  CODE_HEAVY: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
  CODE_FAST: 'deepseek-ai/deepseek-coder-33b-instruct',
  SEARCH_EXPERT: 'Qwen/Qwen2.5-72B-Instruct-Turbo',
  CHAT_SMART: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  CHAT_SPEED: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  VISION: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
  GUARDRAIL: 'meta-llama/Meta-Llama-Guard-3-8B',
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
   * Evaluates the cognitive demand of the request to select the optimal engine.
   */
  classifyIntent(reqBody) {
    const messages = reqBody.messages || [];
    const lastMsg = messages[messages.length - 1];
    
    // 🛠️ TOOL-CALLING EXPERT ROUTING
    // If the client provides tools (e.g., Composio MCP, Desktop Shell), 
    // we MUST route to Llama 405B to ensure near-perfect JSON tool-call schema adherence.
    if (reqBody.tools && reqBody.tools.length > 0) {
      return MODELS.CODE_HEAVY;
    }

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
    if (text.match(/finance|stock|market|sec|filing|revenue|earnings|crypto|bitcoin/)) {
      return MODELS.CODE_HEAVY;
    }
    if (text.match(/sports|score|game|win|odds|bet|nfl|nba|soccer/)) {
      return MODELS.SEARCH_EXPERT;
    }
    if (text.match(/deep research|report|analysis|compare|history|comprehensive/)) {
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
    const TOGETHER_API_KEY = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const TOGETHER_ENDPOINT = 'https://api.together.xyz/v1/chat/completions';

    // 🛡️ GLOBAL GUARDRAIL: ZERO-TOLERANCE PRE-FLIGHT CHECK
    // Run the user's prompt through Llama Guard 3 before ANY routing occurs.
    try {
      const guardRes = await fetch(TOGETHER_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TOGETHER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODELS.GUARDRAIL,
          messages: reqBody.messages,
        }),
      });
      const guardData = await guardRes.json();
      const safetyOutput = guardData.choices?.[0]?.message?.content?.toLowerCase() || '';
      
      if (safetyOutput.includes('unsafe')) {
        logger.warn(`[Llama Guard 3] 🛑 BLOCKED: Malicious/Harmful intent detected.`);
        return res.status(403).json({ 
          error: 'Content policy violation. Your request was blocked by the Aphura Sovereign Guardrail.' 
        });
      }
    } catch (e) {
      logger.error(`[Llama Guard 3] Pre-flight check failed, failing closed: ${e.message}`);
      return res.status(500).json({ error: 'Safety verification failed.' });
    }

    // 🧠 ADVANCED MoE ROUTING:
    // If the client explicitly requests JSON output, we force the Llama 70B engine 
    // because it has the highest strict-schema compliance rate without the latency of 405B.
    let originalModel = reqBody.model;
    if (!originalModel) {
      if (reqBody.response_format?.type === 'json_object') {
        originalModel = MODELS.CHAT_SMART;
        logger.info(`[MoE Gateway] JSON schema requested. Forcing highly-compliant model: ${originalModel}`);
      } else {
        originalModel = this.classifyIntent(reqBody);
      }
    }
    
    let attempts = [originalModel, ...(FALLBACK_CHAIN[originalModel] || [])];

    for (let i = 0; i < attempts.length; i++) {
      const targetModel = attempts[i];
      
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

        // ZERO-COPY PIPELINE FOR MAX EDGE SPEED
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        import('stream').then(({ Readable }) => {
          Readable.fromWeb(response.body).pipe(res);
        });
        
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
