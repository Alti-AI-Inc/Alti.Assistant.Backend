/**
 * @module datasets.controller
 * @description Controller for handling dataset-related operations, including searching,
 * retrieving information, previewing, archiving, indexing, and managing a local catalog
 * and a Hugging Face dataset crawler.
 */
import { DatasetsService } from './datasets.service.js';
import { DatasetsCrawlerService } from './datasetsCrawler.service.js';
/**
 * Mongoose model for Dataset documents.
 * @type {import('mongoose').Model<any>}
 */
import Dataset from './datasets.model.js';

/**
 * @swagger
 * /datasets/search:
 *   get:
 *     summary: Search for datasets on Hugging Face Hub.
 *     description: Retrieves a list of datasets from the Hugging Face Hub based on a search query.
 *     tags:
 *       - Datasets
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: The search term for datasets.
 *         required: true
 *         example: "text classification"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of results to return.
 *     responses:
 *       200:
 *         description: A list of datasets matching the query.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   description: Number of datasets found.
 *                   example: 5
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, example: "glue" }
 *                       name: { type: string, example: "glue" }
 *                       description: { type: string, example: "GLUE benchmark" }
 *                       # ... other relevant dataset properties
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to search datasets: An unexpected error occurred."
 */
/**
 * Handles the search for datasets on the Hugging Face Hub.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const searchDatasets = async (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    
    const results = await DatasetsService.searchHFDatasets(query, limit);
    res.status(200).json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * @swagger
 * /datasets/info:
 *   get:
 *     summary: Get detailed information for a specific Hugging Face dataset.
 *     description: Retrieves comprehensive details about a dataset from the Hugging Face Hub, including configurations, splits, and features.
 *     tags:
 *       - Datasets
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         description: The ID of the dataset (e.g., "glue", "squad").
 *         required: true
 *         example: "glue"
 *     responses:
 *       200:
 *         description: Detailed information about the dataset.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object # Placeholder, ideally define a DatasetInfo schema
 *                   properties:
 *                     id: { type: string, example: "glue" }
 *                     configs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           config: { type: string, example: "default" }
 *                           splits:
 *                             type: array
 *                             items: { type: string, example: "train" }
 *                           features:
 *                             type: object # Example: { "sentence1": { "dtype": "string" } }
 *       400:
 *         description: Bad request, missing dataset ID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Query parameter \"id\" (Dataset ID) is required."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to retrieve dataset info: An unexpected error occurred."
 */
/**
 * Handles the retrieval of detailed information for a specific Hugging Face dataset.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getDatasetInfo = async (req, res) => {
  try {
    const datasetId = req.query.id;
    if (!datasetId) {
      return res.status(400).json({ success: false, error: 'Query parameter "id" (Dataset ID) is required.' });
    }

    const info = await DatasetsService.getHFDatasetInfo(datasetId);
    res.status(200).json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * @swagger
 * /datasets/preview:
 *   get:
 *     summary: Get a preview of rows from a Hugging Face dataset split.
 *     description: Retrieves a limited number of rows from a specified configuration and split of a Hugging Face dataset.
 *     tags:
 *       - Datasets
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         description: The ID of the dataset (e.g., "glue", "squad").
 *         required: true
 *         example: "glue"
 *       - in: query
 *         name: config
 *         schema:
 *           type: string
 *           default: "default"
 *         description: The configuration name of the dataset.
 *         example: "default"
 *       - in: query
 *         name: split
 *         schema:
 *           type: string
 *           default: "train"
 *         description: The split name of the dataset (e.g., "train", "validation", "test").
 *         example: "train"
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: The starting index for retrieving rows.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: The maximum number of rows to return.
 *     responses:
 *       200:
 *         description: A preview of dataset rows.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Placeholder for a single row schema
 *                     example: { "sentence1": "Hello", "sentence2": "World", "label": 0 }
 *       400:
 *         description: Bad request, missing dataset ID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Query parameter \"id\" is required."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to retrieve dataset rows preview: An unexpected error occurred."
 */
