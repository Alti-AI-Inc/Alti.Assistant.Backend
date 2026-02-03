// =============================
//     Slack Controller
import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { composioProdcutivityService } from './composio.productivity.service.js';

// =============================
const getSlackIntegration = catchAsync(async (req, res) => {
  const result = await composioProdcutivityService.getSlackIntegrationService();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fetched Slack integration',
    data: result,
  });
});

const initiateSlackConnection = catchAsync(async (req, res) => {
  const { integrationId } = req.body;
  const result =
    await composioProdcutivityService.initiateSlackConnectionService(integrationId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Initiated Slack connection',
    data: result,
  });
});

const sendMessageToChannel = catchAsync(async (req, res) => {
  const result = await composioProdcutivityService.sendMessageToChannelService(req);
  res.status(200).json({
    success: true,
    message: 'Message sent to channel successfully',
    data: result,
  });
});

const sendMessageToUser = catchAsync(async (req, res) => {
  const result = await composioProdcutivityService.sendMessageToUserService(req);
  res.status(200).json({
    success: true,
    message: 'Message sent to user successfully',
    data: result,
  });
});

const listSlackChannels = catchAsync(async (req, res) => {
  const result = await composioProdcutivityService.listSlackChannelsService(req);
  res.status(200).json({
    success: true,
    message: 'Channels listed successfully',
    data: result,
  });
});

const createSlackChannel = catchAsync(async (req, res) => {
  const result = await composioProdcutivityService.createSlackChannelService(req);
  res.status(200).json({
    success: true,
    message: 'Channel created successfully',
    data: result,
  });
});

// =============================
//     Notion Controller
// =============================

const getNotionIntegration = catchAsync(async (req, res) => {
  const result = await composioProdcutivityService.getNotionIntegrationService();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fetched Notion integration',
    data: result,
  });
});

const initiateNotionConnection = catchAsync(async (req, res) => {
  const { integrationId } = req.body;
  const result =
    await composioProdcutivityService.initiateNotionConnectionService(integrationId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Initiated Notion connection',
    data: result,
  });
});

const createNotionPage = catchAsync(async (req, res) => {
  const result = await composioProdcutivityService.createNotionPageService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notion page created successfully',
    data: result,
  });
});
const createNotionDatabase = catchAsync(async (req, res) => {
  const result = await composioProdcutivityService.createNotionDatabaseService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notion database created successfully',
    data: result,
  });
});

const appendToNotionPage = catchAsync(async (req, res) => {
  const result = await composioProdcutivityService.appendToNotionPageService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Content appended to Notion page',
    data: result,
  });
});

const createNotionComment = catchAsync(async (req, res) => {
  const result = await composioProdcutivityService.createNotionCommentService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Comment created successfully',
    data: result,
  });
});

const fetchNotionComments = catchAsync(async (req, res) => {
  const result = await composioProdcutivityService.fetchNotionCommentsService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Fetched comments successfully',
    data: result,
  });
});

const deleteNotionBlock = catchAsync(async (req, res) => {
  const result = await composioProdcutivityService.deleteNotionBlockService(req);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Block deleted successfully',
    data: result,
  });
});
export const composioProductivityController = {
  getSlackIntegration,
  initiateSlackConnection,
  sendMessageToChannel,
  sendMessageToUser,
  listSlackChannels,
  createSlackChannel,
  getNotionIntegration,
  initiateNotionConnection,
  createNotionPage,
  createNotionDatabase,
  appendToNotionPage,
  createNotionComment,
  fetchNotionComments,
  deleteNotionBlock,
};
