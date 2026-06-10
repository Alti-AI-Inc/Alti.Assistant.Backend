/**
 * @typedef {object} ScanHFHubReport
 * @property {number} scannedCount - The total number of datasets scanned on Hugging Face Hub.
 * @property {number} newDatasetsCount - The number of new datasets discovered and added to the catalog.
 * @property {number} queuedDatasetsCount - The number of datasets successfully added to the ingestion queue.
 */

/**
 * @typedef {object} GCSUploadReport
 * @property {boolean} success - Indicates if the archival process was successful.
 * @property {string} datasetId - The identifier of the dataset that was processed.
 * @property {string} workspaceId - The identifier of the workspace this operation belongs to.
 * @property {number} sizeBytes - The total size of the archived dataset files in bytes.
 * @property {string[]} gcsPaths - An array of Google Cloud Storage paths where the dataset files are stored.
 */

/**
 * @typedef {object} PgVectorIndexingReport
 * @property {boolean} success - Indicates if the indexing process was successful.
 * @property {string} datasetId - The identifier of the dataset that was processed.
 * @property {string} workspaceId - The identifier of the workspace this operation belongs to.
 * @property {string} status - The updated status of the dataset after indexing (e.g., 'indexed', 'failed').
 */

/**
 * @typedef {object} RollbackReport
 * @property {boolean} success - Indicates if the purge operation was successful.
 * @property {string} datasetId - The identifier of the dataset that was purged.
 * @property {string} workspaceId - The identifier of the workspace this operation belongs to.
 * @property {boolean} purged - True if the dataset's associated resources were purged.
 */

import { DatasetsCrawlerService } from '../datasetsCrawler.service.js';
import { DatasetsService } from '../datasets.service.js';
import Dataset from '../datasets.model.js';
import DatasetQueue from '../datasetQueue.model.js';
// --- IMPROVEMENT: Import Workspace model to enforce subscription and usage limits ---
import Workspace from '../../workspaces/workspace.model.js';
import { Storage } from '@google-cloud/storage';
import path from 'path';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Resilient Temporal Activity wrapping programmatical Hugging Face Hub scanning.
 * This activity initiates a scan of the Hugging Face Hub to discover new datasets
 * and queue them for ingestion if they meet specified criteria. This is a global,
 * system-level activity not tied to a specific workspace.
 * @param {number} [maxDatasetsToScan=500] - Limits the scan to a specific dataset count.
 *                                         If not provided, defaults to 500.
 * @returns {Promise<ScanHFHubReport>} A report detailing the discovery and queueing process.
 * @throws {Error} If the Hugging Face Hub scan fails for any reason.
 */
export async function scanHFHubActivity(maxDatasetsToScan = 500) {
  logger.info(`[Temporal Activity] Scanning Hugging Face Hub (Limit: ${maxDatasetsToScan})`);
  try {
    const result = await DatasetsCrawlerService.scanHuggingFaceHub(maxDatasetsToScan);
    return result;
  } catch (error) {
    logger.error(`[Temporal Activity] HF Hub scan failed: ${error.message}`);
    throw error;
  }
}

/**
 * Resilient Temporal Activity streaming dataset Parquet files directly from Hugging Face Hub to Google Cloud Storage.
 * This activity fetches dataset information, updates or creates a dataset entry in the catalog,
 * and then archives its Parquet files to GCS.
 * ---
 * OPTIMIZATION: Added workspace-level validation to ensure the operation is authorized
 * based on the workspace's subscription status and usage limits. This prevents resource
 * abuse and aligns the ingestion pipeline with the billing and platform management features.
 * ---
 * @param {string} datasetId - The target Hugging Face dataset identifier (e.g., "HuggingFaceH4/ultrachat_200k").
 * @param {string} workspaceId - The ID of the workspace initiating the ingestion.
 * @returns {Promise<GCSUploadReport>} A report detailing the GCS upload status and paths.
 * @throws {Error} If the workspace is invalid, limits are exceeded, fetching dataset info fails, database operations fail, or GCS archival fails.
 */
