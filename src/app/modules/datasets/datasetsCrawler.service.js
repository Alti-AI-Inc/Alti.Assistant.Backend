import axios from 'axios';
import Dataset from './datasets.model.js';
import DatasetQueue from './datasetQueue.model.js';
import { DatasetsService } from './datasets.service.js';
import { temporalClientCoordinator } from '../workflow_automation/services/temporal/client.js';
import { runDatasetIngestionWorkflow } from './temporal/ingestionWorkflow.js';


/**
 * @constant {string[]} ALLOWED_LICENSES - Strict legal purity license filter.
 *   Only datasets with these licenses (case-insensitive) will be considered for ingestion.
 */
const ALLOWED_LICENSES = ['mit', 'apache-2.0'];

/**
 * @function getMaxSizeBytes
 * @description Retrieves the maximum allowed dataset size in bytes for crawling from environment variables.
 *   Defaults to 2 GB if `HF_CRAWLER_MAX_SIZE_GB` is not set.
 * @returns {number} The maximum dataset size in bytes.
 */
const getMaxSizeBytes = () => {
  const gb = parseFloat(process.env.HF_CRAWLER_MAX_SIZE_GB || '2');
  return gb * 1024 * 1024 * 1024;
};

/**
 * @function getGcsCapacityBytes
 * @description Retrieves the total GCS storage capacity limit in bytes for archived datasets from environment variables.
 *   Defaults to 5 TB if `HF_CRAWLER_GCS_CAP_TB` is not set.
 * @returns {number} The GCS storage capacity limit in bytes.
 */
const getGcsCapacityBytes = () => {
  const tb = parseFloat(process.env.HF_CRAWLER_GCS_CAP_TB || '5');
  return tb * 1024 * 1024 * 1024 * 1024;
};

/**
 * @global
 * @var {boolean} isWorkerRunning - Flag indicating if the main crawler worker loop should be active.
 */
let isWorkerRunning = false;
/**
 * @global
 * @var {boolean} workerLoopActive - Flag indicating if the worker loop is currently executing.
 */
let workerLoopActive = false;
/**
 * @global
 * @var {number} rateLimitBackoffMs - Dynamic backoff tracking in milliseconds for rate-limiting.
 */
let rateLimitBackoffMs = 0; // Dynamic backoff tracking

/**
 * @function extractLicense
 * @description Normalizes and extracts the license string from a Hugging Face API dataset item.
 *   It attempts to find the license in `item.cardData.license` (string, array, or object with 'type')
 *   or falls back to searching `item.tags` for a 'license:' prefixed tag.
 *   For arrays, it enforces strict purity: only if exactly one allowed license is present will it be returned.
 * @param {object} item - The dataset item object from the Hugging Face API.
 * @param {object} [item.cardData] - Card data containing metadata.
 * @param {(string|string[]|object)} [item.cardData.license] - License information, can be a string, array of strings, or an object with a 'type' property.
 * @param {string[]} [item.tags] - Array of tags associated with the dataset.
 * @returns {string} The normalized, lowercase license string, or 'unspecified' if not found or not strictly pure.
 */
const extractLicense = (item) => {
  if (item.cardData && item.cardData.license) {
    // If it's a string
    if (typeof item.cardData.license === 'string') {
      return item.cardData.license.trim().toLowerCase();
    }
    // If it's an array, enforce strict purity: only one allowed license
    if (Array.isArray(item.cardData.license)) {
      const normalizedLicenses = item.cardData.license
        .map(l => String(l).trim().toLowerCase())
        .filter(l => ALLOWED_LICENSES.includes(l)); // Filter for allowed ones

      if (normalizedLicenses.length === 1) { // Only one allowed license found
        return normalizedLicenses[0];
      }
      // If zero, or more than one allowed license, it's not "pure"
      return 'unspecified';
    }
    // If it's an object (e.g. { type: 'mit' })
    if (typeof item.cardData.license === 'object' && item.cardData.license.type) {
      return String(item.cardData.license.type).trim().toLowerCase();
    }
  }

  // Fallback to tags list search
  if (Array.isArray(item.tags)) {
    const licenseTag = item.tags.find(t => t.startsWith('license:'));
    if (licenseTag) {
      return licenseTag.replace('license:', '').trim().toLowerCase();
    }
  }

  return 'unspecified';
};

