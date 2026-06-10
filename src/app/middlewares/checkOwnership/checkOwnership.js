import mongoose from 'mongoose';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';

/**
 * Middleware to check if the authenticated user owns the specified resource.
 * @param {string} paramName - The name of the request parameter containing the resource ID (e.g., 'conversationId').
 * @param {string} modelName - The name of the Mongoose model (e.g., 'Conversation').
 * @returns {import('express').RequestHandler} Express middleware function.
 */
const checkOwnership = (paramName, modelName) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[paramName] || req.body[paramName] || req.query[paramName];
      const userId = req.user?.userId || req.user?._id || req.user?.id;

      if (!resourceId) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Resource ID (${paramName}) is required`);
      }

      if (!userId) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication is required');
      }

      const Model = mongoose.model(modelName);
      const resource = await Model.findById(resourceId).lean();

      if (!resource) {
        throw new ApiError(httpStatus.NOT_FOUND, `${modelName} not found`);
      }

      // Check if resource.userId matches req.user's ID
      // Some schemas store userId as a string or ObjectId, so we compare their string values
      const ownerId = resource.userId || resource.user;
      if (!ownerId || ownerId.toString() !== userId.toString()) {
        throw new ApiError(httpStatus.FORBIDDEN, `You do not have permission to access this ${modelName.toLowerCase()}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default checkOwnership;