/**
 * Handles the retrieval of a preview of rows from a Hugging Face dataset split.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getDatasetRowsPreview = async (req, res) => {
  try {
    const datasetId = req.query.id;
    const configName = req.query.config || 'default';
    const splitName = req.query.split || 'train';
    const offset = req.query.offset ? parseInt(req.query.offset) : 0;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    if (!datasetId) {
      return res.status(400).json({ success: false, error: 'Query parameter "id" is required.' });
    }

    const preview = await DatasetsService.getHFDatasetRows(datasetId, configName, splitName, offset, limit);
    res.status(200).json({ success: true, data: preview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * @swagger
 * /datasets/archive:
 *   post:
 *     summary: Archive a Hugging Face dataset to Google Cloud Storage.
 *     description: Initiates an asynchronous process to download and archive a specified Hugging Face dataset to Google Cloud Storage.
 *     tags:
 *       - Datasets
 *       - Operations
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - datasetId
 *             properties:
 *               datasetId:
 *                 type: string
 *                 description: The ID of the dataset to archive (e.g., "glue", "squad").
 *                 example: "glue"
 *     responses:
 *       202:
 *         description: Archiving process initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Archiving process for dataset 'glue' started."
 *                 jobId:
 *                   type: string
 *                   example: "archive-job-12345"
 *       400:
 *         description: Bad request, missing dataset ID in body.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Body property \"datasetId\" is required."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to initiate dataset archiving: An unexpected error occurred."
 */
/**
 * Handles the archiving of a Hugging Face dataset to Google Cloud Storage.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const archiveDataset = async (req, res) => {
  try {
    const { datasetId } = req.body;
    if (!datasetId) {
      return res.status(400).json({ success: false, error: 'Body property "datasetId" is required.' });
    }

    const result = await DatasetsService.archiveDatasetToGCS(datasetId);
    res.status(202).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * @swagger
 * /datasets/index:
 *   post:
 *     summary: Index a Hugging Face dataset for RAG (Retrieval Augmented Generation).
 *     description: Initiates an asynchronous process to index a specified Hugging Face dataset, making it available for RAG applications.
 *     tags:
 *       - Datasets
 *       - Operations
 *       - RAG
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - datasetId
 *             properties:
 *               datasetId:
 *                 type: string
 *                 description: The ID of the dataset to index (e.g., "squad", "nq_open").
 *                 example: "squad"
 *     responses:
 *       202:
 *         description: Indexing process initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Indexing process for dataset 'squad' started."
 *                 jobId:
 *                   type: string
 *                   example: "index-job-67890"
 *       400:
 *         description: Bad request, missing dataset ID in body.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Body property \"datasetId\" is required."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to initiate dataset indexing: An unexpected error occurred."
 */
/**
 * Handles the indexing of a Hugging Face dataset for RAG (Retrieval Augmented Generation).
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const indexDataset = async (req, res) => {
  try {
    const { datasetId } = req.body;
    if (!datasetId) {
      return res.status(400).json({ success: false, error: 'Body property "datasetId" is required.' });
    }

    const result = await DatasetsService.indexDatasetForRAG(datasetId);
    res.status(202).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * @swagger
 * /datasets/status/{id}:
 *   get:
 *     summary: Get the local status of a registered dataset.
 *     description: Retrieves the status and metadata of a dataset from the local catalog, if it has been registered (e.g., by the crawler).
 *     tags:
 *       - Datasets
 *       - Local Catalog
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         description: The URL-encoded ID of the dataset (e.g., "glue", "squad", or "google%2Ffleurs").
 *         required: true
 *         example: "glue"
 *     responses:
 *       200:
 *         description: Dataset status and metadata retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object # Placeholder, ideally define a LocalDatasetStatus schema
 *                   properties:
 *                     datasetId: { type: string, example: "glue" }
 *                     status: { type: string, example: "indexed" }
 *                     lastIndexed: { type: string, format: "date-time" }
 *                     # ... other local dataset properties
 *       404:
 *         description: Dataset not found in the local catalog.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Dataset \"glue\" is not registered in our local catalog."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to retrieve dataset status: An unexpected error occurred."
 */
