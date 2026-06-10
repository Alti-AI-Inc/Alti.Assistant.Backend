/**
 * Orchestrates the end-to-end ingestion workflow for a dataset,
 * including downloading from Hugging Face, archiving to Google Cloud Storage (GCS),
 * and indexing into a pgvector RAG system. This is a stateful and durable Temporal Workflow
 * designed to be resilient to failures and implements the transactional Saga pattern
 * for compensating rollbacks in case of critical errors.
 *
 * The workflow dynamically loads activities based on the execution environment
 * (mock/offline vs. production Temporal cluster) to ensure proper isolation
 * from Node.js APIs within the Temporal sandbox.
 *
 * @param {string} datasetId - The unique identifier for the target Hugging Face dataset to be ingested.
 * @returns {Promise<object>} A promise that resolves to an ingestion execution report.
 *   The report object contains:
 *   - `success` (boolean): Indicates if the entire workflow completed successfully.
 *   - `datasetId` (string): The identifier of the dataset that was processed.
 *   - `status` (string): A descriptive status, e.g., 'indexed'.
 *   - `message` (string): A human-readable message detailing the outcome.
 * @throws {Error} If any critical step in the ingestion process fails (e.g., download, archive, index),
 *   or if the rollback compensation itself encounters an unrecoverable error. The error message will
 *   provide details about the specific failure.
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