import axios from 'axios';
import { Storage } from '@google-cloud/storage';
import { CloudTasksClient } from '@google-cloud/tasks';
import path from 'path';
import fs from 'fs';
import Dataset from './datasets.model.js';
import config from '../../../../config/index.js';
import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { rag } from '../knowledge/knowledge.service.js';

// Recommended Mongoose Indexes for Dataset model (to be defined in datasets.model.js):
// For optimal performance, ensure the following indexes are defined on your Dataset schema:
// 1. `datasetId`: For efficient lookups in `Dataset.findOne({ datasetId: ... })`.
//    Example in schema definition: `datasetSchema.index({ datasetId: 1 }, { unique: true });`
// 2. `updatedAt`: For efficient sorting in `Dataset.find(...).sort({ updatedAt: -1 })`.
//    Example in schema definition: `datasetSchema.index({ updatedAt: -1 });`
// 3. If `filter` commonly includes specific fields in `getLocalCatalog`, consider adding indexes for those fields as well.


/**
 * Initializes and returns a Google Cloud Storage client and bucket.
 * It attempts to use credentials from `config.google.google_application_credentials`
 * or a local `alti_gcp.json` file.
 * If GCS initialization fails, it logs an error and returns nulls for storage and bucket.
 *
 * @returns {object} An object containing:
 * @returns {Storage|null} storage - The Google Cloud Storage client instance, or null if initialization failed.
 * @returns {import('@google-cloud/storage').Bucket|null} bucket - The GCS bucket object, or null if initialization failed.
 * @returns {string|null} bucketName - The name of the GCS bucket, or null if initialization failed.
 */
const getGcsBucket = () => {
  try {
    const keyPath = config.google.google_application_credentials || path.join(process.cwd(), 'alti_gcp.json');
    const storage = new Storage({ keyFilename: keyPath });
    // Default bucket to one configured in env, or a standard alti dataset storage bucket
    const bucketName = config.gcs.knowledge_bank_bucket || 'alti_assistant_datasets';
    return { storage, bucket: storage.bucket(bucketName), bucketName };
  } catch (error) {
    console.error('Failed to initialize GCS bucket for datasets:', error.message);
    return { storage: null, bucket: null, bucketName: null };
  }
};

/**
 * Initializes and returns a Google Cloud Tasks client.
 * @returns {CloudTasksClient|null} The Cloud Tasks client instance, or null on failure.
 */
const getCloudTasksClient = () => {
  try {
    const keyPath = config.google.google_application_credentials || path.join(process.cwd(), 'alti_gcp.json');
    if (fs.existsSync(keyPath)) {
      return new CloudTasksClient({ keyFilename: keyPath });
    }
    // Fallback to default credentials if no key file is found (e.g., in a GCP environment)
    return new CloudTasksClient();
  } catch (error) {
    console.error('Failed to initialize Google Cloud Tasks client:', error.message);
    return null;
  }
};

const tasksClient = getCloudTasksClient();

/**
 * Creates a Google Cloud Task to offload a long-running process to a worker service.
 *
 * @param {object} payload - The JSON payload to send to the worker.
 * @param {string} handlerName - A name to identify the task type (e.g., 'archive', 'index'). This will be part of the worker URL.
 * @param {number} [delayInSeconds=0] - Optional delay before the task can be executed.
 * @returns {Promise<string>} The name of the created task.
 * @throws {Error} If required configuration is missing or task creation fails.
 */
