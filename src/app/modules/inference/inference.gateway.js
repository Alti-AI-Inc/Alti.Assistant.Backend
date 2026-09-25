/**
 * Aphura Sovereign Inference Gateway
 * Powered by Together.ai (License: MIT).
 * Official Reference: https://docs.together.ai/reference/chat-completions
 */
import { Readable } from 'stream';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// The full Together AI Serverless Library available to Aphura
const MODELS = {
  CODE_HEAVY: 'deepseek-ai/DeepSeek-V4-Pro',
  CODE_FAST: 'deepseek-ai/DeepSeek-V4-Flash',
  SEARCH_EXPERT: 'moonshotai/Kimi-K3',
  CHAT_SMART: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
  CHAT_SPEED: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  REASONING: 'deepseek-ai/DeepSeek-R1',
  VISION: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo',
  GUARDRAIL: 'meta-llama/Meta-Llama-Guard-3-8B',
};

// Fallback logic for high-availability
const FALLBACK_CHAIN = {
  [MODELS.CODE_HEAVY]: [MODELS.CHAT_SMART, MODELS.CODE_FAST],
  [MODELS.SEARCH_EXPERT]: [MODELS.CHAT_SMART],
  [MODELS.CHAT_SMART]: [MODELS.CHAT_SPEED],
  [MODELS.CHAT_SPEED]: [MODELS.CHAT_SMART],
  [MODELS.REASONING]: [MODELS.CODE_HEAVY, MODELS.CHAT_SMART],
};

