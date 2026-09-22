import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { LangChainService } from './langchain.service.js';

const runReasoningGraph = catchAsync(async (req, res) => {
  const result = await LangChainService.runReasoningGraph(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LangGraph reasoning graph executed.',
    data: result,
  });
});

const runRagChain = catchAsync(async (req, res) => {
  const result = await LangChainService.runRagChain(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'RAG chain executed.',
    data: result,
  });
});

const runSummarizeChain = catchAsync(async (req, res) => {
  const result = await LangChainService.runSummarizeChain(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Summarization chain completed.',
    data: result,
  });
});

const listGraphTemplates = catchAsync(async (req, res) => {
  const result = await LangChainService.listGraphTemplates();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'LangGraph graph templates listed.',
    data: result,
  });
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

export const LangChainController = {
  runReasoningGraph,
  runRagChain,
  runSummarizeChain,
  listGraphTemplates,
  runToolAgent,
  parseStructuredOutput,
  splitText,
  runMemoryChain,
  scrapeWebPage,
};

export default LangChainController;