const createCloudTask = async (payload, handlerName, delayInSeconds = 0) => {
  if (!tasksClient) {
    throw new Error('Cloud Tasks client is not initialized. Cannot create task.');
  }
  const { gcp_project_id, cloud_tasks_queue, cloud_tasks_location, worker_service_url } = config.google;

  if (!gcp_project_id || !cloud_tasks_queue || !cloud_tasks_location || !worker_service_url) {
    console.error('Missing required Cloud Tasks configuration. Please set gcp_project_id, cloud_tasks_queue, cloud_tasks_location, and worker_service_url in your config.');
    throw new Error('Missing required Cloud Tasks configuration.');
  }

  const parent = tasksClient.queuePath(gcp_project_id, cloud_tasks_location, cloud_tasks_queue);
  // The URL points to a dedicated endpoint on a worker service responsible for handling background tasks.
  const url = `${worker_service_url}/datasets/handlers/${handlerName}`;

  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
      },
      // The body must be a base64-encoded string.
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
    },
  };

  if (delayInSeconds > 0) {
    task.scheduleTime = {
      seconds: delayInSeconds + Date.now() / 1000,
    };
  }

  try {
    console.log(`Creating Cloud Task for handler "${handlerName}" targeting URL: ${url}`);
    const [response] = await tasksClient.createTask({ parent, task });
    console.log(`Successfully created task: ${response.name}`);
    return response.name;
  } catch (error) {
    console.error(`Failed to create Cloud Task for handler "${handlerName}":`, error);
    throw new Error(`Could not queue task: ${error.message}`);
  }
};

/**
 * Searches for datasets on the Hugging Face Hub based on a query.
 * Results are sorted by downloads in descending order.
 *
 * @param {string} [query=''] - The search query string.
 * @param {number} [limit=10] - The maximum number of results to return.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of dataset objects,
 *   each containing `datasetId`, `name`, `author`, `downloads`, `likes`, `tags`, and `description`.
 * @throws {Error} If the API call to Hugging Face Hub fails.
 */
const searchHFDatasets = async (query = '', limit = 10) => {
  try {
    const response = await axios.get('https://huggingface.co/api/datasets', {
      params: {
        search: query,
        limit: limit,
        sort: 'downloads',
        direction: '-1'
      },
      headers: {
        'User-Agent': 'Alti-Assistant-Backend'
      }
    });

    return response.data.map(item => ({
      datasetId: item.id,
      name: item.id.split('/').pop(),
      author: item.author || 'anonymous',
      downloads: item.downloads || 0,
      likes: item.likes || 0,
      tags: item.tags || [],
      description: item.cardData?.dataset_info?.description || 'No description available.'
    }));
  } catch (err) {
    throw new Error(`Failed to search Hugging Face Hub: ${err.message}`);
  }
};

/**
 * Fetches detailed information of a dataset from Hugging Face.
 * This includes metadata from the main Hub API and splits/configurations from the datasets-server.
 *
 * @param {string} datasetId - The full ID of the dataset (e.g., 'openai/webgpt_comparisons').
 * @returns {Promise<object>} A promise that resolves to a detailed dataset information object,
 *   including `datasetId`, `name`, `author`, `description`, `downloads`, `likes`, `tags`,
 *   `configs` (array of config names), `splits` (object mapping config names to arrays of split info),
 *   and `createdAt`.
 * @throws {Error} If fetching dataset details from Hugging Face fails.
 */
const getHFDatasetInfo = async (datasetId) => {
  try {
    // 1. Get main metadata from HF Hub API
    const hubResponse = await axios.get(`https://huggingface.co/api/datasets/${datasetId}`, {
      headers: { 'User-Agent': 'Alti-Assistant-Backend' }
    });

    const meta = hubResponse.data;

    // 2. Fetch splits & configurations if available on Hugging Face Dataset Server
    let configs = [];
    let splits = {};
    try {
      const splitsRes = await axios.get(`https://datasets-server.huggingface.co/splits?dataset=${meta.id}`);
      if (splitsRes.data && splitsRes.data.splits) {
        splitsRes.data.splits.forEach(s => {
          if (!configs.includes(s.config)) {
            configs.push(s.config);
          }
          if (!splits[s.config]) {
            splits[s.config] = [];
          }
          splits[s.config].push({
            split: s.split,
            numBytes: s.num_bytes,
            numExamples: s.num_examples
          });
        });
      }
    } catch (e) {
      console.warn(`Could not load splits for ${datasetId} from datasets-server: ${e.message}`);
    }

    return {
      datasetId: meta.id,
      name: meta.id.split('/').pop(),
      author: meta.author || 'anonymous',
      description: meta.description || 'No description provided.',
      downloads: meta.downloads || 0,
      likes: meta.likes || 0,
      tags: meta.tags || [],
      configs,
      splits,
      createdAt: meta.createdAt
    };
  } catch (err) {
    throw new Error(`Failed to fetch dataset details: ${err.message}`);
  }
};

