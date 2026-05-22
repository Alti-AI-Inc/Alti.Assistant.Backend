import { DatasetsService } from './datasets.service.js';
import { DatasetsCrawlerService } from './datasetsCrawler.service.js';
import Dataset from './datasets.model.js';

/**
 * GET /datasets/search
 * Query params: q (search term), limit (optional, default 10)
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
 * GET /datasets/info
 * Query params: id (e.g. glue)
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
 * GET /datasets/preview
 * Query params: id (Dataset ID), config (optional), split (optional), offset (optional), limit (optional)
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
 * POST /datasets/archive
 * Body: datasetId
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
 * POST /datasets/index
 * Body: datasetId
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
 * GET /datasets/status/:id
 */
const getDatasetStatus = async (req, res) => {
  try {
    const { id } = req.params;
    // Replace URL encoded slash if present (e.g. glue%2Fcola -> glue/cola)
    const datasetId = decodeURIComponent(id);

    const dataset = await Dataset.findOne({ datasetId });
    if (!dataset) {
      return res.status(404).json({ success: false, message: `Dataset "${datasetId}" is not registered in our local catalog.` });
    }

    res.status(200).json({ success: true, data: dataset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /datasets/catalog
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
 * POST /datasets/crawler/scan
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
 * POST /datasets/crawler/start
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
 * POST /datasets/crawler/stop
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
 * GET /datasets/crawler/stats
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
 * GET /datasets/crawler/queue
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
