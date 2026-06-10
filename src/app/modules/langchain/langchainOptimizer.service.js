import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainExecution from './langchain-execution.model.js';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

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
      chainId
    });

    // Resolve user context and fetch full user details if only ID is provided
    let currentUser = null;
    const User = mongoose.models.User || mongoose.model('User');
    const Tenant = mongoose.models.Tenant || mongoose.model('Tenant');
    const Notification = mongoose.models.Notification || mongoose.model('Notification');

    if (typeof userContext === 'string') {
      currentUser = await User.findById(userContext).lean();
      if (!currentUser) {
        throw new Error(`User not found: ${userContext}`);
      }
    } else if (userContext && typeof userContext === 'object') {
      currentUser = userContext;
    }

    if (!currentUser) {
      throw new Error('Unauthorized: User context is required for optimization.');
    }

    const userId = currentUser._id || currentUser.id;
    const userRole = currentUser.role; // super_admin, admin, manager, user
    const tenantId = currentUser.tenantId;

    // Fetch the chain
    const chain = await LangchainChain.findById(chainId).lean();
    if (!chain) {
      throw new Error(`LangChain chain not found: ${chainId}`);
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
          chainTenantId: chain.tenantId ? chain.tenantId.toString() : null
        });
        throw new Error('Unauthorized: Access denied to this resource.');
      }

      // Role-specific access control
      if (userRole === 'user') {
        // Regular users can only optimize their own chains
        if (chain.userId && chain.userId.toString() !== userId.toString()) {
          throw new Error('Unauthorized: You can only optimize your own chains.');
        }
      } else if (userRole === 'manager') {
        // Managers can optimize their own chains or chains belonging to users they manage
        if (chain.userId && chain.userId.toString() !== userId.toString()) {
          const chainOwner = await User.findById(chain.userId).select('managerId').lean();
          if (!chainOwner || !chainOwner.managerId || chainOwner.managerId.toString() !== userId.toString()) {
            throw new Error('Unauthorized: Managers can only optimize chains of their direct reports.');
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
        throw new Error('Tenant context not found.');
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
          await Notification.insertMany(notifications);
        }
        throw new Error('Usage limit exceeded: Your workspace has reached its AI optimization limit.');
      }

      // Increment usage count
      await Tenant.findByIdAndUpdate(tenantId, {
        $inc: { 'aiUsage.optimizationCount': 1 }
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

    const optimizationPrompt = `You are an expert AI compiler and LangChain optimizer. Analyze the following custom chain execution telemetry and config profile:
${JSON.stringify(traceSummary, null, 2)}

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

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: optimizationPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    });

    const cleanText = result.response.text().trim();
    const suggestions = JSON.parse(cleanText);

    // 3. Propagate Notifications to Managers and Admins
    if (userRole !== 'super_admin' && tenantId) {
      // Notify manager if exists
      if (currentUser.managerId) {
        await Notification.create({
          recipientId: currentUser.managerId,
          title: 'Chain Optimized by Team Member',
          message: `User ${currentUser.name || userId} optimized chain "${chain.name}" with success rate ${successRate}%.`,
          type: 'info',
        });
      }

      // Notify tenant admins
      // OPTIMIZATION: The recommended compound index on { tenantId: 1, role: 1 } in the User model also benefits this query.
      const admins = await User.find({ tenantId, role: 'admin', _id: { $ne: userId } }).select('_id').lean();
      // OPTIMIZATION: Use insertMany to avoid N+1 query problem when creating multiple notifications.
      if (admins.length > 0) {
        const notifications = admins.map(admin => ({
          recipientId: admin._id,
          title: 'Chain Optimization Executed',
          message: `Optimization completed for chain "${chain.name}" in your workspace.`,
          type: 'info',
        }));
        await Notification.insertMany(notifications);
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
      message: `LangchainOptimizer error: ${err.message}`,
      error: err.stack || err.toString(),
      chainId
    });
    throw new Error(`Failed to generate chain optimizations: ${err.message}`);
  }
};

export const langchainOptimizerService = {
  optimizeChain,
};