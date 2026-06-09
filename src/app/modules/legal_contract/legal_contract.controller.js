import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { legalContractService } from './legal_contract.service.js';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';

/**
 * @typedef {object} FileInfo
 * @property {string} filename - The name of the file on the server.
 * @property {string} originalname - The original name of the file.
 * @property {string} mimetype - The MIME type of the file.
 * @property {number} size - The size of the file in bytes.
 * @property {string} path - The path to the uploaded file.
 */

/**
 * @typedef {object} ConversationalAssistantRequestBody
 * @property {string} message - The natural language message from the user.
 * @property {string} [conversationId] - The ID of an existing conversation to continue.
 * @property {'text'|'pdf'|'docx'} [outputFormat='text'] - The desired output format for the contract.
 * @property {string} [userId] - Optional user ID, primarily for guest users to explicitly set their ID.
 * @property {FileInfo} [file] - Optional file upload information.
 */

/**
 * @typedef {object} ConversationalAssistantResponseData
 * @property {string} conversationId - The ID of the current conversation.
 * @property {string} response - The AI's natural language response.
 * @property {boolean} contractGenerated - True if a contract was generated in this turn.
 * @property {string} [generatedContract] - The generated contract text, if `contractGenerated` is true.
 * @property {boolean} needsMoreInfo - True if the AI requires more information from the user.
 * @property {string} [userId] - The user ID, only included for guest users.
 */

/**
 * Conversational legal contract assistant endpoint
 * Handles natural language requests for contract generation with file upload.
 * This endpoint allows users to interact with an AI assistant to draft legal contracts
 * by providing natural language prompts and optionally uploading relevant documents.
 *
 * @swagger
 * /api/v1/legal-contract/conversational-assistant:
 *   post:
 *     summary: Interact with the AI assistant to generate or modify legal contracts conversationally.
 *     description: This endpoint processes natural language messages to generate, refine, or modify legal contracts. It supports file uploads for context and can continue existing conversations.
 *     tags:
 *       - Legal Contract
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: The natural language message or instruction for the AI assistant.
 *                 example: "Draft a non-disclosure agreement between two parties."
 *               conversationId:
 *                 type: string
 *                 description: Optional. The ID of an existing conversation to continue.
 *                 example: "654321abcdef"
 *               outputFormat:
 *                 type: string
 *                 enum: [text, pdf, docx]
 *                 default: text
 *                 description: Optional. The desired output format for the generated contract.
 *                 example: "pdf"
 *               userId:
 *                 type: string
 *                 description: Optional. Explicit user ID, primarily for guest users to identify themselves across sessions.
 *                 example: "guest_12345"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Optional. A file to upload, providing additional context for contract generation.
 *     responses:
 *       200:
 *         description: Request processed successfully. Returns the AI's response and conversation state.
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
 *                   example: "Request processed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                       example: "654321abcdef"
 *                     response:
 *                       type: string
 *                       example: "I can help you draft a non-disclosure agreement. Could you please provide the names of the parties involved?"
 *                     contractGenerated:
 *                       type: boolean
 *                       example: false
 *                     generatedContract:
 *                       type: string
 *                       description: The generated contract text, if `contractGenerated` is true.
 *                       example: "This Non-Disclosure Agreement ('Agreement') is made and entered into..."
 *                     needsMoreInfo:
 *                       type: boolean
 *                       example: true
 *                     userId:
 *                       type: string
 *                       description: The user ID, only included for guest users.
 *                       example: "guest_12345"
 *       400:
 *         description: Bad Request. Message is required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Message is required"
 *       500:
 *         description: Internal Server Error. Failed to process request or generate user identifier.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to process request"
 */
