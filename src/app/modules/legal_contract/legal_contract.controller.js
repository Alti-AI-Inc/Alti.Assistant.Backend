import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { legalContractService } from './legal_contract.service.js';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';

/**
 * Conversational legal contract assistant endpoint
 * Handles natural language requests for contract generation with file upload
 */
const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? legalContractService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId, outputFormat } = req.body;
  userId = req.body.userId || userId;

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
        userId: isGuest ? userId : undefined,
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
 * Direct contract generation endpoint (non-conversational)
 * For programmatic access with all parameters provided
 */
const generateContract = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? legalContractService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  userId = req.body.userId || userId;

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
        userId: isGuest ? userId : undefined,
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
 * Get conversation history
 */
const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  logger.info(`Fetching conversation history for ${conversationId}`);

  try {
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
 * Download contract in specified format
 */
const downloadContract = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const { format } = req.query;
  const userId = req.user?.userId || req.user?._id;

  logger.info(
    `Download contract request: ${conversationId}, format: ${format}`
  );

  try {
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
 * Modify existing contract
 */
const modifyContract = catchAsync(async (req, res) => {
  const { conversationId, modifications } = req.body;
  const userId = req.user?.userId || req.user?._id;

  logger.info(`Modify contract request: ${conversationId}`);

  try {
    // Get existing conversation
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

export const legalContractController = {
  conversationalAssistant,
  generateContract,
  getConversationHistory,
  downloadContract,
  modifyContract,
};
