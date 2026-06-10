import { GoogleGenerativeAI } from '@google/generative-ai';
import httpStatus from 'http-status';
import fs from 'fs';
import path from 'path';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../core/ApiError.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainExecution from './langchain-execution.model.js';
import { ragService } from '../llamaindex/llamaindex.service.js';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Parses variable names enclosed in curly braces {varName} and returns them.
 */
const extractVariables = (template) => {
  // This is a simple string operation, no error handling needed.
  const matches = template.match(/\{[a-zA-Z0-9_]+\}/g);
  return matches ? matches.map((m) => m.slice(1, -1)) : [];
};

/**
 * Replaces {varName} in template string with actual values from scope.
 */
const formatPrompt = (template, scope) => {
  // This is a simple string operation, no error handling needed.
  let result = template;
  const vars = extractVariables(template);
  for (const v of vars) {
    const val = scope[v] !== undefined ? scope[v] : '';
    const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
    result = result.replace(new RegExp(`\\{${v}\\}`, 'g'), valStr);
  }
  return result;
};

/**
 * Executes a step-by-step pipeline configuration.
 */
const executeSteps = async (steps, inputs, userId) => {
  const scope = { ...inputs };
  const stepsExecution = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let success = true;
  let errorMsg = null;

  for (const step of steps) {
    const stepStart = Date.now();
    let stepInput = {};
    let stepOutput = null;
    let stepStatus = 'success';
    let stepError = null;

    try {
      switch (step.type) {
        case 'prompt': {
          const template = step.config.template || '';
          stepInput = { template, scope };
          const rendered = formatPrompt(template, scope);
          stepOutput = rendered;
          scope[step.name] = rendered;
          break;
        }

        case 'llm': {
          const promptText = scope[step.config.promptSource || ''] || step.config.systemPrompt || '';
          const temperature = step.config.temperature ?? 0.7;
          const maxOutputTokens = step.config.maxOutputTokens ?? 1024;
          const modelName = step.config.model || 'gemini-2.5-flash';

          stepInput = { promptText, modelName, temperature };

          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            generationConfig: {
              temperature,
              maxOutputTokens,
            },
          });

          const response = result.response;
          // Defensive check for response and text() method
          if (!response || typeof response.text !== 'function') {
            throw new Error('Invalid response structure from LLM API.');
          }
          const responseText = response.text();

          stepOutput = responseText;
          scope[step.name] = responseText;

          const usage = response.usageMetadata || {};
          totalPromptTokens += usage.promptTokenCount || Math.ceil(promptText.length / 4);
          totalCompletionTokens += usage.candidatesTokenCount || Math.ceil(responseText.length / 4);
          break;
        }

        case 'parser': {
          const sourceText = scope[step.config.sourceVariable || ''] || '';
          stepInput = { sourceText };

          let cleanText = sourceText.trim();
          if (cleanText.startsWith('```')) {
            cleanText = cleanText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
          }

          try {
            const parsed = JSON.parse(cleanText);
            stepOutput = parsed;
            scope[step.name] = parsed;
          } catch (err) {
            // This is a common, expected failure, so a warning is appropriate.
            // The fallback logic attempts to recover, which is good practice.
            logger.warn(`JSON parser failed, attempting key extraction: ${err.message}`);
            const extracted = {};
            const fields = step.config.expectedFields || [];
            for (const f of fields) {
              const regex = new RegExp(`"${f}"\\s*:\\s*"([^"]+)"`, 'i');
              const match = cleanText.match(regex);
              if (match) {
                extracted[f] = match[1];
              }
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
          if (operator === 'equals') {
            branchMatch = String(currentValue) === String(targetValue);
          } else if (operator === 'contains') {
            branchMatch = String(currentValue).includes(String(targetValue));
          } else if (operator === 'greaterThan') {
            branchMatch = Number(currentValue) > Number(targetValue);
          }

          stepOutput = { match: branchMatch };
          scope[step.name] = stepOutput;

          if (branchMatch && step.config.thenSteps) {
            for (const subStep of step.config.thenSteps) {
              const subStart = Date.now();
              const renderedSub = formatPrompt(subStep.template || '', scope);
              scope[subStep.name] = renderedSub;
              stepsExecution.push({
                stepName: `${step.name}_then_${subStep.name}`,
                stepType: 'prompt',
                input: subStep,
                output: renderedSub,
                durationMs: Date.now() - subStart,
                status: 'success',
              });
            }
          }
          break;
        }

        default:
          // Use ApiError for configuration issues.
          throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported chain step type: ${step.type}`);
      }
    } catch (stepErr) {
      stepStatus = 'failed';
      stepError = stepErr.message;
      success = false;
      errorMsg = stepErr.message;
      // Log with context and the full error object for stack trace.
      logger.error(`Chain step [${step.name}] of type [${step.type}] failed.`, stepErr);
      // Re-throw to be caught by the calling function (executeChain) to halt execution.
      throw stepErr;
    } finally {
      // This block ensures that a record of the step is always created, even on failure.
      stepsExecution.push({
        stepName: step.name,
        stepType: step.type,
        input: stepInput,
        output: stepOutput,
        durationMs: Date.now() - stepStart,
        status: stepStatus,
        error: stepError,
      });
    }
  }

  return {
    success,
    error: errorMsg,
    stepsExecution,
    outputs: scope,
    tokenUsage: {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    },
  };
};

/**
 * Executes a custom chain pipeline step-by-step.
 */
const executeChain = async (chainId, inputs, userId) => {
  const tStart = Date.now();
  let execution; // Hoist execution document to be accessible in the final catch block.

  try {
    // Optimization: Use .lean() for read-only queries to improve performance
    // by returning plain JavaScript objects instead of Mongoose documents,
    // avoiding the overhead of Mongoose change tracking.
    const chain = await LangchainChain.findById(chainId).lean();
    if (!chain) {
      // Use a specific ApiError for known failure cases like "not found".
      throw new ApiError(httpStatus.NOT_FOUND, `LangChain chain not found: ${chainId}`);
    }

    // Create the initial execution record.
    execution = new LangchainExecution({
      chainId,
      userId,
      inputs,
      status: 'running',
    });
    await execution.save();

    try {
      // This inner try/catch handles failures during the step execution phase,
      // allowing us to update the execution record to a 'failed' state.
      const runResult = await executeSteps(chain.steps, inputs, userId);

      const duration = Date.now() - tStart;
      execution.status = 'success';
      execution.stepsExecution = runResult.stepsExecution;
      execution.outputs = runResult.outputs;
      execution.totalDurationMs = duration;
      execution.tokenUsage = runResult.tokenUsage;

      // GCS log backup simulator
      const backupDir = path.resolve('storage/ragsystem/telemetry');
      // Synchronous file operations can throw errors, which are caught by the outer try/catch.
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const logFilePath = path.join(backupDir, `lcel_execution_${execution._id}.json`);
      fs.writeFileSync(logFilePath, JSON.stringify(execution.toJSON(), null, 2));
      execution.gcsLogUri = `gs://${config.gcs?.presentation_bucket || 'alti_assistant_presentation'}/lcel_logs/lcel_execution_${execution._id}.json`;

      await execution.save();
      return execution;
    } catch (chainErr) {
      // This block catches errors from executeSteps.
      const duration = Date.now() - tStart;
      if (execution) {
        execution.status = 'failed';
        execution.totalDurationMs = duration;
        // The specific step error is already logged inside executeSteps.
        // We must wrap this save operation in its own try/catch, as a DB failure
        // here would create an unhandled promise rejection inside a catch block.
        try {
          await execution.save();
        } catch (saveErr) {
          logger.error(
            `CRITICAL: Failed to save FAILED execution state for chainId ${chainId}, executionId ${execution._id}.`,
            saveErr
          );
        }
      }
      // Re-throw the original error to be caught by the main handler below.
      throw chainErr;
    }
  } catch (error) {
    // This is the main catch block for the entire service function.
    // It handles DB errors, configuration errors, and errors re-thrown from the inner block.
    logger.error(`Failed to execute chain ${chainId} for user ${userId}.`, {
      // Log rich context for debugging.
      error: { message: error.message, stack: error.stack },
      chainId,
      userId,
      inputs,
      executionId: execution?._id, // Log execution ID if available.
    });

    // Normalize the error before it propagates to the API response layer.
    // If it's already a structured ApiError, pass it along.
    if (error instanceof ApiError) {
      throw error;
    }
    // Otherwise, wrap it in a generic internal server error to avoid leaking implementation details.
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An internal error occurred during chain execution.',
      true,
      error.stack
    );
  }
};

export const LangchainExecutionService = {
  executeChain,
  executeSteps,
};