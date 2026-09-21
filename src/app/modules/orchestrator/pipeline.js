import { logger } from '../../../shared/logger.js';
import { ROUTE_TYPES } from './classifier.js';

// Dynamic strategy imports (lazy-loaded on first use)
const strategyCache = new Map();

/**
 * Lazily loads and caches a strategy module.
 * @param {string} route - One of ROUTE_TYPES
 * @returns {Promise<{ execute: Function }>}
 */
async function getStrategy(route) {
  if (strategyCache.has(route)) return strategyCache.get(route);

  const strategyMap = {
    [ROUTE_TYPES.CHAT]: './strategies/chatStrategy.js',
    [ROUTE_TYPES.SEARCH]: './strategies/searchStrategy.js',
    [ROUTE_TYPES.RESEARCH]: './strategies/researchStrategy.js',
    [ROUTE_TYPES.TOOL_CALL]: './strategies/toolStrategy.js',
    [ROUTE_TYPES.CODE]: './strategies/codeStrategy.js',
    [ROUTE_TYPES.AGENT]: './strategies/agentStrategy.js',
    [ROUTE_TYPES.WORKFLOW]: './strategies/workflowStrategy.js',
    [ROUTE_TYPES.REASONING]: './strategies/reasoningStrategy.js',
    [ROUTE_TYPES.RAG]: './strategies/ragStrategy.js',
    [ROUTE_TYPES.MULTI_STEP]: './strategies/multiStepStrategy.js',
  };

  const modulePath = strategyMap[route];
  if (!modulePath) {
    throw new Error(`Unknown route type: ${route}`);
  }

  const mod = await import(modulePath);
  strategyCache.set(route, mod);
  return mod;
}

/**
 * Executes a single routing step.
 * @param {{ route: string, params: object }} step
 * @param {object} context - Shared execution context
 * @returns {Promise<object>} Step result
 */
async function executeStep(step, context = {}) {
  const startTime = Date.now();
  const strategy = await getStrategy(step.route);

  try {
    const result = await strategy.execute(step.params || {}, context);
    const durationMs = Date.now() - startTime;

    logger.info(`[Pipeline] Step ${step.route} completed in ${durationMs}ms`);

    return {
      ...result,
      route: step.route,
      durationMs,
      success: true,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    logger.error(`[Pipeline] Step ${step.route} failed after ${durationMs}ms: ${err.message}`);

    return {
      route: step.route,
      durationMs,
      success: false,
      error: err.message,
    };
  }
}

/**
 * Pipeline Executor — chains multiple strategy executions.
 *
 * Supports:
 * - Sequential execution (each step's result feeds into the next as context)
 * - Parallel fan-out (independent steps run concurrently)
 * - Circuit breaking (stop pipeline on critical failure)
 * - Execution trace logging
 */
export const PipelineExecutor = {
  /**
   * Execute a single route strategy.
   * @param {string} route - Route type (CHAT, SEARCH, etc.)
   * @param {object} params - Route-specific parameters
   * @param {object} context - Shared context
   * @returns {Promise<object>}
   */
  async executeSingle(route, params, context = {}) {
    return executeStep({ route, params }, context);
  },

  /**
   * Execute a sequential pipeline of steps.
   * Each step receives the previous step's result as `context.previousResult`.
   * @param {Array<{ route: string, params: object }>} steps
   * @param {object} context - Initial context
   * @param {object} options - { maxSteps, stopOnFailure }
   * @returns {Promise<{ steps: Array<object>, totalDurationMs: number }>}
   */
  async executeSequential(steps, context = {}, options = {}) {
    const { maxSteps = 5, stopOnFailure = true } = options;
    const pipelineStart = Date.now();
    const results = [];
    let currentContext = { ...context };

    const cappedSteps = steps.slice(0, maxSteps);

    for (let i = 0; i < cappedSteps.length; i++) {
      const step = cappedSteps[i];

      logger.info(`[Pipeline] Executing step ${i + 1}/${cappedSteps.length}: ${step.route}`);

      // Inject previous result into params if applicable
      if (results.length > 0) {
        const prevResult = results[results.length - 1];
        currentContext.previousResult = prevResult;

        // Auto-enrich params with previous step data
        if (prevResult.result && !step.params.context) {
          step.params.context = typeof prevResult.result === 'string'
            ? prevResult.result
            : JSON.stringify(prevResult.result);
        }
      }

      const result = await executeStep(step, currentContext);
      results.push(result);

      // Circuit breaker: stop on failure if configured
      if (!result.success && stopOnFailure) {
        logger.warn(`[Pipeline] Circuit breaker triggered at step ${i + 1}. Halting pipeline.`);
        break;
      }
    }

    return {
      steps: results,
      totalDurationMs: Date.now() - pipelineStart,
      completedSteps: results.length,
      totalSteps: cappedSteps.length,
      success: results.every(r => r.success),
    };
  },

  /**
   * Execute independent steps in parallel.
   * @param {Array<{ route: string, params: object }>} steps
   * @param {object} context
   * @returns {Promise<{ steps: Array<object>, totalDurationMs: number }>}
   */
  async executeParallel(steps, context = {}) {
    const pipelineStart = Date.now();

    const results = await Promise.allSettled(
      steps.map(step => executeStep(step, context))
    );

    const processedResults = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        route: steps[i].route,
        success: false,
        error: r.reason?.message || 'Unknown error',
        durationMs: 0,
      };
    });

    return {
      steps: processedResults,
      totalDurationMs: Date.now() - pipelineStart,
      completedSteps: processedResults.filter(r => r.success).length,
      totalSteps: steps.length,
      success: processedResults.every(r => r.success),
    };
  },
};

export default PipelineExecutor;