/**
 * Previews rows of a specific dataset configuration and split from the Hugging Face Dataset Server.
 * It attempts to resolve a canonical dataset ID if a short ID is provided.
 *
 * @param {string} datasetId - The ID of the dataset (e.g., 'squad' or 'rajpurkar/squad').
 * @param {string} [configName='default'] - The name of the dataset configuration.
 * @param {string} [splitName='train'] - The name of the dataset split (e.g., 'train', 'validation', 'test').
 * @param {number} [offset=0] - The starting offset for fetching rows.
 * @param {number} [limit=100] - The maximum number of rows to retrieve.
 * @returns {Promise<object>} A promise that resolves to an object containing `features` (column definitions)
 *   and `rows` (an array of data rows).
 * @throws {Error} If fetching dataset rows from Hugging Face server fails.
 */
const getHFDatasetRows = async (datasetId, configName = 'default', splitName = 'train', offset = 0, limit = 100) => {
  try {
    let canonicalId = datasetId;
    if (!datasetId.includes('/')) {
      try {
        const hubResponse = await axios.get(`https://huggingface.co/api/datasets/${datasetId}`, {
          headers: { 'User-Agent': 'Alti-Assistant-Backend' }
        });
        canonicalId = hubResponse.data.id;
      } catch (e) {
        console.warn(`Could not resolve canonical ID for ${datasetId}: ${e.message}`);
      }
    }

    const response = await axios.get('https://datasets-server.huggingface.co/rows', {
      params: {
        dataset: canonicalId,
        config: configName,
        split: splitName,
        offset,
        limit
      },
      headers: { 'User-Agent': 'Alti-Assistant-Backend' }
    });

    return {
      features: response.data.features || [],
      rows: response.data.rows || []
    };
  } catch (err) {
    throw new Error(`Failed to preview dataset rows from Hugging Face server: ${err.message}`);
  }
};

/**
 * Core implementation for downloading Parquet files for a dataset from Hugging Face
 * and piping them directly into Google Cloud Storage or a local fallback directory.
 * This function is designed to be executed by a stateless worker (e.g., triggered by Cloud Tasks).
 *
 * @param {string} datasetId - The ID of the dataset to archive.
 * @returns {Promise<void>} A promise that resolves when the archival process is complete, or rejects on error.
 * @throws {Error} If no Parquet files are found, dataset size exceeds limits, GCS connection fails,
 *   or streaming/uploading files encounters an error.
 */