/**
 * Handles the retrieval of the local status for a registered dataset.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getDatasetStatus = async (req, res) => {
  try {
    const { id } = req.params;
    // Replace URL encoded slash if present (e.g. glue%2Fcola -> glue/cola)
    const datasetId = decodeURIComponent(id);

    // Optimization: Add .lean() for read-only operations to get plain JavaScript objects
    // instead of Mongoose documents, improving performance.
    // Indexing Recommendation: Consider adding an index to the 'datasetId' field in your Dataset model
    // for faster lookups: `DatasetSchema.index({ datasetId: 1 });`
    const dataset = await Dataset.findOne({ datasetId }).lean();
    if (!dataset) {
      return res.status(404).json({ success: false, message: `Dataset "${datasetId}" is not registered in our local catalog.` });
    }

    res.status(200).json({ success: true, data: dataset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * @swagger
 * /datasets/catalog:
 *   get:
 *     summary: Get the list of datasets in the local catalog.
 *     description: Retrieves all datasets that have been registered and processed by the local system, including their current status.
 *     tags:
 *       - Datasets
 *       - Local Catalog
 *     responses:
 *       200:
 *         description: A list of datasets in the local catalog.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   description: Number of datasets in the catalog.
 *                   example: 10
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Placeholder, ideally define a LocalDatasetStatus schema
 *                     properties:
 *                       datasetId: { type: string, example: "glue" }
 *                       status: { type: string, example: "indexed" }
 *                       # ... other local dataset properties
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to retrieve local catalog: An unexpected error occurred."
 */
/**
 * Handles the retrieval of the local catalog of registered datasets.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getLocalCatalog = async (req, res) => {
  try {
    const catalog = await DatasetsService.getLocalCatalog();
    res.status(200).json({ success: true, count: catalog.length, data: catalog });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * @swagger
 * /datasets/crawler/scan:
 *   post:
 *     summary: Initiate a Hugging Face Hub dataset discovery scan.
 *     description: Starts an asynchronous scan of the Hugging Face Hub to discover new datasets and add them to the processing queue.
 *     tags:
 *       - Crawler
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 500
 *           minimum: 1
 *         description: Maximum number of datasets to discover during this scan.
 *     responses:
 *       202:
 *         description: Discovery scan initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Hugging Face discovery scan initiated (Target limit: 500 datasets). Check status or stats."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to initiate crawler discovery scan: An unexpected error occurred."
 */
/**
 * Handles the initiation of a Hugging Face Hub dataset discovery scan.
 * The scan runs asynchronously.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const startCrawlerDiscovery = async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 500;
    // Launch discovery scan asynchronously
    DatasetsCrawlerService.scanHuggingFaceHub(limit)
      .then(result => console.log('Crawler discovery scan finished:', result))
      .catch(err => console.error('Crawler discovery scan failed:', err));

    res.status(202).json({ success: true, message: `Hugging Face discovery scan initiated (Target limit: ${limit} datasets). Check status or stats.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * @swagger
 * /datasets/crawler/start:
 *   post:
 *     summary: Start the dataset crawler worker.
 *     description: Activates the background worker responsible for processing datasets in the queue (e.g., archiving, indexing).
 *     tags:
 *       - Crawler
 *     responses:
 *       200:
 *         description: Crawler worker started successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Crawler worker started."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to start crawler worker: An unexpected error occurred."
 */
/**
 * Handles the starting of the dataset crawler worker.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const startCrawlerWorker = async (req, res) => {
  try {
    const result = DatasetsCrawlerService.startWorker();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * @swagger
 * /datasets/crawler/stop:
 *   post:
 *     summary: Stop the dataset crawler worker.
 *     description: Deactivates the background worker, pausing the processing of datasets in the queue.
 *     tags:
 *       - Crawler
 *     responses:
 *       200:
 *         description: Crawler worker stopped successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Crawler worker stopped."
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to stop crawler worker: An unexpected error occurred."
 */