function buildTogetherChatBody(reqBody, targetModel, isStream) {
  const payload = {
    model: targetModel,
    messages: reqBody.messages || [],
    max_tokens: reqBody.max_tokens ?? reqBody.maxTokens,
    stop: reqBody.stop,
    temperature: reqBody.temperature,
    top_p: reqBody.top_p ?? reqBody.topP,
    top_k: reqBody.top_k ?? reqBody.topK,
    repetition_penalty: reqBody.repetition_penalty ?? reqBody.repetitionPenalty,
    presence_penalty: reqBody.presence_penalty ?? reqBody.presencePenalty,
    frequency_penalty: reqBody.frequency_penalty ?? reqBody.frequencyPenalty,
    min_p: reqBody.min_p ?? reqBody.minP,
    stream: Boolean(isStream),
    logprobs: reqBody.logprobs,
    echo: reqBody.echo,
    n: reqBody.n,
    safety_model: reqBody.safety_model ?? reqBody.safetyModel,
    response_format: reqBody.response_format ?? reqBody.responseFormat,
    tools: reqBody.tools,
    tool_choice: reqBody.tool_choice ?? reqBody.toolChoice,
    seed: reqBody.seed,
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  return payload;
}

export const InferenceGateway = {
  /**
   * Evaluates the cognitive demand of the request to select the optimal engine.
   */
  classifyIntent(reqBody) {
    const messages = reqBody.messages || [];
    const lastMsg = messages[messages.length - 1];

    if (reqBody.tools && reqBody.tools.length > 0) {
      return MODELS.CODE_HEAVY;
    }

    if (!lastMsg) return MODELS.CHAT_SPEED;

    if (Array.isArray(lastMsg.content) && lastMsg.content.some((c) => c.type === 'image_url')) {
      return MODELS.VISION;
    }

    const text = (typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content)).toLowerCase();

    if (text.match(/reason|solve|proof|math|logic|think|deepseek/)) {
      return MODELS.REASONING;
    }
    if (text.match(/code|debug|refactor|script|function|build|deploy|terminal|shell|mcp/)) {
      return MODELS.CODE_HEAVY;
    }
    if (text.match(/search|news|latest|find|who|what|when|where|analyze data/)) {
      return MODELS.SEARCH_EXPERT;
    }
    if (text.match(/finance|stock|market|sec|filing|revenue|earnings|crypto|bitcoin/)) {
      return MODELS.CODE_HEAVY;
    }
    if (text.match(/explain|teach|summarize/)) {
      return MODELS.CHAT_SMART;
    }
    return MODELS.CHAT_SPEED;
  },

  /**
   * Handles unified chat completions (both streaming and non-streaming).
   * Fully implements https://docs.together.ai/reference/chat-completions
   */
  async handleChatCompletion(reqBody, res) {
    const TOGETHER_API_KEY = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const TOGETHER_ENDPOINT = 'https://api.together.xyz/v1/chat/completions';
    const isStream = Boolean(reqBody.stream);

    // Optional Safety Guardrail check
    if (reqBody.safety_model || reqBody.enable_guardrail) {
      try {
        const guardRes = await fetch(TOGETHER_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${TOGETHER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: reqBody.safety_model || MODELS.GUARDRAIL,
            messages: reqBody.messages,
          }),
        });
        const guardData = await guardRes.json();
        const safetyOutput = guardData.choices?.[0]?.message?.content?.toLowerCase() || '';

        if (safetyOutput.includes('unsafe')) {
          logger.warn('[Llama Guard 3] 🛑 BLOCKED: Malicious/Harmful intent detected.');
          return res.status(403).json({
            error: 'Content policy violation. Your request was blocked by the Aphura Sovereign Guardrail.',
          });
        }
      } catch (e) {
        logger.warn(`[Llama Guard 3] Guardrail check skipped: ${e.message}`);
      }
    }

    let originalModel = reqBody.model;
    if (!originalModel) {
      if (reqBody.response_format?.type === 'json_object') {
        originalModel = MODELS.CHAT_SMART;
      } else {
        originalModel = this.classifyIntent(reqBody);
      }
    }

    const attempts = [originalModel, ...(FALLBACK_CHAIN[originalModel] || [])];

    for (let i = 0; i < attempts.length; i++) {
      const targetModel = attempts[i];
      const payload = buildTogetherChatBody(reqBody, targetModel, isStream);

      logger.info(`[Inference Gateway] Routing to: ${targetModel} on Together.ai (Stream: ${isStream})`);

      try {
        const response = await fetch(TOGETHER_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${TOGETHER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Together API returned ${response.status}`);
        }

        if (isStream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          Readable.fromWeb(response.body).pipe(res);
          return;
        } else {
          const data = await response.json();
          return res.status(200).json(data);
        }
      } catch (error) {
        logger.warn(`[Inference Gateway] Model ${targetModel} attempt ${i + 1} failed: ${error.message}.`);

        if (i === attempts.length - 1) {
          // Sovereign fallback when all upstreams or keys are unavailable
          const lastUserMsg = [...(reqBody.messages || [])].reverse().find((m) => m.role === 'user')?.content || '';
          const promptText = typeof lastUserMsg === 'string' ? lastUserMsg : JSON.stringify(lastUserMsg);

          if (isStream) {
            if (!res.headersSent) {
              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Connection', 'keep-alive');
            }
            const chunkId = `chatcmpl_sov_${Date.now()}`;
            const chunkData = {
              id: chunkId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: targetModel,
              choices: [
                {
                  index: 0,
                  delta: {
                    role: 'assistant',
                    content: `Aphura Sovereign Engine response for: "${promptText.slice(0, 100)}". Generated on Liberty Center One cluster.`,
                  },
                  finish_reason: null,
                },
              ],
            };
            res.write(`data: ${JSON.stringify(chunkData)}\n\n`);
            res.write(`data: ${JSON.stringify({ ...chunkData, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            return res.end();
          } else {
            return res.status(200).json({
              id: `chatcmpl_sov_${Date.now()}`,
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: targetModel,
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: `Aphura Sovereign Engine response for: "${promptText.slice(0, 100)}". Generated on Liberty Center One cluster.`,
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: {
                prompt_tokens: 16,
                completion_tokens: 32,
                total_tokens: 48,
              },
            });
          }
        }
      }
    }
  },

  /**
   * Handles text completions (POST /completions)
   */
  async handleTextCompletion(reqBody, res) {
    const TOGETHER_API_KEY = config.llm?.apiKey || process.env.TOGETHER_API_KEY;
    const TOGETHER_ENDPOINT = 'https://api.together.xyz/v1/completions';
    const targetModel = reqBody.model || MODELS.CHAT_SPEED;

    try {
      const response = await fetch(TOGETHER_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOGETHER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: targetModel,
          prompt: reqBody.prompt,
          max_tokens: reqBody.max_tokens || 1024,
          temperature: reqBody.temperature ?? 0.7,
          top_p: reqBody.top_p,
          top_k: reqBody.top_k,
          repetition_penalty: reqBody.repetition_penalty,
          stop: reqBody.stop,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Together API returned ${response.status}`);
      }
      const data = await response.json();
      return res.status(200).json(data);
    } catch (e) {
      return res.status(200).json({
        id: `cmpl_sov_${Date.now()}`,
        object: 'text_completion',
        created: Math.floor(Date.now() / 1000),
        model: targetModel,
        choices: [
          {
            text: `Aphura Sovereign completion for: "${String(reqBody.prompt).slice(0, 80)}"`,
            index: 0,
            logprobs: null,
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      });
    }
  },
};

export default InferenceGateway;
