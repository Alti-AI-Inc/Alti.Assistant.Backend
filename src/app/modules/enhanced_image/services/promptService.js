/**
 * @file This module provides the PromptService class for interacting with prompt evaluation and enhancement utilities.
 * @module modules/enhanced_image/services/promptService
 */

// INTEGRATION FIX: Import necessary services for business logic, authorization, and usage tracking.
// The original file was a simple wrapper with no awareness of the application's architecture.
import { AppError, ForbiddenError, UsageLimitExceededError } from '../../../core/errors.js';
import { USAGE_TYPES } from '../../../core/constants.js';
import {
  evaluatePromptQuality,
  buildEnhancedPrompt,
} from '../utils/promptEvaluator.js';

/**
 * @class PromptService
 * @description A service class responsible for orchestrating prompt evaluation and enhancement operations.
 *              It integrates with workspace, usage, and notification services to enforce business rules,
 *              track usage, and respect tenant boundaries.
 */
export class PromptService {
  /**
   * @constructor
   * @param {Object} services - An object containing injected services.
   * @param {Object} services.workspaceService - Service for managing workspace data and permissions.
   * @param {Object} services.usageService - Service for tracking and enforcing usage limits.
   * @param {Object} services.notificationService - Service for sending notifications.
   * @param {Object} services.config - The application's configuration service.
   */
  constructor({ workspaceService, usageService, notificationService, config }) {
    // INTEGRATION FIX: Dependencies are now injected for proper separation of concerns and testability.
    this.workspaceService = workspaceService;
    this.usageService = usageService;
    this.notificationService = notificationService;

    // SECURITY FIX: API key is retrieved from a secure config service instead of being passed directly.
    // This prevents key leakage through constructor calls in various parts of the application.
    this.apiKey = config.get('externalServices.promptEnhancer.apiKey');
    if (!this.apiKey) {
      // BUG FIX: Added a fail-fast mechanism. The service is unusable without its key, so we throw an error on startup.
      throw new AppError('Prompt enhancer API key is not configured.', 500);
    }
  }

  /**
   * @async
   * @method evaluatePrompt
   * @description Evaluates the quality of a given prompt, ensuring the user has permission and is within usage limits.
   * @param {string} prompt - The prompt string to be evaluated.
   * @param {Array<Object>} history - An array of historical messages or interactions relevant to the prompt.
   * @param {Object} userContext - The context of the user making the request.
   * @param {string} userContext.userId - The ID of the user.
   * @param {string} userContext.workspaceId - The ID of the user's current workspace (tenant context).
   * @param {string} userContext.role - The role of the user within the workspace.
   * @returns {Promise<Object>} A promise that resolves to an object containing the evaluation results.
   * @throws {ForbiddenError} If the user lacks permissions or context is missing.
   * @throws {UsageLimitExceededError} If the workspace has reached its usage limit for this feature.
   * @throws {AppError} If an unexpected internal error occurs.
   */
  async evaluatePrompt(prompt, history, userContext) {
    // INTEGRATION FIX: Added comprehensive validation, usage tracking, and error handling to align with the CRITICAL INTEGRATION TASK.
    // This ensures actions are authorized, tracked, and contained within the correct tenant (workspace) context.

    // 1. Authorize the request against the user and workspace context.
    if (!userContext || !userContext.userId || !userContext.workspaceId) {
      throw new ForbiddenError('Valid user context is required to evaluate a prompt.');
    }

    // This check ensures the user belongs to the workspace, enforcing tenant boundaries.
    const canAccess = await this.workspaceService.isUserInWorkspace(userContext.userId, userContext.workspaceId);
    if (!canAccess) {
        throw new ForbiddenError('User does not have access to this workspace.');
    }

    // Check if the feature is enabled for this workspace's subscription plan.
    const isFeatureEnabled = await this.workspaceService.isFeatureEnabled(userContext.workspaceId, 'promptEvaluation');
    if (!isFeatureEnabled) {
      throw new ForbiddenError('Prompt evaluation feature is not enabled for this workspace.');
    }

    // 2. Check usage limits before consuming the external API.
    const hasUsageLeft = await this.usageService.hasSufficientUsage(userContext.workspaceId, USAGE_TYPES.PROMPT_EVALUATION);
    if (!hasUsageLeft) {
      // Notify admins upon attempt to use a depleted resource.
      await this.notificationService.notifyAdminsOfUsageLimitExceeded({
        workspaceId: userContext.workspaceId,
        usageType: USAGE_TYPES.PROMPT_EVALUATION,
        userId: userContext.userId,
      });
      throw new UsageLimitExceededError('Prompt evaluation limit reached for this workspace.');
    }

    try {
      // 3. Perform the core action.
      const evaluationResult = await evaluatePromptQuality(prompt, history, {
        apiKey: this.apiKey,
      });

      // 4. Record usage after a successful operation to debit the workspace's quota.
      const usageRecord = await this.usageService.recordUsage({
        workspaceId: userContext.workspaceId,
        userId: userContext.userId,
        type: USAGE_TYPES.PROMPT_EVALUATION,
        units: 1,
        metadata: { promptLength: prompt.length }
      });

      // 5. Propagate notifications up the hierarchy (to managers/admins) if usage thresholds are met.
      if (usageRecord && usageRecord.thresholdReached) {
        await this.notificationService.notifyAdminsOfUsageThreshold({
            workspaceId: userContext.workspaceId,
            usageType: USAGE_TYPES.PROMPT_EVALUATION,
            percentage: usageRecord.usagePercentage,
            triggeredByUserId: userContext.userId
        });
      }

      return evaluationResult;

    } catch (error) {
      // BUG FIX: Implement robust error handling to prevent leaking stack traces or sensitive info.
      console.error(`Error during prompt evaluation for user ${userContext.userId} in workspace ${userContext.workspaceId}:`, error);
      // Re-throw a generic, user-friendly error.
      throw new AppError('Failed to evaluate prompt due to an internal service error.', 500);
    }
  }

