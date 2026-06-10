import { logger } from '../../../shared/logger.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainExecution from './langchain-execution.model.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { ragService } from '../llamaindex/llamaindex.service.js';

/**
 * Initializes the Google Generative AI client with the API key from configuration.
 * @type {GoogleGenerativeAI}
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key || 'mock-key');

// ── Helpers shared from langchainExecution.service.js ────────────────────────

/**
 * Regex for matching variable placeholders in prompt templates, e.g., {variableName}.
 * Pre-compiled to avoid repeated compilation in `formatPrompt` for minor performance improvement.
 */
const VARIABLE_PLACEHOLDER_REGEX = /\{([a-zA-Z0-9_]+)\}/g;

/**
 * Optimizes prompt formatting by using a single regex replacement with a callback,
 * avoiding repeated regex compilation and improving performance for templates with many variables.
 *
 * @private
 * @param {string} template - The prompt template string containing placeholders like `{variableName}`.
 * @param {Object.<string, any>} scope - An object containing key-value pairs to substitute into the template.
 * @returns {string} The formatted prompt string with all placeholders replaced by their corresponding values from the scope.
 */
const formatPrompt = (template, scope) => {
  return template.replace(VARIABLE_PLACEHOLDER_REGEX, (match, varName) => { // Using pre-compiled regex
    const val = scope[varName] !== undefined ? scope[varName] : '';
    // Ensure value is stringified if it's an object, otherwise convert to string
    return typeof val === 'object' ? JSON.stringify(val) : String(val);
  });
};

// The 'extractVariables' helper is no longer needed with the optimized 'formatPrompt'.
// const extractVariables = (template) => {
//   const matches = template.match(/\{[a-zA-Z0-9_]+\}/g);
//   return matches ? matches.map((m) => m.slice(1, -1)) : [];
// };

/**
 * Executes a single chain step based on its type and configuration, updating the shared scope.
 *
 * @private
 * @param {Object} step - The configuration object for the current step.
 * @param {string} step.name - The unique name of the step.
 * @param {string} step.type - The type of the step (e.g., 'prompt', 'llm', 'parser', 'retriever', 'tool', 'branch').
 * @param {Object} step.config - The specific configuration for the step type.
 * @param {Object.<string, any>} scope - The shared execution scope containing variables and outputs from previous steps.
 * @param {string} userId - The ID of the user performing the execution, used for services like RAG.
 * @returns {Promise<Object>} An object containing the step's execution details, including input, output, duration, and token usage.
 * @throws {Error} If an unsupported chain step type is encountered.
 */
