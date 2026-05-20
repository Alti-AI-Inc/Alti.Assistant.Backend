import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { orchestratorService } from './orchestrator.service.js';

const routePrompt = catchAsync(async (req, res) => {
  const { message, prompt, sessionId, conversationId } = req.body;
  const userPrompt = message || prompt;
  const userId = req.user.id || req.user._id || req.user.userId;

  const result = await orchestratorService.classifyAndDispatch(userPrompt, sessionId, userId, conversationId);

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