export async function downloadAndArchiveActivity(datasetId, workspaceId) {
  logger.info(`[Temporal Activity] Downloading and Archiving dataset to GCS: ${datasetId} for Workspace: ${workspaceId}`);
  
  // --- IMPROVEMENT: Enforce workspace subscription and usage limits before consuming resources ---
  if (!workspaceId) {
    throw new Error('FATAL: Workspace ID is required to perform dataset ingestion.');
  }

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace with ID ${workspaceId} not found.`);
  }

  // 1. Verify active subscription
  if (workspace.subscription?.status !== 'active') {
    throw new Error(`Workspace ${workspaceId} does not have an active subscription. Ingestion denied.`);
  }

  // 2. Verify dataset count limit
  const currentDatasetCount = await Dataset.countDocuments({ workspace: workspaceId });
  if (currentDatasetCount >= (workspace.plan?.limits?.maxDatasets ?? 5)) { // Default to 5 if no plan is set
    throw new Error(`Workspace ${workspaceId} has reached its maximum dataset limit of ${workspace.plan.limits.maxDatasets}.`);
  }
  // --- END IMPROVEMENT ---

  try {
    const info = await DatasetsService.getHFDatasetInfo(datasetId);
    let dataset = await Dataset.findOne({ datasetId, workspace: workspaceId });

    if (!dataset) {
      dataset = new Dataset({
        datasetId: info.datasetId,
        name: info.name,
        author: info.author,
        description: info.description,
        downloads: info.downloads,
        likes: info.likes,
        tags: info.tags,
        configs: info.configs,
        splits: info.splits,
        status: 'pending',
        workspace: workspaceId, // Associate dataset with the workspace
      });
    } else {
      // Reset status for re-ingestion attempts
      dataset.status = 'pending';
      dataset.error = '';
    }
    await dataset.save();

    // The core service function now also needs the workspace context for potential detailed logging or metrics
    await DatasetsService.archiveDatasetToGCSCore(datasetId, dataset, workspaceId);
    
    // After successful archival, the dataset object's properties (like sizeBytes, gcsPaths)
    // are updated in memory by archiveDatasetToGCSCore. These changes must be persisted.
    dataset.status = 'archived';
    await dataset.save();

    // --- IMPROVEMENT: Update workspace usage statistics after successful archival ---
    const newStorageBytes = (workspace.usage?.storageBytes ?? 0) + (dataset.sizeBytes ?? 0);
    const newDatasetCount = currentDatasetCount + 1;
    
    // Check storage limit after knowing the dataset size
    if (newStorageBytes > (workspace.plan?.limits?.maxStorageBytes ?? 10737418240)) { // Default to 10GB
      // This is a post-facto check. Ideally, we'd estimate size beforehand.
      // For now, we'll fail the workflow here and the purge activity will clean up.
      dataset.status = 'failed';
      dataset.error = 'Ingestion failed: Workspace storage limit exceeded.';
      await dataset.save();
      throw new Error(`Workspace ${workspaceId} storage limit exceeded after archiving dataset ${datasetId}.`);
    }

    workspace.usage = {
      storageBytes: newStorageBytes,
      datasetCount: newDatasetCount,
    };
    await workspace.save();
    // --- END IMPROVEMENT ---
    
    return {
      success: true,
      datasetId,
      workspaceId,
      sizeBytes: dataset.sizeBytes,
      gcsPaths: dataset.gcsPaths
    };
  } catch (error) {
    logger.error(`[Temporal Activity] Failed to archive dataset ${datasetId} for workspace ${workspaceId}: ${error.message}`);
    // Ensure dataset is marked as failed on any error during this critical step
    const failedDataset = await Dataset.findOne({ datasetId, workspace: workspaceId });
    if (failedDataset && failedDataset.status !== 'failed') {
      failedDataset.status = 'failed';
      failedDataset.error = error.message;
      await failedDataset.save();
    }
    throw error;
  }
}

/**
 * Resilient Temporal Activity parsing Parquet files from GCS and loading chunk embeddings into pgvector.
 * This activity retrieves a dataset from the catalog, processes its archived Parquet files,
 * extracts relevant data, generates embeddings, and stores them in the pgvector database for RAG.
 * @param {string} datasetId - The target Hugging Face dataset identifier.
 * @param {string} workspaceId - The ID of the workspace this dataset belongs to.
 * @returns {Promise<PgVectorIndexingReport>} A report detailing the pgvector indexing status.
 * @throws {Error} If the dataset is not found in the catalog, or if the indexing process fails.
 */
export async function indexRAGActivity(datasetId, workspaceId) {
  logger.info(`[Temporal Activity] Indexing dataset into pgvector RAG: ${datasetId} for Workspace: ${workspaceId}`);
  try {
    // --- IMPROVEMENT: Query dataset with workspaceId to ensure data tenancy ---
    const dataset = await Dataset.findOne({ datasetId, workspace: workspaceId });
    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found in catalog for workspace ${workspaceId}.`);
    }
    
    // A lightweight check to ensure the workspace is still active before compute-intensive indexing
    const workspace = await Workspace.findById(workspaceId, 'subscription.status');
    if (workspace?.subscription?.status !== 'active') {
        throw new Error(`Workspace ${workspaceId} subscription is no longer active. Indexing aborted.`);
    }

    dataset.status = 'indexing';
    await dataset.save();

    await DatasetsService.indexDatasetForRAGCore(datasetId, dataset, workspaceId);
    
    dataset.status = 'indexed';
    dataset.error = ''; // Clear any previous errors
    await dataset.save();

    return {
      success: true,
      datasetId,
      workspaceId,
      status: dataset.status
    };
  } catch (error) {
    logger.error(`[Temporal Activity] Failed to index dataset ${datasetId} for workspace ${workspaceId}: ${error.message}`);
    // Ensure dataset is marked as failed on any error during indexing
    const failedDataset = await Dataset.findOne({ datasetId, workspace: workspaceId });
    if (failedDataset) {
      failedDataset.status = 'failed';
      failedDataset.error = `Indexing failed: ${error.message}`;
      await failedDataset.save();
    }
    throw error;
  }
}

