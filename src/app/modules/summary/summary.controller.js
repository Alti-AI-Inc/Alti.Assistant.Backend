/* eslint-disable no-case-declarations */

import httpStatus from 'http-status';
// Fix: Correct import for pdf-parse. It exports a default function.
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
// Fix: Correct import path for csv-parse in a Node.js environment.
import { parse } from 'csv-parse';
import { v4 as uuidv4 } from 'uuid';
import { Storage } from '@google-cloud/storage';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { summaryService } from './summary.service.js';
import { summarizerApp } from './summarizer/workflow.js';
// Optimization: Removed unused import for SubscriptionModel.
// Optimization: Removed unused import for conversationHelpers.

// --- GCS Configuration ---
// Initialize the Google Cloud Storage client.
// The GCS bucket name should be configured via environment variables for security and flexibility.
const GCS_BUCKET_NAME =
  process.env.GCS_SUMMARY_UPLOADS_BUCKET || 'your-gcs-bucket-name'; // TODO: Replace with actual env var
const storage = new Storage();
const bucket = storage.bucket(GCS_BUCKET_NAME);
// --- End GCS Configuration ---

/**
 * @swagger
 * tags:
 *   name: Summary
 *   description: API for content summarization and related operations.
 */

/**
 * @swagger
 * /api/v1/summary:
 *   post:
 *     summary: Summarize content from a URL, text, or uploaded file.
 *     description: |
 *       Processes user input (a URL, raw text, or an uploaded file) to generate a summary.
 *       Uploaded files are streamed directly to a secure Google Cloud Storage bucket, ensuring statelessness and scalability.
 *       Supports PDF, DOCX, CSV, and TXT file types.
 *       Manages conversation history, allowing users to continue previous summarization threads.
 *       Handles both authenticated and guest users, generating a unique ID for guests.
 *       The response includes the generated summary, conversation ID, and metadata, including a secure, temporary signed URL to the uploaded file in GCS.
 *     tags: [Summary]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The URL or text content to be summarized.
 *                 example: "https://example.com/article.pdf"
 *               conversationId:
 *                 type: string
 *                 description: Optional. The ID of an existing conversation to continue.
 *                 example: "654321098765432109876543"
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - file
 *             properties:
 *               message:
 *                 type: string
 *                 description: A descriptive message for the file being summarized (e.g., "Summarize this document").
 *                 example: "Summarize the attached report."
 *               conversationId:
 *                 type: string
 *                 description: Optional. The ID of an existing conversation to continue.
 *                 example: "654321098765432109876543"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The file to be uploaded and summarized (PDF, DOCX, CSV, TXT).
 *     responses:
 *       200:
 *         description: Summarization completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Summarization completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     responseMessage:
 *                       type: object
 *                       properties:
 *                         answer:
 *                           type: string
 *                           description: The generated summary.
 *                           example: "The document discusses AI advancements..."
 *                         summaryType:
 *                           type: string
 *                           enum: [file, url]
 *                           description: Indicates if the summary was generated from a file or URL/text.
 *                           example: "file"
 *                         fileMetadata:
 *                           type: object
 *                           description: Metadata about the summarized file, including GCS storage details.
 *                           properties:
 *                             fileName: { type: string, example: "report.pdf" }
 *                             fileType: { type: string, example: "application/pdf" }
 *                             fileSize: { type: number, example: 102400 }
 *                             gcsPath: { type: string, example: "uploads/user123/uuid-report.pdf" }
 *                             gcsUrl: { type: string, example: "gs://your-bucket/uploads/user123/uuid-report.pdf" }
 *                             gcsSignedUrl: { type: string, format: uri, description: "A temporary, secure URL to access the uploaded file." }
 *                         metadata:
 *                           type: object
 *                           description: Additional message metadata.
 *                           properties:
 *                             summaryType: { type: string, example: "file" }
 *                             fileMetadata: { type: object }
 *                             summaryTimestamp: { type: string, format: date-time }
 *                             model: { type: string, example: "claude-sonnet-4.5" }
 *                     conversationId:
 *                       type: string
 *                       description: The ID of the conversation.
 *                       example: "654321098765432109876543"
 *                     messageCount:
 *                       type: number
 *                       description: The total number of messages in the conversation after this interaction.
 *                       example: 4
 *                     userType:
 *                       type: string
 *                       enum: [guest, authenticated]
 *                       description: Type of user performing the summarization.
 *                       example: "authenticated"
 *                     userId:
 *                       type: string
 *                       description: The user ID (only included for guest users for frontend tracking).
 *                       example: "guest_12345"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Summarizes content provided as a URL, raw text, or an uploaded file.
 * This function handles the entire summarization workflow, including:
 * - Identifying user type (guest or authenticated) and managing user IDs.
 * - Creating or retrieving conversation threads.
 * - **GCS Integration**: Uploading any provided files directly to Google Cloud Storage to maintain a stateless architecture.
 * - Parsing various file types (PDF, DOCX, CSV, TXT) from the in-memory buffer after GCS upload.
 * - Invoking the summarization AI workflow.
 * - Storing user queries and AI responses in the conversation history.
 * - Returning the summary, a temporary signed URL to the GCS file, and relevant conversation metadata.
 *
 * @param {import('express').Request} req - The Express request object.
 *   - `req.user`: Authenticated user information (if available).
 *   - `req.isGuest`: Boolean indicating if the user is a guest.
 *   - `req.body.message`: The URL or text content to summarize.
 *   - `req.body.conversationId`: Optional ID of an existing conversation.
 *   - `req.file`: Uploaded file object (if `multipart/form-data` is used).
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
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

      // --- GCS Integration: Stateless File Upload ---
      // The user's uploaded file is written directly to a GCS bucket.
      // This avoids using the local ephemeral filesystem, ensuring the service is stateless and scalable.
      const gcsFileName = `uploads/${userId}/${uuidv4()}-${req.file.originalname}`;
      const gcsFile = bucket.file(gcsFileName);

      try {
        // Upload the file buffer received from multer to GCS.
        await gcsFile.save(req.file.buffer, {
          contentType: req.file.mimetype,
          resumable: false, // Use simple upload for in-memory buffers
        });
        logger.info(
          `File ${req.file.originalname} successfully uploaded to GCS as ${gcsFileName}`
        );

        // Generate a v4 signed URL for secure, temporary read access to the uploaded file.
        // This URL can be used for auditing, debugging, or providing a download link to the user.
        const [signedUrl] = await gcsFile.getSignedUrl({
          action: 'read',
          expires: Date.now() + 60 * 60 * 1000, // URL is valid for 1 hour
          version: 'v4',
        });

        // Populate file metadata with GCS information for the response.
        fileMetadata = {
          fileName: req.file.originalname,
          fileType: req.file.mimetype,
          fileSize: req.file.size,
          gcsPath: gcsFile.name,
          gcsUrl: `gs://${GCS_BUCKET_NAME}/${gcsFileName}`,
          gcsSignedUrl: signedUrl,
        };
      } catch (gcsError) {
        logger.error('GCS Upload Error:', gcsError);
        // If the GCS upload fails, we must not proceed.
        // Throw a new error that will be caught by the main try-catch block.
        throw new Error('Failed to upload file to cloud storage.');
      }
      // --- End GCS Integration ---

      userMessageForHistory = `Summarize the uploaded file: ${req.file.originalname}`;

      // File parsing logic
      // The parsing logic continues to operate on the in-memory buffer (`req.file.buffer`),
      // which is efficient as the file is already loaded in memory for the GCS upload.
      switch (req.file.mimetype) {
        case 'application/pdf':
          // Bug Fix: Correct usage of pdf-parse. It's a function that takes a buffer
          // and returns a promise resolving with the parsed data.
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
          // Optimization: For large CSV files, synchronous parsing and then JSON.stringify can be CPU and memory intensive.
          // This approach uses csv-parse's event-based API for potentially better memory management and avoids JSON.stringify
          // by formatting the data into a plain string, which is often more suitable for summarization models.
          const records = await new Promise((resolve, reject) => {
            const parsedRecords = [];
            parse(req.file.buffer, {
              // csv-parse can directly accept a Buffer
              columns: true,
              skip_empty_lines: true,
            })
              .on('data', (record) => parsedRecords.push(record))
              .on('end', () => resolve(parsedRecords))
              .on('error', (err) => reject(err));
          });

          if (records.length > 0) {
            const headers = Object.keys(records[0]);
            // Format into a readable string, e.g., "Header1, Header2\nValue1A, Value2A\nValue1B, Value2B"
            let formattedContent = headers.join(', ') + '\n';
            formattedContent += records
              .map((record) =>
                headers.map((header) => record[header]).join(', ')
              )
              .join('\n');
            contentToSummarize = formattedContent;
          } else {
            contentToSummarize = '';
          }
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
      actualConversationId ||
      conversationId ||
      summaryService.generateSummaryConversationId();
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
 * @swagger
 * /api/v1/summary/stats:
 *   get:
 *     summary: Retrieve summary statistics for the authenticated user.
 *     description: |
 *       Fetches usage statistics related to summarization for the currently authenticated user.
 *       This endpoint is restricted to authenticated users only; guest users will receive an unauthorized response.
 *       Statistics might include total summaries, file summaries, URL summaries, etc.
 *     tags: [Summary]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Summary statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Summary statistics retrieved successfully"
 *                 data:
 *                   type: object
 *                   description: Object containing various summary statistics.
 *                   properties:
 *                     totalSummaries:
 *                       type: number
 *                       example: 50
 *                       description: Total number of summarization requests made by the user.
 *                     fileSummaries:
 *                       type: number
 *                       example: 20
 *                       description: Number of summaries generated from file uploads.
 *                     urlSummaries:
 *                       type: number
 *                       example: 30
 *                       description: Number of summaries generated from URLs or text.
 *                     lastSummaryDate:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:00:00Z"
 *                       description: Timestamp of the last summarization request.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Retrieves summarization usage statistics for an authenticated user.
 * This endpoint is protected and will return an unauthorized error for guest users.
 * It fetches data such as the total number of summaries, file summaries, etc.,
 * from the `summaryService`.
 *
 * @param {import('express').Request} req - The Express request object.
 *   - `req.user`: Authenticated user information, including `userId` or `_id`.
 *   - `req.isGuest`: Boolean indicating if the user is a guest.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
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

/**
 * @typedef {object} SummaryController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} summarizeContent - Handles content summarization requests.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getSummaryStats - Retrieves summary statistics for authenticated users.
 */
/**
 * Exports an object containing all controller functions related to summary operations.
 * @type {SummaryController}
 */
export const summaryController = {
  summarizeContent,
  getSummaryStats,
};