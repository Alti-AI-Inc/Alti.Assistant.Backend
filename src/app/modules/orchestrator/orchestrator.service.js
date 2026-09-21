import { IntentClassifier, ROUTE_TYPES } from './classifier.js';
import { PipelineExecutor } from './pipeline.js';
import { groqStream } from '../../services/groq.client.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * In-memory telemetry ring buffer (last 500 routing decisions).
 * In production, replace with Redis or a time-series DB.
 */
const TELEMETRY_BUFFER_SIZE = 500;
const telemetryBuffer = [];

function recordTelemetry(entry) {
  telemetryBuffer.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  if (telemetryBuffer.length > TELEMETRY_BUFFER_SIZE) {
    telemetryBuffer.shift();
  }
}

/**
 * Available route catalog for frontend discovery.
 */
const ROUTE_CATALOG = [
  {
    route: ROUTE_TYPES.CHAT,
    name: 'Conversational Chat',
    description: 'Direct conversation with gpt-oss-120b for general Q&A, opinions, explanations',
    icon: '💬',
    requiresAuth: true,
  },
  {
    route: ROUTE_TYPES.SEARCH,
    name: 'Exa Neural Search',
    description: 'Real-time web search powered by Exa neural search engine',
    icon: '🔍',
    requiresAuth: true,
  },
  {
    route: ROUTE_TYPES.RESEARCH,
    name: 'Deep Research',
    description: 'Multi-hop autonomous research with comprehensive reports',
    icon: '📊',
    requiresAuth: true,
  },
  {
    route: ROUTE_TYPES.TOOL_CALL,
    name: 'Composio Tool Execution',
    description: 'Execute actions across 1,500+ integrations (email, Slack, GitHub, CRM)',
    icon: '🔧',
    requiresAuth: true,
  },
  {
    route: ROUTE_TYPES.CODE,
    name: 'Open-Source Codex',
    description: 'Code generation, explanation, refactoring, review, and sandboxed execution',
    icon: '💻',
    requiresAuth: true,
    license: 'Apache 2.0',
  },
  {
    route: ROUTE_TYPES.AGENT,
    name: 'OpenClaw Agent',
    description: 'Persistent autonomous daemon agents with long-term memory',
    icon: '🤖',
    requiresAuth: true,
    license: 'Apache 2.0',
  },
  {
    route: ROUTE_TYPES.WORKFLOW,
    name: 'Temporal Workflow',
    description: 'Durable fault-tolerant workflow execution that survives failures',
    icon: '⚡',
    requiresAuth: true,
    license: 'MIT',
  },
  {
    route: ROUTE_TYPES.REASONING,
    name: 'LangGraph Reasoning',
    description: 'Multi-agent cognitive reasoning loop (Planner → Synthesizer → Critic)',
    icon: '🧠',
    requiresAuth: true,
    license: 'MIT',
  },
  {
    route: ROUTE_TYPES.RAG,
    name: 'RAG Retrieval',
    description: 'Grounded answers from Exa-sourced documents via LangChain RAG chain',
    icon: '📚',
    requiresAuth: true,
    license: 'MIT',
  },
  {
    route: ROUTE_TYPES.MULTI_STEP,
    name: 'Multi-Step Pipeline',
    description: 'Chain multiple capabilities together (e.g., search → reason → code)',
    icon: '🔗',
    requiresAuth: true,
  },
];

/**
 * Central Orchestration Service.
 * The brain of the platform — classifies intent, selects strategy, executes, returns results.
 */