/**
 * Saga compensating activity to delete partially uploaded GCS files and mark dataset status as failed.
 * This activity is triggered as part of a Temporal Saga to roll back an ingestion process
 * if an error occurs. It attempts to clean up GCS artifacts and update the dataset's status.
 * ---
 * OPTIMIZATION: Added workspace-awareness to correctly roll back usage statistics,
 * ensuring billing and limit enforcement remain accurate after a failed ingestion.
 * ---
 * @param {string} datasetId - The target Hugging Face dataset identifier to be purged.
 * @param {string} workspaceId - The ID of the workspace where the ingestion failed.
 * @returns {Promise<RollbackReport>} A report detailing the rollback and purge operation.
 * @throws {Error} If critical parts of the Saga rollback fail (e.g., updating database status).
 */
export async function purgeCorruptDatasetActivity(datasetId, workspaceId) {
  logger.info(`[Temporal Saga Activity] Purging corrupt or failed dataset: ${datasetId} for Workspace: ${workspaceId}`);
  try {
    // 1. Delete all GCS files with the datasets prefix
    try {
      const keyPath = config.google.google_application_credentials || path.join(process.cwd(), 'alti_gcp.json');
      const storage = new Storage({ keyFilename: keyPath });
      const bucketName = config.gcs.knowledge_bank_bucket || 'alti_assistant_datasets';
      const bucket = storage.bucket(bucketName);
      
      // --- IMPROVEMENT: Scope GCS path with workspaceId for better multi-tenant isolation ---
      const gcsPrefix = `workspaces/${workspaceId}/datasets/${datasetId}/`;
      const [files] = await bucket.getFiles({ prefix: gcsPrefix });
      for (const file of files) {
        logger.info(`[Temporal Saga] Deleting GCS file: ${file.name}`);
        await file.delete();
      }
    } catch (gcsErr) {
      logger.warn(`[Temporal Saga] GCS purge error (non-fatal, bucket might be uninitialized or files already gone): ${gcsErr.message}`);
    }

    // 2. Mark queue item as failed (if applicable)
    const queueItem = await DatasetQueue.findOne({ datasetId, workspaceId });
    if (queueItem) {
      queueItem.status = 'failed';
      queueItem.error = 'Ingestion failed during execution, Saga compensation triggered.';
      await queueItem.save();
    }

    // 3. Update dataset catalog entry and roll back workspace usage stats
    const dataset = await Dataset.findOne({ datasetId, workspace: workspaceId });
    if (dataset) {
      const storageBytesToReclaim = dataset.sizeBytes ?? 0;
      const wasSuccessfullyArchived = dataset.status === 'archived' || dataset.status === 'indexing' || dataset.status === 'indexed';

      dataset.status = 'failed';
      dataset.error = 'Archival/Indexing aborted and rolled back by Saga transaction manager.';
      dataset.gcsPaths = [];
      dataset.sizeBytes = 0;
      await dataset.save();

      // --- IMPROVEMENT: Roll back workspace usage stats to maintain accurate limits/billing ---
      if (workspaceId && wasSuccessfullyArchived) {
        const workspace = await Workspace.findById(workspaceId);
        if (workspace) {
          logger.info(`[Temporal Saga] Rolling back usage stats for workspace ${workspaceId}.`);
          // Use $inc to prevent race conditions
          await Workspace.updateOne({ _id: workspaceId }, {
            $inc: {
              'usage.datasetCount': -1,
              'usage.storageBytes': -storageBytesToReclaim
            }
          });
        }
      }
    }

    return {
      success: true,
      datasetId,
      workspaceId,
      purged: true
    };
  } catch (error) {
    logger.error(`[Temporal Saga Activity] Saga rollback failed for dataset ${datasetId} in workspace ${workspaceId}: ${error.message}`);
    throw error;
  }
}