const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? legalContractService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId, outputFormat } = req.body;
  userId = req.body.userId || userId; // Allow explicit userId from body for guests

  // Handle file upload if present
  const fileInfo = req.file
    ? {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
      }
    : null;

  logger.info(
    `Legal contract request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    {
      hasFile: !!fileInfo,
      conversationId,
    }
  );

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required',
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
    const result = await legalContractService.processConversationalRequest(
      userId,
      message,
      conversationId,
      fileInfo,
      outputFormat,
      isGuest
    );

    logger.info('Legal contract assistant response:', {
      conversationId: result.conversationId,
      success: result.success,
      contractGenerated: result.contractGenerated,
      needsMoreInfo: result.needsMoreInfo,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Request processed successfully',
      data: {
        ...result,
        userId: isGuest ? userId : undefined, // Only return userId for guest users
      },
    });
  } catch (error) {
    logger.error('Error in conversational assistant:', error);
    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to process request',
    });
  }
});

/**
 * @typedef {object} GenerateContractRequestBody
 * @property {string} contractType - The type of contract to generate (e.g., 'NDA', 'Service Agreement').
 * @property {string} [complexity] - The desired complexity level (e.g., 'simple', 'standard', 'complex').
 * @property {object} [contractDetails] - An object containing specific details required for the contract type.
 * @property {string} [outputFormat='text'] - The desired output format for the contract.
 * @property {string} [userId] - Optional user ID, primarily for guest users to explicitly set their ID.
 */

/**
 * @typedef {object} GenerateContractResponseData
 * @property {string} conversationId - The ID of the conversation created for this contract generation.
 * @property {string} contractType - The type of contract generated.
 * @property {string} generatedContract - The full text of the generated contract.
 * @property {string} [userId] - The user ID, only included for guest users.
 */

/**
 * Direct contract generation endpoint (non-conversational)
 * For programmatic access with all parameters provided. This endpoint allows
 * direct generation of a contract by supplying all necessary parameters
 * in a single request, bypassing the conversational flow.
 *
 * @swagger
 * /api/v1/legal-contract/generate:
 *   post:
 *     summary: Directly generate a legal contract with specified parameters.
 *     description: This endpoint allows for programmatic generation of legal contracts by providing all required parameters in the request body, without engaging in a conversational flow.
 *     tags:
 *       - Legal Contract
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contractType
 *             properties:
 *               contractType:
 *                 type: string
 *                 description: The type of contract to generate (e.g., 'NDA', 'Service Agreement', 'Employment Contract').
 *                 example: "Non-Disclosure Agreement"
 *               complexity:
 *                 type: string
 *                 description: Optional. The desired complexity level for the contract.
 *                 enum: [simple, standard, complex]
 *                 example: "standard"
 *               contractDetails:
 *                 type: object
 *                 description: An object containing specific details relevant to the contract type (e.g., party names, effective date, terms).
 *                 example:
 *                   partyA: "Acme Corp"
 *                   partyB: "Beta Solutions"
 *                   purpose: "Evaluation of new software"
 *                   duration: "1 year"
 *               outputFormat:
 *                 type: string
 *                 enum: [text, pdf, docx]
 *                 default: text
 *                 description: Optional. The desired output format for the generated contract.
 *                 example: "text"
 *               userId:
 *                 type: string
 *                 description: Optional. Explicit user ID, primarily for guest users to identify themselves across sessions.
 *                 example: "guest_12345"
 *     responses:
 *       200:
 *         description: Contract generated successfully.
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
 *                   example: "Contract generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                       example: "654321abcdef"
 *                     contractType:
 *                       type: string
 *                       example: "Non-Disclosure Agreement"
 *                     generatedContract:
 *                       type: string
 *                       description: The full text of the generated contract.
 *                       example: "This Non-Disclosure Agreement ('Agreement') is made and entered into..."
 *                     userId:
 *                       type: string
 *                       description: The user ID, only included for guest users.
 *                       example: "guest_12345"
 *       500:
 *         description: Internal Server Error. Failed to generate contract.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to generate contract"
 */
const generateContract = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? legalContractService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  userId = req.body.userId || userId; // Allow explicit userId from body for guests

  const params = req.body;

  logger.info(`Direct contract generation request from user ${userId}`, {
    contractType: params.contractType,
    complexity: params.complexity,
  });

  try {
    const result = await legalContractService.generateContractDirect(
      params,
      userId,
      isGuest,
      req
    );

    logger.info('Direct contract generation successful:', {
      conversationId: result.conversationId,
      contractType: result.contractType,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Contract generated successfully',
      data: {
        ...result,
        userId: isGuest ? userId : undefined, // Only return userId for guest users
      },
    });
  } catch (error) {
    logger.error('Error in direct contract generation:', error);
    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to generate contract',
    });
  }
});

/**
 * @typedef {object} ConversationHistoryEntry
 * @property {string} role - The role of the speaker ('user' or 'assistant').
 * @property {string} message - The message content.
 * @property {Date} timestamp - The timestamp of the message.
 * @property {object} [metadata] - Additional metadata related to the entry (e.g., generatedContract).
 */

/**
 * @typedef {object} GetConversationHistoryResponseData
 * @property {string} _id - The ID of the conversation.
 * @property {string} userId - The ID of the user associated with the conversation.
 * @property {ConversationHistoryEntry[]} history - An array of messages in the conversation.
 * @property {object} metadata - General metadata for the conversation.
 * @property {Date} createdAt - The creation timestamp of the conversation.
 * @property {Date} updatedAt - The last update timestamp of the conversation.
 */

/**
 * Get conversation history.
 * Retrieves the complete history of a specific legal contract conversation.
 *
 * @swagger
 * /api/v1/legal-contract/conversations/{conversationId}:
 *   get:
 *     summary: Retrieve the history of a specific legal contract conversation.
 *     description: This endpoint fetches all messages and associated metadata for a given conversation ID, allowing users to review past interactions and generated contracts.
 *     tags:
 *       - Legal Contract
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation to retrieve.
 *         example: "654321abcdef"
 *     responses:
 *       200:
 *         description: Conversation history retrieved successfully.
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
 *                   example: "Conversation history retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "654321abcdef"
 *                     userId:
 *                       type: string
 *                       example: "user123"
 *                     history:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           role:
 *                             type: string
 *                             enum: [user, assistant]
 *                             example: "user"
 *                           message:
 *                             type: string
 *                             example: "Draft an NDA."
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                             example: "2023-10-27T10:00:00.000Z"
 *                           metadata:
 *                             type: object
 *                             description: Additional metadata for the message, e.g., generatedContract.
 *                     metadata:
 *                       type: object
 *                       description: General metadata for the conversation (e.g., initial output format, guest status).
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T09:55:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:05:00.000Z"
 *       401:
 *         description: Unauthorized. User not authenticated.
 *       403:
 *         description: Forbidden. User does not have access to this conversation.
 *       404:
 *         description: Not Found. Conversation with the given ID does not exist.
 *       500:
 *         description: Internal Server Error. Failed to retrieve conversation history.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to retrieve conversation history"
 */
const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  logger.info(`Fetching conversation history for ${conversationId}`);

  try {
    // Optimization suggestion: If legalContractService.getConversationHistory uses Mongoose,
    // consider adding .lean() for read-only operations and .select() to fetch only necessary fields
    // (e.g., 'metadata.generatedContract', 'metadata.outputFormat', 'metadata.isGuest')
    // to improve query performance.
    const result = await legalContractService.getConversationHistory(
      conversationId,
      userId,
      req
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation history retrieved successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error fetching conversation history:', error);
    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to retrieve conversation history',
    });
  }
});

/**
 * Download contract in specified format.
 * Retrieves a previously generated contract from a conversation and serves it
 * in the requested format (text, PDF, or DOCX).
 *
 * @swagger
 * /api/v1/legal-contract/conversations/{conversationId}/download:
 *   get:
 *     summary: Download a generated contract in a specified format.
 *     description: This endpoint allows users to download a contract that was previously generated within a conversation. The contract can be downloaded as plain text, PDF, or DOCX.
 *     tags:
 *       - Legal Contract
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation containing the contract to download.
 *         example: "654321abcdef"
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [text, pdf, docx]
 *           default: text
 *         description: The desired format for the contract download.
 *         example: "pdf"
 *     responses:
 *       200:
 *         description: Contract downloaded successfully. Returns the contract file.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "This is a sample contract text."
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *               description: Binary PDF file content.
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema:
 *               type: string
 *               format: binary
 *               description: Binary DOCX file content.
 *       400:
 *         description: Bad Request. Unsupported format specified.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Format 'xyz' is not supported. Supported formats: 'text', 'pdf', 'docx'."
 *       401:
 *         description: Unauthorized. User not authenticated.
 *       403:
 *         description: Forbidden. User does not have access to this conversation.
 *       404:
 *         description: Not Found. No contract found in this conversation or conversation does not exist.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "No contract found in this conversation"
 *       500:
 *         description: Internal Server Error. Failed to download contract.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to download contract"
 */
const downloadContract = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const { format } = req.query;
  const userId = req.user?.userId || req.user?._id;

  logger.info(
    `Download contract request: ${conversationId}, format: ${format}`
  );

  try {
    // Optimization suggestion: If legalContractService.getConversationHistory uses Mongoose,
    // consider adding .lean() for read-only operations and .select() to fetch only necessary fields
    // (e.g., 'metadata.generatedContract') to improve query performance.
    const conversation = await legalContractService.getConversationHistory(
      conversationId,
      userId,
      req
    );

    if (!conversation.metadata?.generatedContract) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'No contract found in this conversation',
      });
    }

    const contractText = conversation.metadata.generatedContract;

    if (format === 'text' || !format) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="contract_${conversationId}.txt"`
      );
      return res.send(contractText);
    } else if (format === 'pdf') {
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 54,
          bottom: 54,
          left: 54,
          right: 54,
        },
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="contract_${conversationId}.pdf"`
      );

      doc.pipe(res);

      const lines = contractText.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('##')) {
          doc.moveDown(0.5);
          doc.fontSize(12).font('Helvetica-Bold').text(line.replace(/#/g, '').trim());
          doc.moveDown(0.5);
        } else if (line.trim().startsWith('#')) {
          doc.moveDown(0.5);
          doc.fontSize(14).font('Helvetica-Bold').text(line.replace(/#/g, '').trim());
          doc.moveDown(0.5);
        } else if (line.trim() === '') {
          doc.moveDown(0.5);
        } else {
          let text = line;
          let fontName = 'Helvetica';
          if (text.startsWith('**') && text.endsWith('**')) {
            text = text.replace(/\*\*/g, '');
            fontName = 'Helvetica-Bold';
          }
          doc.fontSize(10).font(fontName).text(text, { align: 'justify', lineGap: 3 });
        }
      }

      doc.end();
      return;
    } else if (format === 'docx') {
      const children = [];
      const lines = contractText.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('##')) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line.replace(/#/g, '').trim(),
                  bold: true,
                  size: 24, // 12pt
                }),
              ],
              spacing: { before: 200, after: 100 },
            })
          );
        } else if (line.trim().startsWith('#')) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line.replace(/#/g, '').trim(),
                  bold: true,
                  size: 28, // 14pt
                }),
              ],
              spacing: { before: 300, after: 150 },
            })
          );
        } else if (line.trim() === '') {
          children.push(
            new Paragraph({
              children: [new TextRun('')],
              spacing: { after: 100 },
            })
          );
        } else {
          let text = line;
          let bold = false;
          if (text.startsWith('**') && text.endsWith('**')) {
            text = text.replace(/\*\*/g, '');
            bold = true;
          }
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: text,
                  bold: bold,
                  size: 20, // 10pt
                }),
              ],
              spacing: { after: 100 },
            })
          );
        }
      }

      const doc = new Document({
        sections: [
          {
            properties: {},
            children,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="contract_${conversationId}.docx"`
      );
      return res.send(buffer);
    } else {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `Format '${format}' is not supported. Supported formats: 'text', 'pdf', 'docx'.`,
      });
    }
  } catch (error) {
    logger.error('Error downloading contract:', error);
    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to download contract',
    });
  }
});