const archiveDatasetToGCSCore = async (datasetId) => {
  // This function is now self-contained. It fetches the dataset object from the DB.
  const dataset = await Dataset.findOne({ datasetId });
  if (!dataset) {
    console.error(`[Worker] Dataset with ID ${datasetId} not found. Aborting archive task.`);
    // Throwing an error here can cause Cloud Tasks to retry the job, which is often desirable.
    throw new Error(`Dataset with ID ${datasetId} not found.`);
  }

  try {
    dataset.status = 'downloading';
    await dataset.save();

    console.log(`[Worker] Starting GCS archival/download process for HF Dataset: ${datasetId}`);

    // Fetch Parquet files list from HF Dataset Server
    let fileListResponse;
    try {
      fileListResponse = await axios.get(`https://datasets-server.huggingface.co/parquet?dataset=${datasetId}`);
    } catch (err) {
      throw new Error(`Hugging Face datasets-server does not expose Parquet files for this dataset: ${err.message}`);
    }

    if (!fileListResponse.data || !fileListResponse.data.parquet_files || fileListResponse.data.parquet_files.length === 0) {
      throw new Error('No Parquet files found for this dataset on Hugging Face server.');
    }

    const parquetFiles = fileListResponse.data.parquet_files;
    let totalBytes = 0;
    for (const fileItem of parquetFiles) {
      totalBytes += fileItem.size || 0;
    }
    const maxSizeBytes = parseFloat(process.env.HF_CRAWLER_MAX_SIZE_GB || '2') * 1024 * 1024 * 1024;
    if (totalBytes > maxSizeBytes) {
      throw new Error(`Dataset actual size (${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB) exceeds max size limit (${(maxSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB)`);
    }

    let useLocalFallback = false;
    let bucket = null;
    let bucketName = null;

    try {
      const gcsConfig = getGcsBucket();
      bucket = gcsConfig.bucket;
      bucketName = gcsConfig.bucketName;
      if (!bucket) {
        useLocalFallback = true;
      } else {
        const [bucketExists] = await bucket.exists();
        if (!bucketExists) {
          console.log(`GCS Bucket "${bucketName}" does not exist. Attempting to create...`);
          await bucket.create();
        }
      }
    } catch (gcsAuthErr) {
      console.warn(`[Datasets] GCS Connection failed (${gcsAuthErr.message}). Switching to local disk fallback storage.`);
      useLocalFallback = true;
    }

    const uploadedGcsPaths = [];
    totalBytes = 0;

    for (const fileItem of parquetFiles) {
      const downloadUrl = fileItem.url;
      const fileName = fileItem.filename;
      const configName = fileItem.config;
      const splitName = fileItem.split;
      const fileSize = fileItem.size || 0;

      console.log(`[Worker] Streaming Parquet file: ${fileName} (${(fileSize / (1024 * 1024)).toFixed(2)} MB) for configuration: ${configName} (Local Fallback: ${useLocalFallback})`);

      const destPath = `datasets/${datasetId}/${configName}/${splitName}/${fileName}`;
      let writeStream;
      let localFilePath = '';

      if (useLocalFallback) {
        const localDir = path.join(process.cwd(), 'storage', 'datasets', datasetId.replace(/\//g, '_'), configName, splitName);
        await fs.promises.mkdir(localDir, { recursive: true });
        localFilePath = path.join(localDir, fileName);
        writeStream = fs.createWriteStream(localFilePath);
      } else {
        const gcsFileObj = bucket.file(destPath);
        writeStream = gcsFileObj.createWriteStream({
          metadata: {
            contentType: 'application/octet-stream',
            storageClass: config.gcs.datasetStorageClass || 'ARCHIVE',
            metadata: {
              originalUrl: downloadUrl,
              datasetId: datasetId,
              config: configName,
              split: splitName
            }
          }
        });
      }

      const sourceResponse = await axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'stream',
        headers: { 'User-Agent': 'Alti-Assistant-Backend' }
      });

      await new Promise((resolve, reject) => {
        sourceResponse.data
          .pipe(writeStream)
          .on('finish', () => {
            const gsUri = useLocalFallback ? `local://${localFilePath.replace(/\\/g, '/')}` : `gs://${bucketName}/${destPath}`;
            uploadedGcsPaths.push(gsUri);
            totalBytes += fileSize;
            console.log(useLocalFallback ? `[Worker] Successfully saved locally: ${gsUri}` : `[Worker] Successfully uploaded to GCS: ${gsUri}`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`[Worker] Piping stream failed for file ${fileName}:`, err);
            reject(err);
          });
      });
    }

    dataset.status = 'archived';
    dataset.gcsBucket = useLocalFallback ? 'local' : bucketName;
    dataset.gcsPaths = uploadedGcsPaths;
    dataset.sizeBytes = totalBytes;
    
    let totalRows = 0;
    if (dataset.splits) {
      Object.keys(dataset.splits).forEach(cfg => {
        if (Array.isArray(dataset.splits[cfg])) {
          dataset.splits[cfg].forEach(s => {
            if (s.numExamples) totalRows += s.numExamples;
          });
        }
      });
    }
    dataset.rowCount = totalRows;

    try {
      const previewData = await getHFDatasetRows(datasetId, dataset.configs[0] || 'default', 'train', 0, 1);
      dataset.features = previewData.features || {};
    } catch (e) {
      console.warn(`[Worker] Could not extract column features during archiving: ${e.message}`);
    }

    await dataset.save();
    console.log(`[Worker] Archival completed for ${datasetId}. Total size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);

  } catch (error) {
    console.error(`[Worker] Error during archival of ${datasetId}:`, error);
    dataset.status = 'failed';
    dataset.error = error.message;
    await dataset.save();
    throw error;
  }
};

/**
 * Initiates a background job to download Parquet files for a dataset from Hugging Face
 * and store them in Google Cloud Storage. This is achieved by creating a Google Cloud Task.
 *
 * @param {string} datasetId - The ID of the dataset to archive.
 * @returns {Promise<object>} A promise that resolves to an object indicating the job queuing status.
 * @throws {Error} If fetching dataset info fails or the initial database save fails.
 */
const archiveDatasetToGCS = async (datasetId) => {
  // 1. Fetch info and prepare database catalog record
  const info = await getHFDatasetInfo(datasetId);
  
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

  // 2. OFFLOAD: Replace in-memory async execution with a durable Cloud Task.
  // This prevents the web server from being blocked by long-running downloads
  // and ensures the job will be executed by a worker even if the current server instance restarts.
  await createCloudTask({ datasetId }, 'archive');

  return {
    success: true,
    message: `GCS Archival job for dataset "${datasetId}" has been successfully queued.`,
    dataset
  };
};

/**
 * Core implementation for chunking, embedding, and indexing archived data.
 * This function is designed to be executed by a stateless worker (e.g., triggered by Cloud Tasks).
 *
 * @param {string} datasetId - The ID of the dataset to index.
 * @returns {Promise<void>} A promise that resolves when indexing is complete, or rejects on error.
 * @throws {Error} If RAG initialization fails, GCS bucket is not configured, file download/read fails,
 *   Parquet parsing fails, or the RAG system encounters an error during document addition.
 */
const indexDatasetForRAGCore = async (datasetId) => {
  // This function is now self-contained. It fetches the dataset object from the DB.
  const dataset = await Dataset.findOne({ datasetId });
  if (!dataset) {
    console.error(`[Worker] Dataset with ID ${datasetId} not found. Aborting index task.`);
    throw new Error(`Dataset with ID ${datasetId} not found.`);
  }

  if (config.shelfHfRagIndexing) {
    console.log(`[Worker] ⚠️ Hugging Face dataset RAG indexing is currently shelved. Skipping pgvector indexing for dataset: ${datasetId}`);
    dataset.status = 'archived'; // Revert status
    dataset.error = 'RAG indexing shelved by configuration';
    await dataset.save();
    return;
  }

  try {
    console.log(`[Worker] Starting RAG Indexing of archived dataset: ${datasetId}`);
    
    await rag.initialize();

    const gcsConfig = getGcsBucket();
    const bucket = gcsConfig.bucket;
    const bucketName = gcsConfig.bucketName;

    let totalIndexedChunks = 0;
    const maxRowsPerFile = 2000;

    for (const gcsPath of dataset.gcsPaths) {
      let buffer;
      let relativePath = '';
      let configName = 'default';
      let splitName = 'train';
      let fileName = 'data.parquet';

      if (gcsPath.startsWith('local://')) {
        const localPath = gcsPath.slice('local://'.length);
        console.log(`[Worker] Reading Parquet file from local storage for indexing: ${localPath}`);
        buffer = await fs.promises.readFile(localPath);
        
        const normalizedPath = localPath.replace(/\\/g, '/');
        const parts = normalizedPath.split('/');
        configName = parts[parts.length - 3] || 'default';
        splitName = parts[parts.length - 2] || 'train';
        fileName = parts[parts.length - 1];
        relativePath = `local/${datasetId}/${configName}/${splitName}/${fileName}`;
      } else {
        if (!bucket) {
          throw new Error('GCS bucket not configured, cannot download GCS path: ' + gcsPath);
        }
        const prefix = `gs://${bucketName}/`;
        relativePath = gcsPath.startsWith(prefix) ? gcsPath.slice(prefix.length) : gcsPath;

        console.log(`[Worker] Downloading Parquet file from GCS for indexing: ${relativePath}`);
        const fileObj = bucket.file(relativePath);
        const [downloadedBuffer] = await fileObj.download();
        buffer = downloadedBuffer;

        const parts = relativePath.split('/');
        configName = parts[parts.length - 3] || 'default';
        splitName = parts[parts.length - 2] || 'train';
        fileName = parts[parts.length - 1];
      }

      const file = {
        byteLength: buffer.length,
        slice: (start, end) => {
          const view = buffer.subarray(start, end);
          return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
        }
      };

      console.log(`[Worker] Parsing Parquet objects for split "${splitName}" / config "${configName}"...`);
      const rows = await parquetReadObjects({
        file,
        rowStart: 0,
        rowEnd: maxRowsPerFile,
        compressors
      });

      console.log(`[Worker] Successfully parsed ${rows.length} rows from Parquet file.`);

      let fullText = '';
      rows.forEach((row, rowIndex) => {
        let rowText = `Dataset: ${datasetId}\nConfig: ${configName}\nSplit: ${splitName}\nRow: ${rowIndex + 1}\n`;
        for (const [key, value] of Object.entries(row)) {
          if (value === null || value === undefined || value === '') continue;
          let valStr;
          if (value instanceof Uint8Array || value instanceof ArrayBuffer || Buffer.isBuffer(value)) {
            valStr = `[Binary Data: ${value.byteLength || value.length || 0} bytes]`;
          } else if (Array.isArray(value) && value.length > 100) {
            valStr = `[Large Array: ${value.length} items]`;
          } else if (typeof value === 'object') {
            try {
              let hasBinary = false;
              for (const v of Object.values(value)) {
                if (v instanceof Uint8Array || v instanceof ArrayBuffer || Buffer.isBuffer(v)) {
                  hasBinary = true;
                  break;
                }
              }
              if (hasBinary) {
                valStr = `[Object containing binary fields]`;
              } else {
                valStr = JSON.stringify(value);
              }
            } catch (e) {
              valStr = String(value);
            }
          } else if (typeof value === 'bigint') {
            valStr = value.toString();
          } else {
            valStr = String(value);
          }
          if (valStr.length > 1000) {
            valStr = valStr.substring(0, 1000) + '... (truncated)';
          }
          rowText += `${key}: ${valStr}\n`;
        }
        fullText += rowText + '\n\n---\n\n';
      });

      if (fullText.trim().length === 0) {
        console.warn(`[Worker] No valid content found in ${fileName}, skipping index step.`);
        continue;
      }

      console.log(`[Worker] Feeding text buffer to pgvector RAG system (size: ${fullText.length} characters)...`);
      const textBuffer = Buffer.from(fullText, 'utf-8');
      
      const ragResult = await rag.addDocumentFromBuffer(
        textBuffer,
        `${datasetId.replace(/\//g, '_')}_${configName}_${splitName}.txt`,
        'txt',
        {
          ownerType: 'dataset',
          ownerId: datasetId,
          datasetId: datasetId,
          config: configName,
          split: splitName,
          gcsPath: relativePath
        }
      );

      console.log(`[Worker] ✓ Indexed Parquet file: ${fileName} into RAG. Chunks added: ${ragResult.chunkCount}`);
      totalIndexedChunks += ragResult.chunkCount;
    }

    dataset.status = 'indexed';
    dataset.error = '';
    await dataset.save();
    console.log(`[Worker] RAG Indexing successfully completed for dataset: ${datasetId}. Total chunks: ${totalIndexedChunks}`);
  } catch (err) {
    console.error(`[Worker] RAG Indexing failed for ${datasetId}:`, err);
    dataset.status = 'failed';
    dataset.error = err.message;
    await dataset.save();
    throw err;
  }
};

