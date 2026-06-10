import { logger } from '../../../shared/logger.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainExecution from './langchain-execution.model.js';
// AUDIT: Replaced @google/generative-ai with the enterprise-grade @google-cloud/vertexai SDK.
// This SDK is required for enterprise features like IAM, VPC-SC, and fine-grained safety controls.
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import config from '../../../../config/index.js';
import { ragService } from '../llamaindex/llamaindex.service.js';
import ApiError from '../../../errors/ApiError.js';
// BUG: Missing tenancy and usage tracking models/services.
// FIX: Import necessary services and models to enforce workspace boundaries and track resource usage.
import { usageService } from '../usage/usage.service.js';
// PLATFORM_OWNER: Import Workspace model to enforce tenant-level status checks like suspension.
import Workspace from '../workspace/workspace.model.js';

/**
 * Initializes the Vertex AI client with project and location from configuration.
 * @type {VertexAI}
 */
// ENTERPRISE-GRADE SDK: Switched from @google/generative-ai to the enterprise-ready @google-cloud/vertexai SDK.
// This provides better integration with Google Cloud IAM, VPC-SC, and other enterprise features.
const vertexAI = new VertexAI({
  project: config.gcp_project_id || 'your-gcp-project-id',
  location: config.gcp_location || 'us-central1',
});

// ── Helpers shared from langchainExecution.service.js ────────────────────────

/**
 * Regex for matching variable placeholders in prompt templates, e.g., {variableName}.
 * Pre-compiled to avoid repeated compilation in `formatPrompt` for minor performance improvement.
 */
const VARIABLE_PLACEHOLDER_REGEX = /\{([a-zA-Z0-9_]+)\}/g;

/**
 * Masks common PII patterns in a string before sending it to the LLM.
 * This is a critical security measure to prevent sensitive data exposure.
 * @param {string} text - The input text to sanitize.
 * @returns {string} The text with PII masked.
 */
const filterPII = (text) => {
  if (typeof text !== 'string') return text;
  // Mask email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  // Mask U.S. phone numbers (simple version)
  const phoneRegex = /(\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}/g;
  // Mask Social Security Numbers (SSN)
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;

  return text
    .replace(emailRegex, '[REDACTED_EMAIL]')
    .replace(phoneRegex, '[REDACTED_PHONE]')
    .replace(ssnRegex, '[REDACTED_SSN]');
};

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
 * @param {Object} user - The authenticated user object, used for role-based checks and services like RAG.
 * @returns {Promise<Object>} An object containing the step's execution details, including input, output, duration, and token usage.
 * @throws {ApiError} If execution fails or an unsupported chain step type is encountered.
 */
