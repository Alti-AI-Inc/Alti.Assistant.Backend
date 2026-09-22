import { logger } from '../../shared/logger.js';

/**
 * Model Router Service — Smart model selection for every task.
 *
 * Picks the right model (gpt-oss-20b vs gpt-oss-120b) based on:
 * - Route type (chat, search, code, agent, etc.)
 * - Estimated complexity of the request
 * - Cost optimization (use small model when big model isn't needed)
 *
 * Result: faster responses, lower cost, better quality per task.
 */

// Model definitions
export const MODELS = {
  LIGHT: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',    // Fast, cheap — classification, extraction, simple Q&A
  HEAVY: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',   // Powerful — reasoning, code, agents, complex tasks
};

// Route → default model mapping
const ROUTE_MODEL_MAP = {
  CHAT: MODELS.LIGHT,          // Simple Q&A doesn't need 120B
  SEARCH: MODELS.LIGHT,        // Search synthesis is a summarization task
  RESEARCH: MODELS.HEAVY,      // Deep research needs deep reasoning
  TOOL_CALL: MODELS.HEAVY,     // Tool calling needs reliable function calling
  CODE: MODELS.HEAVY,          // Code generation needs precise syntax
  AGENT: MODELS.HEAVY,         // Agent execution is complex multi-step
  WORKFLOW: MODELS.HEAVY,      // Workflow orchestration needs reliability
  REASONING: MODELS.HEAVY,     // Multi-agent reasoning is the hardest task
  RAG: MODELS.LIGHT,           // RAG synthesis from retrieved docs
  MULTI_STEP: MODELS.HEAVY,    // Chained operations need consistency
};

// Model-specific configurations
const MODEL_CONFIGS = {
  [MODELS.LIGHT]: {
    temperature: 0.3,
    maxTokens: 2048,
    topP: 0.9,
    costPer1kTokens: 0.0001,   // $0.10 per 1M tokens
  },
  [MODELS.HEAVY]: {
    temperature: 0.7,
    maxTokens: 4096,
    topP: 0.95,
    costPer1kTokens: 0.0005,   // $0.50 per 1M tokens
  },
};

// Complexity indicators that upgrade from LIGHT → HEAVY
const COMPLEXITY_UPGRADE_PATTERNS = [
  /\b(explain|analyze|compare|contrast|evaluate|synthesize|debate)\b/i,
  /\b(step[- ]by[- ]step|in[- ]depth|comprehensive|detailed|thorough)\b/i,
  /\b(algorithm|architecture|design|implement|refactor|optimize)\b/i,
  /\b(why|how does|what causes|implications|trade-?offs)\b/i,
  /\b(pros?\s+and\s+cons?|advantages?\s+and\s+disadvantages?)\b/i,
];

// Simplicity indicators that keep LIGHT model
const SIMPLICITY_PATTERNS = [
  /^(what|who|when|where)\s+(is|are|was|were)\b/i,
  /^(define|translate|convert|list|name)\b/i,
  /^(yes|no)\s*\?/i,
  /\b(summary|summarize|tldr|brief)\b/i,
];

export const ModelRouter = {
  /**
   * Select the optimal model for a request.
   * @param {string} route - The classified route type
   * @param {object} options - { message, complexity, forceModel }
   * @returns {string} Model name
   */
  selectModel(route, options = {}) {
    const { message, complexity, forceModel } = options;

    // Allow manual override
    if (forceModel && MODELS[forceModel]) {
      return MODELS[forceModel];
    }

    // Get default model for this route
    let model = ROUTE_MODEL_MAP[route] || MODELS.HEAVY;

    // If route defaults to LIGHT, check if message complexity requires upgrade
    if (model === MODELS.LIGHT && message) {
      const estimatedComplexity = complexity || this.estimateComplexity(message);
      if (estimatedComplexity > 0.45) {
        model = MODELS.HEAVY;
        logger.info(`[ModelRouter] Upgraded ${route} to ${MODELS.HEAVY} (complexity: ${estimatedComplexity.toFixed(2)})`);
      }
    }

    return model;
  },

  /**
   * Estimate the complexity of a user message (0.0 to 1.0).
   * Higher complexity → bigger model.
   */
  estimateComplexity(message) {
    if (!message) return 0.5;

    let score = 0;
    const factors = [];

    // Length factor (longer = more complex)
    if (message.length > 500) { score += 0.15; factors.push('long'); }
    if (message.length > 1000) { score += 0.15; factors.push('very_long'); }

    // Complexity pattern matching
    const complexMatches = COMPLEXITY_UPGRADE_PATTERNS.filter(p => p.test(message));
    score += complexMatches.length * 0.12;
    if (complexMatches.length > 0) factors.push('complex_patterns');

    // Simplicity pattern matching (reduces score)
    const simpleMatches = SIMPLICITY_PATTERNS.filter(p => p.test(message));
    score -= simpleMatches.length * 0.15;
    if (simpleMatches.length > 0) factors.push('simple_patterns');

    // Multiple questions (? count)
    const questionCount = (message.match(/\?/g) || []).length;
    if (questionCount > 2) { score += 0.15; factors.push('multi_question'); }

    // Code indicators
    if (/```|function\s|class\s|import\s|const\s|let\s/.test(message)) {
      score += 0.2;
      factors.push('code');
    }

    // Multi-part requests (and, also, additionally, then)
    if (/\b(and also|additionally|furthermore|then|after that|also)\b/i.test(message)) {
      score += 0.1;
      factors.push('multi_part');
    }

    // Clamp to 0-1
    const clamped = Math.max(0, Math.min(1, score));

    return clamped;
  },

  /**
   * Get configuration for a specific model.
   */
  getModelConfig(model) {
    return MODEL_CONFIGS[model] || MODEL_CONFIGS[MODELS.HEAVY];
  },

  /**
   * Estimate cost for a request based on expected tokens.
   */
  estimateCost(model, estimatedTokens) {
    const config = this.getModelConfig(model);
    return (estimatedTokens / 1000) * config.costPer1kTokens;
  },

  /**
   * Get routing decision summary for telemetry.
   */
  getRoutingDecision(route, message) {
    const model = this.selectModel(route, { message });
    const complexity = this.estimateComplexity(message);
    const config = this.getModelConfig(model);

    return {
      route,
      model,
      complexity: Math.round(complexity * 100) / 100,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      estimatedCostPer1kTokens: config.costPer1kTokens,
    };
  },
};

export default ModelRouter;
