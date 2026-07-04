import axios from 'axios';
import Dataset from './datasets.model.js';
import DatasetQueue from './datasetQueue.model.js';
import { DatasetsService } from './datasets.service.js';
import { temporalClientCoordinator } from '../workflow_automation/services/temporal/client.js';
import { runDatasetIngestionWorkflow } from './temporal/ingestionWorkflow.js';


/**
 * @constant {string[]} ALLOWED_LICENSES - Strict legal purity license filter.
 *   Only datasets with these licenses (case-insensitive) will be considered for ingestion.
 *   BUGFIX: Added 'apache-2.0-only' to align with original intent of allowing Apache 2.0 variants.
 */
const ALLOWED_LICENSES = ['mit', 'apache-2.0', 'apache-2.0-only'];

/**
 * @function getMaxSizeBytes
 * @description Retrieves the maximum allowed dataset size in bytes for crawling from environment variables.
 *   Defaults to 2 GB if `HF_CRAWLER_MAX_SIZE_GB` is not set or is invalid.
 * @returns {number} The maximum dataset size in bytes.
 */
const getMaxSizeBytes = () => {
  const gb = parseFloat(process.env.HF_CRAWLER_MAX_SIZE_GB || '2');
  // BUGFIX: Ensure that a non-numeric environment variable doesn't result in NaN, which would break size comparisons.
  if (isNaN(gb) || gb <= 0) {
    console.warn(`[HF Crawler Config] Invalid or missing HF_CRAWLER_MAX_SIZE_GB. Defaulting to 2 GB.`);
    return 2 * 1024 * 1024 * 1024;
  }
  return gb * 1024 * 1024 * 1024;
};

/**
 * @function getGcsCapacityBytes
 * @description Retrieves the total GCS storage capacity limit in bytes for archived datasets from environment variables.
 *   Defaults to 5 TB if `HF_CRAWLER_GCS_CAP_TB` is not set or is invalid.
 * @returns {number} The GCS storage capacity limit in bytes.
 */
