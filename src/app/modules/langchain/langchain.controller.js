import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { LangChainService } from './langchain.service.js';
import { LangGraphService } from './langchain.langgraph.service.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  ORIGINAL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

const runReasoningGraph = catchAsync(async (req, res) => {
  const result = await LangChainService.runReasoningGraph(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'LangGraph reasoning graph executed.', data: result });
});

const runRagChain = catchAsync(async (req, res) => {
  const result = await LangChainService.runRagChain(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'RAG chain executed.', data: result });
});

const runSummarizeChain = catchAsync(async (req, res) => {
  const result = await LangChainService.runSummarizeChain(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Summarization chain completed.', data: result });
});

const listGraphTemplates = catchAsync(async (req, res) => {
  const result = await LangChainService.listGraphTemplates();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'LangGraph graph templates listed.', data: result });
});

const runToolAgent = catchAsync(async (req, res) => {
  const result = await LangChainService.runToolAgent(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Tool agent executed.', data: result });
});

const parseStructuredOutput = catchAsync(async (req, res) => {
  const result = await LangChainService.parseStructuredOutput(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Output parsed.', data: result });
});

const splitText = catchAsync(async (req, res) => {
  const result = await LangChainService.splitText(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Text split into chunks.', data: result });
});

const runMemoryChain = catchAsync(async (req, res) => {
  const result = await LangChainService.runMemoryChain(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Memory chain executed.', data: result });
});

const scrapeWebPage = catchAsync(async (req, res) => {
  const result = await LangChainService.scrapeWebPage(req.body.url);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Web page scraped.', data: result });
});

const runExaSearchAgent = catchAsync(async (req, res) => {
  const result = await LangChainService.runExaSearchAgent(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Exa search agent executed.', data: result });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  LANGGRAPH ADVANCED HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

const runSupervisorGraph = catchAsync(async (req, res) => {
  const result = await LangGraphService.runSupervisorGraph(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Supervisor graph executed.', data: result });
});

const runResearchSwarm = catchAsync(async (req, res) => {
  const result = await LangGraphService.runResearchSwarm(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Research swarm executed.', data: result });
});

const runPlanAndExecute = catchAsync(async (req, res) => {
  const result = await LangGraphService.runPlanAndExecute(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Plan-and-execute completed.', data: result });
});

const runHumanInTheLoop = catchAsync(async (req, res) => {
  const result = await LangGraphService.runHumanInTheLoop(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Human-in-the-loop initiated.', data: result });
});

const resumeGraph = catchAsync(async (req, res) => {
  const result = await LangGraphService.resumeGraph(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Graph resumed.', data: result });
});

const getGraphState = catchAsync(async (req, res) => {
  const result = await LangGraphService.getGraphState({ threadId: req.params.threadId });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Graph state retrieved.', data: result });
});

const runMapReduce = catchAsync(async (req, res) => {
  const result = await LangGraphService.runMapReduce(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Map-reduce executed.', data: result });
});

const runConversationalAgent = catchAsync(async (req, res) => {
  const result = await LangGraphService.runConversationalAgent(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Conversational agent executed.', data: result });
});

const listAdvancedGraphTemplates = catchAsync(async (req, res) => {
  const result = LangGraphService.listGraphTemplates();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Advanced graph templates listed.', data: result });
});

const buildAndRunCustomGraph = catchAsync(async (req, res) => {
  const result = await LangGraphService.buildAndRunCustomGraph(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Custom graph executed.', data: result });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  NEW CORE LANGCHAIN HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

const runQAChain = catchAsync(async (req, res) => {
  const result = await LangChainService.runQAChain(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'QA chain executed.', data: result });
});

const runConversationalRAG = catchAsync(async (req, res) => {
  const result = await LangChainService.runConversationalRAG(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Conversational RAG executed.', data: result });
});

const runMapReduceSummarize = catchAsync(async (req, res) => {
  const result = await LangChainService.runMapReduceSummarize(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Map-reduce summarization completed.', data: result });
});

const runRefineChain = catchAsync(async (req, res) => {
  const result = await LangChainService.runRefineChain(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Refine chain completed.', data: result });
});

const loadPDF = catchAsync(async (req, res) => {
  const result = await LangChainService.loadPDF(req.body.filePath);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'PDF loaded.', data: result });
});

const loadCSV = catchAsync(async (req, res) => {
  const result = await LangChainService.loadCSV(req.body.filePath, req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'CSV loaded.', data: result });
});

const loadJSON = catchAsync(async (req, res) => {
  const result = await LangChainService.loadJSON(req.body.filePath, req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'JSON loaded.', data: result });
});

const loadGitHubRepo = catchAsync(async (req, res) => {
  const result = await LangChainService.loadGitHubRepo(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'GitHub repo loaded.', data: result });
});

const loadNotionPage = catchAsync(async (req, res) => {
  const result = await LangChainService.loadNotionPage(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Notion page loaded.', data: result });
});

const runRouterChain = catchAsync(async (req, res) => {
  const result = await LangChainService.runRouterChain(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Router chain executed.', data: result });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const LangChainController = {
  // Original
  runReasoningGraph,
  runRagChain,
  runSummarizeChain,
  listGraphTemplates,
  runToolAgent,
  parseStructuredOutput,
  splitText,
  runMemoryChain,
  scrapeWebPage,
  runExaSearchAgent,
  // LangGraph Advanced
  runSupervisorGraph,
  runResearchSwarm,
  runPlanAndExecute,
  runHumanInTheLoop,
  resumeGraph,
  getGraphState,
  runMapReduce,
  runConversationalAgent,
  listAdvancedGraphTemplates,
  buildAndRunCustomGraph,
  // Core LangChain New
  runQAChain,
  runConversationalRAG,
  runMapReduceSummarize,
  runRefineChain,
  loadPDF,
  loadCSV,
  loadJSON,
  loadGitHubRepo,
  loadNotionPage,
  runRouterChain,
};

export default LangChainController;