/**
 * @function scanHuggingFaceHub
 * @description Discovers and indexes Hugging Face datasets into the local crawling queue (`DatasetQueue`).
 *   It fetches datasets from the Hugging Face Hub API, applies various filters (gated, private, media, license, size),
 *   and queues eligible datasets for ingestion. Existing datasets in the queue are updated, and their status
 *   is re-evaluated based on current HF metadata.
 * @param {number} [maxDatasetsToScan=500] - The maximum number of datasets to scan from the Hugging Face Hub.
 * @returns {Promise<object>} An object containing `success` status and `stats` about the scan process.
 * @throws {Error} If the HF Discovery Scanner encounters a critical error during the scan.
 */
const scanHuggingFaceHub = async (maxDatasetsToScan = 500) => {
  try {
    console.log(`[HF Scanner] Initiating paginated discovery. Target scan limit: ${maxDatasetsToScan}`);
    let scannedCount = 0;
    let nextPageUrl = `https://huggingface.co/api/datasets?sort=downloads&direction=-1&limit=100&full=true`;
    
    const maxSizeBytes = getMaxSizeBytes();
    let stats = { discovered: 0, queued: 0, skippedGated: 0, skippedSize: 0, skippedLicense: 0 };

    while (nextPageUrl && scannedCount < maxDatasetsToScan) {
      console.log(`[HF Scanner] Querying HF Hub endpoint: ${nextPageUrl}`);
      const response = await axios.get(nextPageUrl, {
        headers: { 'User-Agent': 'Alti-Assistant-Backend' }
      });

      const datasets = response.data;
      if (!Array.isArray(datasets) || datasets.length === 0) {
        break;
      }

      // Optimization: Batch fetch existing queue items for the current page of datasets
      // This avoids N+1 queries inside the loop for DatasetQueue.findOne
      const datasetIdsOnPage = datasets.map(item => item.id);
      // Recommended index: { datasetId: 1 } on DatasetQueue model for efficient lookups.
      const existingQueueItems = await DatasetQueue.find({ datasetId: { $in: datasetIdsOnPage } }).lean();
      const existingQueueMap = new Map(existingQueueItems.map(item => [item.datasetId, item]));

      for (const item of datasets) {
        if (scannedCount >= maxDatasetsToScan) break;
        scannedCount++;

        const datasetId = item.id;
        const downloads = item.downloads || 0;
        const likes = item.likes || 0;
        const isGated = item.gated || false;
        const isPrivate = item.private || false;
        const rawLicense = extractLicense(item);
        
        let calculatedStatus = 'pending'; // Default status, will be updated by filters
        let calculatedSkipReason = '';
        let calculatedSizeBytes = 0;

        // Determine status based on current Hugging Face data
        // 1. Gatekeeper Filter: Gated or Private
        if (isGated || isPrivate) {
          calculatedStatus = 'skipped';
          calculatedSkipReason = 'Gated or Private dataset';
          stats.skippedGated++;
        } 
        // 2. Gatekeeper Filter: Media/Non-Text (Image, Audio, Video, 3D) dataset detection
        else {
          const tags = item.tags || [];
          const blacklistedTasks = [
            'image-classification', 'image-segmentation', 'zero-shot-image-classification', 
            'image-to-image', 'unconditional-image-generation', 'video-classification', 
            'text-to-video', 'zero-shot-video-classification', 'depth-estimation', 
            'image-to-text', 'image-to-video', 'text-to-image', 'mask-generation',
            'audio-classification', 'text-to-speech', 'automatic-speech-recognition', 
            'audio-to-audio', 'voice-activity-detection', 'text-to-3d', 'image-to-3d', '3d'
          ];
          
          let isMedia = false;
          let matchedMediaTag = '';
          for (const tag of tags) {
            if (tag.startsWith('task_categories:')) {
              const category = tag.replace('task_categories:', '').trim().toLowerCase();
              if (blacklistedTasks.includes(category)) {
                isMedia = true;
                matchedMediaTag = tag;
                break;
              }
            }
          }
          
          // Check dataset ID or tags for keywords like 'image', 'audio', 'video', 'objaverse'
          const lowerId = datasetId.toLowerCase();
          if (!isMedia) {
            const mediaKeywords = ['image', 'audio', 'video', 'spectrogram', 'speech', 'objaverse', 'point-cloud', 'pointcloud', '3d-mesh', 'voxels'];
            for (const keyword of mediaKeywords) {
              if (lowerId.includes(keyword)) {
                isMedia = true;
                matchedMediaTag = `keyword:${keyword}`;
                break;
              }
            }
          }

          if (isMedia) {
            calculatedStatus = 'skipped';
            calculatedSkipReason = `Media/Non-Text Dataset: matched ${matchedMediaTag}`;
            stats.skippedLicense++; // Count as skipped/license skip metric (as per original logic)
          } 
          // 3. Gatekeeper Filter: Strict Legal License Purity (Pure MIT or pure Apache 2.0 only)
          else {
            const isMIT = rawLicense === 'mit';
            const isApache = rawLicense === 'apache-2.0' || rawLicense === 'apache-2.0-only';
            if (!isMIT && !isApache) {
              calculatedStatus = 'skipped';
              calculatedSkipReason = `Unsupported License: "${rawLicense}" (Only pure mit and apache-2.0 allowed)`;
              stats.skippedLicense++;
            } 
            // 4. Gatekeeper Filter: Rough Size threshold (if exposed in metadata)
            else {
              if (item.cardData?.dataset_info?.dataset_size) {
                calculatedSizeBytes = item.cardData.dataset_info.dataset_size;
              } else if (item.cardData?.dataset_info?.download_size) {
                calculatedSizeBytes = item.cardData.dataset_info.download_size;
              }

              if (calculatedSizeBytes > maxSizeBytes) {
                calculatedStatus = 'skipped';
                calculatedSkipReason = `Exceeded Max Size Limit (${(calculatedSizeBytes / (1024 * 1024)).toFixed(2)} MB)`;
                stats.skippedSize++;
              }
            }
          }
        }

        // Now, determine the final status for the queue item, considering its previous state
        const existingQueueItem = existingQueueMap.get(datasetId);
        let finalStatus = calculatedStatus;

        if (existingQueueItem) {
          // If an item was previously completed or downloading, and still passes filters, keep its status.
          // If it now fails filters, update to 'skipped'.
          if ((existingQueueItem.status === 'completed' || existingQueueItem.status === 'downloading') && calculatedStatus === 'pending') {
            finalStatus = existingQueueItem.status; 
          } 
          // If it was failed or skipped before, but now passes filters, set to 'pending' for re-evaluation.
          else if ((existingQueueItem.status === 'failed' || existingQueueItem.status === 'skipped') && calculatedStatus === 'pending') {
            finalStatus = 'pending';
          }
          // In all other cases (e.g., was pending, now skipped; was completed, now skipped; was failed, still skipped),
          // `finalStatus` remains `calculatedStatus`.
        } else {
          stats.discovered++; // Only increment discovered for truly new items
        }

        // Update or create the queue item in the database
        const updatePayload = {
          downloads,
          likes,
          license: rawLicense,
          lastAttemptedAt: new Date(), // Always update last attempted at scan time
          status: finalStatus,
          skipReason: calculatedSkipReason,
          sizeBytes: calculatedSizeBytes,
        };

        await DatasetQueue.findOneAndUpdate(
          { datasetId },
          { $set: updatePayload },
          { upsert: true, new: true }
        );

        // Update stats for queued items based on final status
        if (finalStatus === 'pending' && (!existingQueueItem || existingQueueItem.status !== 'pending')) {
          stats.queued++; // Count as queued if it's new or changed to pending
        }
      }

      // Extract next page URL from 'Link' header (Hugging Face pagination format)
      nextPageUrl = null;
      const linkHeader = response.headers.link;
      if (linkHeader) {
        const matches = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (matches) {
          nextPageUrl = matches[1];
        }
      }
    }

    console.log(`[HF Scanner] Completed! Stats:`, stats);
    return { success: true, stats };
  } catch (error) {
    console.error(`[HF Scanner] Scan process failure:`, error);
    throw new Error(`HF Discovery Scanner failed: ${error.message}`);
  }
};