const getGcsCapacityBytes = () => {
  const tb = parseFloat(process.env.HF_CRAWLER_GCS_CAP_TB || '5');
  // BUGFIX: Ensure that a non-numeric environment variable doesn't result in NaN, which would break capacity checks.
  if (isNaN(tb) || tb <= 0) {
    console.warn(`[HF Crawler Config] Invalid or missing HF_CRAWLER_GCS_CAP_TB. Defaulting to 5 TB.`);
    return 5 * 1024 * 1024 * 1024 * 1024;
  }
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
 * @description REFACTORED: Normalizes and extracts the license string from a Hugging Face API dataset item.
 *   It checks all known locations for a license, normalizes the findings, and enforces strict purity:
 *   only if exactly one allowed license (from ALLOWED_LICENSES) is present will it be returned.
 * @param {object} item - The dataset item object from the Hugging Face API.
 * @param {object} [item.cardData] - Card data containing metadata.
 * @param {(string|string[]|object)} [item.cardData.license] - License information.
 * @param {string[]} [item.tags] - Array of tags associated with the dataset.
 * @returns {string} The normalized, lowercase, and allowed license string, or 'unspecified' if not found or not strictly pure.
 */
const extractLicense = (item) => {
  const potentialLicenses = [];

  if (item.cardData && item.cardData.license) {
    const licenseData = item.cardData.license;
    if (typeof licenseData === 'string') {
      potentialLicenses.push(licenseData);
    } else if (Array.isArray(licenseData)) {
      potentialLicenses.push(...licenseData.map(l => String(l)));
    } else if (typeof licenseData === 'object' && licenseData.type) {
      potentialLicenses.push(String(licenseData.type));
    }
  }

  // Fallback to tags list search
  if (Array.isArray(item.tags)) {
    const licenseTag = item.tags.find(t => t.startsWith('license:'));
    if (licenseTag) {
      potentialLicenses.push(licenseTag.replace('license:', ''));
    }
  }

  if (potentialLicenses.length === 0) {
    return 'unspecified';
  }

  // Normalize and filter for allowed licenses
  const normalizedAllowedLicenses = potentialLicenses
    .map(l => String(l).trim().toLowerCase())
    .filter(l => ALLOWED_LICENSES.includes(l));

  // Enforce strict purity: only if exactly one allowed license is present will it be returned.
  if (normalizedAllowedLicenses.length === 1) {
    return normalizedAllowedLicenses[0];
  }

  // If zero, or more than one allowed license, it's not "pure"
  return 'unspecified';
};


/**
 * @function scanHuggingFaceHub
 * @description Discovers and indexes Hugging Face datasets into the local crawling queue (`DatasetQueue`).
 *   It fetches datasets from the Hugging Face Hub API, applies various filters (gated, private, media, license, size),
 *   and queues eligible datasets for ingestion. Existing datasets in the queue are updated.
 * @param {object} user - The authenticated user object, used for authorization.
 * @param {string} user.role - The role of the user (e.g., 'super_admin').
 * @param {number} [maxDatasetsToScan=500] - The maximum number of datasets to scan from the Hugging Face Hub.
 * @returns {Promise<object>} An object containing `success` status and `stats` about the scan process.
 * @throws {Error} If the user is not authorized or if the scanner encounters a critical error.
 */
const scanHuggingFaceHub = async (user, maxDatasetsToScan = 500) => {
  // INTEGRATION: Role-based access control. Only platform owners can trigger a global scan.
  if (!user || user.role !== 'super_admin') {
    throw new Error('Authorization failed: You do not have permission to perform this action.');
  }

  try {
    console.log(`[HF Scanner] Initiating paginated discovery. Target scan limit: ${maxDatasetsToScan}`);
    let scannedCount = 0;
    let nextPageUrl = `https://huggingface.co/api/datasets?sort=downloads&direction=-1&limit=100&full=true`;
    
    const maxSizeBytes = getMaxSizeBytes();
    // BUGFIX: Added skippedMediaType to correctly categorize media-related skips.
    let stats = { discovered: 0, queued: 0, skippedGated: 0, skippedSize: 0, skippedLicense: 0, skippedMediaType: 0 };

    while (nextPageUrl && scannedCount < maxDatasetsToScan) {
      console.log(`[HF Scanner] Querying HF Hub endpoint: ${nextPageUrl}`);
      const response = await axios.get(nextPageUrl, {
        headers: { 'User-Agent': 'Inso AI-Assistant-Backend' }
      });

      const datasets = response.data;
      if (!Array.isArray(datasets) || datasets.length === 0) {
        break;
      }

      const datasetIdsOnPage = datasets.map(item => item.id);
      const existingQueueItems = await DatasetQueue.find({ datasetId: { $in: datasetIdsOnPage } }).lean();
      const existingQueueMap = new Map(existingQueueItems.map(item => [item.datasetId, item]));

      const bulkOps = [];

      for (const item of datasets) {
        if (scannedCount >= maxDatasetsToScan) break;
        scannedCount++;

        const datasetId = item.id;
        const downloads = item.downloads || 0;
        const likes = item.likes || 0;
        const isGated = item.gated || false;
        const isPrivate = item.private || false;
        // REFACTOR: Use the new, more robust license extraction function.
        const rawLicense = extractLicense(item);
        
        let calculatedStatus = 'pending';
        let calculatedSkipReason = '';
        let calculatedSizeBytes = 0;

        if (isGated || isPrivate) {
          calculatedStatus = 'skipped';
          calculatedSkipReason = 'Gated or Private dataset';
          stats.skippedGated++;
        } 
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
            stats.skippedMediaType++; // BUGFIX: Correctly categorize media skips.
          } 
          // REFACTOR: Simplified license check using the improved extractLicense function.
          else if (rawLicense === 'unspecified') {
            calculatedStatus = 'skipped';
            const originalLicense = item.cardData?.license || item.tags?.find(t => t.startsWith('license:')) || 'not found';
            calculatedSkipReason = `Unsupported or impure license: "${JSON.stringify(originalLicense)}" (Only pure mit and apache-2.0 allowed)`;
            stats.skippedLicense++;
          }
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

        const existingQueueItem = existingQueueMap.get(datasetId);
        let finalStatus = calculatedStatus;

        if (existingQueueItem) {
          if ((existingQueueItem.status === 'completed' || existingQueueItem.status === 'downloading') && calculatedStatus === 'pending') {
            finalStatus = existingQueueItem.status; 
          } 
          else if ((existingQueueItem.status === 'failed' || existingQueueItem.status === 'skipped') && calculatedStatus === 'pending') {
            finalStatus = 'pending';
          }
        } else {
          stats.discovered++;
        }

        const updatePayload = {
          downloads,
          likes,
          license: rawLicense,
          lastAttemptedAt: new Date(),
          status: finalStatus,
          skipReason: calculatedSkipReason,
          sizeBytes: calculatedSizeBytes,
        };

        bulkOps.push({
          updateOne: {
            filter: { datasetId },
            update: { $set: updatePayload },
            upsert: true
          }
        });

        if (finalStatus === 'pending' && (!existingQueueItem || existingQueueItem.status !== 'pending')) {
          stats.queued++;
        }
      }

      if (bulkOps.length > 0) {
        await DatasetQueue.bulkWrite(bulkOps);
      }

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
      const capacityLimit = getGcsCapacityBytes();
      const currentStorageUsed = await Dataset.aggregate([
        { $group: { _id: null, total: { $sum: '$sizeBytes' } } }
      ]);
      const totalBytesArchived = currentStorageUsed[0]?.total || 0;

      if (totalBytesArchived >= capacityLimit) {
        console.warn(`[HF Worker] GCS Storage Limit Reached (${(totalBytesArchived / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB / ${(capacityLimit / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB). Hinsoaing crawler loop.`);
        isWorkerRunning = false;
        break;
      }

      if (rateLimitBackoffMs > 0) {
        console.log(`[HF Worker] Applying rate-limit sleep penalty: ${rateLimitBackoffMs / 1000}s`);
        await new Promise(r => setTimeout(r, rateLimitBackoffMs));
        rateLimitBackoffMs = 0;
      }

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

      try {
        const info = await DatasetsService.getHFDatasetInfo(datasetId);
        
        // BUGFIX: Removed lean: true to get a full Mongoose document for service layer interaction.
        const datasetDoc = await Dataset.findOneAndUpdate(
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
              status: 'pending'
            }
          },
          { upsert: true, new: true }
        );
        
        await DatasetsService.archiveDatasetToGCSCore(datasetId, datasetDoc);

        // BUGFIX: The dataset document in the DB may have been updated by the core service (e.g., with sizeBytes).
        // Refetch the document to ensure we have the latest data before proceeding to avoid using a stale object.
        const updatedDataset = await Dataset.findOne({ datasetId }).lean();
        if (!updatedDataset) {
          throw new Error(`Consistency Error: Dataset ${datasetId} was not found after archiving.`);
        }

        try {
          console.log(`[HF Worker] Autonomously indexing dataset for RAG vector search: ${datasetId}`);
          await DatasetsService.indexDatasetForRAGCore(datasetId, updatedDataset);

          queueItem.status = 'completed';
          // Use size from the refetched document to ensure accuracy.
          queueItem.sizeBytes = updatedDataset.sizeBytes || 0;
          queueItem.error = '';
          await queueItem.save();
          console.log(`[HF Worker] Successfully archived to GCS and indexed: ${datasetId}`);

        } catch (indexErr) {
          console.error(`[HF Worker] Failed to index dataset ${datasetId} autonomously:`, indexErr.message);
          queueItem.retryCount = (queueItem.retryCount || 0) + 1;
          queueItem.error = `Indexing Failed: ${indexErr.message}`;
          if (queueItem.retryCount >= 3) {
            queueItem.status = 'failed';
            console.error(`[HF Worker] Dataset ${datasetId} failed all retries including indexing. Marking as FAILED.`);
          } else {
            queueItem.status = 'pending';
            console.log(`[HF Worker] Scheduled retry ${queueItem.retryCount}/3 for dataset (indexing failed): ${datasetId}`);
          }
          await queueItem.save();
        }

      } catch (err) {
        console.error(`[HF Worker] Ingestion execution failure for ${datasetId}:`, err.message);

        if (err.message.includes('429') || (err.response && err.response.status === 429)) {
          console.warn('[HF Worker] Rate-limit (429) detected! Backing off worker loop.');
          rateLimitBackoffMs = 30000;
          queueItem.status = 'pending';
          queueItem.error = `Rate Limit: ${err.message}`;
        } else {
          queueItem.retryCount = (queueItem.retryCount || 0) + 1;
          queueItem.error = err.message;
          if (queueItem.retryCount >= 3) {
            queueItem.status = 'failed';
            console.error(`[HF Worker] Dataset ${datasetId} failed all retries. Marking as FAILED.`);
          } else {
            queueItem.status = 'pending';
            console.log(`[HF Worker] Scheduled retry ${queueItem.retryCount}/3 for dataset: ${datasetId}`);
          }
        }
        await queueItem.save();
      }

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
      const capacityLimit = getGcsCapacityBytes();
      const currentStorageUsed = await Dataset.aggregate([
        { $group: { _id: null, total: { $sum: '$sizeBytes' } } }
      ]);
      const totalBytesArchived = currentStorageUsed[0]?.total || 0;

      if (totalBytesArchived >= capacityLimit) {
        console.warn(`[HF Worker] GCS Storage Limit Reached (${(totalBytesArchived / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB / ${(capacityLimit / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB). Hinsoaing crawler loop.`);
        isWorkerRunning = false;
        break;
      }

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
          taskQueue: 'insoai-workflows-queue',
          workflowId
        });

        console.log(`[HF Worker] Durable Ingestion Workflow started with ID: ${workflowId}`);
        
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
 * @param {object} user - The authenticated user object, used for authorization.
 * @param {string} user.role - The role of the user (e.g., 'super_admin').
 * @returns {object} An object indicating success and a message about the worker's status.
 * @throws {Error} If the user is not authorized.
 */
