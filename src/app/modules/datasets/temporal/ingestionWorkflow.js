/**
 * Stateful, durable Temporal Ingestion Workflow that orchestrates
 * downloading from Hugging Face, GCS archiving, and pgvector RAG indexing.
 * Implements the transactional Saga pattern for compensating rollbacks.
 * 
 * @param {string} datasetId - Target Hugging Face dataset identifier.
 * @returns {Promise<object>} Ingestion execution report.
 */
export async function runDatasetIngestionWorkflow(datasetId) {
  let activities;
  
  // Safeguard: Check if running in mock offline/test environment
  const isMock = typeof process !== 'undefined' && process.env && (process.env.TEMPORAL_MOCK === 'true' || process.env.OFFLINE_MODE === 'true');

  if (isMock) {
    // Dynamic import to prevent Temporal workflow sandbox compiler from loading Node APIs in production
    activities = await import('./ingestionActivities.js');
  } else {
    const { proxyActivities } = await import('@temporalio/workflow');
    activities = proxyActivities({
      startToCloseTimeout: '30 minutes',
      retry: {
        initialInterval: '5s',
        backoffCoefficient: 2,
        maximumInterval: '2 minutes',
        maximumAttempts: 3
      }
    });
  }

  try {
    // 1. Download and Archive Parquet streams to GCS
    const archiveResult = await activities.downloadAndArchiveActivity(datasetId);
    if (!archiveResult.success) {
      throw new Error(`Archival step failed for dataset ${datasetId}`);
    }

    // 2. Extract and embed into pgvector RAG
    const indexingResult = await activities.indexRAGActivity(datasetId);
    if (!indexingResult.success) {
      throw new Error(`Indexing step failed for dataset ${datasetId}`);
    }

    return {
      success: true,
      datasetId,
      status: 'indexed',
      message: `Resilient ingestion and RAG vector indexing successfully completed via Temporal.`
    };
  } catch (error) {
    // Saga Rollback logic: Purge any partial/corrupt files on GCS and reset states
    console.error(`[Temporal Ingestion Orchestrator] Critical ingestion failure: ${error.message}. Initiating rollback compensation...`);
    
    try {
      await activities.purgeCorruptDatasetActivity(datasetId);
    } catch (purgeError) {
      console.error(`[Temporal Ingestion Orchestrator] Failed to execute purge compensating rollback: ${purgeError.message}`);
    }

    throw new Error(`Dataset Ingestion Workflow Failed: ${error.message}`);
  }
}