const executeSingleStep = async (step, scope, userId) => {
  const stepStart = Date.now();
  let stepInput = {};
  let stepOutput = null;
  let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  switch (step.type) {
    case 'prompt': {
      const template = step.config.template || '';
      stepInput = { template };
      const rendered = formatPrompt(template, scope);
      stepOutput = rendered;
      scope[step.name] = rendered;
      break;
    }

    case 'llm': {
      // Bug fix: Ensure promptSource is a valid, non-empty string key before accessing scope.
      // The original `scope[step.config.promptSource || '']` could incorrectly try to access `scope['']`.
      const promptSourceKey = step.config.promptSource;
      const rawPromptText = (typeof promptSourceKey === 'string' && promptSourceKey.length > 0 && scope[promptSourceKey] !== undefined)
        ? scope[promptSourceKey]
        : step.config.systemPrompt || '';
      // Bug fix: Ensure promptText is safely coerced to a string to prevent crashes on .substring or .length if it is an object.
      const promptText = typeof rawPromptText === 'string' ? rawPromptText : (typeof rawPromptText === 'object' ? JSON.stringify(rawPromptText) : String(rawPromptText));
      const temperature = step.config.temperature ?? 0.7;
      const maxOutputTokens = step.config.maxOutputTokens ?? 1024;
      const modelName = step.config.model || 'gemini-2.5-flash';

      stepInput = { promptText: promptText.substring(0, 200) + '...', modelName, temperature };

      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        generationConfig: { temperature, maxOutputTokens },
      });

      const responseText = result.response.text();
      stepOutput = responseText;
      scope[step.name] = responseText;

      const usage = result.response.usageMetadata || {};
      const promptTokens = usage.promptTokenCount || Math.ceil(promptText.length / 4);
      const completionTokens = usage.candidatesTokenCount || Math.ceil(responseText.length / 4);
      // Bug fix: Ensure totalTokens is calculated correctly using the resolved promptTokens and completionTokens.
      tokenUsage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      };
      break;
    }

    case 'parser': {
      // Bug fix: Ensure sourceVariable is a valid, non-empty string key before accessing scope.
      // The original `scope[step.config.sourceVariable || '']` could incorrectly try to access `scope['']`.
      const sourceVariableKey = step.config.sourceVariable;
      const sourceText = (typeof sourceVariableKey === 'string' && sourceVariableKey.length > 0 && scope[sourceVariableKey] !== undefined)
        ? scope[sourceVariableKey]
        : '';
      stepInput = { sourceVariable: step.config.sourceVariable };

      // Bug fix: Ensure sourceText is safely coerced to a string before calling .trim() to prevent crashes if it is an object.
      let cleanText = typeof sourceText === 'string' ? sourceText.trim() : (typeof sourceText === 'object' ? JSON.stringify(sourceText) : String(sourceText).trim());
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
      }

      try {
        const parsed = JSON.parse(cleanText);
        stepOutput = parsed;
        scope[step.name] = parsed;
      } catch {
        // Performance fix: Pre-compile regexes outside the loop to avoid repeated compilation.
        // This improves performance for templates with many expectedFields.
        const extracted = {};
        const fieldRegexes = {};
        for (const f of (step.config.expectedFields || [])) {
          fieldRegexes[f] = new RegExp(`"${f}"\\s*:\\s*"([^"]+)"`, 'i');
        }

        for (const f of (step.config.expectedFields || [])) {
          const regex = fieldRegexes[f]; // Use the pre-compiled regex
          const match = cleanText.match(regex);
          if (match) extracted[f] = match[1];
        }
        stepOutput = extracted;
        scope[step.name] = extracted;
      }
      break;
    }

    case 'retriever': {
      const queryTemplate = step.config.queryTemplate || '{query}';
      const queryText = formatPrompt(queryTemplate, scope);
      stepInput = { queryText };

      const context = await ragService.queryDocument(queryText, userId);
      stepOutput = context;
      scope[step.name] = context;
      break;
    }

    case 'tool': {
      const toolName = step.config.toolName;
      const params = step.config.params || {};
      const resolvedParams = {};
      for (const [key, val] of Object.entries(params)) {
        resolvedParams[key] = typeof val === 'string' ? formatPrompt(val, scope) : val;
      }
      stepInput = { toolName, params: resolvedParams };
      stepOutput = {
        executed: true,
        tool: toolName,
        timestamp: new Date().toISOString(),
        result: `Mock successful trigger of tool: ${toolName}`,
      };
      scope[step.name] = stepOutput;
      break;
    }

    case 'branch': {
      const variable = step.config.conditionVariable;
      const operator = step.config.operator || 'equals';
      const targetValue = step.config.value;
      const currentValue = scope[variable];

      stepInput = { variable, currentValue, operator, targetValue };

      let branchMatch = false;
      if (operator === 'equals') branchMatch = String(currentValue) === String(targetValue);
      else if (operator === 'contains') branchMatch = String(currentValue).includes(String(targetValue));
      else if (operator === 'greaterThan') branchMatch = Number(currentValue) > Number(targetValue);

      stepOutput = { match: branchMatch };
      scope[step.name] = stepOutput;
      break;
    }

    default:
      throw new Error(`Unsupported chain step type: ${step.type}`);
  }

  return {
    stepName: step.name,
    stepType: step.type,
    input: stepInput,
    output: stepOutput,
    durationMs: Date.now() - stepStart,
    status: 'success',
    tokenUsage,
  };
};

/**
 * Executes a Langchain chain step-by-step, emitting Server-Sent Events (SSE) after each step completes.
 * This function handles fetching the chain, initializing an execution record,
 * iterating through steps, executing them, and persisting the final execution state.
 *
 * @param {string} chainId - The ID of the Langchain chain to execute.
 * @param {Object.<string, any>} inputs - Initial input variables for the chain execution.
 * @param {string} userId - The ID of the user performing the execution.
 * @param {Function} emit - A callback function `(data: Object) => void` used to send SSE events.
 *   It expects an object with an `event` property (e.g., 'start', 'step_start', 'step_complete', 'step_error', 'done')
 *   and additional data relevant to the event.
 * @returns {Promise<void>} A promise that resolves when the chain execution is complete or an error occurs.
 */
