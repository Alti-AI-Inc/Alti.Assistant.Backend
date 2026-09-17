import { randomUUID } from 'crypto';
import httpStatus from 'http-status';
import UserModel from '../app/modules/auth/auth.model.js';
import ApiError from '../errors/ApiError.js';

const validatePromptRequest = async (req, res) => {
  const prompt = req.body?.prompt;
  const userId = req.user?._id;
  const sessionId = req.body?.sessionId || randomUUID();

  if (!prompt) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Prompt is required.');
  }

  const user = await UserModel.isUserExist(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  return { prompt, userId, sessionId };
};
export default validatePromptRequest;
