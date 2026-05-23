import express from 'express';
import { LangchainController } from './langchain.controller.js';

const router = express.Router();

router.get('/repositories', LangchainController.getRepositories);
router.get('/stats', LangchainController.getStats);
router.post('/import', LangchainController.importSubmodule);

// ── LCEL Custom Chain Registry & Execution Endpoints ────────────────────────
router.post('/chains', LangchainController.createChain);
router.get('/chains', LangchainController.listChains);
router.post('/chains/:chainId/run', LangchainController.runChain);
router.get('/chains/:chainId/executions', LangchainController.getExecutions);
router.get('/chains/:chainId/optimize', LangchainController.optimizeChain);
router.post('/chains/:chainId/rollback', LangchainController.rollbackChain);
router.get('/chains/:chainId/versions', LangchainController.getChainVersions);
router.post('/chains/:chainId/benchmark', LangchainController.benchmarkChain);
router.post('/chains/:chainId/stream', LangchainController.streamChain);

export const langchainRoutes = router;
