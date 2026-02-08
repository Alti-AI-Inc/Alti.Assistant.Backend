import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import httpStatus from 'http-status';
import { MicrosoftGraphService } from './microsoft-graph.service.js';
import { User } from '../user/user.model.js';

const getAuthUrl = catchAsync(async (req, res) => {
    const url = MicrosoftGraphService.getAuthUrl();
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Microsoft Auth URL generated',
        data: { url }
    });
});

const handleCallback = catchAsync(async (req, res) => {
    const { code } = req.body;
    const userId = req.user.id;

    const tokens = await MicrosoftGraphService.getTokenFromCode(code);

    // Save tokens to User
    await User.findByIdAndUpdate(userId, { microsoftTokens: tokens });

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Microsoft 365 connected successfully',
        data: null
    });
});

const getRecentFiles = catchAsync(async (req, res) => {
    const files = await MicrosoftGraphService.getRecentFiles(req.user.id);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Recent files retrieved',
        data: files
    });
});

const sendTeamsMessage = catchAsync(async (req, res) => {
    const { chatId, content } = req.body;
    await MicrosoftGraphService.sendTeamsMessage(req.user.id, chatId, content);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Message sent',
        data: null
    });
});

export const MicrosoftGraphController = {
    getAuthUrl,
    handleCallback,
    getRecentFiles,
    sendTeamsMessage
};
