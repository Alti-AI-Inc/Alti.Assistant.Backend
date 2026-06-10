/* eslint-disable no-case-declarations */

import httpStatus from 'http-status';
// Fix: Correct import for pdf-parse. It exports a default function, not a named class.
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
// Fix: Correct import path for csv-parse in a Node.js environment.
import { parse } from 'csv-parse';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { summaryService } from './summary.service.js';
import { summarizerApp } from './summarizer/workflow.js';
import SubscriptionModel from '../subscription/subscription.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * Summarize content (URL or file)
 */
const summarizeContent = catchAsync(async (req, res) => {
  console.log('Performing summarization with request body:', req.user);

  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? summaryService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  const { message, conversationId } = req.body;
  // Security Fix: Remove the ability to override userId from the request body.
  // The userId must be derived from the authenticated session (req.user) or generated for guests
  // to prevent IDOR (Insecure Direct Object Reference) vulnerabilities.
  // userId = req.body.userId || userId; // Removed for security

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

  const thread_id =
    conversationId || summaryService.generateSummaryConversationId();

  // Bug Fix: Declare actualConversationId with 'let' outside the try block
  // so it's accessible in the catch block for consistent error logging.
  let actualConversationId;

  try {
    // Handle conversation creation/retrieval
    // Optimization Recommendation: If summaryService.handleSummaryConversation primarily fetches a Mongoose document for read-only access (as 'conversation' is only read here),
    // consider adding .lean() within the service method for better performance by returning plain JavaScript objects.
    const conversation = await summaryService.handleSummaryConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );
    actualConversationId = conversation.conversationId || thread_id;

    // Get conversation history for context-aware processing
    let conversationHistory = [];
    if (conversationId && conversation.messages) {
      // Get last 10 messages for context (excluding the current message)
      conversationHistory = conversation.messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    }

    // Process file if uploaded
    let user_input = message;
    let userMessageForHistory = message;
    let contentToSummarize = '';
    let fileMetadata = {};
    let isFilePassed = false;
    console.log(
      `Received summarization request from ${isGuest ? 'guest' : 'authenticated'} user ${userId} for conversation ${actualConversationId}, file uploaded: ${!!req.file}`
    );
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
      // Optimization Recommendation: For very large files, especially CSV, synchronous parsing (like `parse` and `JSON.stringify`) can be CPU-intensive and block the event loop.
      // Consider using stream-based parsing or offloading to worker threads for improved scalability with large inputs.
      switch (req.file.mimetype) {
        case 'application/pdf':
          // Bug Fix: Correct usage of pdf-parse. It's a function that returns a promise,
          // and the result object contains the 'text' property.
          const pdfData = await pdf(req.file.buffer);
          contentToSummarize = pdfData.text;
          console.log(
            `Extracted text from PDF: ${contentToSummarize.substring(0, 100)}...`
          );
          isFilePassed = true;
          break;
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': // .docx
          const docxResult = await mammoth.extractRawText({
            buffer: req.file.buffer,
          });
          contentToSummarize = docxResult.value;
          console.log(
            `Extracted text from DOCX: ${contentToSummarize.substring(0, 100)}...`
          );
          isFilePassed = true;
          break;
        case 'text/csv':
          // Bug Fix: csv-parse expects a string or stream, not a raw Buffer.
          // Convert the buffer to a UTF-8 string explicitly.
          const records = parse(req.file.buffer.toString('utf-8'), {
            columns: true,
            skip_empty_lines: true,
          });
          contentToSummarize = JSON.stringify(records, null, 2);
          console.log(
            `Extracted text from CSV: ${contentToSummarize.substring(0, 100)}...`
          );
          isFilePassed = true;
          break;
        case 'text/plain':
          contentToSummarize = req.file.buffer.toString('utf-8');
          console.log(
            `Extracted text from TXT: ${contentToSummarize.substring(0, 100)}...`
          );
          isFilePassed = true;
          break;
        default:
          throw new Error(`Unsupported file type: ${req.file.mimetype}`);
      }
      user_input = contentToSummarize;
      console.log(
        `Parsed content from file: ${user_input.substring(0, 100)}...`
      );
    }

    // Add user message to conversation
    await summaryService.addSummaryQueryMessage(
      actualConversationId,
      userId,
      userMessageForHistory,
      isGuest,
      req
    );

    const inputs = {
      user_input: user_input,
      history: [
        ...conversationHistory,
        { role: 'user', content: userMessageForHistory },
      ],
      isFilePassed: isFilePassed,
    };

    const result = await summarizerApp.invoke(inputs);

    logger.info(
      `Summary Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`
    );

    const fullResponse = result.summary;

    // Add assistant response to conversation with enhanced metadata
    const messageMetadata = {
      summaryType: req.file ? 'file' : 'url',
      fileMetadata: req.file ? fileMetadata : null,
      summaryTimestamp: new Date().toISOString(),
      model: 'claude-sonnet-4.5',
    };

    await summaryService.addSummaryResultMessage(
      actualConversationId,
      userId,
      fullResponse,
      messageMetadata,
      isGuest,
      req
    );
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
    logger.error('Summarizer Assistant Error:', error);

    // Bug Fix: Ensure error message is saved to the correct conversation ID.
    // Prioritize actualConversationId if it was successfully determined,
    // then fall back to the initial conversationId from req.body,
    // and only generate a new one as a last resort.
    const errorConversationId =
      actualConversationId || conversationId || summaryService.generateSummaryConversationId();
    try {
      if (errorConversationId && userId) {
        await summaryService.addErrorMessage(
          errorConversationId,
          userId,
          'I apologize, but an error occurred while processing your summarization request.',
          error,
          isGuest,
          req
        );
      }
    } catch (convError) {
      logger.error('Failed to save error to conversation:', convError);
    }

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message:
        'An internal error occurred while processing your summarization request',
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

  // Optimization Recommendation: If summaryService.getSummaryStats primarily fetches Mongoose documents for read-only display,
  // consider adding .lean() within the service method for better performance by returning plain JavaScript objects.
  const stats = await summaryService.getSummaryStats(userId, req);

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