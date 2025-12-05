import httpStatus from 'http-status';
import path from 'path';
import fs from 'fs';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { reportService } from './report.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * Conversational report assistant endpoint
 * Handles natural language requests for report generation with optional file uploads
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? reportService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId, outputFormat, reportType } = req.body;
  const files = req.files || [];
  userId = req.body.userId || userId;

  logger.info(
    `Report assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}, files: ${files.length}`
  );

  // Check subscription limits for authenticated users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    });
    const promptUsage = userSubscription ? userSubscription.usage : 0;
    const totalConversationWithConvId = conversationId
      ? await conversationHelpers.getConversationById(conversationId, userId)
      : 0;

    if (promptUsage <= totalConversationWithConvId) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your report generation limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  if (!message && files.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message or files are required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  try {
    const result = await reportService.processConversationalRequest(
      userId,
      message || 'Generate a report from the uploaded files',
      conversationId,
      isGuest,
      files
    );

    logger.info('Report assistant response:', {
      conversationId: result.conversationId,
      success: result.success,
      needsMoreInfo: result.needsMoreInfo,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Request processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in conversational assistant:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while processing your request',
      data: {
        conversationId,
        error: error.message,
      },
    });
  }
});

/**
 * Direct report generation endpoint (non-conversational)
 * For programmatic access with all parameters provided
 */
export const generateReport = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? reportService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  logger.info(`Direct report generation request from user ${userId}`);

  try {
    const result = await reportService.generateReport(req.body, userId, isGuest);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Report generated successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error generating report:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to generate report',
    });
  }
});

/**
 * Analyze uploaded files
 */
export const analyzeFiles = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? reportService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const files = req.files || [];
  const { analysisType, instructions, conversationId } = req.body;

  logger.info(`File analysis request from user ${userId}, files: ${files.length}`);

  if (files.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'No files uploaded for analysis',
    });
  }

  try {
    const result = await reportService.analyzeFiles(
      files,
      analysisType,
      instructions,
      userId,
      conversationId
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Files analyzed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error analyzing files:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to analyze files',
    });
  }
});

/**
 * Download generated report
 */
export const downloadReport = catchAsync(async (req, res) => {
  const { filename } = req.params;

  const filePath = path.join(process.cwd(), 'output', 'reports', filename);

  if (!fs.existsSync(filePath)) {
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Report file not found',
    });
  }

  logger.info(`Downloading report: ${filename}`);

  // Set appropriate headers based on file type
  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.csv': 'text/csv',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.json': 'application/json',
  };

  const contentType = contentTypes[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  fileStream.on('error', (error) => {
    logger.error('Error streaming file:', error);
    if (!res.headersSent) {
      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Error downloading file',
      });
    }
  });
});

/**
 * Export existing report to different format
 */
export const exportReport = catchAsync(async (req, res) => {
  const { reportId, outputFormat } = req.body;

  logger.info(`Export report ${reportId} to ${outputFormat}`);

  // This is a placeholder - you'll need to implement report storage
  // to retrieve and re-export existing reports
  return sendResponse(res, {
    statusCode: httpStatus.NOT_IMPLEMENTED,
    success: false,
    message: 'Export functionality requires report storage implementation',
  });
});

/**
 * Get report by ID
 */
export const getReport = catchAsync(async (req, res) => {
  const { reportId } = req.params;

  logger.info(`Get report: ${reportId}`);

  // Placeholder - requires report storage implementation
  return sendResponse(res, {
    statusCode: httpStatus.NOT_IMPLEMENTED,
    success: false,
    message: 'Get report functionality requires report storage implementation',
  });
});

/**
 * List user reports
 */
export const listReports = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const { page = 1, limit = 10, reportType, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  logger.info(`List reports for user ${userId}`);

  // Placeholder - requires report storage implementation
  return sendResponse(res, {
    statusCode: httpStatus.NOT_IMPLEMENTED,
    success: false,
    message: 'List reports functionality requires report storage implementation',
  });
});

/**
 * Modify existing report
 */
export const modifyReport = catchAsync(async (req, res) => {
  const { reportId, modifications, sections, conversationId } = req.body;
  const userId = req.user?.userId || req.user?._id;

  logger.info(`Modify report ${reportId} for user ${userId}`);

  // Placeholder - requires report storage and modification logic
  return sendResponse(res, {
    statusCode: httpStatus.NOT_IMPLEMENTED,
    success: false,
    message: 'Modify report functionality requires report storage implementation',
  });
});

export const reportController = {
  conversationalAssistant,
  generateReport,
  analyzeFiles,
  downloadReport,
  exportReport,
  getReport,
  listReports,
  modifyReport,
};
