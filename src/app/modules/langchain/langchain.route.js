import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { LangChainController } from './langchain.controller.js';

const router = express.Router();

router.use(auth());

// ═══════════════════════════════════════════════════════════════════════════════
//  ORIGINAL ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
//  LANGGRAPH ADVANCED ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Multi-Agent Graphs
router.post('/graph/supervisor', LangChainController.runSupervisorGraph);
router.post('/graph/research-swarm', LangChainController.runResearchSwarm);
router.post('/graph/plan-execute', LangChainController.runPlanAndExecute);
router.post('/graph/map-reduce', LangChainController.runMapReduce);
router.post('/graph/custom', LangChainController.buildAndRunCustomGraph);

// Human-in-the-Loop
router.post('/graph/hitl', LangChainController.runHumanInTheLoop);
router.post('/graph/resume', LangChainController.resumeGraph);

// State Management
router.get('/graph/state/:threadId', LangChainController.getGraphState);

// Conversational Agent
router.post('/graph/conversational', LangChainController.runConversationalAgent);

// Advanced Templates
router.get('/graphs/advanced', LangChainController.listAdvancedGraphTemplates);

// ═══════════════════════════════════════════════════════════════════════════════
//  NEW CORE LANGCHAIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Enhanced Chains
router.post('/chains/qa', LangChainController.runQAChain);
router.post('/chains/conversational-rag', LangChainController.runConversationalRAG);
router.post('/chains/map-reduce-summarize', LangChainController.runMapReduceSummarize);
router.post('/chains/refine', LangChainController.runRefineChain);
router.post('/chains/router', LangChainController.runRouterChain);

// Document Loaders
router.post('/document-loaders/pdf', LangChainController.loadPDF);
router.post('/document-loaders/csv', LangChainController.loadCSV);
router.post('/document-loaders/json', LangChainController.loadJSON);
router.post('/document-loaders/github', LangChainController.loadGitHubRepo);
router.post('/document-loaders/notion', LangChainController.loadNotionPage);

export const LangChainRoutes = router;
export default LangChainRoutes;
