import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import httpStatus from 'http-status';
import fs from 'fs';
import path from 'path';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../core/ApiError.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainExecution from './langchain-execution.model.js';
import { ragService } from '../llamaindex/llamaindex.service.js';

/**
 * Google Vertex AI client instance initialized with project and location.
 * This uses the enterprise-grade SDK for Google Cloud.
 * @private
 */
const vertex_ai = new VertexAI({
  project: config.gcp_project_id || process.env.GCP_PROJECT_ID,
  location: config.gcp_location || process.env.GCP_LOCATION,
});

/**
 * Parses variable names enclosed in curly braces {varName} from a template string.
 * @private
 * @param {string} template - The template string to parse.
 * @returns {string[]} An array of extracted variable names, without the curly braces.
 */
const extractVariables = (template) => {
  // This is a simple string operation, no error handling needed.
  const matches = template.match(/\{[a-zA-Z0-9_]+\}/g);
  return matches ? matches.map((m) => m.slice(1, -1)) : [];
};

/**
 * Replaces {varName} placeholders in a template string with actual values from a scope object.
 * @private
 * @param {string} template - The template string with placeholders.
 * @param {Object<string, any>} scope - An object containing key-value pairs for substitution.
 * @returns {string} The formatted string with all placeholders replaced.
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
 * Masks common PII patterns (email, phone) in a given text.
 * This is a critical security step before sending data to an external LLM.
 * @private
 * @param {string} text - The text to be sanitized.
 * @returns {string} The text with PII masked.
 */
const maskPII = (text) => {
  if (!text) return '';
  // Mask email addresses
  let sanitizedText = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');
  // Mask phone numbers (basic North American and international formats)
  sanitizedText = sanitizedText.replace(/(\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g, '[PHONE_REDACTED]');
  return sanitizedText;
};

/**
 * Executes a step-by-step pipeline (chain) configuration. This is the core execution engine.
 * It iterates through a series of defined steps, manages a shared state (`scope`),
 * and records detailed telemetry for each step.
 * @private
 * @param {Array<Object>} steps - The array of step configuration objects from a `LangchainChain`.
 * @param {Object<string, any>} inputs - The initial input values for the execution.
 * @param {string} userId - The ID of the user executing the chain. This provides a multi-tenant context,
 * particularly for steps like 'retriever' that access user-specific data.
 * @returns {Promise<Object>} A promise that resolves to an object containing the execution results.
 * @property {boolean} success - Indicates if all steps completed successfully.
 * @property {string|null} error - The error message if the execution failed.
 * @property {Array<Object>} stepsExecution - An array of detailed records for each step's execution.
 * @property {Object<string, any>} outputs - The final state of the `scope` object, containing all generated values.
 * @property {Object} tokenUsage - An object detailing the token consumption.
 * @property {number} tokenUsage.promptTokens - Total prompt tokens used.
 * @property {number} tokenUsage.completionTokens - Total completion tokens used.
 * @property {number} tokenUsage.totalTokens - Sum of prompt and completion tokens.
 * @throws {ApiError} Throws an `ApiError` for unsupported step types.
 * @throws {Error} Throws a generic `Error` for failures within a step (e.g., LLM API failure), which is then caught and processed.
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
          const modelName = step.config.model || 'gemini-1.5-flash-001'; // Updated to a common Vertex AI model name

          // PII Masking: Sanitize the prompt before sending it to the model.
          const sanitizedPromptText = maskPII(promptText);
          stepInput = { promptText: sanitizedPromptText, modelName, temperature }; // Log the sanitized input

          // Configure the generative model with the enterprise Vertex AI SDK
          const generativeModel = vertex_ai.getGenerativeModel({
            model: modelName,
            // Safety settings are crucial for enterprise applications to filter harmful content.
            safetySettings: [
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
              },
            ],
            generationConfig: {
              maxOutputTokens: maxOutputTokens,
              temperature: temperature,
            },
          });

          const result = await generativeModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: sanitizedPromptText }] }],
          });

          const response = result.response;
          // Defensive check for the Vertex AI SDK response structure.
          if (!response || !response.candidates || response.candidates.length === 0) {
            throw new Error('Invalid or empty response structure from Vertex AI LLM API.');
          }

          // Check for safety blocks and provide a more informative error.
          if (response.candidates[0].finishReason === 'SAFETY') {
            logger.warn(`LLM call blocked due to safety settings. Reason: ${response.candidates[0].finishReason}`);
            throw new Error('Content generation blocked by safety filters.');
          }

          if (!response.candidates[0].content?.parts[0]?.text) {
            throw new Error('Invalid or empty response content from Vertex AI LLM API.');
          }
          const responseText = response.candidates[0].content.parts[0].text;

          stepOutput = responseText;
          scope[step.name] = responseText;

          // Extract token usage from the Vertex AI SDK response structure.
          const usage = response.usageMetadata || {};
          totalPromptTokens += usage.promptTokenCount || 0;
          totalCompletionTokens += usage.candidatesTokenCount || 0;
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
 * Orchestrates the full execution of a Langchain chain. It finds the chain definition,
 * creates and updates the execution record in the database, invokes the step executor,
 * and manages top-level error handling and logging.
 * @param {string} chainId - The MongoDB ObjectId of the `LangchainChain` to execute.
 * @param {Object<string, any>} inputs - The initial input data for the chain.
 * @param {string} userId - The ID of the user initiating the execution. This is crucial for
 * multi-tenancy, as it scopes data access and records ownership of the execution.
 * @returns {Promise<import('./langchain-execution.model.js').LangchainExecution>} A promise that resolves to the saved `LangchainExecution` Mongoose document.
 * @throws {ApiError} Throws an `ApiError` if the chain is not found, or if an internal error occurs during execution.
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

/**
 * Service object containing methods for executing and managing Langchain chains.
 * @namespace LangchainExecutionService
 * @exports LangchainExecutionService
 */
export const LangchainExecutionService = {
  executeChain,
  executeSteps,
};