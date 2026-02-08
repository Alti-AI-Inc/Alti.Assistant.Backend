import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import httpStatus from 'http-status';
import { GoogleWorkspaceService } from './google-workspace.service.js';
import { User } from '../user/user.model.js';

const getAuthUrl = catchAsync(async (req, res) => {
    const url = GoogleWorkspaceService.getAuthUrl();
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Auth URL generated',
        data: { url }
    });
});

const handleCallback = catchAsync(async (req, res) => {
    const { code } = req.body; // or req.query depending on frontend flow
    const userId = req.user.id; // Protected route

    const tokens = await GoogleWorkspaceService.getTokenFromCode(code);

    // Save tokens to User
    await User.findByIdAndUpdate(userId, { googleTokens: tokens });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Google Workspace connected successfully',
        data: null
    });
});

const listFiles = catchAsync(async (req, res) => {
    const files = await GoogleWorkspaceService.listFiles(req.user.id);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Files retrieved successfully',
        data: files
    });
});

const getDocContent = catchAsync(async (req, res) => {
    const { fileId } = req.params;
    const content = await GoogleWorkspaceService.getDocContent(req.user.id, fileId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Document content retrieved',
        data: { content }
    });
});

export const GoogleWorkspaceController = {
    getAuthUrl,
    handleCallback,
    listFiles,
    getDocContent
};
