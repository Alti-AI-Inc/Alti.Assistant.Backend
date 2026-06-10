import mongoose from 'mongoose';
import httpStatus from 'http-status';
// VAI-SAFETY-FIX: Use the enterprise-grade Vertex AI SDK for Node.js.
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainExecution from './langchain-execution.model.js';
import ApiError from '../../../core/ApiError.js';

// VAI-SAFETY-FIX: Instantiate the Vertex AI client.
// This uses Application Default Credentials (ADC) for authentication, which is the recommended approach for GCP environments.
const vertex_ai = new VertexAI({ project: config.gcp_project_id, location: config.gcp_location });

// VAI-SAFETY-FIX: PII masking utility function to redact sensitive information before sending to the AI model.
const maskPII = text => {
  if (typeof text !== 'string') return text;
  // Mask emails
  let maskedText = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]');
  // Mask phone numbers (basic North American and international formats)
  maskedText = maskedText.replace(/(\+\d{1,3}[- ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}/g, '[REDACTED_PHONE]');
  // Mask common IP addresses
  maskedText = maskedText.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[REDACTED_IP]');
  return maskedText;
};

// VAI-SAFETY-FIX: Recursive function to sanitize an entire object for AI processing.
const sanitizeObjectForAI = obj => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObjectForAI(item));
  }
  const sanitized = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (typeof value === 'string') {
        sanitized[key] = maskPII(value);
      } else if (typeof value === 'object') {
        sanitized[key] = sanitizeObjectForAI(value);
      } else {
        sanitized[key] = value;
      }
    }
  }
  return sanitized;
};

/**
 * Automatically audits custom chain runs and queries Google Gemini to suggest prompt and structure improvements.
 * Supports multi-tenant isolation, role-based access control (RBAC), usage limit enforcement, and notification propagation.
 *
 * @param {string} chainId - The ID of the chain to optimize.
 * @param {Object|string} userContext - The current user object or user ID.
 */
