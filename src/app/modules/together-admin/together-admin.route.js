import express from 'express';
import { TogetherAdminController } from './together-admin.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

// Dashboard aggregate
router.get('/dashboard', auth(), TogetherAdminController.getDashboard);

// Account
router.get('/whoami', auth(), TogetherAdminController.whoami);
router.get('/billing/usage', auth(), TogetherAdminController.getBillingUsage);

// Models
router.get('/models', auth(), TogetherAdminController.listModels);
router.post('/models/upload', auth(), TogetherAdminController.uploadModel);
router.get('/models/:model/limits', auth(), TogetherAdminController.getModelLimits);

// Endpoints
router.get('/endpoints', auth(), TogetherAdminController.listEndpoints);
router.post('/endpoints', auth(), TogetherAdminController.createEndpoint);

// Fine-tuning
router.get('/fine-tunes', auth(), TogetherAdminController.listFineTunes);
router.post('/fine-tunes', auth(), TogetherAdminController.createFineTune);
router.get('/fine-tunes/:id', auth(), TogetherAdminController.getFineTune);
router.post('/fine-tunes/:id/cancel', auth(), TogetherAdminController.cancelFineTune);
router.post('/fine-tunes/estimate-price', auth(), TogetherAdminController.estimateFineTunePrice);
router.get('/fine-tunes/:id/metrics', auth(), TogetherAdminController.getFineTuneMetrics);

// Batch jobs
router.get('/batches', auth(), TogetherAdminController.listBatches);
router.post('/batches', auth(), TogetherAdminController.createBatch);
router.get('/batches/:id', auth(), TogetherAdminController.getBatch);
router.post('/batches/:id/cancel', auth(), TogetherAdminController.cancelBatch);

// Evals
router.get('/evals', auth(), TogetherAdminController.listEvals);
router.post('/evals', auth(), TogetherAdminController.createEval);
router.get('/evals/:id', auth(), TogetherAdminController.getEval);

// Files
router.get('/files', auth(), TogetherAdminController.listFiles);
router.get('/files/:id', auth(), TogetherAdminController.getFile);
router.delete('/files/:id', auth(), TogetherAdminController.deleteFile);

export default router;
