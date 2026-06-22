import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import ApiError from '../../../errors/ApiError.js';
import { audioService } from './audio.service.js';

/**
 * Handles audio generation request.
 */
const generateAudio = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? audioService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId } = req.body;

  if (!message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A message prompt is required for audio generation');
  }

  const result = await audioService.generateAudio(
    userId,
    conversationId,
    message,
    isGuest,
    req
  );

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Audio generation completed successfully',
    data: {
      ...result,
      userType: isGuest ? 'guest' : 'authenticated',
      userId: isGuest ? userId : undefined,
    },
  });
});

export const audioController = {
  generateAudio,
};
