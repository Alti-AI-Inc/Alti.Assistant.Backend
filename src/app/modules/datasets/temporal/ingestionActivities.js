import { DatasetsCrawlerService } from '../datasetsCrawler.service.js';
import { DatasetsService } from '../datasets.service.js';
import Dataset from '../datasets.model.js';
import DatasetQueue from '../datasetQueue.model.js';
import { Storage } from '@google-cloud/storage';
import path from 'path';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Resilient Temporal Activity wrapping programmatical Hugging Face Hub scanning
 * @param {number} maxDatasetsToScan - Limits the scan to a specific dataset count
 * @returns {Promise<object>} Discovery and queueing report
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
 * Resilient Temporal Activity streaming dataset Parquet files directly from HF to GCS
 * @param {string} datasetId - Target Hugging Face dataset identifier
 * @returns {Promise<object>} GCS upload report
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
 * Resilient Temporal Activity parsing Parquet from GCS and loading chunk embeddings into pgvector
 * @param {string} datasetId - Target Hugging Face dataset identifier
 * @returns {Promise<object>} pgvector indexing report
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
 * Saga compensating activity to delete partially uploaded GCS files and mark status as failed
 * @param {string} datasetId - Target Hugging Face dataset identifier
 * @returns {Promise<object>} Rollback report
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
      logger.warn(`[Temporal Saga] GCS purge error (non-fatal, bucket might be uninitialized): ${gcsErr.message}`);
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
