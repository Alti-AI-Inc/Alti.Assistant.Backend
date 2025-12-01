/* eslint-disable no-case-declarations */

import httpStatus from 'http-status';
import PdfParse from "pdf-parse";
import mammoth from "mammoth";
import { parse } from "csv-parse/browser/esm";
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { summaryService } from './summary.service.js';
import { summarizerApp } from "./summarizer/workflow.js";
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * Summarize content (URL or file)
 */
const summarizeContent = catchAsync(async (req, res) => {
  console.log("Performing summarization with request body:", req.user);

  const isGuest = req.isGuest || !req.user;
  let userId = isGuest ? summaryService.generateGuestUserId() : (req.user?.userId || req.user?._id);
  const { message, conversationId } = req.body;
  userId = req.body.userId || userId; // Allow overriding userId from request body

  // Skip subscription check for guest users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
    const prompotUsage = userSubscription ? userSubscription.usage : 0;
    const totalConversationWithConvId = conversationId ? await conversationHelpers.getConversationById(conversationId, userId) : 0;

    if (prompotUsage <= totalConversationWithConvId) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your summary limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'A URL or content is required for summarization',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  const thread_id = conversationId || summaryService.generateSummaryConversationId();

  try {
    // Handle conversation creation/retrieval
    const conversation = await summaryService.handleSummaryConversation(userId, conversationId, message, isGuest);
    const actualConversationId = conversation.conversationId || thread_id;

    // Get conversation history for context-aware processing
    let conversationHistory = [];
    if (conversationId && conversation.messages) {
      // Get last 10 messages for context (excluding the current message)
      conversationHistory = conversation.messages
        .slice(-10)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));
    }

    // Process file if uploaded
    let user_input = message;
    let userMessageForHistory = message;
    let contentToSummarize = '';
    let fileMetadata = {};
    let isFilePassed = false
    if (req.file) {
      console.log(
        `Processing uploaded file: ${req.file.originalname} (MIME type: ${req.file.mimetype})`
      );
      userMessageForHistory = `Summarize the uploaded file: ${req.file.originalname}`;
      fileMetadata = {
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
      };

      // File parsing logic
      switch (req.file.mimetype) {
        case 'application/pdf':
          const pdfData = await PdfParse(req.file.buffer);
          contentToSummarize = pdfData.text;
          console.log(`Extracted text from PDF: ${contentToSummarize.substring(0, 100)}...`);
          isFilePassed = true;
          break;
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': // .docx
          const docxResult = await mammoth.extractRawText({
            buffer: req.file.buffer,
          });
          contentToSummarize = docxResult.value;
          console.log(`Extracted text from DOCX: ${contentToSummarize.substring(0, 100)}...`);
          isFilePassed = true;
          break;
        case 'text/csv':
          // For CSV, we'll stringify the records to make them readable for the AI.
          const records = parse(req.file.buffer, {
            columns: true,
            skip_empty_lines: true,
          });
          contentToSummarize = JSON.stringify(records, null, 2);
          console.log(`Extracted text from CSV: ${contentToSummarize.substring(0, 100)}...`);
          isFilePassed = true;
          break;
        case 'text/plain':
          contentToSummarize = req.file.buffer.toString('utf-8');
          console.log(`Extracted text from TXT: ${contentToSummarize.substring(0, 100)}...`);
          isFilePassed = true;
          break;
        default:
          throw new Error(`Unsupported file type: ${req.file.mimetype}`);
      }
      user_input = contentToSummarize;
      console.log(`Parsed content from file: ${user_input.substring(0, 100)}...`);
    }

    // Add user message to conversation
    await summaryService.addSummaryQueryMessage(actualConversationId, userId, userMessageForHistory, isGuest);

    const inputs = {
      user_input: user_input,
      history: [...conversationHistory, { role: 'user', content: userMessageForHistory }],
      isFilePassed: isFilePassed,
    };

    const result = await summarizerApp.invoke(inputs);

    logger.info(`Summary Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`);

    const fullResponse = result.summary;

    // Add assistant response to conversation with enhanced metadata
    const messageMetadata = {
      summaryType: req.file ? 'file' : 'url',
      fileMetadata: req.file ? fileMetadata : null,
      summaryTimestamp: new Date().toISOString(),
      model: 'claude-sonnet-4.5',
    };

    await summaryService.addSummaryResultMessage(actualConversationId, userId, fullResponse, messageMetadata, isGuest);
    console.log('Full response:', fullResponse);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Summarization completed successfully',
      data: {
        responseMessage: {
          answer: fullResponse,
          summaryType: req.file ? 'file' : 'url',
          fileMetadata: req.file ? fileMetadata : null,
          metadata: messageMetadata,
        },
        conversationId: actualConversationId,
        messageCount: conversation.messageCount + 2,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined, // Include userId for guest users for frontend tracking
      },
    });
  } catch (error) {
    logger.error("Summarizer Assistant Error:", error);

    // Try to save error message to conversation if possible
    const errorConversationId = conversationId || summaryService.generateSummaryConversationId();
    try {
      if (errorConversationId && userId) {
        await summaryService.addErrorMessage(
          errorConversationId,
          userId,
          'I apologize, but an error occurred while processing your summarization request.',
          error,
          isGuest
        );
      }
    } catch (convError) {
      logger.error("Failed to save error to conversation:", convError);
    }

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while processing your summarization request',
      data: {
        conversationId: errorConversationId,
        userType: isGuest ? 'guest' : 'authenticated',
        error: error.message,
      },
    });
  }
});

/**
 * Get summary statistics for the user (authenticated users only)
 */
const getSummaryStats = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Statistics are only available for authenticated users',
    });
  }

  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const stats = await summaryService.getSummaryStats(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Summary statistics retrieved successfully',
    data: stats,
  });
});

export const summaryController = {
  summarizeContent,
  getSummaryStats,
};