  /**
   * @async
   * @method buildEnhancedPrompt
   * @description Builds an enhanced prompt, ensuring the user has permission and is within usage limits.
   * @param {Array<Object>} conversationHistory - An array of historical messages to inform the enhanced prompt.
   * @param {Object} userContext - The context of the user making the request.
   * @param {string} userContext.userId - The ID of the user.
   * @param {string} userContext.workspaceId - The ID of the user's current workspace (tenant context).
   * @param {string} userContext.role - The role of the user within the workspace.
   * @returns {Promise<string>} A promise that resolves to the enhanced prompt string.
   * @throws {ForbiddenError} If the user lacks permissions or context is missing.
   * @throws {UsageLimitExceededError} If the workspace has reached its usage limit for this feature.
   * @throws {AppError} If an unexpected internal error occurs.
   */
  async buildEnhancedPrompt(conversationHistory, userContext) {
    // INTEGRATION FIX: Applied the same authorization and usage tracking pattern as evaluatePrompt.
    
    // 1. Authorize the request.
    if (!userContext || !userContext.userId || !userContext.workspaceId) {
      throw new ForbiddenError('Valid user context is required to build an enhanced prompt.');
    }

    const canAccess = await this.workspaceService.isUserInWorkspace(userContext.userId, userContext.workspaceId);
    if (!canAccess) {
        throw new ForbiddenError('User does not have access to this workspace.');
    }

    const isFeatureEnabled = await this.workspaceService.isFeatureEnabled(userContext.workspaceId, 'promptEnhancement');
    if (!isFeatureEnabled) {
      throw new ForbiddenError('Prompt enhancement feature is not enabled for this workspace.');
    }

    // 2. Check usage limits.
    const hasUsageLeft = await this.usageService.hasSufficientUsage(userContext.workspaceId, USAGE_TYPES.PROMPT_ENHANCEMENT);
    if (!hasUsageLeft) {
      await this.notificationService.notifyAdminsOfUsageLimitExceeded({
        workspaceId: userContext.workspaceId,
        usageType: USAGE_TYPES.PROMPT_ENHANCEMENT,
        userId: userContext.userId,
      });
      throw new UsageLimitExceededError('Prompt enhancement limit reached for this workspace.');
    }

    try {
      // 3. Perform the core action.
      const enhancedPrompt = await buildEnhancedPrompt(conversationHistory, {
        apiKey: this.apiKey,
      });

      // 4. Record usage.
      const usageRecord = await this.usageService.recordUsage({
        workspaceId: userContext.workspaceId,
        userId: userContext.userId,
        type: USAGE_TYPES.PROMPT_ENHANCEMENT,
        units: 1,
        metadata: { conversationLength: conversationHistory.length }
      });

      // 5. Propagate notifications.
      if (usageRecord && usageRecord.thresholdReached) {
        await this.notificationService.notifyAdminsOfUsageThreshold({
            workspaceId: userContext.workspaceId,
            usageType: USAGE_TYPES.PROMPT_ENHANCEMENT,
            percentage: usageRecord.usagePercentage,
            triggeredByUserId: userContext.userId
        });
      }

      return enhancedPrompt;

    } catch (error) {
      // BUG FIX: Implement robust error handling.
      console.error(`Error building enhanced prompt for user ${userContext.userId} in workspace ${userContext.workspaceId}:`, error);
      throw new AppError('Failed to build enhanced prompt due to an internal service error.', 500);
    }
  }
}