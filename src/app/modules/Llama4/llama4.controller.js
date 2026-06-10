import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { Llama4AiServices } from './llama4.service.js';
import validatePromptRequest from '../../../shared/validatePromptRequest.js';

const Llama4AiGetResponse = catchAsync(async (req, res) => {
  // Security Vulnerability (IDOR - Insecure Direct Object Reference):
  // The original code extracted `userId` from `validatePromptRequest(req)`,
  // implying it was taken directly from the client's request (e.g., req.body, req.query).
  // This is an IDOR vulnerability because a malicious user could potentially
  // provide any userId and attempt to access or manipulate data belonging to other users.
  //
  // Fix:
  // `userId` should be derived from the authenticated user's session or token,
  // which is typically populated by an authentication middleware onto `req.user` (or similar object).
  // This ensures that the AI response is generated for and associated with the
  // securely authenticated user, preventing unauthorized access to other users' data.
  //
  // Assuming `req.user.id` is populated by an authentication middleware:
  const { prompt, sessionId } = await validatePromptRequest(req);
  const userId = req.user.id; // Securely get userId from the authenticated user's context

  const result = await Llama4AiServices.Llama4AiGetResponseService(
    prompt,
    userId,
    sessionId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Response processed successfully.',
    data: result,
  });
});

export const Llama4AiController = {
  Llama4AiGetResponse,
};