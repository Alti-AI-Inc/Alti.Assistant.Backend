import axios from 'axios';
import { Storage } from '@google-cloud/storage';
import path from 'path';
import fs from 'fs';
import Dataset from './datasets.model.js';
import config from '../../../../config/index.js';
import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { rag } from '../knowledge/knowledge.service.js';


// Initialize GCS client
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
 * Search datasets on Hugging Face Hub
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
 * Fetch detailed info of a dataset from Hugging Face
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
 * Preview rows of a dataset configuration/split
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
 * Download Parquet files for a dataset from Hugging Face and pipe them directly into Google Cloud Storage (Awaited Core)
 */
const archiveDatasetToGCSCore = async (datasetId, dataset) => {
  try {
    dataset.status = 'downloading';
    await dataset.save();

    console.log(`Starting GCS archival/download process for HF Dataset: ${datasetId}`);

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
        // Check bucket access/exists
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

      console.log(`Streaming Parquet file: ${fileName} (${(fileSize / (1024 * 1024)).toFixed(2)} MB) for configuration: ${configName} (Local Fallback: ${useLocalFallback})`);

      const destPath = `datasets/${datasetId}/${configName}/${splitName}/${fileName}`;
      let writeStream;
      let localFilePath = '';

      if (useLocalFallback) {
        const localDir = path.join(process.cwd(), 'storage', 'datasets', datasetId.replace(/\//g, '_'), configName, splitName);
        // Optimization: Use fs.promises.mkdir for async directory creation to prevent blocking the event loop
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

      // Use axios to fetch source stream
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
            console.log(useLocalFallback ? `Successfully saved locally: ${gsUri}` : `Successfully uploaded to GCS: ${gsUri}`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`Piping stream failed for file ${fileName}:`, err);
            reject(err);
          });
      });
    }

    // Update database model to archived
    dataset.status = 'archived';
    dataset.gcsBucket = useLocalFallback ? 'local' : bucketName;
    dataset.gcsPaths = uploadedGcsPaths;
    dataset.sizeBytes = totalBytes;
    
    // Calculate row count from splits metadata
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

    // Extract features/columns if available in splits response
    try {
      const previewData = await getHFDatasetRows(datasetId, dataset.configs[0] || 'default', 'train', 0, 1);
      dataset.features = previewData.features || {};
    } catch (e) {
      console.warn(`Could not extract column features during archiving: ${e.message}`);
    }

    await dataset.save();
    console.log(`Archival completed for ${datasetId}. Total size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);

  } catch (error) {
    console.error(`Error during archival of ${datasetId}:`, error);
    dataset.status = 'failed';
    dataset.error = error.message;
    await dataset.save();
    throw error;
  }
};

/**
 * Download Parquet files for a dataset from Hugging Face and pipe them directly into Google Cloud Storage
 */
const archiveDatasetToGCS = async (datasetId) => {
  // 1. Fetch info and prepare database catalog record
  // Recommendation: Ensure an index exists on `datasetId` in the Dataset model for efficient lookups.
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

  // Trigger download asynchronously to not block the REST endpoint thread
  (async () => {
    try {
      await archiveDatasetToGCSCore(datasetId, dataset);
    } catch (error) {
      // Error handled inside Core
    }
  })();

  return {
    success: true,
    message: `GCS Archival job initiated for dataset "${datasetId}". You can poll progress/status using GET /datasets/status/${datasetId}`,
    dataset
  };
};

/**
 * Core blocking implementation for chunking, embedding, and indexing archived data
 * to build the ultimate high-fidelity data base for our Perplexity-killer
 */
const indexDatasetForRAGCore = async (datasetId, dataset) => {
  if (config.shelfHfRagIndexing) {
    console.log(`⚠️ Hugging Face dataset RAG indexing is currently shelved to minimize embedding API costs. Skipping pgvector indexing for dataset: ${datasetId}`);
    dataset.status = 'archived'; // Keep as archived and do not advance to indexed
    dataset.error = 'RAG indexing shelved by configuration';
    await dataset.save();
    return;
  }

  try {
    console.log(`Starting RAG Indexing of archived dataset: ${datasetId}`);
    
    // 1. Initialize the RAG system (ensures pgvector and database schemas are setup)
    await rag.initialize();

    const gcsConfig = getGcsBucket();
    const bucket = gcsConfig.bucket;
    const bucketName = gcsConfig.bucketName;

    let totalIndexedChunks = 0;
    const maxRowsPerFile = 2000; // Guardrail to prevent runaway embedding costs

    for (const gcsPath of dataset.gcsPaths) {
      let buffer;
      let relativePath = '';
      let configName = 'default';
      let splitName = 'train';
      let fileName = 'data.parquet';

      if (gcsPath.startsWith('local://')) {
        const localPath = gcsPath.slice('local://'.length);
        console.log(`Reading Parquet file from local storage for indexing: ${localPath}`);
        // Optimization: Use fs.promises.readFile for async file reading to prevent blocking the event loop
        buffer = await fs.promises.readFile(localPath);
        
        // Parse metadata/config/split from the local file path or directory structure
        // localPath: .../storage/datasets/[datasetId]/[configName]/[splitName]/[fileName].parquet
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
        // Strip the gs://[bucketName]/ prefix to get the relative object path
        const prefix = `gs://${bucketName}/`;
        relativePath = gcsPath.startsWith(prefix) ? gcsPath.slice(prefix.length) : gcsPath;

        console.log(`Downloading Parquet file from GCS for indexing: ${relativePath}`);
        const fileObj = bucket.file(relativePath);
        const [downloadedBuffer] = await fileObj.download();
        buffer = downloadedBuffer;

        const parts = relativePath.split('/');
        configName = parts[parts.length - 3] || 'default';
        splitName = parts[parts.length - 2] || 'train';
        fileName = parts[parts.length - 1];
      }

      // Use the Node.js Buffer directly without duplicating the entire ArrayBuffer in memory.
      // hyparquet calls file.slice(start, end) incrementally, so we only slice/copy the required byte chunks.
      const file = {
        byteLength: buffer.length,
        slice: (start, end) => {
          const view = buffer.subarray(start, end);
          return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
        }
      };

      console.log(`Parsing Parquet objects for split "${splitName}" / config "${configName}"...`);
      const rows = await parquetReadObjects({
        file,
        rowStart: 0,
        rowEnd: maxRowsPerFile,
        compressors
      });

      console.log(`Successfully parsed ${rows.length} rows from Parquet file.`);

      // Convert rows to cohesive text paragraphs
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
              // Quick check if object has binary fields or properties that are Uint8Array/Buffer
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
        console.warn(`No valid content found in ${fileName}, skipping index step.`);
        continue;
      }

      console.log(`Feeding text buffer to pgvector RAG system (size: ${fullText.length} characters)...`);
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

      console.log(`✓ Indexed Parquet file: ${fileName} into RAG. Chunks added: ${ragResult.chunkCount}`);
      totalIndexedChunks += ragResult.chunkCount;
    }

    dataset.status = 'indexed';
    dataset.error = '';
    await dataset.save();
    console.log(`RAG Indexing successfully completed for dataset: ${datasetId}. Total chunks: ${totalIndexedChunks}`);
  } catch (err) {
    console.error(`RAG Indexing failed for ${datasetId}:`, err);
    dataset.status = 'failed';
    dataset.error = err.message;
    await dataset.save();
    throw err;
  }
};