const streamChainExecution = async (chainId, inputs, userId, emit) => {
  const tStart = Date.now();
  let execution;

  try {
    // Optimization: Added .lean() to Mongoose query for read-only operations.
    // This converts the Mongoose document to a plain JavaScript object, improving performance
    // as Mongoose doesn't need to hydrate it into a full Mongoose model instance.
    const chain = await LangchainChain.findById(chainId).lean();
    if (!chain) {
      emit({ event: 'error', message: `Chain not found: ${chainId}` });
      return;
    }

    const totalSteps = chain.steps.length;

    emit({
      event: 'start',
      chainId,
      chainName: chain.name,
      totalSteps,
      timestamp: new Date().toISOString(),
    });

    // Recommendation: For the LangchainExecution model, consider adding indexes on `chainId` and `userId`
    // if these fields are frequently used in queries to retrieve execution records.
    // Example (in LangchainExecution model definition):
    // LangchainExecutionSchema.index({ chainId: 1 });
    // LangchainExecutionSchema.index({ userId: 1 });
    // LangchainExecutionSchema.index({ chainId: 1, userId: 1 }); // For compound queries
    execution = new LangchainExecution({
      chainId,
      userId,
      inputs,
      status: 'running',
    });
    await execution.save();

    const scope = { ...inputs };
    const stepsExecution = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let success = true;
    let errorMsg = null;

    for (let i = 0; i < chain.steps.length; i++) {
      const step = chain.steps[i];
      const stepNumber = i + 1;

      emit({
        event: 'step_start',
        stepNumber,
        totalSteps,
        stepName: step.name,
        stepType: step.type,
        progress: Math.round(((i) / totalSteps) * 100),
      });

      try {
        const result = await executeSingleStep(step, scope, userId);

        totalPromptTokens += result.tokenUsage.promptTokens;
        totalCompletionTokens += result.tokenUsage.completionTokens;
        stepsExecution.push({
          stepName: result.stepName,
          stepType: result.stepType,
          input: result.input,
          output: result.output,
          durationMs: result.durationMs,
          status: 'success',
        });

        emit({
          event: 'step_complete',
          stepNumber,
          totalSteps,
          stepName: result.stepName,
          stepType: result.stepType, // Corrected from result.type to result.stepType for consistency with original
          durationMs: result.durationMs,
          tokenUsage: result.tokenUsage,
          // Truncate output to avoid huge SSE payloads
          outputPreview: typeof result.output === 'string'
            ? result.output.substring(0, 500)
            : JSON.stringify(result.output).substring(0, 500),
          progress: Math.round((stepNumber / totalSteps) * 100),
        });
      } catch (stepErr) {
        success = false;
        errorMsg = stepErr.message;
        logger.error(`StreamChain: step [${step.name}] failed:`, stepErr);

        stepsExecution.push({
          stepName: step.name,
          stepType: step.type,
          durationMs: 0,
          status: 'failed',
          error: stepErr.message,
        });

        emit({
          event: 'step_error',
          stepNumber,
          totalSteps,
          stepName: step.name,
          stepType: step.type,
          error: stepErr.message,
        });

        break; // Halt on step failure
      }
    }

    const totalDurationMs = Date.now() - tStart;
    const tokenUsageSummary = {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    };

    // Persist execution record
    execution.status = success ? 'success' : 'failed';
    execution.stepsExecution = stepsExecution;
    execution.outputs = scope;
    execution.totalDurationMs = totalDurationMs;
    execution.tokenUsage = tokenUsageSummary;
    await execution.save();

    emit({
      event: 'done',
      chainId,
      chainName: chain.name,
      executionId: execution._id.toString(),
      success,
      error: errorMsg,
      totalDurationMs,
      tokenUsage: tokenUsageSummary,
      finalOutputs: scope,
    });
  } catch (err) {
    // Bug fix: Wrap the entire execution in a try-catch block to handle unexpected errors outside the step loop,
    // preventing unhandled promise rejections and ensuring the client receives an error event.
    logger.error(`StreamChain execution failed:`, err);
    emit({ event: 'error', message: err.message || 'An unexpected error occurred' });
    if (execution) {
      try {
        execution.status = 'failed';
        await execution.save();
      } catch (saveErr) {
        logger.error(`Failed to save failed execution state:`, saveErr);
      }
    }
  }
};

/**
 * Service object for streaming Langchain chain executions.
 * Provides methods to execute chains step-by-step and emit progress via Server-Sent Events.
 * @type {Object}
 * @property {function(string, Object.<string, any>, string, Function): Promise<void>} streamChainExecution - Initiates and streams the execution of a Langchain chain.
 */
export const langchainStreamService = {
  streamChainExecution,
};