/**
 * Stateful, durable Temporal RAG Ingestion Workflow that orchestrates
 * resilient document loading, structured Markdown parsing, metadata extraction,
 * text-embedding-004 embedding generation, and pgvector RAG database synchronization.
 * Implements the transactional Saga pattern for compensating compensating rollbacks.
 * 
 * @param {string} filePath - Absolute path to the source file (local or GCS prefix).
 * @param {string} originalName - User-provided original filename.
 * @param {string} userId - User identifier for isolated storage workspace.
 * @param {string} docId - Unique document identifier.
 * @returns {Promise<object>} Ingestion execution report.
 */
export async function resilientRAGIngestionWorkflow(filePath, originalName, userId, docId) {
  let activities;
  
  // Safeguard: Check if running in mock offline/test environment
  const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');

  if (isMock) {
    // Dynamic import to prevent Temporal workflow sandbox compiler from loading Node APIs in production
    activities = await import('./ragIngestionActivities.js');
  } else {
    const { proxyActivities } = await import('@temporalio/workflow');
    activities = proxyActivities({
      startToCloseTimeout: '60 minutes',
      retry: {
        initialInterval: '5s',
        backoffCoefficient: 2,
        maximumInterval: '5 minutes',
        maximumAttempts: 3
      }
    });
  }

  try {
    // 1. Download/Load file, checking for absolute GCS/local paths
    const loadResult = await activities.downloadAndLoadFileActivity(filePath, originalName, docId);
    if (!loadResult.success) {
      throw new Error(`Temporal Ingestion failed during file loading step.`);
    }

    // 2. High-fidelity parsing to structured HTML/Markdown
    const parseResult = await activities.parseToMarkdownActivity(filePath, originalName, docId);
    if (!parseResult.success) {
      throw new Error(`Temporal Ingestion failed during high-fidelity HTML-to-Markdown parsing step.`);
    }

    // 3. Structured chunking, Title/Keyword auto-extraction, and text-embedding-004 vector embedding
    const embeddingResult = await activities.chunkAndEmbedActivity(filePath, originalName, docId, userId);
    if (!embeddingResult.success) {
      throw new Error(`Temporal Ingestion failed during embedding generation step.`);
    }

    // 4. pgvector database sync and Manifest DB commit
    const commitResult = await activities.commitToVectorStoreActivity(filePath, originalName, docId, userId);
    if (!commitResult.success) {
      throw new Error(`Temporal Ingestion failed during vector database commit step.`);
    }

    return {
      success: true,
      docId,
      originalName,
      status: 'completed',
      message: `World-class resilient RAG document ingestion successfully committed via Temporal durable workflows.`
    };
  } catch (error) {
    // Saga Rollback logic: Purge any partial/corrupt vector nodes and reset state records
    console.error(`[Temporal RAG Ingestion Orchestrator] Critical ingestion failure: ${error.message}. Initiating rollback compensation...`);
    
    try {
      await activities.cleanupFailedIngestionActivity(filePath, originalName, docId, userId);
    } catch (purgeError) {
      console.error(`[Temporal RAG Ingestion Orchestrator] Failed to execute compensating rollback activity: ${purgeError.message}`);
    }

    throw new Error(`Resilient RAG Ingestion Workflow Failed: ${error.message}`);
  }
}
