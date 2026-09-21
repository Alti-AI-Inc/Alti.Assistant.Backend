import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { LangChainController } from './langchain.controller.js';

const router = express.Router();

router.use(auth());

// Graph & Chain Execution
router.post('/graph/run', LangChainController.runReasoningGraph);
router.post('/chains/rag', LangChainController.runRagChain);
router.post('/chains/summarize', LangChainController.runSummarizeChain);

// Templates Catalog
router.get('/graphs', LangChainController.listGraphTemplates);

export const LangChainRoutes = router;
export default LangChainRoutes;
