import { logger } from '../../../shared/logger.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainExecution from './langchain-execution.model.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { ragService } from '../llamaindex/llamaindex.service.js';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key || 'mock-key');

// ── Helpers shared from langchainExecution.service.js ────────────────────────

const extractVariables = (template) => {
  const matches = template.match(/\{[a-zA-Z0-9_]+\}/g);
  return matches ? matches.map((m) => m.slice(1, -1)) : [];
};

const formatPrompt = (template, scope) => {
  let result = template;
  for (const v of extractVariables(template)) {
    const val = scope[v] !== undefined ? scope[v] : '';
    const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
    result = result.replace(new RegExp(`\\{${v}\\}`, 'g'), valStr);
  }
  return result;
};

/**
 * Executes a single chain step and returns its result.
 * @private
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
      const promptText = scope[step.config.promptSource || ''] || step.config.systemPrompt || '';
      const temperature = step.config.temperature ?? 0.7;
      const maxOutputTokens = step.config.maxOutputTokens ?? 1024;
      const modelName = step.config.model || 'gemini-3.5-flash';

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
      tokenUsage = {
        promptTokens: usage.promptTokenCount || Math.ceil(promptText.length / 4),
        completionTokens: usage.candidatesTokenCount || Math.ceil(responseText.length / 4),
        totalTokens: (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0),
      };
      break;
    }

    case 'parser': {
      const sourceText = scope[step.config.sourceVariable || ''] || '';
      stepInput = { sourceVariable: step.config.sourceVariable };

      let cleanText = sourceText.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
      }

      try {
        const parsed = JSON.parse(cleanText);
        stepOutput = parsed;
        scope[step.name] = parsed;
      } catch {
        const extracted = {};
        for (const f of (step.config.expectedFields || [])) {
          const regex = new RegExp(`"${f}"\\s*:\\s*"([^"]+)"`, 'i');
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
 * Execute a chain step-by-step, emitting an SSE event after each step completes.
 *
 * @param {string} chainId - The chain to execute
 * @param {Object} inputs - Input variables
 * @param {string} userId - User performing the execution
 * @param {Function} emit - Callback `(data: Object) => void` called after each step
 */
const streamChainExecution = async (chainId, inputs, userId, emit) => {
  const tStart = Date.now();

  const chain = await LangchainChain.findById(chainId);
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

  const execution = new LangchainExecution({
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
};

export const langchainStreamService = {
  streamChainExecution,
};
