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
 * @property {number} sizeBytes - The total size of the archived dataset files in bytes.
 * @property {string[]} gcsPaths - An array of Google Cloud Storage paths where the dataset files are stored.
 */

/**
 * @typedef {object} PgVectorIndexingReport
 * @property {boolean} success - Indicates if the indexing process was successful.
 * @property {string} datasetId - The identifier of the dataset that was processed.
 * @property {string} status - The updated status of the dataset after indexing (e.g., 'indexed', 'failed').
 */

/**
 * @typedef {object} RollbackReport
 * @property {boolean} success - Indicates if the purge operation was successful.
 * @property {string} datasetId - The identifier of the dataset that was purged.
 * @property {boolean} purged - True if the dataset's associated resources were purged.
 */

import { DatasetsCrawlerService } from '../datasetsCrawler.service.js';
import { DatasetsService } from '../datasets.service.js';
import Dataset from '../datasets.model.js';
import DatasetQueue from '../datasetQueue.model.js';
import { Storage } from '@google-cloud/storage';
import path from 'path';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Resilient Temporal Activity wrapping programmatical Hugging Face Hub scanning.
 * This activity initiates a scan of the Hugging Face Hub to discover new datasets
 * and queue them for ingestion if they meet specified criteria.
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
 * @param {string} datasetId - The target Hugging Face dataset identifier (e.g., "HuggingFaceH4/ultrachat_200k").
 * @returns {Promise<GCSUploadReport>} A report detailing the GCS upload status and paths.
 * @throws {Error} If fetching dataset info fails, database operations fail, or GCS archival fails.
 */
export async function downloadAndArchiveActivity(datasetId) {
  logger.info(`[Temporal Activity] Downloading and Archiving dataset to GCS: ${datasetId}`);
  try {
    const info = await DatasetsService.getHFDatasetInfo(datasetId);
    let dataset = await Dataset.findOne({ datasetId });
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
        status: 'pending'
      });
    } else {
      dataset.status = 'pending';
      dataset.error = '';
    }
    await dataset.save();

    await DatasetsService.archiveDatasetToGCSCore(datasetId, dataset);
    
    return {
      success: true,
      datasetId,
      sizeBytes: dataset.sizeBytes,
      gcsPaths: dataset.gcsPaths
    };
  } catch (error) {
    logger.error(`[Temporal Activity] Failed to archive dataset ${datasetId}: ${error.message}`);
    throw error;
  }
}

/**
 * Resilient Temporal Activity parsing Parquet files from GCS and loading chunk embeddings into pgvector.
 * This activity retrieves a dataset from the catalog, processes its archived Parquet files,
 * extracts relevant data, generates embeddings, and stores them in the pgvector database for RAG.
 * @param {string} datasetId - The target Hugging Face dataset identifier.
 * @returns {Promise<PgVectorIndexingReport>} A report detailing the pgvector indexing status.
 * @throws {Error} If the dataset is not found in the catalog, or if the indexing process fails.
 */
export async function indexRAGActivity(datasetId) {
  logger.info(`[Temporal Activity] Indexing dataset into pgvector RAG: ${datasetId}`);
  try {
    const dataset = await Dataset.findOne({ datasetId });
    if (!dataset) {
      throw new Error(`Dataset ${datasetId} not found in catalog.`);
    }
    await DatasetsService.indexDatasetForRAGCore(datasetId, dataset);
    return {
      success: true,
      datasetId,
      status: dataset.status
    };
  } catch (error) {
    logger.error(`[Temporal Activity] Failed to index dataset ${datasetId}: ${error.message}`);
    throw error;
  }
}

/**
 * Saga compensating activity to delete partially uploaded GCS files and mark dataset status as failed.
 * This activity is triggered as part of a Temporal Saga to roll back an ingestion process
 * if an error occurs. It attempts to clean up GCS artifacts and update the dataset's status.
 * @param {string} datasetId - The target Hugging Face dataset identifier to be purged.
 * @returns {Promise<RollbackReport>} A report detailing the rollback and purge operation.
 * @throws {Error} If critical parts of the Saga rollback fail (e.g., updating database status).
 */
export async function purgeCorruptDatasetActivity(datasetId) {
  logger.info(`[Temporal Saga Activity] Purging corrupt or failed dataset: ${datasetId}`);
  try {
    // 1. Delete all GCS files with the datasets prefix
    try {
      const keyPath = config.google.google_application_credentials || path.join(process.cwd(), 'alti_gcp.json');
      const storage = new Storage({ keyFilename: keyPath });
      const bucketName = config.gcs.knowledge_bank_bucket || 'alti_assistant_datasets';
      const bucket = storage.bucket(bucketName);
      
      const [files] = await bucket.getFiles({ prefix: `datasets/${datasetId}/` });
      for (const file of files) {
        logger.info(`[Temporal Saga] Deleting GCS file: ${file.name}`);
        await file.delete();
      }
    } catch (gcsErr) {
      logger.warn(`[Temporal Saga] GCS purge error (non-fatal, bucket might be uninitialized or files already gone): ${gcsErr.message}`);
    }

    // 2. Mark queue item as failed or update catalog
    const queueItem = await DatasetQueue.findOne({ datasetId });
    if (queueItem) {
      queueItem.status = 'failed';
      queueItem.error = 'Ingestion failed during execution, Saga compensation triggered.';
      await queueItem.save();
    }

    const dataset = await Dataset.findOne({ datasetId });
    if (dataset) {
      dataset.status = 'failed';
      dataset.error = 'Archival aborted/rolled back by Saga transaction manager.';
      await dataset.save();
    }

    return {
      success: true,
      datasetId,
      purged: true
    };
  } catch (error) {
    logger.error(`[Temporal Saga Activity] Saga rollback failed: ${error.message}`);
    throw error;
  }
}