/**
 * @typedef {object} ModifyContractRequestBody
 * @property {string} conversationId - The ID of the conversation containing the contract to modify.
 * @property {string} modifications - Natural language instructions describing the desired modifications.
 */

/**
 * @typedef {object} ModifyContractResponseData
 * @property {string} conversationId - The ID of the conversation.
 * @property {string} response - The AI's natural language response to the modification request.
 * @property {boolean} contractGenerated - True if a new version of the contract was generated.
 * @property {string} [generatedContract] - The modified contract text, if `contractGenerated` is true.
 * @property {boolean} needsMoreInfo - True if the AI requires more information for the modification.
 */

/**
 * Modify existing contract.
 * Allows users to request modifications to a previously generated contract
 * within an ongoing conversation using natural language instructions.
 *
 * @swagger
 * /api/v1/legal-contract/conversations/{conversationId}/modify:
 *   post:
 *     summary: Request modifications to an existing contract within a conversation.
 *     description: This endpoint enables users to modify a contract by providing natural language instructions. The AI assistant will process these instructions and update the contract within the specified conversation.
 *     tags:
 *       - Legal Contract
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation containing the contract to modify.
 *         example: "654321abcdef"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - modifications
 *             properties:
 *               modifications:
 *                 type: string
 *                 description: Natural language instructions describing the desired modifications to the contract.
 *                 example: "Please change the effective date to January 1, 2024 and add a clause about dispute resolution."
 *     responses:
 *       200:
 *         description: Contract modification request processed successfully.
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
 *                   example: "Contract modification request processed"
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                       example: "654321abcdef"
 *                     response:
 *                       type: string
 *                       example: "I have updated the contract with the new effective date and added a dispute resolution clause. Please review."
 *                     contractGenerated:
 *                       type: boolean
 *                       example: true
 *                     generatedContract:
 *                       type: string
 *                       description: The modified contract text.
 *                       example: "This Non-Disclosure Agreement ('Agreement') is made and entered into effective January 1, 2024..."
 *                     needsMoreInfo:
 *                       type: boolean
 *                       example: false
 *       401:
 *         description: Unauthorized. User not authenticated.
 *       403:
 *         description: Forbidden. User does not have access to this conversation.
 *       404:
 *         description: Not Found. No contract found to modify in the specified conversation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "No contract found to modify"
 *       500:
 *         description: Internal Server Error. Failed to modify contract.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Failed to modify contract"
 */
