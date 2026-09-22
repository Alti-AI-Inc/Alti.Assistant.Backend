import { IntentClassifier, ROUTE_TYPES } from './classifier.js';
import { PipelineExecutor } from './pipeline.js';
import { llmStream } from '../../services/llm.client.js';
import { GroundingService } from '../../services/grounding.service.js';
import { GuardrailsService } from '../../services/guardrails.service.js';
import { ModelRouter } from '../../services/modelRouter.service.js';
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
   * Sovereign Pipeline: guardrails → classify → model route → execute → ground → validate → return.
   * Every output is fact-checked and validated before reaching the user.
   *
   * @param {string} userMessage - The user's raw message
   * @param {object} context - { userId, conversationHistory, systemPrompt, stream }
   * @returns {Promise<object>} Grounded, validated orchestration result
   */
  async orchestrate(userMessage, context = {}) {
    const orchestrationStart = Date.now();

    // ═══ STEP 1: GUARDRAILS IN ═══
    const inputCheck = await GuardrailsService.validateInput(userMessage);
    if (!inputCheck.safe) {
      logger.warn(`[Orchestrator] Input rejected: ${inputCheck.risk}`);
      return {
        route: 'REJECTED',
        confidence: 1.0,
        output: inputCheck.rejectionReason || 'Your request could not be processed.',
        risk: inputCheck.risk,
        warnings: inputCheck.warnings,
        totalDurationMs: Date.now() - orchestrationStart,
      };
    }

    const sanitizedMessage = inputCheck.sanitized;

    // ═══ STEP 2: CLASSIFY INTENT ═══
    const classification = await IntentClassifier.classify(sanitizedMessage, {
      maxLatencyMs: context.classificationTimeoutMs || 2000,
      conversationHistory: context.conversationHistory || [],
    });

    logger.info(`[Orchestrator] Classified → ${classification.route} (${classification.confidence}), risk: ${inputCheck.risk}`);

    // ═══ STEP 3: SMART MODEL ROUTING ═══
    const model = ModelRouter.selectModel(classification.route, {
      message: sanitizedMessage,
    });
    const modelConfig = ModelRouter.getModelConfig(model);

    logger.info(`[Orchestrator] Model: ${model} (temp: ${modelConfig.temperature})`);

    // ═══ STEP 4: SEARCH AUGMENTATION ═══
    let searchContext = null;
    if (classification.search_augmentation && classification.route !== ROUTE_TYPES.SEARCH) {
      try {
        const searchResult = await PipelineExecutor.executeSingle(
          ROUTE_TYPES.SEARCH,
          { query: classification.parameters?.query || sanitizedMessage, numResults: 3 },
          { synthesize: false }
        );
        if (searchResult.success) {
          searchContext = searchResult;
        }
      } catch (err) {
        logger.warn(`[Orchestrator] Search augmentation failed: ${err.message}`);
      }
    }

    // ═══ STEP 5: EXECUTE PRIMARY ROUTE ═══
    const enrichedContext = {
      ...context,
      searchContext,
      userMessage: sanitizedMessage,
      model,
      modelConfig,
    };

    // Build grounded system prompt
    if (context.systemPrompt) {
      enrichedContext.systemPrompt = GuardrailsService.buildGroundedSystemPrompt(
        context.systemPrompt,
        { searchContext: searchContext ? JSON.stringify(searchContext).slice(0, 1000) : null }
      );
    }

    const params = {
      userMessage: sanitizedMessage,
      ...classification.parameters,
    };

    let result;

    if (classification.route === ROUTE_TYPES.MULTI_STEP && classification.parameters?.steps?.length) {
      const pipelineSteps = classification.parameters.steps.map(s => ({
        route: s.route,
        params: { query: s.query, userMessage: s.query },
      }));
      result = await PipelineExecutor.executeSequential(pipelineSteps, enrichedContext);
    } else {
      result = await PipelineExecutor.executeSingle(
        classification.route,
        params,
        enrichedContext
      );
    }

    // ═══ STEP 6: GROUNDING (verify factual claims) ═══
    const GROUNDABLE_ROUTES = ['CHAT', 'SEARCH', 'RESEARCH', 'RAG', 'REASONING'];
    let grounding = { groundedOutput: null, score: 1.0, citations: [], claims: [], disclaimer: null };

    const outputText = result?.output || result?.content || result?.answer ||
      (typeof result === 'string' ? result : JSON.stringify(result));

    if (GROUNDABLE_ROUTES.includes(classification.route) && outputText) {
      grounding = await GroundingService.groundOutput(outputText, {
        query: sanitizedMessage,
      });
    } else {
      grounding.groundedOutput = outputText;
    }

    // ═══ STEP 7: GUARDRAILS OUT ═══
    const outputCheck = await GuardrailsService.validateOutput(
      grounding.groundedOutput || outputText,
      {
        query: sanitizedMessage,
        groundingScore: grounding.score,
      }
    );

    const totalDurationMs = Date.now() - orchestrationStart;

    // ═══ STEP 8: TELEMETRY ═══
    const telemetryEntry = {
      userMessage: sanitizedMessage.slice(0, 200),
      classification: {
        route: classification.route,
        confidence: classification.confidence,
        classifier: classification.classifier,
        latencyMs: classification.latencyMs,
      },
      model,
      risk: inputCheck.risk,
      searchAugmented: !!searchContext,
      grounding: {
        score: grounding.score,
        claimsCount: grounding.claims?.length || 0,
        citationsCount: grounding.citations?.length || 0,
      },
      output: {
        confidence: outputCheck.confidence,
        valid: outputCheck.valid,
      },
      result: {
        route: result?.route || classification.route,
        success: result?.success !== false,
        durationMs: result?.durationMs,
      },
      totalDurationMs,
    };
    recordTelemetry(telemetryEntry);

    // ═══ RETURN SOVEREIGN RESPONSE ═══
    return {
      route: classification.route,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      classifier: classification.classifier,
      model,
      searchAugmented: !!searchContext,
      // Grounding
      output: grounding.groundedOutput || outputText,
      groundingScore: grounding.score,
      citations: grounding.citations || [],
      disclaimer: grounding.disclaimer,
      // Guardrails
      outputConfidence: outputCheck.confidence,
      risk: inputCheck.risk,
      warnings: [...(inputCheck.warnings || []), ...(outputCheck.warnings || [])],
      // Execution
      result: result?.success !== false ? result : { error: result?.error },
      totalDurationMs,
    };
  },

  /**
   * Sovereign streaming orchestration for SSE endpoints.
   * Guardrails → classify → model route → stream → quick-ground.
   */
  async orchestrateStream(userMessage, context = {}) {
    // Guardrails in
    const inputCheck = await GuardrailsService.validateInput(userMessage);
    if (!inputCheck.safe) {
      return {
        classification: { route: 'REJECTED', risk: inputCheck.risk },
        stream: null,
        isStreaming: false,
        error: inputCheck.rejectionReason,
      };
    }

    const sanitizedMessage = inputCheck.sanitized;

    const classification = await IntentClassifier.classify(sanitizedMessage, {
      maxLatencyMs: 1500,
      conversationHistory: context.conversationHistory || [],
    });

    // Smart model selection
    const model = ModelRouter.selectModel(classification.route, {
      message: sanitizedMessage,
    });

    if (classification.route === ROUTE_TYPES.CHAT) {
      const basePrompt = context.systemPrompt || 'You are Aphura, a world-class AI assistant. Be precise, helpful, and concise.';
      const systemPrompt = GuardrailsService.buildGroundedSystemPrompt(basePrompt);

      const messages = [
        { role: 'system', content: systemPrompt },
        ...(context.conversationHistory || []),
        { role: 'user', content: sanitizedMessage },
      ];

      const stream = await llmStream(messages, { model });

      return {
        classification,
        model,
        stream,
        isStreaming: true,
      };
    }

    // Non-streaming routes: execute full sovereign pipeline
    const result = await this.orchestrate(sanitizedMessage, context);
    return {
      classification: result,
      model,
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
