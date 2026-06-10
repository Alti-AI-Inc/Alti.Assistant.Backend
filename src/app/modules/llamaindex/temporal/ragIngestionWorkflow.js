import httpStatus from 'http-status';
import { logger } from '../../../core/logger.js';
import { ApiError } from '../../../core/ApiError.js';

/**
 * Stateful, durable Temporal RAG Ingestion Workflow that orchestrates
 * resilient document loading, structured Markdown parsing, metadata extraction,
 * text-embedding-004 embedding generation, and pgvector RAG database synchronization.
 * Implements the transactional Saga pattern for compensating compensating rollbacks.
 * This workflow is tenant-aware and enforces workspace-level usage limits.
 *
 * @param {string} filePath - Absolute path to the source file (local or GCS prefix).
 * @param {string} originalName - User-provided original filename.
 * @param {string} userId - User identifier for auditing and ownership.
 * @param {string} docId - Unique document identifier.
 * @param {string} workspaceId - The identifier for the tenant workspace to ensure data isolation and limit enforcement.
 * @returns {Promise<object>} Ingestion execution report containing success status, docId, originalName, and a message.
 * @throws {ApiError} If any step of the ingestion process fails, if usage limits are exceeded, or if the rollback compensation fails.
 */
export async function resilientRAGIngestionWorkflow(filePath, originalName, userId, docId, workspaceId) {
  // Integration Fix: Validate that workspaceId is provided, as it's critical for multi-tenancy.
  if (!workspaceId) {
    // This is a fundamental logic error. The workflow should not have been started without a workspace context.
    // Fail fast to prevent any potential data corruption or cross-tenant operations.
    throw new ApiError(httpStatus.BAD_REQUEST, 'FATAL: workspaceId is required for RAG ingestion workflow.', true);
  }

  let activities;
  let embeddingResult = null; // To hold the result for usage tracking

  // A single, top-level try/catch block to handle both setup (e.g., import) and activity execution failures.
  try {
    // Safeguard: Check if running in mock offline/test environment
    const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');

    if (isMock) {
      // Dynamic import to prevent Temporal workflow sandbox compiler from loading Node APIs in production
      activities = await import('./ragIngestionActivities.js');
    } else {
      const { proxyActivities } = await import('@temporalio/workflow');
      // Integration Fix: Define a separate, shorter timeout for activities that should fail fast, like limit checks.
      const fastActivities = proxyActivities({
        startToCloseTimeout: '1 minute', // Shorter timeout for quick checks
        retry: { maximumAttempts: 2 }
      });
      const longRunningActivities = proxyActivities({
        startToCloseTimeout: '60 minutes',
        retry: {
          initialInterval: '5s',
          backoffCoefficient: 2,
          maximumInterval: '5 minutes',
          maximumAttempts: 3
        }
      });
      activities = { ...fastActivities, ...longRunningActivities };
    }

    // Integration Fix (Step 0): Pre-flight check for usage and limits against the workspace.
    // This prevents running expensive jobs if the user/workspace has exceeded their quota.
    await activities.checkUsageAndLimitsActivity(workspaceId, filePath);

    // 1. Download/Load file, checking for absolute GCS/local paths
    // Pass workspaceId for context, e.g., for scoped temporary storage.
    const loadResult = await activities.downloadAndLoadFileActivity(filePath, originalName, docId, workspaceId);
    if (!loadResult.success) {
      // Throwing a standard Error here is fine, as the catch block will normalize it.
      throw new Error(`Temporal Ingestion failed during file loading step.`);
    }

    // 2. High-fidelity parsing to structured HTML/Markdown
    const parseResult = await activities.parseToMarkdownActivity(filePath, originalName, docId, workspaceId);
    if (!parseResult.success) {
      throw new Error(`Temporal Ingestion failed during high-fidelity HTML-to-Markdown parsing step.`);
    }

    // 3. Structured chunking, Title/Keyword auto-extraction, and text-embedding-004 vector embedding
    // Integration Fix: Pass workspaceId to ensure embeddings are associated with the correct tenant.
    embeddingResult = await activities.chunkAndEmbedActivity(filePath, originalName, docId, userId, workspaceId);
    if (!embeddingResult.success || typeof embeddingResult.chunkCount === 'undefined') {
      // The activity must return chunkCount for usage tracking.
      throw new Error(`Temporal Ingestion failed during embedding generation step or did not return chunkCount.`);
    }

    // 4. pgvector database sync and Manifest DB commit
    // Integration Fix: Pass workspaceId to ensure data is committed to the correct tenant's vector space.
    const commitResult = await activities.commitToVectorStoreActivity(filePath, originalName, docId, userId, workspaceId);
    if (!commitResult.success) {
      throw new Error(`Temporal Ingestion failed during vector database commit step.`);
    }

    // Integration Fix (Step 5): After a successful commit, update the usage metrics for the workspace.
    // This is a critical step for billing and enforcing limits accurately.
    await activities.updateUsageActivity(workspaceId, docId, embeddingResult.chunkCount);

    return {
      success: true,
      docId,
      originalName,
      status: 'completed',
      message: `World-class resilient RAG document ingestion successfully committed via Temporal durable workflows.`
    };
  } catch (error) {
    // Centralized error handling for the entire workflow.
    // This block handles failures from setup (imports) and all subsequent activities.
    logger.error({
      message: `[Temporal RAG Ingestion Orchestrator] Critical ingestion failure. Initiating rollback compensation.`,
      docId,
      userId,
      workspaceId,
      originalName,
      filePath,
      // Ensure we log the original error message and stack for internal debugging.
      error: error.message,
      stack: error.stack,
    });
    
    // Saga Rollback logic: Purge any partial/corrupt vector nodes and reset state records.
    // This should only be attempted if the activities were successfully initialized.
    if (activities) {
      try {
        // Attempt to execute the compensating activity to clean up resources.
        // Integration Fix: Pass workspaceId to ensure cleanup happens in the correct tenant context.
        await activities.cleanupFailedIngestionActivity(filePath, originalName, docId, userId, workspaceId);
      } catch (purgeError) {
        // Log the failure of the cleanup activity itself, as this is a critical state.
        logger.error({
          message: `[Temporal RAG Ingestion Orchestrator] FATAL: Failed to execute compensating rollback activity. Manual cleanup may be required.`,
          docId,
          userId,
          workspaceId,
          originalName,
          filePath,
          // Log the details of the purge error specifically.
          error: purgeError.message,
          stack: purgeError.stack,
        });
        // Note: We do not re-throw the purgeError, as the original error is the root cause of the workflow failure.
        // The workflow should fail because of the original 'error', not the 'purgeError'.
      }
    }

    // Normalize the error and re-throw it to fail the workflow execution.
    // The client that invoked this workflow will receive this normalized error.
    throw new ApiError(
      // Integration Fix: If the error is due to limits, return a more appropriate status code.
      error.message.includes('Usage limit exceeded') ? httpStatus.PAYMENT_REQUIRED : httpStatus.INTERNAL_SERVER_ERROR,
      `Resilient RAG Ingestion Workflow Failed: ${error.message}`,
      true, // isOperational
      error.stack
    );
  }
}