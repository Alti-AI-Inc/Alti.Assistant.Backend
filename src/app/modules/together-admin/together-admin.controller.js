import {
  llmListModels, llmWhoami, llmGetBillingUsage,
  llmListEndpoints, llmCreateEndpoint,
  llmListBatches, llmGetBatch, llmCreateBatch, llmCancelBatch,
  llmCreateFineTune, llmListFineTunes, llmGetFineTune, llmCancelFineTune,
  llmEstimateFineTunePrice, llmGetFineTuneMetrics,
  llmListEvals, llmCreateEval, llmGetEval,
  llmUploadFile, llmListFiles, llmGetFile, llmDeleteFile,
  llmUploadModel, llmGetModelLimits
} from '../../services/llm.client.js';
import { logger } from '../../../shared/logger.js';

/**
 * Together AI Admin Controller
 * Provides REST endpoints for platform administration:
 * - Account & billing
 * - Model management
 * - Fine-tuning jobs
 * - Batch inference
 * - Evaluations
 * - File management
 */
export const TogetherAdminController = {
  // ─── ACCOUNT ────────────────────────────────────────────────────────

  async whoami(req, res) {
    try {
      const result = await llmWhoami();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getBillingUsage(req, res) {
    try {
      const { month, granularity } = req.query;
      const result = await llmGetBillingUsage({ month, granularity });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ─── MODELS ─────────────────────────────────────────────────────────

  async listModels(req, res) {
    try {
      const result = await llmListModels();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async uploadModel(req, res) {
    try {
      const { source, name, hfToken } = req.body;
      const result = await llmUploadModel(source, { name, hfToken });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getModelLimits(req, res) {
    try {
      const result = await llmGetModelLimits(req.params.model);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ─── ENDPOINTS ──────────────────────────────────────────────────────

  async listEndpoints(req, res) {
    try {
      const result = await llmListEndpoints();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async createEndpoint(req, res) {
    try {
      const result = await llmCreateEndpoint(req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ─── FINE-TUNING ────────────────────────────────────────────────────

  async listFineTunes(req, res) {
    try {
      const result = await llmListFineTunes();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async createFineTune(req, res) {
    try {
      const result = await llmCreateFineTune(req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getFineTune(req, res) {
    try {
      const result = await llmGetFineTune(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async cancelFineTune(req, res) {
    try {
      const result = await llmCancelFineTune(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async estimateFineTunePrice(req, res) {
    try {
      const { fileId, model, epochs, learningRate, batchSize } = req.body;
      const result = await llmEstimateFineTunePrice(fileId, model, { epochs, learningRate, batchSize });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getFineTuneMetrics(req, res) {
    try {
      const result = await llmGetFineTuneMetrics(req.params.id, req.query);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ─── BATCH JOBS ─────────────────────────────────────────────────────

  async listBatches(req, res) {
    try {
      const result = await llmListBatches();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async createBatch(req, res) {
    try {
      const { inputFileId, endpoint, completionWindow } = req.body;
      const result = await llmCreateBatch(inputFileId, endpoint, { completionWindow });
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getBatch(req, res) {
    try {
      const result = await llmGetBatch(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async cancelBatch(req, res) {
    try {
      const result = await llmCancelBatch(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ─── EVALS ──────────────────────────────────────────────────────────

  async listEvals(req, res) {
    try {
      const result = await llmListEvals();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async createEval(req, res) {
    try {
      const result = await llmCreateEval(req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getEval(req, res) {
    try {
      const result = await llmGetEval(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ─── FILES ──────────────────────────────────────────────────────────

  async listFiles(req, res) {
    try {
      const result = await llmListFiles();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getFile(req, res) {
    try {
      const result = await llmGetFile(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async deleteFile(req, res) {
    try {
      const result = await llmDeleteFile(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // ─── DASHBOARD AGGREGATE ───────────────────────────────────────────

  async getDashboard(req, res) {
    try {
      const [whoami, models, endpoints, fineTunes, batches, files] = await Promise.allSettled([
        llmWhoami(),
        llmListModels(),
        llmListEndpoints(),
        llmListFineTunes(),
        llmListBatches(),
        llmListFiles()
      ]);

      res.json({
        success: true,
        data: {
          account: whoami.status === 'fulfilled' ? whoami.value : null,
          modelCount: models.status === 'fulfilled' ? (models.value?.length || models.value?.data?.length || 0) : 0,
          endpoints: endpoints.status === 'fulfilled' ? endpoints.value : [],
          fineTunes: fineTunes.status === 'fulfilled' ? fineTunes.value : [],
          batches: batches.status === 'fulfilled' ? batches.value : [],
          fileCount: files.status === 'fulfilled' ? (files.value?.length || files.value?.data?.length || 0) : 0
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

export default TogetherAdminController;
