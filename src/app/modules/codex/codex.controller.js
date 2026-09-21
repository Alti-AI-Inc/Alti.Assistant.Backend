import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { CodexService } from './codex.service.js';

const generateCode = catchAsync(async (req, res) => {
  const result = await CodexService.generateCode(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Code generated successfully.',
    data: result,
  });
});

const explainCode = catchAsync(async (req, res) => {
  const result = await CodexService.explainCode(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Code explained successfully.',
    data: result,
  });
});

const refactorCode = catchAsync(async (req, res) => {
  const result = await CodexService.refactorCode(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Code refactored successfully.',
    data: result,
  });
});

const reviewCode = catchAsync(async (req, res) => {
  const result = await CodexService.reviewCode(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Code audit completed.',
    data: result,
  });
});

const executeCode = catchAsync(async (req, res) => {
  const { code, timeoutMs } = req.body;
  const result = await CodexService.executeCode({ code, timeoutMs });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: result.success,
    message: result.success ? 'Sandbox execution completed.' : 'Execution failed.',
    data: result,
  });
});

export const CodexController = {
  generateCode,
  explainCode,
  refactorCode,
  reviewCode,
  executeCode,
};

export default CodexController;
