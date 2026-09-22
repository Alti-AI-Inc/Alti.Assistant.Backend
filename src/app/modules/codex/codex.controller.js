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

const completeCode = catchAsync(async (req, res) => {
  const result = await CodexService.completeCode(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Code completion generated.', data: result });
});

const translateCode = catchAsync(async (req, res) => {
  const result = await CodexService.translateCode(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Code translated.', data: result });
});

const generateTests = catchAsync(async (req, res) => {
  const result = await CodexService.generateTests(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Tests generated.', data: result });
});

const generateDocs = catchAsync(async (req, res) => {
  const result = await CodexService.generateDocs(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Documentation generated.', data: result });
});

const debugCode = catchAsync(async (req, res) => {
  const result = await CodexService.debugCode(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Debug analysis completed.', data: result });
});

const generateCodeStream = async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await CodexService.generateCodeStream(req.body);
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
};

export const CodexController = {
  generateCode,
  explainCode,
  refactorCode,
  reviewCode,
  executeCode,
  completeCode,
  translateCode,
  generateTests,
  generateDocs,
  debugCode,
  generateCodeStream,
};

export default CodexController;