const optimizeChain = async (chainId, userContext) => {
  try {
    // Structured log for GCP Cloud Logging compatibility
    logger.info({
      severity: 'INFO',
      message: `LangchainOptimizer: running diagnostics on chain ${chainId}`,
      chainId,
    });

    // Resolve user context and fetch full user details if only ID is provided
    let currentUser = null;
    const User = mongoose.models.User || mongoose.model('User');
    const Tenant = mongoose.models.Tenant || mongoose.model('Tenant');
    const Notification = mongoose.models.Notification || mongoose.model('Notification');

    if (typeof userContext === 'string') {
      currentUser = await User.findById(userContext).lean();
      if (!currentUser) {
        // Use ApiError for standardized HTTP responses
        throw new ApiError(httpStatus.NOT_FOUND, `User not found: ${userContext}`);
      }
    } else if (userContext && typeof userContext === 'object') {
      currentUser = userContext;
    }

    if (!currentUser) {
      // Use ApiError for standardized HTTP responses
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Unauthorized: User context is required for optimization.');
    }

    const userId = currentUser._id || currentUser.id;
    const userRole = currentUser.role; // super_admin, admin, manager, user
    const tenantId = currentUser.tenantId;

    // Fetch the chain
    const chain = await LangchainChain.findById(chainId).lean();
    if (!chain) {
      // Use ApiError for standardized HTTP responses
      throw new ApiError(httpStatus.NOT_FOUND, `LangChain chain not found: ${chainId}`);
    }

    // 1. Tenant Boundary & RBAC Validation
    if (userRole !== 'super_admin') {
      // Ensure tenant isolation
      if (!tenantId || !chain.tenantId || chain.tenantId.toString() !== tenantId.toString()) {
        // Structured log for GCP Cloud Logging compatibility
        logger.warn({
          severity: 'WARNING',
          message: `Security Alert: User ${userId} attempted to access chain ${chainId} across tenant boundaries.`,
          userId,
          chainId,
          tenantId: tenantId ? tenantId.toString() : null,
          chainTenantId: chain.tenantId ? chain.tenantId.toString() : null,
        });
        // Use ApiError for standardized HTTP responses
        throw new ApiError(httpStatus.FORBIDDEN, 'Unauthorized: Access denied to this resource.');
      }

      // Role-specific access control
      if (userRole === 'user') {
        // Regular users can only optimize their own chains
        if (chain.userId && chain.userId.toString() !== userId.toString()) {
          throw new ApiError(httpStatus.FORBIDDEN, 'Unauthorized: You can only optimize your own chains.');
        }
      } else if (userRole === 'manager') {
        // Managers can optimize their own chains or chains belonging to users they manage
        if (chain.userId && chain.userId.toString() !== userId.toString()) {
          const chainOwner = await User.findById(chain.userId).select('managerId').lean();
          if (!chainOwner || !chainOwner.managerId || chainOwner.managerId.toString() !== userId.toString()) {
            throw new ApiError(httpStatus.FORBIDDEN, 'Unauthorized: Managers can only optimize chains of their direct reports.');
          }
        }
      }
      // Admins have full access within their tenant, so no further checks needed for 'admin'
    }

    // 2. Usage Limits & Subscription Checks
    if (userRole !== 'super_admin' && tenantId) {
      // OPTIMIZATION: Use .lean() for read-only operations to improve performance.
      const tenant = await Tenant.findById(tenantId).lean();
      if (!tenant) {
        // This indicates a data integrity issue, which is an internal server error.
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tenant context not found.');
      }

      // Check if tenant has reached AI optimization limits
      const currentUsage = tenant.aiUsage?.optimizationCount || 0;
      const limit = tenant.aiUsage?.optimizationLimit || 100; // Default limit

      if (currentUsage >= limit) {
        // Notify administrators about limit exhaustion
        // OPTIMIZATION: Recommend compound index on { tenantId: 1, role: 1 } in the User model for faster lookups.
        const admins = await User.find({ tenantId, role: 'admin' }).select('_id').lean();
        // OPTIMIZATION: Use insertMany to avoid N+1 query problem when creating multiple notifications.
        if (admins.length > 0) {
          const notifications = admins.map(admin => ({
            recipientId: admin._id,
            title: 'AI Limit Exceeded',
            message: `Tenant ${tenant.name || tenantId} has reached its AI optimization limit (${limit}).`,
            type: 'warning',
          }));
          // Fire-and-forget notification creation to not block the user response, but log any errors.
          Notification.insertMany(notifications).catch(err => {
            logger.error({
              severity: 'ERROR',
              message: `Failed to create 'limit exceeded' notifications for tenant ${tenantId}`,
              error: err.stack || err.toString(),
              tenantId,
            });
          });
        }
        throw new ApiError(httpStatus.FORBIDDEN, 'Usage limit exceeded: Your workspace has reached its AI optimization limit.');
      }

      // Increment usage count
      await Tenant.findByIdAndUpdate(tenantId, {
        $inc: { 'aiUsage.optimizationCount': 1 },
      });
    }

    // Fetch last 15 executions for this chain
    // If user is regular user, restrict executions to their own. Otherwise, allow tenant-wide executions.
    const executionQuery = { chainId };
    if (userRole === 'user') {
      executionQuery.userId = userId;
    } else if (userRole !== 'super_admin') {
      // Restrict to tenant executions
      executionQuery.tenantId = tenantId;
    }

    // OPTIMIZATION: Recommend compound index on { chainId: 1, createdAt: -1 } in the LangchainExecution model.
    // Also consider { chainId: 1, tenantId: 1, createdAt: -1 } and { chainId: 1, userId: 1, createdAt: -1 } to cover all query variations.
    const executions = await LangchainExecution.find(executionQuery)
      .select('status totalDurationMs stepsExecution createdAt')
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();

    if (executions.length === 0) {
      return {
        success: true,
        message: 'No execution traces found for this chain. Execute the chain first to gather optimization telemetry.',
        recommendations: [],
      };
    }

    // Single-pass aggregation to optimize CPU usage and avoid multiple array iterations
    const totalExecutions = executions.length;
    let successfulExecutions = 0;
    let totalDuration = 0;
    const failures = [];
    const stepDurations = {};

    for (const exec of executions) {
      if (exec.status === 'success') {
        successfulExecutions++;
      }
      totalDuration += exec.totalDurationMs || 0;

      for (const stepRun of exec.stepsExecution || []) {
        // Accumulate durations per step
        if (!stepDurations[stepRun.stepName]) {
          stepDurations[stepRun.stepName] = { totalMs: 0, count: 0 };
        }
        stepDurations[stepRun.stepName].totalMs += stepRun.durationMs || 0;
        stepDurations[stepRun.stepName].count++;

        if (stepRun.status === 'failed') {
          failures.push({
            stepName: stepRun.stepName,
            stepType: stepRun.stepType,
            input: stepRun.input,
            error: stepRun.error,
            timestamp: exec.createdAt,
          });
        }
      }
    }

    const successRate = Math.round((successfulExecutions / totalExecutions) * 100);
    const avgDuration = Math.round(totalDuration / totalExecutions);
    const slowSteps = [];

    // Find slow steps (avg duration > 4 seconds)
    for (const [name, data] of Object.entries(stepDurations)) {
      const avg = Math.round(data.totalMs / data.count);
      if (avg > 4000) {
        slowSteps.push({ stepName: name, avgDurationMs: avg });
      }
    }

    // Call Gemini to suggest prompt refinements
    const traceSummary = {
      chainName: chain.name,
      chainDescription: chain.description,
      successRate: `${successRate}%`,
      avgDurationMs: avgDuration,
      slowSteps,
      frequentFailures: failures.slice(0, 5),
      stepsConfig: (chain.steps || []).map(s => ({ name: s.name, type: s.type, config: s.config })),
    };

    // VAI-SAFETY-FIX: Sanitize the trace summary to remove PII before sending it to the model.
    const sanitizedTraceSummary = sanitizeObjectForAI(traceSummary);

    const optimizationPrompt = `You are an expert AI compiler and LangChain optimizer. Analyze the following custom chain execution telemetry and config profile:
${JSON.stringify(sanitizedTraceSummary, null, 2)}

Identify bottlenecks, failed prompts, or parser issues, and suggest:
1. Prompts optimization (how to rewrite the prompts to avoid failures or boost precision).
2. Parameter adjustments (temperature, tokens).
3. Pipeline enhancements (steps re-arrangements).

Return your output as a clean, structured JSON object following this exact schema:
{
  "traceSummary": {
    "successRate": "X%",
    "avgLatencyMs": 999
  },
  "bottlenecks": [
    {
      "stepName": "string",
      "issue": "string",
      "recommendation": "string"
    }
  ],
  "promptRefinements": [
    {
      "stepName": "string",
      "originalPromptPreview": "string",
      "optimizedPromptText": "string",
      "rationale": "string"
    }
  ],
  "parameterTuning": [
    {
      "stepName": "string",
      "param": "temperature" | "maxOutputTokens",
      "currentValue": "string",
      "recommendedValue": "string",
      "rationale": "string"
    }
  ]
}

Ensure your response is raw JSON only, with no markdown styling or wrapping backticks.`;

    // VAI-SAFETY-FIX: Define explicit safety settings for the model call.
    // This blocks content with a medium or higher probability of being harmful.
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    // VAI-SAFETY-FIX: Use the Vertex AI model with safety settings and generation config.
    const generativeModel = vertex_ai.getGenerativeModel({
      model: 'gemini-1.5-flash-001', // Using a specific model version for stability
      safetySettings,
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: optimizationPrompt }] }],
    });

    let suggestions;
    try {
      // VAI-SAFETY-FIX: Robustly parse the JSON response from the Vertex AI SDK.
      const responseCandidate = result.response?.candidates?.[0];
      if (!responseCandidate || !responseCandidate.content?.parts?.[0]?.text) {
        logger.error({
          severity: 'ERROR',
          message: 'LangchainOptimizer: Received an empty or malformed response from Vertex AI.',
          chainId,
          rawResponse: JSON.stringify(result.response),
        });
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Received an empty response from the AI model.');
      }
      const cleanText = responseCandidate.content.parts[0].text.trim();
      suggestions = JSON.parse(cleanText);
    } catch (parseError) {
      // Log the raw response for debugging if JSON parsing fails
      logger.error({
        severity: 'ERROR',
        message: 'LangchainOptimizer: Failed to parse JSON response from Gemini.',
        chainId,
        rawResponse: result.response?.candidates?.[0]?.content?.parts?.[0]?.text || 'No text found in response',
        error: parseError.stack || parseError.toString(),
      });
      // Inform the user that the AI response was malformed
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to parse optimization suggestions from the AI model. The model may have returned an invalid format.');
    }

    // 3. Propagate Notifications to Managers and Admins
    if (userRole !== 'super_admin' && tenantId) {
      const notificationsToCreate = [];

      // Prepare manager notification
      if (currentUser.managerId) {
        notificationsToCreate.push({
          recipientId: currentUser.managerId,
          title: 'Chain Optimized by Team Member',
          message: `User ${currentUser.name || userId} optimized chain "${chain.name}" with success rate ${successRate}%.`,
          type: 'info',
        });
      }

      // Prepare tenant admin notifications
      // OPTIMIZATION: The recommended compound index on { tenantId: 1, role: 1 } in the User model also benefits this query.
      const admins = await User.find({ tenantId, role: 'admin', _id: { $ne: userId } })
        .select('_id')
        .lean();

      if (admins.length > 0) {
        const adminNotifications = admins.map(admin => ({
          recipientId: admin._id,
          title: 'Chain Optimization Executed',
          message: `Optimization completed for chain "${chain.name}" in your workspace.`,
          type: 'info',
        }));
        notificationsToCreate.push(...adminNotifications);
      }

      // OPTIMIZATION: Use a single insertMany call to create all notifications in one database round trip.
      if (notificationsToCreate.length > 0) {
        // Fire-and-forget notification creation to not block the user response, but log any errors.
        Notification.insertMany(notificationsToCreate).catch(err => {
          logger.error({
            severity: 'ERROR',
            message: `Failed to create optimization notifications for chain ${chainId}`,
            error: err.stack || err.toString(),
            chainId,
            tenantId,
          });
        });
      }
    }

    return {
      success: true,
      chainId,
      telemetry: {
        totalTraces: totalExecutions,
        successRate: `${successRate}%`,
        averageDurationMs: avgDuration,
      },
      optimization: suggestions,
    };
  } catch (err) {
    // Structured log for GCP Cloud Logging compatibility
    logger.error({
      severity: 'ERROR',
      message: `LangchainOptimizer error on chain ${chainId}: ${err.message}`,
      error: err.stack || err.toString(),
      chainId,
      userId: userContext?._id || (typeof userContext === 'string' ? userContext : 'unknown'),
    });

    // Re-throw ApiError instances to be handled by the global error middleware
    if (err instanceof ApiError) {
      throw err;
    }

    // Wrap other unexpected errors in a generic internal server error
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred while optimizing the chain.');
  }
};

export const langchainOptimizerService = {
  optimizeChain,
};