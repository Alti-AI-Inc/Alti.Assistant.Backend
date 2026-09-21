import { groqLightToolCall } from '../../services/groq.client.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Route types supported by the orchestrator.
 * Each maps to a dedicated execution strategy.
 */
export const ROUTE_TYPES = {
  CHAT: 'CHAT',
  SEARCH: 'SEARCH',
  RESEARCH: 'RESEARCH',
  TOOL_CALL: 'TOOL_CALL',
  CODE: 'CODE',
  AGENT: 'AGENT',
  WORKFLOW: 'WORKFLOW',
  REASONING: 'REASONING',
  RAG: 'RAG',
  MULTI_STEP: 'MULTI_STEP',
};

/**
 * Tool-calling schema for Groq gpt-oss-120b intent classification.
 * Uses structured function output to guarantee parseable routing decisions.
 */
const CLASSIFICATION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'classify_intent',
      description: 'Classify a user message into the optimal processing route and extract structured parameters.',
      parameters: {
        type: 'object',
        properties: {
          route: {
            type: 'string',
            enum: Object.values(ROUTE_TYPES),
            description: `The processing route:
- CHAT: General conversation, opinions, explanations, Q&A that doesn't need external data
- SEARCH: Queries needing real-time web data, current events, recent information, factual lookups
- RESEARCH: Deep multi-hop investigations, comprehensive reports, market analysis
- TOOL_CALL: Actions requiring external service integration (send email, create ticket, post to Slack, calendar, CRM)
- CODE: Code generation, explanation, refactoring, review, or execution
- AGENT: Long-running autonomous tasks requiring persistent memory and multi-step execution
- WORKFLOW: Durable multi-step business processes that must survive failures (data pipelines, batch jobs)
- REASONING: Complex problems requiring structured multi-agent decomposition (planning, strategy, analysis)
- RAG: Questions that need grounded answers from specific documents or knowledge bases
- MULTI_STEP: Requests requiring chained operations (e.g., "search for X then write code for it")`,
          },
          confidence: {
            type: 'number',
            description: 'Classification confidence from 0.0 to 1.0',
          },
          search_augmentation: {
            type: 'boolean',
            description: 'Whether the response should be augmented with real-time web search results before processing',
          },
          parameters: {
            type: 'object',
            description: 'Route-specific parameters extracted from the user message',
            properties: {
              query: { type: 'string', description: 'The core query or task description' },
              language: { type: 'string', description: 'Programming language if CODE route' },
              code_action: {
                type: 'string',
                enum: ['generate', 'explain', 'refactor', 'review', 'execute'],
                description: 'Specific code action if CODE route',
              },
              tool_name: { type: 'string', description: 'Target tool/service name if TOOL_CALL route' },
              workflow_type: { type: 'string', description: 'Workflow type if WORKFLOW route' },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    route: { type: 'string' },
                    query: { type: 'string' },
                  },
                },
                description: 'Ordered steps if MULTI_STEP route',
              },
            },
          },
          reasoning: {
            type: 'string',
            description: 'Brief explanation of why this route was selected',
          },
        },
        required: ['route', 'confidence', 'search_augmentation', 'parameters', 'reasoning'],
      },
    },
  },
];

const CLASSIFIER_SYSTEM_PROMPT = `You are an intent classification engine for a world-class AI platform.
Your ONLY job is to call the classify_intent function with the correct route for the user's message.

Route selection priorities:
1. If the user asks to DO something with an external service (email, Slack, calendar, CRM, GitHub) → TOOL_CALL
2. If the user needs current/recent web information → SEARCH
3. If the user wants deep investigation or comprehensive report → RESEARCH  
4. If the user mentions code, programming, debugging, or algorithms → CODE
5. If the user needs a long-running autonomous task → AGENT
6. If the user describes a multi-step business process → WORKFLOW
7. If the user asks a complex reasoning/planning/strategy question → REASONING
8. If the user asks about specific documents or knowledge bases → RAG
9. If the request clearly needs multiple different capabilities chained → MULTI_STEP
10. For general conversation, opinions, simple questions → CHAT

Always set search_augmentation=true when current/factual data would improve the answer.`;

/**
 * Keyword-based heuristic fallback classifier.
 * Used when LLM classification exceeds latency budget or fails.
 */
