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

export const LangChainController = {
  runReasoningGraph,
  runRagChain,
  runSummarizeChain,
  listGraphTemplates,
};

export default LangChainController;
