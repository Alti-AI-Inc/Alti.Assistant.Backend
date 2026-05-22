import express from 'express';
import { DatasetsController } from './datasets.controller.js';

const router = express.Router();

/**
 * GET /datasets/search
 * Search the Hugging Face Hub for datasets matching a search term
 */
router.get('/search', DatasetsController.searchDatasets);

/**
 * GET /datasets/catalog
 * Retrieve list of datasets that have been locally cataloged, archived, or indexed
 */
router.get('/catalog', DatasetsController.getLocalCatalog);

/**
 * GET /datasets/info
 * Fetch complete metadata details of a dataset from HF API
 */
router.get('/info', DatasetsController.getDatasetInfo);

/**
 * GET /datasets/preview
 * Fetch row previews for a dataset split
 */
router.get('/preview', DatasetsController.getDatasetRowsPreview);

/**
 * POST /datasets/archive
 * Asynchronously stream all Parquet files of a dataset from HF to Google Cloud Storage
 */
router.post('/archive', DatasetsController.archiveDataset);

/**
 * POST /datasets/index
 * Chunk, embed, and index archived dataset lines into RAG search vector storage
 */
router.post('/index', DatasetsController.indexDataset);

/**
 * GET /datasets/status/:id
 * Retrieve live archival/indexing status of a specific dataset ID
 */
router.get('/status/:id', DatasetsController.getDatasetStatus);

/**
 * POST /datasets/crawler/scan
 * Launch background discovery scanner to fetch and queue HF datasets
 */
router.post('/crawler/scan', DatasetsController.startCrawlerDiscovery);

/**
 * POST /datasets/crawler/start
 * Enable background serial downloader queue worker
 */
router.post('/crawler/start', DatasetsController.startCrawlerWorker);

/**
 * POST /datasets/crawler/stop
 * Gracefully stop background sequential downloader loop
 */
router.post('/crawler/stop', DatasetsController.stopCrawlerWorker);

/**
 * GET /datasets/crawler/stats
 * Return real-time metrics of the background queue and storage utilization
 */
router.get('/crawler/stats', DatasetsController.getCrawlerStats);

/**
 * GET /datasets/crawler/queue
 * Query entries in the crawling queue with pagination and status filters
 */
router.get('/crawler/queue', DatasetsController.getQueueList);

export const datasetsRoutes = router;
export default router;
