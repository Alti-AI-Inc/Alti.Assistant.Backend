import axios from 'axios';
import { Storage } from '@google-cloud/storage';
import path from 'path';
import Dataset from './datasets.model.js';
import config from '../../../../config/index.js';

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

    console.log(`Starting GCS archival process for HF Dataset: ${datasetId}`);

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

    const { bucket, bucketName } = getGcsBucket();
    if (!bucket) {
      throw new Error('Google Cloud Storage bucket not configured or failed to initialize.');
    }

    // Check bucket access/exists
    const [bucketExists] = await bucket.exists();
    if (!bucketExists) {
      console.log(`GCS Bucket "${bucketName}" does not exist. Attempting to create...`);
      await bucket.create();
    }

    const parquetFiles = fileListResponse.data.parquet_files;
    const uploadedGcsPaths = [];
    let totalBytes = 0;

    for (const fileItem of parquetFiles) {
      const downloadUrl = fileItem.url;
      const fileName = fileItem.filename;
      const configName = fileItem.config;
      const splitName = fileItem.split;
      const fileSize = fileItem.size || 0;

      console.log(`Streaming Parquet file: ${fileName} (${(fileSize / (1024 * 1024)).toFixed(2)} MB) for configuration: ${configName}`);

      // Stream from HF to GCS
      const destPath = `datasets/${datasetId}/${configName}/${splitName}/${fileName}`;
      const gcsFileObj = bucket.file(destPath);

      const writeStream = gcsFileObj.createWriteStream({
        metadata: {
          contentType: 'application/octet-stream',
          metadata: {
            originalUrl: downloadUrl,
            datasetId: datasetId,
            config: configName,
            split: splitName
          }
        }
      });

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
            const gsUri = `gs://${bucketName}/${destPath}`;
            uploadedGcsPaths.push(gsUri);
            totalBytes += fileSize;
            console.log(`Successfully uploaded to GCS: ${gsUri}`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`Piping stream to GCS failed for file ${fileName}:`, err);
            reject(err);
          });
      });
    }

    // Update database model to archived
    dataset.status = 'archived';
    dataset.gcsBucket = bucketName;
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
      console.warn(`Could not extract column features during GCS archiving: ${e.message}`);
    }

    await dataset.save();
    console.log(`GCS Archival completed for ${datasetId}. Total size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);

  } catch (error) {
    console.error(`Error during GCS archival of ${datasetId}:`, error);
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
 * Stub implementation for chunking, embedding, and indexing archived data
 * to build the ultimate high-fidelity data base for our Perplexity-killer
 */
const indexDatasetForRAG = async (datasetId) => {
  const dataset = await Dataset.findOne({ datasetId });
  if (!dataset) {
    throw new Error('Dataset not found in local catalog.');
  }

  if (dataset.status !== 'archived') {
    throw new Error(`Dataset is in status "${dataset.status}". It must be fully "archived" to GCS before starting vector indexing.`);
  }

  dataset.status = 'indexing';
  await dataset.save();

  // Async processing stub for indexing
  (async () => {
    try {
      console.log(`Starting RAG Indexing of archived dataset: ${datasetId}`);
      
      // 1. In a live system, we would stream each Parquet file from GCS
      // 2. Parse the parquet bytes using a parquet-reader or convert to JSON rows
      // 3. For each row, construct a semantic text document (e.g. "Column A: Value, Column B: Value")
      // 4. Generate embeddings via Google Vertex AI / Gemini Text Embedding APIs
      // 5. Index chunks into MongoDB vectors or Vector databases (such as Pinecone / pgvector / Qdrant)
      
      // Simulate indexing progress
      await new Promise(resolve => setTimeout(resolve, 8000));

      dataset.status = 'indexed';
      await dataset.save();
      console.log(`RAG Indexing successfully completed for dataset: ${datasetId}`);
    } catch (err) {
      console.error(`RAG Indexing failed for ${datasetId}:`, err);
      dataset.status = 'failed';
      dataset.error = err.message;
      await dataset.save();
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
    const list = await Dataset.find(filter).sort({ updatedAt: -1 });
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
  getLocalCatalog
};
