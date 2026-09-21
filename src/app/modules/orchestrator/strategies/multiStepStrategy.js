import { execute as chatStrategy } from './chatStrategy.js';
import { execute as searchStrategy } from './searchStrategy.js';
import { execute as researchStrategy } from './researchStrategy.js';
import { execute as toolStrategy } from './toolStrategy.js';
import { execute as codeStrategy } from './codeStrategy.js';
import { execute as agentStrategy } from './agentStrategy.js';
import { execute as workflowStrategy } from './workflowStrategy.js';
import { execute as reasoningStrategy } from './reasoningStrategy.js';
import { execute as ragStrategy } from './ragStrategy.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Execute multi-step strategy.
 * @param {Object} params
 * @param {Object} context
 */
export async function execute({ steps }, context = {}) {
  try {
    const results = [];
    let currentContext = { ...context };

    for (const step of steps) {
      let stepResult;
      const { route, params } = step;

      switch (route) {
        case 'CHAT':
          stepResult = await chatStrategy(params, currentContext);
          break;
        case 'SEARCH':
          stepResult = await searchStrategy(params, currentContext);
          break;
        case 'RESEARCH':
          stepResult = await researchStrategy(params, currentContext);
          break;
        case 'TOOL_CALL':
          stepResult = await toolStrategy(params, currentContext);
          break;
        case 'CODE':
          stepResult = await codeStrategy(params, currentContext);
          break;
        case 'AGENT':
          stepResult = await agentStrategy(params, currentContext);
          break;
        case 'WORKFLOW':
          stepResult = await workflowStrategy(params, currentContext);
          break;
        case 'REASONING':
          stepResult = await reasoningStrategy(params, currentContext);
          break;
        case 'RAG':
          stepResult = await ragStrategy(params, currentContext);
          break;
        default:
          throw new Error(`Unknown route: ${route}`);
      }

      results.push(stepResult);
      // Update context with the result of the previous step
      currentContext = { ...currentContext, previousResult: stepResult };
    }

    return { route: 'MULTI_STEP', steps: results };
  } catch (error) {
    logger.error('Error in multiStepStrategy', error);
    throw error;
  }
}