/**
 * Handles the stopping of the dataset crawler worker.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const stopCrawlerWorker = async (req, res) => {
  try {
    const result = DatasetsCrawlerService.stopWorker();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * @swagger
 * /datasets/crawler/stats:
 *   get:
 *     summary: Get statistics about the dataset crawler.
 *     description: Retrieves current operational statistics for the dataset crawler, including queue size, processed items, and worker status.
 *     tags:
 *       - Crawler
 *     responses:
 *       200:
 *         description: Crawler statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object # Placeholder for CrawlerStats schema
 *                   properties:
 *                     workerStatus: { type: string, example: "running" }
 *                     queueSize: { type: integer, example: 15 }
 *                     processedCount: { type: integer, example: 120 }
 *                     failedCount: { type: integer, example: 2 }
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to retrieve crawler stats: An unexpected error occurred."
 */
/**
 * Handles the retrieval of statistics about the dataset crawler.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getCrawlerStats = async (req, res) => {
  try {
    const stats = await DatasetsCrawlerService.getCrawlerStats();
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * @swagger
 * /datasets/crawler/queue:
 *   get:
 *     summary: Get the list of datasets in the crawler queue.
 *     description: Retrieves a paginated list of datasets currently in the crawler's processing queue, with optional filtering by status.
 *     tags:
 *       - Crawler
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed]
 *         description: Filter queue items by their processing status.
 *         example: "pending"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 200
 *         description: Maximum number of queue items to return.
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Number of queue items to skip for pagination.
 *     responses:
 *       200:
 *         description: A paginated list of datasets in the crawler queue.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 total:
 *                   type: integer
 *                   description: Total number of items matching the filter.
 *                   example: 100
 *                 count:
 *                   type: integer
 *                   description: Number of items returned in this response.
 *                   example: 50
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object # Placeholder for QueueItem schema
 *                     properties:
 *                       datasetId: { type: string, example: "glue" }
 *                       status: { type: string, example: "pending" }
 *                       addedAt: { type: string, format: "date-time" }
 *                       # ... other queue item properties
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to retrieve crawler queue: An unexpected error occurred."
 */
/**
 * Handles the retrieval of the list of datasets in the crawler queue.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getQueueList = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    const skip = req.query.skip ? parseInt(req.query.skip) : 0;

    const result = await DatasetsCrawlerService.getQueueList(filter, limit, skip);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * @global
 * @typedef {object} DatasetsControllerType
 * @property {function(import('express').Request, import('express').Response): Promise<void>} searchDatasets - Handler for searching Hugging Face datasets.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getDatasetInfo - Handler for getting detailed dataset information.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getDatasetRowsPreview - Handler for getting a preview of dataset rows.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} archiveDataset - Handler for archiving a dataset to GCS.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} indexDataset - Handler for indexing a dataset for RAG.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getDatasetStatus - Handler for getting the local status of a dataset.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getLocalCatalog - Handler for getting the local dataset catalog.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} startCrawlerDiscovery - Handler for initiating a crawler discovery scan.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} startCrawlerWorker - Handler for starting the crawler worker.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} stopCrawlerWorker - Handler for stopping the crawler worker.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getCrawlerStats - Handler for getting crawler statistics.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getQueueList - Handler for getting the crawler queue list.
 */
/**
 * Exports an object containing all dataset-related controller functions.
 * These functions handle various API endpoints for managing and interacting with datasets,
 * including Hugging Face integration and local catalog/crawler management.
 * @type {DatasetsControllerType}
 */
export const DatasetsController = {
  searchDatasets,
  getDatasetInfo,
  getDatasetRowsPreview,
  archiveDataset,
  indexDataset,
  getDatasetStatus,
  getLocalCatalog,
  startCrawlerDiscovery,
  startCrawlerWorker,
  stopCrawlerWorker,
  getCrawlerStats,
  getQueueList
};