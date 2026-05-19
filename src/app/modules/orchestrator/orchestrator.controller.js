import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { orchestratorService } from './orchestrator.service.js';

const routePrompt = catchAsync(async (req, res) => {
  const { prompt, sessionId } = req.body;
  const userId = req.user.userId;

  const result = await orchestratorService.classifyAndDispatch(prompt, sessionId, userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Prompt successfully routed and processed.',
    data: result,
  });
});

export const orchestratorController = {
  routePrompt,
};