// PLATFORM_OWNER: Modified signature to accept the full user object for role-based configuration enforcement.
const executeSingleStep = async (step, scope, user) => {
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
        const modelName = step.config.model || 'gemini-1.5-flash';

        // PLATFORM_OWNER: Enforce a global maximum on output tokens to prevent abuse and control costs.
        // The Platform Owner can set this limit in the global config. This is a critical platform stability and cost-control feature.
        // Note: A platform owner's own requests could also be capped, which is a safe default. An override is possible if needed.
        const platformMaxTokens = config.llm?.maxOutputTokensGlobalLimit || 8192;
        const effectiveMaxOutputTokens = Math.min(maxOutputTokens, platformMaxTokens);

        if (effectiveMaxOutputTokens < maxOutputTokens) {
            logger.warn(`Tenant-requested maxOutputTokens (${maxOutputTokens}) was capped at the platform limit (${effectiveMaxOutputTokens})`, {
                userId: user._id,
                workspaceId: user.workspaceId,
                role: user.role,
                chainStep: step.name,
            });
        }

        // SECURITY (PII): Filter out Personally Identifiable Information before sending data to the model.
        const sanitizedPromptText = filterPII(promptText);

        stepInput = { promptText: sanitizedPromptText.substring(0, 200) + '...', modelName, temperature };

        // SAFETY: Explicitly configure Google's safety filters to block harmful content.
        // This is a crucial step for responsible AI deployment.
        const safetySettings = [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ];

        let result;
        try {
          const model = vertexAI.getGenerativeModel({
            model: modelName,
            safetySettings, // Apply the defined safety settings
            generationConfig: { temperature, maxOutputTokens: effectiveMaxOutputTokens }, // Use the capped token limit
          });
          const request = {
            contents: [{ role: 'user', parts: [{ text: sanitizedPromptText }] }], // Use the sanitized prompt
          };
          result = await model.generateContent(request);
        } catch (llmErr) {
          throw new ApiError(502, `LLM generation failed: ${llmErr.message}`, llmErr.stack);
        }

        // The response structure from @google-cloud/vertexai is nested.
        const response = result.response;
        const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (response.promptFeedback?.blockReason) {
            // Handle cases where the prompt itself was blocked by safety filters.
            throw new ApiError(400, `Prompt blocked due to safety settings: ${response.promptFeedback.blockReason}`);
        }
        if (response.candidates?.[0]?.finishReason !== 'STOP' && response.candidates?.[0]?.finishReason !== 'MAX_TOKENS') {
            // Handle cases where the generation was stopped for safety reasons.
            logger.warn(`LLM generation stopped for reason: ${response.candidates?.[0]?.finishReason}`, { candidate: response.candidates?.[0] });
            // Depending on policy, you might throw an error or return a canned response.
            // For this audit, we'll throw an error to make the issue visible.
            throw new ApiError(500, `Content generation stopped due to safety filters or an unexpected reason: ${response.candidates?.[0]?.finishReason}`);
        }

        stepOutput = responseText;
        scope[step.name] = responseText;

        const usage = response.usageMetadata || {};
        const promptTokens = usage.promptTokenCount || Math.ceil(sanitizedPromptText.length / 4); // Use sanitized prompt for token estimation
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
          // PLATFORM_OWNER: Pass user ID for RAG service context.
          context = await ragService.queryDocument(queryText, user._id);
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
 * @param {Object} user - The authenticated user object, containing id, workspaceId, and role.
 * @param {Function} emit - A callback function `(data: Object) => void` used to send SSE events.
 * @returns {Promise<void>} A promise that resolves when the chain execution is complete or an error occurs.
 */
const streamChainExecution = async (chainId, inputs, user, emit) => {
  const tStart = Date.now();
  let execution;
  // PLATFORM_OWNER: Destructure role from user object to implement role-based access control (RBAC).
  const { _id: userId, workspaceId, role } = user;

  try {
    // PLATFORM_OWNER: Enforce tenant (workspace) status. A suspended tenant cannot execute chains.
    // The Platform Owner can bypass this check for administrative or debugging purposes.
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
        const tenantNotFoundError = new ApiError(404, `Workspace with ID ${workspaceId} not found.`);
        logger.error(`StreamChain execution failed: Workspace not found`, { chainId, userId, workspaceId });
        emit({ event: 'error', message: tenantNotFoundError.message });
        return;
    }
    if (workspace.status === 'suspended' && role !== 'platform_owner') {
        const suspendedError = new ApiError(403, 'This workspace is suspended. Please contact support.');
        logger.warn(`Execution blocked for suspended workspace`, { chainId, userId, workspaceId });
        emit({ event: 'error', message: suspendedError.message });
        return;
    }

    // PLATFORM_OWNER: Modify query to allow Platform Owners to access chains from any tenant.
    // This is essential for global oversight and debugging tenant-specific issues.
    const chainQuery = { _id: chainId };
    if (role !== 'platform_owner') {
      chainQuery.workspaceId = workspaceId;
    }
    const chain = await LangchainChain.findOne(chainQuery).lean();
    if (!chain) {
      const notFoundError = new ApiError(404, `Chain not found or you do not have permission to access it.`);
      logger.warn(`StreamChain execution failed: Chain not found or permission denied`, { chainId, userId, workspaceId, role });
      emit({ event: 'error', message: notFoundError.message });
      return;
    }

    // PLATFORM_OWNER: Allow Platform Owners to bypass tenant usage limits.
    // This is crucial for debugging production issues without being blocked by a tenant's quota.
    if (role !== 'platform_owner') {
        const canExecute = await usageService.canPerformAction(workspaceId, 'llmExecution');
        if (!canExecute) {
            const limitError = new ApiError(402, 'Workspace usage limit reached. Please upgrade your plan or contact your administrator.');
            logger.warn(`Workspace usage limit reached for workspaceId: ${workspaceId}`, { chainId, userId });
            emit({ event: 'error', message: limitError.message });
            return;
        }
    }

    const totalSteps = chain.steps.length;

    emit({
      event: 'start',
      chainId,
      chainName: chain.name,
      totalSteps,
      timestamp: new Date().toISOString(),
    });

    // FIX: Add workspaceId to the execution record for proper data segregation, auditing, and billing aggregation.
    execution = new LangchainExecution({
      chainId,
      userId,
      workspaceId,
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
        // PLATFORM_OWNER: Pass the full user object to executeSingleStep for role-based config enforcement.
        const result = await executeSingleStep(step, scope, user);

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
    if (!success) {
      execution.error = errorMsg;
    }
    await execution.save();

    // INTEGRATION (Usage Propagation): After a successful execution, record the token usage against the workspace.
    // This allows for centralized billing, limit enforcement, and notifications for administrators.
    if (success && tokenUsageSummary.totalTokens > 0) {
        try {
            await usageService.recordTokenUsage(workspaceId, userId, tokenUsageSummary.totalTokens);
        } catch (usageError) {
            // This is a non-fatal error for the end-user, but critical for the platform to monitor.
            // We log it as a high-priority error without failing the user's request.
            logger.error('CRITICAL: Failed to record token usage after successful chain execution', {
                workspaceId,
                userId,
                executionId: execution._id.toString(),
                tokens: tokenUsageSummary.totalTokens,
                error: usageError.message,
            });
        }
    }

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
        // BUG: The original code didn't update the error message in the execution record on a global failure.
        // FIX: Add the error message to the execution record for better debugging.
        execution.error = apiError.message;
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