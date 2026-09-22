import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { LangChainController } from './langchain.controller.js';

const router = express.Router();

router.use(auth());

// Graph & Chain Execution
router.post('/graph/run', LangChainController.runReasoningGraph);
router.post('/chains/rag', LangChainController.runRagChain);
router.post('/chains/summarize', LangChainController.runSummarizeChain);

// Advanced LangChain Capabilities
router.post('/agent/tool', LangChainController.runToolAgent);
router.post('/output-parsers/structured', LangChainController.parseStructuredOutput);
router.post('/text-splitters/split', LangChainController.splitText);
router.post('/memory/chat', LangChainController.runMemoryChain);
router.post('/document-loaders/web', LangChainController.scrapeWebPage);
router.post('/agent/exa', LangChainController.runExaSearchAgent);

// Templates Catalog
router.get('/graphs', LangChainController.listGraphTemplates);

export const LangChainRoutes = router;
export default LangChainRoutes;