const HEURISTIC_PATTERNS = [
  { route: ROUTE_TYPES.CODE, patterns: /\b(code|function|class|api|debug|refactor|algorithm|implement|typescript|javascript|python|rust|sql|regex|compile|runtime|snippet|programming)\b/i, confidence: 0.75 },
  { route: ROUTE_TYPES.SEARCH, patterns: /\b(search|find|look up|what is|who is|latest|current|news|today|recent|trending|price of|weather|stock)\b/i, confidence: 0.7 },
  { route: ROUTE_TYPES.RESEARCH, patterns: /\b(research|investigate|deep dive|comprehensive|report|analysis|market|study|compare.*companies|white paper)\b/i, confidence: 0.7 },
  { route: ROUTE_TYPES.TOOL_CALL, patterns: /\b(send email|post to|create ticket|slack message|calendar|schedule meeting|tweet|github issue|jira|notion|salesforce|hubspot|crm)\b/i, confidence: 0.8 },
  { route: ROUTE_TYPES.AGENT, patterns: /\b(agent|monitor|watch|track|daemon|autonomous|persistent|keep running|background task)\b/i, confidence: 0.65 },
  { route: ROUTE_TYPES.WORKFLOW, patterns: /\b(workflow|pipeline|batch|etl|data pipeline|process|orchestrate|automate.*steps|cron|schedule)\b/i, confidence: 0.7 },
  { route: ROUTE_TYPES.REASONING, patterns: /\b(reason|plan|strategy|analyze|think through|pros and cons|decision|evaluate options|tradeoffs|architect)\b/i, confidence: 0.65 },
  { route: ROUTE_TYPES.RAG, patterns: /\b(document|knowledge base|based on.*docs|from.*files|in.*database|retrieve from|our data|internal docs)\b/i, confidence: 0.7 },
];

/**
 * Classifies user intent using heuristic keyword matching.
 * @param {string} message - User message
 * @returns {{ route: string, confidence: number, parameters: object, reasoning: string, search_augmentation: boolean }}
 */
function heuristicClassify(message) {
  for (const { route, patterns, confidence } of HEURISTIC_PATTERNS) {
    if (patterns.test(message)) {
      return {
        route,
        confidence,
        search_augmentation: route === ROUTE_TYPES.SEARCH || route === ROUTE_TYPES.RESEARCH,
        parameters: { query: message },
        reasoning: `Heuristic keyword match → ${route}`,
        classifier: 'heuristic',
      };
    }
  }

  // Default to CHAT
  return {
    route: ROUTE_TYPES.CHAT,
    confidence: 0.5,
    search_augmentation: false,
    parameters: { query: message },
    reasoning: 'No strong signal detected, defaulting to conversational chat',
    classifier: 'heuristic',
  };
}

/**
 * Intent Classifier Engine.
 * Primary: Groq gpt-oss-20b tool-calling for fast structured classification (~100ms).
 * Fallback: Keyword heuristic when LLM is unavailable or slow.
 */
export const IntentClassifier = {
  /**
   * Classify a user message into a processing route.
   * @param {string} message - The user's message
   * @param {object} options - { maxLatencyMs, conversationHistory }
   * @returns {Promise<{ route: string, confidence: number, parameters: object, reasoning: string, search_augmentation: boolean, classifier: string }>}
   */
  async classify(message, options = {}) {
    const { maxLatencyMs = 2000, conversationHistory = [] } = options;
    const startTime = Date.now();

    try {
      const messages = [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        ...conversationHistory.slice(-4).map(m => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user', content: message },
      ];

      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), maxLatencyMs);

      const response = await groqLightToolCall(messages, CLASSIFICATION_TOOLS, {
        model: config.groq?.lightModel || 'gpt-oss-20b',
        temperature: 0.0,
        max_tokens: 512,
        tool_choice: { type: 'function', function: { name: 'classify_intent' } },
      });

      clearTimeout(timeoutId);

      const toolCall = response.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        logger.warn('[Classifier] No tool call returned, falling back to heuristic');
        return heuristicClassify(message);
      }

      const classification = JSON.parse(toolCall.function.arguments);
      const latencyMs = Date.now() - startTime;

      logger.info(`[Classifier] Route: ${classification.route} | Confidence: ${classification.confidence} | Latency: ${latencyMs}ms`);

      return {
        ...classification,
        classifier: 'llm',
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      logger.warn(`[Classifier] LLM classification failed (${latencyMs}ms): ${err.message}. Falling back to heuristic.`);
      return heuristicClassify(message);
    }
  },

  /**
   * Batch classify multiple messages (for pre-routing or analytics).
   * @param {string[]} messages
   * @returns {Promise<Array>}
   */
  async classifyBatch(messages) {
    return Promise.all(messages.map(msg => this.classify(msg)));
  },
};

export default IntentClassifier;