const startWorker = (user) => {
  // INTEGRATION: Role-based access control. Only platform owners can start the global worker.
  if (!user || user.role !== 'super_admin') {
    throw new Error('Authorization failed: You do not have permission to perform this action.');
  }

  if (isWorkerRunning) {
    return { success: true, message: 'Continuous worker loop is already running.' };
  }
  isWorkerRunning = true;

  let workerTypeMessage = 'sequential fallback'; // Default message

  // Asynchronously connect to Temporal and start the correct worker loop
  (async () => {
    try {
      await temporalClientCoordinator.connect();
      if (temporalClientCoordinator.isMock) {
        console.log('[HF Worker] System is in Offline/Mock Standby Mode. Launching Legacy sequential loop fallback.');
        runWorkerLoop();
      } else {
        workerTypeMessage = 'Resilient Temporal';
        console.log('[HF Worker] System is connected to a live cluster. Launching Resilient Temporal Workflow coordinator.');
        runTemporalWorkerLoop();
      }
    } catch (err) {
      console.error('[HF Worker] Failed to initialize temporal client, falling back to legacy loop:', err);
      runWorkerLoop();
    }
  })().catch(err => {
    // BUGFIX: Catch unhandled promise rejections from the worker initialization to prevent process crash.
    console.error('[HF Worker] Critical error during worker startup sequence:', err);
    isWorkerRunning = false; // Ensure worker is stopped if startup fails
  });

  // BUGFIX: Return a more accurate message about the dispatched worker type.
  return { success: true, message: `Continuous ${workerTypeMessage} background queue worker start signal dispatched.` };
};