/**
 * Async wrapper for chunking, embedding, and indexing archived data
 * to build the ultimate high-fidelity data base for our Perplexity-killer
 */
const indexDatasetForRAG = async (datasetId) => {
  if (config.shelfHfRagIndexing) {
    return {
      success: false,
      message: `Hugging Face dataset RAG vector indexing is currently shelved to minimize API embedding costs.`
    };
  }

  // Recommendation: Ensure an index exists on `datasetId` in the Dataset model for efficient lookups.
  const dataset = await Dataset.findOne({ datasetId });
  if (!dataset) {
    throw new Error('Dataset not found in local catalog.');
  }

  if (dataset.status !== 'archived') {
    throw new Error(`Dataset is in status "${dataset.status}". It must be fully "archived" to GCS before starting vector indexing.`);
  }

  dataset.status = 'indexing';
  await dataset.save();

  // Async processing loop for indexing
  (async () => {
    try {
      await indexDatasetForRAGCore(datasetId, dataset);
    } catch (error) {
      // Error handled inside Core
    }
  })();

  return {
    success: true,
    message: `RAG indexing process initiated for dataset "${datasetId}". Status is now "indexing".`,
    dataset
  };
};

/**
 * Fetch catalog of local datasets cached in MongoDB
 */
const getLocalCatalog = async (filter = {}) => {
  try {
    // Optimization: Use .lean() for read-only queries to return plain JavaScript objects
    // instead of Mongoose documents, improving performance by skipping Mongoose overhead.
    // Recommendation: Ensure an index exists on `updatedAt` for efficient sorting.
    // If `filter` commonly includes specific fields, consider adding indexes for those fields as well.
    const list = await Dataset.find(filter).sort({ updatedAt: -1 }).lean();
    return list;
  } catch (err) {
    throw new Error(`Failed to retrieve local datasets catalog: ${err.message}`);
  }
};

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