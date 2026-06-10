import { logger } from '../../../shared/logger.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainExecution from './langchain-execution.model.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { ragService } from '../llamaindex/llamaindex.service.js';
import ApiError from '../../../errors/ApiError.js';

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
 * @throws {ApiError} If execution fails or an unsupported chain step type is encountered.
 */
const executeSingleStep = async (step, scope, userId) => {
  const stepStart = Date.now();
  let stepInput = {};
  let stepOutput = null;
  let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  try {
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
        const promptSourceKey = step.config.promptSource;
        const rawPromptText = (typeof promptSourceKey === 'string' && promptSourceKey.length > 0 && scope[promptSourceKey] !== undefined)
          ? scope[promptSourceKey]
          : step.config.systemPrompt || '';
        const promptText = typeof rawPromptText === 'string' ? rawPromptText : (typeof rawPromptText === 'object' ? JSON.stringify(rawPromptText) : String(rawPromptText));
        const temperature = step.config.temperature ?? 0.7;
        const maxOutputTokens = step.config.maxOutputTokens ?? 1024;
        const modelName = step.config.model || 'gemini-2.5-flash';

        stepInput = { promptText: promptText.substring(0, 200) + '...', modelName, temperature };

        let result;
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            generationConfig: { temperature, maxOutputTokens },
          });
        } catch (llmErr) {
          throw new ApiError(502, `LLM generation failed: ${llmErr.message}`, llmErr.stack);
        }

        const responseText = result.response.text();
        stepOutput = responseText;
        scope[step.name] = responseText;

        const usage = result.response.usageMetadata || {};
        const promptTokens = usage.promptTokenCount || Math.ceil(promptText.length / 4);
        const completionTokens = usage.candidatesTokenCount || Math.ceil(responseText.length / 4);
        tokenUsage = {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        };
        break;
      }

      case 'parser': {
        const sourceVariableKey = step.config.sourceVariable;
        const sourceText = (typeof sourceVariableKey === 'string' && sourceVariableKey.length > 0 && scope[sourceVariableKey] !== undefined)
          ? scope[sourceVariableKey]
          : '';
        stepInput = { sourceVariable: step.config.sourceVariable };

        let cleanText = typeof sourceText === 'string' ? sourceText.trim() : (typeof sourceText === 'object' ? JSON.stringify(sourceText) : String(sourceText).trim());
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
        }

        try {
          const parsed = JSON.parse(cleanText);
          stepOutput = parsed;
          scope[step.name] = parsed;
        } catch {
          const extracted = {};
          const fieldRegexes = {};
          for (const f of (step.config.expectedFields || [])) {
            fieldRegexes[f] = new RegExp(`"${f}"\\s*:\\s*"([^"]+)"`, 'i');
          }

          for (const f of (step.config.expectedFields || [])) {
            const regex = fieldRegexes[f];
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

        let context;
        try {
          context = await ragService.queryDocument(queryText, userId);
        } catch (ragErr) {
          throw new ApiError(500, `RAG retrieval failed: ${ragErr.message}`, ragErr.stack);
        }
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
        throw new ApiError(400, `Unsupported chain step type: ${step.type}`);
    }
  } catch (err) {
    const normalizedErr = err instanceof ApiError ? err : new ApiError(500, `Step [${step.name}] execution failed: ${err.message}`, err.stack);
    logger.error(`executeSingleStep failed for step [${step.name}]:`, {
      message: normalizedErr.message,
      stack: normalizedErr.stack,
      stepName: step.name,
      stepType: step.type
    });
    throw normalizedErr;
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
 * @returns {Promise<void>} A promise that resolves when the chain execution is complete or an error occurs.
 */
const streamChainExecution = async (chainId, inputs, userId, emit) => {
  const tStart = Date.now();
  let execution;

  try {
    const chain = await LangchainChain.findById(chainId).lean();
    if (!chain) {
      const notFoundError = new ApiError(404, `Chain not found: ${chainId}`);
      logger.error(`StreamChain execution failed: Chain not found`, { chainId });
      emit({ event: 'error', message: notFoundError.message });
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
          stepType: result.stepType,
          durationMs: result.durationMs,
          tokenUsage: result.tokenUsage,
          outputPreview: typeof result.output === 'string'
            ? result.output.substring(0, 500)
            : JSON.stringify(result.output).substring(0, 500),
          progress: Math.round((stepNumber / totalSteps) * 100),
        });
      } catch (stepErr) {
        success = false;
        const normalizedErr = stepErr instanceof ApiError ? stepErr : new ApiError(500, stepErr.message, stepErr.stack);
        errorMsg = normalizedErr.message;
        
        logger.error(`StreamChain: step [${step.name}] failed:`, {
          message: normalizedErr.message,
          stack: normalizedErr.stack,
          stepName: step.name,
          stepType: step.type,
          chainId
        });

        stepsExecution.push({
          stepName: step.name,
          stepType: step.type,
          durationMs: 0,
          status: 'failed',
          error: normalizedErr.message,
        });

        emit({
          event: 'step_error',
          stepNumber,
          totalSteps,
          stepName: step.name,
          stepType: step.type,
          error: normalizedErr.message,
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
    const apiError = err instanceof ApiError ? err : new ApiError(500, err.message || 'An unexpected error occurred during chain execution', err.stack);
    logger.error(`StreamChain execution failed:`, {
      message: apiError.message,
      stack: apiError.stack,
      chainId,
      userId
    });
    
    emit({ event: 'error', message: apiError.message });
    
    if (execution) {
      try {
        execution.status = 'failed';
        await execution.save();
      } catch (saveErr) {
        logger.error(`Failed to save failed execution state:`, {
          message: saveErr.message,
          stack: saveErr.stack
        });
      }
    }
  }
};

/**
 * Service object for streaming Langchain chain executions.
 * Provides methods to execute chains step-by-step and emit progress via Server-Sent Events.
 * @type {Object}
 */
export const langchainStreamService = {
  streamChainExecution,
};