/**
 * @function stopWorker
 * @description Stops the continuous background queue processor worker.
 *   It sets a flag that signals the worker loop to gracefully shut down after completing its current task.
 * @param {object} user - The authenticated user object, used for authorization.
 * @param {string} user.role - The role of the user (e.g., 'super_admin').
 * @returns {object} An object indicating success and a message about the worker's status.
 * @throws {Error} If the user is not authorized.
 */
const stopWorker = (user) => {
  // INTEGRATION: Role-based access control. Only platform owners can stop the global worker.
  if (!user || user.role !== 'super_admin') {
    throw new Error('Authorization failed: You do not have permission to perform this action.');
  }

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
 * @param {object} user - The authenticated user object, used for authorization.
 * @param {string} user.role - The role of the user (e.g., 'super_admin').
 * @returns {Promise<object>} An object containing various statistics about the crawler's state and queue.
 * @throws {Error} If the user is not authorized or if there's a failure in compiling stats.
 */
const getCrawlerStats = async (user) => {
  // INTEGRATION: Role-based access control. Only platform owners can view global crawler stats.
  if (!user || user.role !== 'super_admin') {
    throw new Error('Authorization failed: You do not have permission to perform this action.');
  }

  try {
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
      // BUGFIX: totalBytesDownloaded should only be calculated from datasets that are successfully completed.
      if (c._id === 'completed') {
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
 * @param {object} user - The authenticated user object, used for authorization.
 * @param {string} user.role - The role of the user (e.g., 'super_admin').
 * @param {object} [filter={}] - MongoDB query filter object to apply to the DatasetQueue.
 * @param {number} [limit=50] - The maximum number of queue items to return.
 * @param {number} [skip=0] - The number of queue items to skip for pagination.
 * @returns {Promise<object>} An object containing the total count, pagination details, and the list of queue items.
 * @throws {Error} If the user is not authorized or if there's a failure in retrieving the list.
 */
const getQueueList = async (user, filter = {}, limit = 50, skip = 0) => {
  // INTEGRATION: Role-based access control. Only platform owners can view the global queue list.
  if (!user || user.role !== 'super_admin') {
    throw new Error('Authorization failed: You do not have permission to perform this action.');
  }

  try {
    const list = await DatasetQueue.find(filter)
      .sort({ downloads: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
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
 *   and retrieving operational statistics. All control functions are restricted to super_admin.
 *   INTEGRATION NOTE: This service operates at the platform level and does not interact with
 *   tenant-specific contexts or limits. It populates a global, shared dataset library.
 */
export const DatasetsCrawlerService = {
  scanHuggingFaceHub,
  startWorker,
  stopWorker,
  getCrawlerStats,
  getQueueList,
  extractLicense
};