/**
 * Initiates a background job to chunk, embed, and index archived dataset data
 * into the RAG system by creating a Google Cloud Task.
 *
 * @param {string} datasetId - The ID of the dataset to index.
 * @returns {Promise<object>} A promise that resolves to an object indicating the job queuing status.
 * @throws {Error} If RAG indexing is shelved by configuration, the dataset is not found,
 *   or the dataset is not in an 'archived' status.
 */
const indexDatasetForRAG = async (datasetId) => {
  if (config.shelfHfRagIndexing) {
    return {
      success: false,
      message: `Hugging Face dataset RAG vector indexing is currently shelved to minimize API embedding costs.`
    };
  }

  const dataset = await Dataset.findOne({ datasetId });
  if (!dataset) {
    throw new Error('Dataset not found in local catalog.');
  }

  if (dataset.status !== 'archived') {
    throw new Error(`Dataset is in status "${dataset.status}". It must be fully "archived" to GCS before starting vector indexing.`);
  }

  dataset.status = 'indexing';
  await dataset.save();

  // OFFLOAD: Replace in-memory async execution with a durable Cloud Task.
  // This offloads the heavy CPU/memory/network load of indexing to a dedicated worker
  // and makes the process resilient to server failures.
  await createCloudTask({ datasetId }, 'index');

  return {
    success: true,
    message: `RAG indexing job for dataset "${datasetId}" has been successfully queued.`,
    dataset
  };
};

