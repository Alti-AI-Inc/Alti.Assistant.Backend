import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import httpStatus from 'http-status';
import { PromptForgeService } from './promptforge.service.js';

const listTemplates = catchAsync(async (req, res) => {
  const result = await PromptForgeService.listTemplates();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Templates retrieved successfully',
    data: result,
  });
});

const render = catchAsync(async (req, res) => {
  const result = await PromptForgeService.renderTemplate(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Template rendered successfully',
    data: result,
  });
});

const optimize = catchAsync(async (req, res) => {
  const result = await PromptForgeService.optimizePrompt(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Prompt optimized successfully',
    data: result,
  });
});

const analyze = catchAsync(async (req, res) => {
  const result = await PromptForgeService.analyzePrompt(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Prompt analyzed successfully',
    data: result,
  });
});

export const PromptForgeController = {
  listTemplates,
  render,
  optimize,
  analyze
};