export const OrchestratorService = {
  /**
   * Full orchestration: classify → route → execute → return.
   * @param {string} userMessage - The user's raw message
   * @param {object} context - { userId, conversationHistory, systemPrompt, stream }
   * @returns {Promise<object>} Unified orchestration result
   */
  async orchestrate(userMessage, context = {}) {
    const orchestrationStart = Date.now();

    // Step 1: Classify intent
    const classification = await IntentClassifier.classify(userMessage, {
      maxLatencyMs: context.classificationTimeoutMs || 2000,
      conversationHistory: context.conversationHistory || [],
    });

    logger.info(`[Orchestrator] Classified "${userMessage.slice(0, 60)}..." → ${classification.route} (${classification.confidence})`);

    // Step 2: Search augmentation if recommended
    let searchContext = null;
    if (classification.search_augmentation && classification.route !== ROUTE_TYPES.SEARCH) {
      try {
        const searchResult = await PipelineExecutor.executeSingle(
          ROUTE_TYPES.SEARCH,
          { query: classification.parameters?.query || userMessage, numResults: 3 },
          { synthesize: false }
        );
        if (searchResult.success) {
          searchContext = searchResult;
        }
      } catch (err) {
        logger.warn(`[Orchestrator] Search augmentation failed: ${err.message}`);
      }
    }

    // Step 3: Execute primary route
    const enrichedContext = {
      ...context,
      searchContext,
      userMessage,
    };

    const params = {
      userMessage,
      ...classification.parameters,
    };

    let result;

    if (classification.route === ROUTE_TYPES.MULTI_STEP && classification.parameters?.steps?.length) {
      // Multi-step pipeline execution
      const pipelineSteps = classification.parameters.steps.map(s => ({
        route: s.route,
        params: { query: s.query, userMessage: s.query },
      }));
      result = await PipelineExecutor.executeSequential(pipelineSteps, enrichedContext);
    } else {
      // Single-step execution
      result = await PipelineExecutor.executeSingle(
        classification.route,
        params,
        enrichedContext
      );
    }

    const totalDurationMs = Date.now() - orchestrationStart;

    // Step 4: Record telemetry
    const telemetryEntry = {
      userMessage: userMessage.slice(0, 200),
      classification: {
        route: classification.route,
        confidence: classification.confidence,
        classifier: classification.classifier,
        latencyMs: classification.latencyMs,
      },
      searchAugmented: !!searchContext,
      result: {
        route: result.route,
        success: result.success,
        durationMs: result.durationMs,
      },
      totalDurationMs,
    };
    recordTelemetry(telemetryEntry);

    return {
      route: classification.route,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      classifier: classification.classifier,
      searchAugmented: !!searchContext,
      result: result.success !== false ? result : { error: result.error },
      totalDurationMs,
    };
  },

  /**
   * Streaming orchestration for SSE endpoints.
   * @param {string} userMessage
   * @param {object} context
   * @returns {Promise<{ classification: object, stream: AsyncIterable }>}
   */
  async orchestrateStream(userMessage, context = {}) {
    const classification = await IntentClassifier.classify(userMessage, {
      maxLatencyMs: 1500,
      conversationHistory: context.conversationHistory || [],
    });

    // For streaming, we currently support CHAT and REASONING routes
    if (classification.route === ROUTE_TYPES.CHAT) {
      const systemPrompt = context.systemPrompt || 'You are Alti, a world-class AI assistant. Be precise, helpful, and concise.';
      const messages = [
        { role: 'system', content: systemPrompt },
        ...(context.conversationHistory || []),
        { role: 'user', content: userMessage },
      ];

      const stream = await groqStream(messages, {
        model: config.groq?.model || 'gpt-oss-120b',
      });

      return {
        classification,
        stream,
        isStreaming: true,
      };
    }

    // Non-streaming routes: execute normally and return result
    const result = await this.orchestrate(userMessage, context);
    return {
      classification: result,
      stream: null,
      isStreaming: false,
      result,
    };
  },

  /**
   * Classification-only endpoint (for frontend routing hints / UI adaptation).
   * @param {string} userMessage
   * @param {object} options
   * @returns {Promise<object>} Classification result without execution
   */
  async classifyOnly(userMessage, options = {}) {
    return IntentClassifier.classify(userMessage, options);
  },

  /**
   * Get the route catalog for frontend discovery.
   * @returns {Array}
   */
  getRouteCatalog() {
    return ROUTE_CATALOG;
  },

  /**
   * Get recent telemetry data.
   * @param {number} limit
   * @returns {object}
   */
  getTelemetry(limit = 50) {
    const recent = telemetryBuffer.slice(-limit);

    // Compute aggregate stats
    const routeCounts = {};
    let totalLatency = 0;
    let successCount = 0;

    for (const entry of recent) {
      routeCounts[entry.classification.route] = (routeCounts[entry.classification.route] || 0) + 1;
      totalLatency += entry.totalDurationMs;
      if (entry.result.success !== false) successCount++;
    }

    return {
      entries: recent,
      stats: {
        totalRequests: recent.length,
        avgLatencyMs: recent.length > 0 ? Math.round(totalLatency / recent.length) : 0,
        successRate: recent.length > 0 ? Math.round((successCount / recent.length) * 100) : 0,
        routeDistribution: routeCounts,
      },
    };
  },

  /**
   * Force a specific route (bypass classifier).
   * @param {string} route - One of ROUTE_TYPES
   * @param {object} params
   * @param {object} context
   * @returns {Promise<object>}
   */
  async executeRoute(route, params, context = {}) {
    if (!ROUTE_TYPES[route]) {
      throw new Error(`Invalid route: ${route}. Valid routes: ${Object.keys(ROUTE_TYPES).join(', ')}`);
    }
    return PipelineExecutor.executeSingle(route, params, context);
  },
};

export default OrchestratorService;