/**
 * Fetches a catalog of locally cached datasets from MongoDB.
 *
 * @param {object} [filter={}] - An optional MongoDB query filter to apply to the dataset search.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of plain JavaScript objects
 *   representing the datasets, sorted by `updatedAt` in descending order.
 * @throws {Error} If the database query fails.
 */
const getLocalCatalog = async (filter = {}) => {
  try {
    const list = await Dataset.find(filter).sort({ updatedAt: -1 }).lean();
    return list;
  } catch (err) {
    throw new Error(`Failed to retrieve local datasets catalog: ${err.message}`);
  }
};

/**
 * @typedef {object} DatasetsService
 * @property {function(string, number): Promise<Array<object>>} searchHFDatasets - Searches for datasets on Hugging Face Hub.
 * @property {function(string): Promise<object>} getHFDatasetInfo - Fetches detailed info of a dataset from Hugging Face.
 * @property {function(string, string, string, number, number): Promise<object>} getHFDatasetRows - Previews rows of a dataset configuration/split.
 * @property {function(string): Promise<object>} archiveDatasetToGCS - Initiates a background job to download Parquet files to GCS.
 * @property {function(string): Promise<void>} archiveDatasetToGCSCore - Core implementation for archiving datasets to GCS (for worker use).
 * @property {function(string): Promise<object>} indexDatasetForRAG - Initiates a background job to chunk, embed, and index archived data for RAG.
 * @property {function(string): Promise<void>} indexDatasetForRAGCore - Core implementation for RAG indexing (for worker use).
 * @property {function(object): Promise<Array<object>>} getLocalCatalog - Fetches catalog of local datasets cached in MongoDB.
 */

/**
 * An object containing various service functions for managing datasets.
 * @type {DatasetsService}
 */
export const DatasetsService = {
  searchHFDatasets,
  getHFDatasetInfo,
  getHFDatasetRows,
  archiveDatasetToGCS,
  archiveDatasetToGCSCore,
  indexDatasetForRAG,
  indexDatasetForRAGCore,
  getLocalCatalog
};