const modifyContract = catchAsync(async (req, res) => {
  const { conversationId, modifications } = req.body;
  const userId = req.user?.userId || req.user?._id;

  logger.info(`Modify contract request: ${conversationId}`);

  try {
    // Optimization suggestion: If legalContractService.getConversationHistory uses Mongoose,
    // consider adding .lean() for read-only operations and .select() to fetch only necessary fields
    // (e.g., 'metadata.generatedContract', 'metadata.outputFormat', 'metadata.isGuest')
    // to improve query performance.
    const conversation = await legalContractService.getConversationHistory(
      conversationId,
      userId,
      req
    );

    if (!conversation.metadata?.generatedContract) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'No contract found to modify',
      });
    }

    // Process modification as a new conversational request
    const result = await legalContractService.processConversationalRequest(
      userId,
      `Please modify the contract as follows: ${modifications}`,
      conversationId,
      null,
      conversation.metadata?.outputFormat || 'text',
      conversation.metadata?.isGuest || false
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Contract modification request processed',
      data: result,
    });
  } catch (error) {
    logger.error('Error modifying contract:', error);
    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to modify contract',
    });
  }
});

/**
 * @namespace legalContractController
 * @description Controller for handling legal contract related operations.
 * This object exports all the individual controller functions for use in routes.
 */
export const legalContractController = {
  conversationalAssistant,
  generateContract,
  getConversationHistory,
  downloadContract,
  modifyContract,
};