import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { composioV2Service } from './composio.v2.service.js';

const initiateConnection = catchAsync(async (req, res) => {
    const { appName, missingConnection, redirectUrl } = req.body;

    // Try to use authenticated user's ID
    const userId = req.user?.id || req.user?._id || 'default_user';

    // If redirectUrl is not provided, construct a default one or let backend handle it
    // Ideally frontend sends it

    const result = await composioV2Service.initiateConnection(
        appName,
        userId,
        redirectUrl || 'http://localhost:3000/apps' // Fallback
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Connection initiated successfully',
        data: result,
    });
});

const getUserConnections = catchAsync(async (req, res) => {
    // Use authenticated user's ID
    const userId = req.user?.id || req.user?._id || 'default_user';

    const result = await composioV2Service.getUserConnections(userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'User connections fetched successfully',
        data: result,
    });
});

export const composioV2Controller = {
    initiateConnection,
    getUserConnections,
};
