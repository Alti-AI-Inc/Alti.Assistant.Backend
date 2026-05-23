import axios from 'axios';
import Dataset from './datasets.model.js';
import DatasetQueue from './datasetQueue.model.js';
import { DatasetsService } from './datasets.service.js';

// Strict legal purity license filter
const ALLOWED_LICENSES = ['mit', 'apache-2.0'];

// Configuration controls from Env with default sensible fallbacks
const getMaxSizeBytes = () => {
  const gb = parseFloat(process.env.HF_CRAWLER_MAX_SIZE_GB || '2');
  return gb * 1024 * 1024 * 1024;
};

const getGcsCapacityBytes = () => {
  const tb = parseFloat(process.env.HF_CRAWLER_GCS_CAP_TB || '5');
  return tb * 1024 * 1024 * 1024 * 1024;
};

// Global worker runtime state
let isWorkerRunning = false;
let workerLoopActive = false;
let rateLimitBackoffMs = 0; // Dynamic backoff tracking

/**
 * Normalizes and extracts license string from HF API dataset item
 */
const extractLicense = (item) => {
  if (item.cardData && item.cardData.license) {
    // If it's a string
    if (typeof item.cardData.license === 'string') {
      return item.cardData.license.trim().toLowerCase();
    }
    // If it's an array
    if (Array.isArray(item.cardData.license)) {
      return item.cardData.license.map(l => String(l).trim().toLowerCase()).join(',');
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
 * Discovers and indexes Hugging Face datasets into the local crawling Queue
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

      for (const item of datasets) {
        if (scannedCount >= maxDatasetsToScan) break;
        scannedCount++;

        const datasetId = item.id;
        const downloads = item.downloads || 0;
        const likes = item.likes || 0;
        const isGated = item.gated || false;
        const isPrivate = item.private || false;
        
        // Extract license
        const rawLicense = extractLicense(item);
        
        // 1. Check existing record
        const existingQueueItem = await DatasetQueue.findOne({ datasetId });
        if (existingQueueItem) {
          // If already cataloged, just update likes/downloads and continue
          existingQueueItem.downloads = downloads;
          existingQueueItem.likes = likes;
          await existingQueueItem.save();
          continue;
        }

        stats.discovered++;

        // 2. Gatekeeper Filter: Gated or Private
        if (isGated || isPrivate) {
          stats.skippedGated++;
          await DatasetQueue.create({
            datasetId,
            downloads,
            likes,
            license: rawLicense,
            status: 'skipped',
            skipReason: 'Gated or Private dataset'
          });
          continue;
        }

        // 3. Gatekeeper Filter: Strict Legal License Purity (Pure MIT or pure Apache 2.0 only)
        const isMIT = rawLicense === 'mit';
        const isApache = rawLicense === 'apache-2.0' || rawLicense === 'apache-2.0-only';
        if (!isMIT && !isApache) {
          stats.skippedLicense++;
          await DatasetQueue.create({
            datasetId,
            downloads,
            likes,
            license: rawLicense,
            status: 'skipped',
            skipReason: `Unsupported License: "${rawLicense}" (Only pure mit and apache-2.0 allowed)`
          });
          continue;
        }

        // 4. Gatekeeper Filter: Rough Size threshold (if exposed in metadata)
        let sizeBytes = 0;
        if (item.cardData?.dataset_info?.dataset_size) {
          sizeBytes = item.cardData.dataset_info.dataset_size;
        } else if (item.cardData?.dataset_info?.download_size) {
          sizeBytes = item.cardData.dataset_info.download_size;
        }

        if (sizeBytes > maxSizeBytes) {
          stats.skippedSize++;
          await DatasetQueue.create({
            datasetId,
            downloads,
            likes,
            license: rawLicense,
            status: 'skipped',
            sizeBytes,
            skipReason: `Exceeded Max Size Limit (${(sizeBytes / (1024 * 1024)).toFixed(2)} MB)`
          });
          continue;
        }

        // Passes all initial filters! Queue it for serial archival.
        stats.queued++;
        await DatasetQueue.create({
          datasetId,
          downloads,
          likes,
          license: rawLicense,
          status: 'pending',
          sizeBytes
        });
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
 * Sequential background worker queue runner
 */
const runWorkerLoop = async () => {
  if (workerLoopActive) return;
  workerLoopActive = true;

  console.log('[HF Worker] sequential downloader daemon loop started.');

  while (isWorkerRunning) {
    try {
      // 1. GCS Capacity Guardrail
      const capacityLimit = getGcsCapacityBytes();
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
        }
        
        // Execute awaited pipeline piping directly to GCS
        await DatasetsService.archiveDatasetToGCSCore(datasetId, dataset);

        // Success!
        queueItem.status = 'completed';
        queueItem.sizeBytes = dataset.sizeBytes;
        queueItem.error = '';
        await queueItem.save();
        console.log(`[HF Worker] Successfully archived to GCS: ${datasetId}`);

        // Autonomously trigger the high-fidelity RAG vector indexing step sequentially
        try {
          console.log(`[HF Worker] Autonomously indexing dataset for RAG vector search: ${datasetId}`);
          await DatasetsService.indexDatasetForRAGCore(datasetId, dataset);
        } catch (indexErr) {
          console.error(`[HF Worker] Failed to index dataset ${datasetId} autonomously:`, indexErr.message);
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
          queueItem.retryCount += 1;
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
 * Starts sequential background queue processor worker
 */
const startWorker = () => {
  if (isWorkerRunning) {
    return { success: true, message: 'Continuous worker loop is already running.' };
  }
  isWorkerRunning = true;
  runWorkerLoop(); // run asynchronously in background thread
  return { success: true, message: 'Continuous sequential background queue worker started.' };
};

/**
 * Stops sequential background queue processor worker
 */
const stopWorker = () => {
  if (!isWorkerRunning) {
    return { success: true, message: 'Continuous worker loop is already stopped.' };
  }
  isWorkerRunning = false;
  return { success: true, message: 'Continuous worker loop stop signal dispatched. Worker will shut down cleanly after finishing its active download.' };
};

/**
 * Compiles real-time metrics and logs for operational visibility
 */
const getCrawlerStats = async () => {
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
 * Query queue listings
 */
const getQueueList = async (filter = {}, limit = 50, skip = 0) => {
  try {
    const list = await DatasetQueue.find(filter)
      .sort({ downloads: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await DatasetQueue.countDocuments(filter);
    
    return { total, limit, skip, data: list };
  } catch (err) {
    throw new Error(`Failed to retrieve queue list: ${err.message}`);
  }
};

export const DatasetsCrawlerService = {
  scanHuggingFaceHub,
  startWorker,
  stopWorker,
  getCrawlerStats,
  getQueueList,
  extractLicense
};