/**
 * @function runWorkerLoop
 * @description The main sequential background worker loop for processing the dataset queue.
 *   It continuously polls for 'pending' datasets, archives them to GCS, and then triggers RAG indexing.
 *   Includes GCS capacity guardrails, dynamic rate-limiting backoff, and retry logic.
 *   This is the legacy fallback worker used when Temporal is not available or in mock mode.
 * @returns {Promise<void>} A promise that resolves when the worker loop is halted.
 */
const runWorkerLoop = async () => {
  if (workerLoopActive) return;
  workerLoopActive = true;

  console.log('[HF Worker] sequential downloader daemon loop started.');

  while (isWorkerRunning) {
    try {
      // 1. GCS Capacity Guardrail
      const capacityLimit = getGcsCapacityBytes();
      // Recommended index: { sizeBytes: 1 } on Dataset model for efficient aggregation.
      const currentStorageUsed = await Dataset.aggregate([
        { $group: { _id: null, total: { $sum: '$sizeBytes' } } }
      ]);
      const totalBytesArchived = currentStorageUsed[0]?.total || 0;

      if (totalBytesArchived >= capacityLimit) {
        console.warn(`[HF Worker] GCS Storage Limit Reached (${(totalBytesArchived / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB / ${(capacityLimit / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB). Halting crawler loop.`);
        isWorkerRunning = false;
        break;
      }

      // 2. Dynamic rate limit backing-off pause
      if (rateLimitBackoffMs > 0) {
        console.log(`[HF Worker] Applying rate-limit sleep penalty: ${rateLimitBackoffMs / 1000}s`);
        await new Promise(r => setTimeout(r, rateLimitBackoffMs));
        rateLimitBackoffMs = 0; // Reset after backing off
      }

      // 3. Poll next high-priority pending queue item
      // Recommended index: { status: 1, downloads: -1 } on DatasetQueue model for efficient polling.
      const queueItem = await DatasetQueue.findOne({ status: 'pending' }).sort({ downloads: -1 });
      if (!queueItem) {
        console.log('[HF Worker] Queue empty. Sleeping for 10 seconds...');
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      const { datasetId } = queueItem;
      console.log(`[HF Worker] Processing queued dataset: ${datasetId} (Downloads: ${queueItem.downloads})`);

      queueItem.status = 'downloading';
      queueItem.lastAttemptedAt = new Date();
      await queueItem.save();

      // 4. Archive dataset using Core awaited helper
      try {
        // Prepare local dataset metadata catalog record
        const info = await DatasetsService.getHFDatasetInfo(datasetId);
        
        // Optimization: Use findOneAndUpdate with upsert: true to create or update the Dataset record.
        // Recommended index: { datasetId: 1 } on Dataset model for efficient lookups.
        let dataset = await Dataset.findOneAndUpdate(
          { datasetId },
          {
            $set: {
              datasetId: info.datasetId,
              name: info.name,
              author: info.author,
              description: info.description,
              downloads: info.downloads,
              likes: info.likes,
              tags: info.tags,
              configs: info.configs,
              splits: info.splits,
              status: 'pending' // Status will be updated after archiving
            }
          },
          { upsert: true, new: true } // Create if not exists, return the updated/new document
        );
        
        // Execute awaited pipeline piping directly to GCS
        await DatasetsService.archiveDatasetToGCSCore(datasetId, dataset);

        // Autonomously trigger the high-fidelity RAG vector indexing step sequentially
        try {
          console.log(`[HF Worker] Autonomously indexing dataset for RAG vector search: ${datasetId}`);
          await DatasetsService.indexDatasetForRAGCore(datasetId, dataset);

          // If both archiving and indexing succeed, mark as completed
          queueItem.status = 'completed';
          queueItem.sizeBytes = dataset.sizeBytes;
          queueItem.error = '';
          await queueItem.save();
          console.log(`[HF Worker] Successfully archived to GCS and indexed: ${datasetId}`);

        } catch (indexErr) {
          console.error(`[HF Worker] Failed to index dataset ${datasetId} autonomously:`, indexErr.message);
          // If indexing fails, mark the item as failed for retry or final failure
          queueItem.retryCount = (queueItem.retryCount || 0) + 1;
          queueItem.error = `Indexing Failed: ${indexErr.message}`;
          if (queueItem.retryCount >= 3) {
            queueItem.status = 'failed';
            console.error(`[HF Worker] Dataset ${datasetId} failed all retries including indexing. Marking as FAILED.`);
          } else {
            queueItem.status = 'pending'; // Schedule retry for the whole ingestion process
            console.log(`[HF Worker] Scheduled retry ${queueItem.retryCount}/3 for dataset (indexing failed): ${datasetId}`);
          }
          await queueItem.save();
        }

      } catch (err) {
        console.error(`[HF Worker] Ingestion execution failure for ${datasetId}:`, err.message);

        // Check if rate limited
        if (err.message.includes('429') || (err.response && err.response.status === 429)) {
          console.warn('[HF Worker] Rate-limit (429) detected! Backing off worker loop.');
          rateLimitBackoffMs = 30000; // sleep 30 seconds
          queueItem.status = 'pending'; // retry later
          queueItem.error = `Rate Limit: ${err.message}`;
        } else {
          // Normal failure
          queueItem.retryCount = (queueItem.retryCount || 0) + 1; // Ensure retryCount exists
          queueItem.error = err.message;
          if (queueItem.retryCount >= 3) {
            queueItem.status = 'failed';
            console.error(`[HF Worker] Dataset ${datasetId} failed all retries. Marking as FAILED.`);
          } else {
            queueItem.status = 'pending'; // Schedule retry
            console.log(`[HF Worker] Scheduled retry ${queueItem.retryCount}/3 for dataset: ${datasetId}`);
          }
        }
        await queueItem.save();
      }

      // Add a polite spacing delay between tasks to be gentle on servers
      await new Promise(r => setTimeout(r, 2000));

    } catch (loopErr) {
      console.error('[HF Worker] Loop processing error:', loopErr);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  workerLoopActive = false;
  console.log('[HF Worker] sequential downloader daemon loop halted.');
};

/**
 * @function runTemporalWorkerLoop
 * @description The resilient Temporal Ingestion Coordinator worker loop.
 *   It continuously polls for 'pending' datasets in the queue and dispatches them as
 *   Temporal Workflows for durable and fault-tolerant ingestion.
 *   Includes GCS capacity guardrails.
 * @returns {Promise<void>} A promise that resolves when the worker loop is halted.
 */
const runTemporalWorkerLoop = async () => {
  if (workerLoopActive) return;
  workerLoopActive = true;

  console.log('[HF Worker] Resilient Temporal Ingestion Coordinator loop started.');

  while (isWorkerRunning) {
    try {
      // 1. GCS Capacity Guardrail
      const capacityLimit = getGcsCapacityBytes();
      // Recommended index: { sizeBytes: 1 } on Dataset model for efficient aggregation.
      const currentStorageUsed = await Dataset.aggregate([
        { $group: { _id: null, total: { $sum: '$sizeBytes' } } }
      ]);
      const totalBytesArchived = currentStorageUsed[0]?.total || 0;

      if (totalBytesArchived >= capacityLimit) {
        console.warn(`[HF Worker] GCS Storage Limit Reached (${(totalBytesArchived / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB / ${(capacityLimit / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB). Halting crawler loop.`);
        isWorkerRunning = false;
        break;
      }

      // 2. Poll next high-priority pending queue item
      // Recommended index: { status: 1, downloads: -1 } on DatasetQueue model for efficient polling.
      const queueItem = await DatasetQueue.findOne({ status: 'pending' }).sort({ downloads: -1 });
      if (!queueItem) {
        console.log('[HF Worker] Queue empty. Sleeping for 10 seconds...');
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      const { datasetId } = queueItem;
      console.log(`[HF Worker] Dispatching queued dataset to Temporal Ingestion Workflow: ${datasetId}`);

      queueItem.status = 'downloading';
      queueItem.lastAttemptedAt = new Date();
      await queueItem.save();

      try {
        const client = temporalClientCoordinator.client;
        if (!client) {
          throw new Error('Temporal client is not initialized.');
        }

        const workflowId = `ingest-${datasetId.replace(/\//g, '-')}-${Date.now()}`;
        
        await client.workflow.start(runDatasetIngestionWorkflow, {
          args: [datasetId],
          taskQueue: 'alti-workflows-queue',
          workflowId
        });

        console.log(`[HF Worker] Durable Ingestion Workflow started with ID: ${workflowId}`);
        
        // Wait a small delay before checking next item to avoid rapid concurrent starts
        await new Promise(r => setTimeout(r, 5000));
      } catch (err) {
        console.error(`[HF Worker] Failed to start Temporal workflow for ${datasetId}:`, err.message);
        queueItem.status = 'failed';
        queueItem.error = `Temporal Launch Error: ${err.message}`;
        await queueItem.save();
        
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (loopErr) {
      console.error('[HF Worker] Temporal coordinator loop processing error:', loopErr);
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  workerLoopActive = false;
  console.log('[HF Worker] Resilient Temporal Ingestion Coordinator loop halted.');
};

/**
 * @function startWorker
 * @description Starts the continuous background queue processor worker.
 *   It attempts to connect to Temporal and launches either the Temporal-based coordinator
 *   or falls back to the legacy sequential worker loop if Temporal is unavailable or in mock mode.
 * @returns {object} An object indicating success and a message about the worker's status.
 */
const startWorker = () => {
  if (isWorkerRunning) {
    return { success: true, message: 'Continuous worker loop is already running.' };
  }
  isWorkerRunning = true;

  // Asynchronously connect to Temporal and start the correct worker loop
  (async () => {
    try {
      await temporalClientCoordinator.connect();
      if (temporalClientCoordinator.isMock) {
        console.log('[HF Worker] System is in Offline/Mock Standby Mode. Launching Legacy sequential loop fallback.');
        runWorkerLoop();
      } else {
        console.log('[HF Worker] System is connected to a live cluster. Launching Resilient Temporal Workflow coordinator.');
        runTemporalWorkerLoop();
      }
    } catch (err) {
      console.error('[HF Worker] Failed to initialize temporal client, falling back to legacy loop:', err);
      runWorkerLoop();
    }
  })();

  return { success: true, message: 'Continuous sequential background queue worker started.' };
};


/**
 * @function stopWorker
 * @description Stops the continuous background queue processor worker.
 *   It sets a flag that signals the worker loop to gracefully shut down after completing its current task.
 * @returns {object} An object indicating success and a message about the worker's status.
 */
const stopWorker = () => {
  if (!isWorkerRunning) {
    return { success: true, message: 'Continuous worker loop is already stopped.' };
  }
  isWorkerRunning = false;
  return { success: true, message: 'Continuous worker loop stop signal dispatched. Worker will shut down cleanly after finishing its active download.' };
};

/**
 * @function getCrawlerStats
 * @description Compiles real-time metrics and logs for operational visibility of the crawler.
 *   Aggregates counts and total sizes of datasets by their status in the queue.
 * @returns {Promise<object>} An object containing various statistics about the crawler's state and queue.
 * @throws {Error} If there's a failure in compiling the crawler statistics.
 */
const getCrawlerStats = async () => {
  try {
    // Recommended indexes: { status: 1 } and { sizeBytes: 1 } on DatasetQueue model for efficient aggregation.
    const counts = await DatasetQueue.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 }, totalBytes: { $sum: '$sizeBytes' } } }
    ]);

    const stats = {
      pending: 0,
      downloading: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      totalBytesDownloaded: 0,
      isWorkerRunning,
      workerLoopActive
    };

    counts.forEach(c => {
      if (c._id) {
        stats[c._id] = c.count;
      }
      if (c._id === 'completed' || c._id === 'downloading') {
        stats.totalBytesDownloaded += (c.totalBytes || 0);
      }
    });

    return stats;
  } catch (err) {
    throw new Error(`Failed to compile crawler stats: ${err.message}`);
  }
};

/**
 * @function getQueueList
 * @description Queries the dataset queue listings with optional filtering, pagination, and sorting.
 * @param {object} [filter={}] - MongoDB query filter object to apply to the DatasetQueue.
 * @param {number} [limit=50] - The maximum number of queue items to return.
 * @param {number} [skip=0] - The number of queue items to skip for pagination.
 * @returns {Promise<object>} An object containing the total count, pagination details, and the list of queue items.
 * @throws {Error} If there's a failure in retrieving the queue list.
 */
const getQueueList = async (filter = {}, limit = 50, skip = 0) => {
  try {
    // Optimization: Add .lean() for read-only queries to improve performance.
    // Recommended index: { downloads: -1 } on DatasetQueue model for sorting.
    // If 'filter' is frequently used with specific fields, consider compound indexes like { 'filterField': 1, downloads: -1 }.
    const list = await DatasetQueue.find(filter)
      .sort({ downloads: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Added .lean()
    
    // Recommended index: Indexes on fields used in 'filter' for efficient countDocuments.
    const total = await DatasetQueue.countDocuments(filter);
    
    return { total, limit, skip, data: list };
  } catch (err) {
    throw new Error(`Failed to retrieve queue list: ${err.message}`);
  }
};

/**
 * @namespace DatasetsCrawlerService
 * @description Provides services for crawling, queuing, and managing Hugging Face datasets.
 *   Includes functionality for discovering datasets, running background ingestion workers,
 *   and retrieving operational statistics.
 */
export const DatasetsCrawlerService = {
  scanHuggingFaceHub,
  startWorker,
  stopWorker,
  getCrawlerStats,
  getQueueList,
  extractLicense
};