import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { conversationAnalyzer } from './services/conversationAnalyzer.js';
import { exportDocument } from './utils/documentExporter.js';
import { uploadDocumentToGCS } from './services/gcsUploadService.js';
import {
  DOCUMENT_CONFIG,
  DOCUMENT_INTENTS,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
} from './document.constant.js';

// Mock external modules
vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal();
  return {
    ...actualMongoose,
    Types: {
      ObjectId: vi.fn().mockImplementation(() => ({
        toString: vi.fn().mockImplementation(() => 'mockObjectIdString'),
      })),
    },
  };
});

vi.mock('@google/generative-ai');
vi.mock('../../../errors/ApiError.js');
vi.mock('../../../shared/logger.js');
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock_gemini_key',
  },
}));
vi.mock('../conversations/conversation.service.js');
vi.mock('../conversations/conversation.helpers.js');
vi.mock('./services/conversationAnalyzer.js');
vi.mock('./utils/documentExporter.js');
vi.mock('./services/gcsUploadService.js');

// Import the service after mocks are set up
const {
  generateGuestUserId,
  generateConversationId,
  processConversationalRequest,
  generateDocument,
  generateDocumentContent,
  // exportDocument is exported but also mocked, so we test its usage
} = await import('./document.service.js');

describe('documentService', () => {
  const mockUserId = 'user123';
  const mockGuestUserId = 'guest123';
  const mockConversationId = 'conv123';
  const mockUserMessage = 'Please draft a business proposal about AI.';
  const mockReq = { user: { id: mockUserId } };

  const mockConversation = {
    conversationId: mockConversationId,
    userId: mockUserId,
    title: 'Document: Please draft a business proposal...',
    messages: [],
    metadata: {
      category: CONVERSATION_CATEGORY,
      model: CONVERSATION_MODEL,
      userType: 'authenticated',
      isGuest: false,
      collectedParams: {},
    },
    save: vi.fn(),
  };

  const mockGeminiResponse = {
    response: {
      text: vi.fn().mockImplementation(() => 'Generated document content'),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock logger
    logger.info = vi.fn();
    logger.error = vi.fn();
    logger.warn = vi.fn();

    // Mock ApiError constructor
    ApiError.mockImplementation((status, message) => {
      const error = new Error(message);
      error.statusCode = status;
      return error;
    });

    // Mock GoogleGenerativeAI
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: vi.fn().mockImplementation(() => ({
        generateContent: vi.fn().mockImplementation(() => Promise.resolve(mockGeminiResponse)),
      })),
    }));

    // Mock conversationService
    conversationService.createConversation.mockResolvedValue(mockConversation);
    conversationService.addMessageToConversation.mockResolvedValue({
      ...mockConversation,
      messages: [{ role: 'user', content: mockUserMessage }],
    });
    conversationService.updateConversationMetadata.mockResolvedValue(
      mockConversation
    );

    // Mock conversationHelpers
    conversationHelpers.getConversationById.mockResolvedValue(mockConversation);

    // Mock conversationAnalyzer
    conversationAnalyzer._calculateConversationTokens.mockReturnValue(100);
    conversationAnalyzer.summarizeConversation.mockResolvedValue(
      'Mock summary'
    );
    conversationAnalyzer.analyzeIntent.mockResolvedValue({
      intent: DOCUMENT_INTENTS.DRAFT,
      confidence: 0.9,
      canProceed: true,
      parameters: {
        documentType: 'business proposal',
        content: mockUserMessage,
      },
      suggestedResponse: 'I can draft that for you.',
      improvementQuestions: [],
    });

    // Mock documentExporter
    exportDocument.mockResolvedValue({
      filePath: '/tmp/mock_doc.pdf',
      fileName: 'mock_doc.pdf',
      format: 'pdf',
    });

    // Mock gcsUploadService
    uploadDocumentToGCS.mockResolvedValue({
      publicUrl: 'https://storage.googleapis.com/mock_bucket/mock_doc.pdf',
      fileName: 'mock_doc.pdf',
    });
  });

  describe('generateGuestUserId', () => {
    it('should return a string', () => {
      const id = generateGuestUserId();
      expect(typeof id).toBe('string');
    });

    it('should return a mock ObjectId string', () => {
      const id = generateGuestUserId();
      expect(id).toBe('mockObjectIdString');
      expect(mongoose.Types.ObjectId).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateConversationId', () => {
    it('should return a string', () => {
      const id = generateConversationId();
      expect(typeof id).toBe('string');
    });

    it('should start with "doc_"', () => {
      const id = generateConversationId();
      expect(id).toMatch(/^doc_/);
    });

    it('should generate different IDs on successive calls', () => {
      const id1 = generateConversationId();
      const id2 = generateConversationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('handleDocumentConversation', () => {
    it('should retrieve an existing conversation if conversationId is provided', async () => {
      const result = await documentService.handleDocumentConversation(
        mockUserId,
        mockConversationId,
        mockUserMessage,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        mockReq
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(result).toEqual(mockConversation);
      expect(logger.info).toHaveBeenCalledWith(
        `Retrieved existing conversation: ${mockConversationId}`
      );
    });

    it('should create a new conversation if conversationId is null/undefined', async () => {
      const newConversationId = 'new_conv_id';
      vi.spyOn(documentService, 'generateConversationId').mockReturnValueOnce(
        newConversationId
      );
      conversationHelpers.getConversationById.mockRejectedValueOnce(
        new ApiError(httpStatus.NOT_FOUND, 'Not found')
      ); // Simulate no conversation found initially

      const result = await documentService.handleDocumentConversation(
        mockUserId,
        null,
        mockUserMessage,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).not.toHaveBeenCalledWith(
        null,
        mockUserId,
        mockReq
      ); // Should not be called with null
      expect(documentService.generateConversationId).toHaveBeenCalledTimes(1);
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: `Document: ${mockUserMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: 'authenticated',
            isGuest: false,
            collectedParams: {},
          },
        },
        newConversationId,
        mockReq
      );
      expect(result).toEqual(mockConversation);
      expect(logger.info).toHaveBeenCalledWith(
        `Created new document conversation ${newConversationId} for user ${mockUserId}`
      );
    });

    it('should throw ApiError if conversationId is provided but not found', async () => {
      conversationHelpers.getConversationById.mockRejectedValueOnce(
        new ApiError(httpStatus.NOT_FOUND, 'Conversation not found')
      );

      await expect(
        documentService.handleDocumentConversation(
          mockUserId,
          mockConversationId,
          mockUserMessage,
          false,
          mockReq
        )
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: httpStatus.NOT_FOUND,
          message: `Conversation with ID ${mockConversationId} not found or not accessible.`,
        })
      );
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should throw ApiError for other errors during retrieval', async () => {
      conversationHelpers.getConversationById.mockRejectedValueOnce(
        new Error('Database error')
      );

      await expect(
        documentService.handleDocumentConversation(
          mockUserId,
          mockConversationId,
          mockUserMessage,
          false,
          mockReq
        )
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: httpStatus.NOT_FOUND,
          message: `Conversation with ID ${mockConversationId} not found or not accessible.`,
        })
      );
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should re-throw ApiError if it originates from createConversation', async () => {
      vi.spyOn(documentService, 'generateConversationId').mockReturnValueOnce(
        'new_conv_id'
      );
      conversationService.createConversation.mockRejectedValueOnce(
        new ApiError(httpStatus.BAD_REQUEST, 'Invalid data')
      );

      await expect(
        documentService.handleDocumentConversation(
          mockUserId,
          null,
          mockUserMessage,
          false,
          mockReq
        )
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: httpStatus.BAD_REQUEST,
          message: 'Invalid data',
        })
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should wrap non-ApiError from createConversation in a new ApiError', async () => {
      vi.spyOn(documentService, 'generateConversationId').mockReturnValueOnce(
        'new_conv_id'
      );
      conversationService.createConversation.mockRejectedValueOnce(
        new Error('Some unexpected error')
      );

      await expect(
        documentService.handleDocumentConversation(
          mockUserId,
          null,
          mockUserMessage,
          false,
          mockReq
        )
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to handle conversation',
        })
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('addMessage', () => {
    it('should call conversationService.addMessageToConversation with correct arguments', async () => {
      const role = 'user';
      const content = 'Hello AI';
      const metadata = { type: 'greeting' };

      await documentService.addMessage(
        mockConversationId,
        mockUserId,
        role,
        content,
        metadata,
        false,
        mockReq
      );

      expect(
        conversationService.addMessageToConversation
      ).toHaveBeenCalledTimes(1);
      const args =
        conversationService.addMessageToConversation.mock.calls[0][2]; // The message object
      expect(args.role).toBe(role);
      expect(args.content).toBe(content);
      expect(args.metadata).toEqual(metadata);
      expect(args.timestamp).toBeInstanceOf(Date);
    });

    it('should return the result from conversationService.addMessageToConversation', async () => {
      const expectedResult = {
        ...mockConversation,
        messages: [{ role: 'user', content: 'Test message' }],
      };
      conversationService.addMessageToConversation.mockResolvedValueOnce(
        expectedResult
      );

      const result = await documentService.addMessage(
        mockConversationId,
        mockUserId,
        'user',
        'Test message'
      );
      expect(result).toEqual(expectedResult);
    });

    it('should throw ApiError on failure', async () => {
      conversationService.addMessageToConversation.mockRejectedValueOnce(
        new Error('DB error')
      );

      await expect(
        documentService.addMessage(
          mockConversationId,
          mockUserId,
          'user',
          'Test message'
        )
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to add message',
        })
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('updateConversationMetadata', () => {
    it('should call conversationService.updateConversationMetadata with correct arguments', async () => {
      const params = { documentType: 'report' };
      await documentService.updateConversationMetadata(
        mockConversationId,
        mockUserId,
        params,
        mockReq
      );

      expect(
        conversationService.updateConversationMetadata
      ).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        { collectedParams: params },
        mockReq
      );
    });

    it('should log a warning but not throw on error', async () => {
      conversationService.updateConversationMetadata.mockRejectedValueOnce(
        new Error('Update failed')
      );

      await expect(
        documentService.updateConversationMetadata(
          mockConversationId,
          mockUserId,
          {}
        )
      ).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'Error updating conversation metadata:',
        expect.any(Error)
      );
    });
  });

  describe('saveConversationSummary', () => {
    const mockSummary = 'This is a summary of the conversation.';
    const mockConversationWithMessages = {
      ...mockConversation,
      messages: [
        { role: 'user', content: 'msg1' },
        { role: 'assistant', content: 'msg2' },
      ],
      metadata: {
        ...mockConversation.metadata,
        conversationSummary: null,
        summarizedAt: null,
        summarizedMessageCount: 0,
      },
      save: vi.fn().mockResolvedValue(true),
    };

    it('should retrieve conversation, update metadata, and save', async () => {
      conversationHelpers.getConversationById.mockResolvedValueOnce(
        mockConversationWithMessages
      );

      await documentService.saveConversationSummary(
        mockConversationId,
        mockUserId,
        mockSummary,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        mockReq
      );
      expect(mockConversationWithMessages.metadata.conversationSummary).toBe(
        mockSummary
      );
      expect(
        mockConversationWithMessages.metadata.summarizedAt
      ).toBeDefined();
      expect(
        mockConversationWithMessages.metadata.summarizedMessageCount
      ).toBe(mockConversationWithMessages.messages.length);
      expect(mockConversationWithMessages.save).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        `Saved conversation summary for ${mockConversationId}`
      );
    });

    it('should do nothing if conversation is not found', async () => {
      conversationHelpers.getConversationById.mockResolvedValueOnce(null);

      await documentService.saveConversationSummary(
        mockConversationId,
        mockUserId,
        mockSummary
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledTimes(1);
      expect(mockConversationWithMessages.save).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalledWith(
        `Saved conversation summary for ${mockConversationId}`
      );
    });

    it('should log an error but not throw on failure', async () => {
      conversationHelpers.getConversationById.mockRejectedValueOnce(
        new Error('DB error')
      );

      await expect(
        documentService.saveConversationSummary(
          mockConversationId,
          mockUserId,
          mockSummary
        )
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Error saving conversation summary:',
        expect.any(Error)
      );
    });
  });

  describe('generateDocumentContent', () => {
    it('should call model.generateContent with a well-formed prompt', async () => {
      const params = {
        content: 'Draft a letter to a client.',
        documentType: 'letter',
        tone: 'formal',
        length: 'medium',
        wordCount: 500,
        language: 'English',
        additionalInstructions: 'Be concise.',
      };

      await documentService.generateDocumentContent(params);

      const expectedPrompt = expect.stringContaining(`You are a professional document writer. Generate a high-quality ${params.documentType} document.

<user_content>
${params.content}
</user_content>

Requirements:
- Document Type: ${params.documentType}
- Tone: ${params.tone}
- Length: ${params.length} (approximately ${params.wordCount} words)
- Language: ${params.language}
- Additional Instructions: <user_instructions>${params.additionalInstructions}</user_instructions>

Guidelines:
1. Create well-structured, professional content
2. Use appropriate formatting (headings, paragraphs, lists where needed)
3. Ensure logical flow and coherence
4. Match the specified tone and style
5. Be clear, concise, and engaging

Generate the complete document content now:`);

      const genAIInstance = GoogleGenerativeAI.mock.results[0].value;
      const modelInstance = genAIInstance.getGenerativeModel.mock.results[0]
        .value;
      expect(modelInstance.generateContent).toHaveBeenCalledWith(
        expectedPrompt
      );
      expect(mockGeminiResponse.response.text).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        'Document content generated successfully',
        expect.any(Object)
      );
    });

    it('should use default parameters if not provided', async () => {
      const params = {
        content: 'Simple content.',
      };

      await documentService.generateDocumentContent(params);

      const expectedPrompt = expect.stringContaining(
        `Document Type: ${DEFAULT_PARAMS.documentType}`
      );
      expect(
        GoogleGenerativeAI.mock.results[0].value.getGenerativeModel.mock
          .results[0].value.generateContent
      ).toHaveBeenCalledWith(expectedPrompt);
    });

    it('should return the generated text', async () => {
      const result = await documentService.generateDocumentContent({
        content: 'test',
      });
      expect(result).toBe('Generated document content');
    });

    it('should throw ApiError on generation failure', async () => {
      const genAIInstance = GoogleGenerativeAI.mock.results[0].value;
      const modelInstance = genAIInstance.getGenerativeModel.mock.results[0]
        .value;
      modelInstance.generateContent.mockRejectedValueOnce(
        new Error('AI service down')
      );

      await expect(
        documentService.generateDocumentContent({ content: 'test' })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to generate document content',
        })
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('handleDraftIntent', () => {
    const mockAnalysisCanProceed = {
      intent: DOCUMENT_INTENTS.DRAFT,
      confidence: 0.9,
      canProceed: true,
      parameters: {
        documentType: 'report',
        content: 'Report content',
        outputFormat: 'pdf',
        title: 'My Report',
      },
      suggestedResponse: 'Drafting your report.',
      improvementQuestions: ['Question 1', 'Question 2'],
    };

    const mockAnalysisNeedsInfo = {
      intent: DOCUMENT_INTENTS.DRAFT,
      confidence: 0.7,
      canProceed: false,
      parameters: { documentType: 'report' },
      suggestedResponse: 'I need more information to draft.',
      improvementQuestions: ['What is the topic?'],
    };

    it('should return needsMoreInfo if analysis.canProceed is false', async () => {
      const result = await documentService.handleDraftIntent(
        mockAnalysisNeedsInfo,
        mockAnalysisNeedsInfo.parameters,
        mockConversationId,
        mockUserId,
        false
      );

      expect(documentService.addMessage).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        'assistant',
        mockAnalysisNeedsInfo.suggestedResponse,
        { needsMoreInfo: true },
        false
      );
      expect(generateDocumentContent).not.toHaveBeenCalled();
      expect(exportDocument).not.toHaveBeenCalled();
      expect(uploadDocumentToGCS).not.toHaveBeenCalled();
      expect(result).toEqual({
        conversationId: mockConversationId,
        userId: mockUserId,
        success: true,
        needsMoreInfo: true,
        message: mockAnalysisNeedsInfo.suggestedResponse,
        improvementQuestions: mockAnalysisNeedsInfo.improvementQuestions,
        collectedParams: mockAnalysisNeedsInfo.parameters,
      });
    });

    it('should generate, export, upload, and return document details if canProceed is true', async () => {
      const updatedParams = mockAnalysisCanProceed.parameters;
      const mockExportResult = {
        filePath: '/tmp/mock_doc.pdf',
        fileName: 'mock_doc.pdf',
        format: 'pdf',
      };
      const mockUploadResult = {
        publicUrl: 'https://storage.googleapis.com/mock_bucket/mock_doc.pdf',
        fileName: 'mock_doc.pdf',
      };

      generateDocumentContent.mockResolvedValueOnce('Generated document content');
      exportDocument.mockResolvedValueOnce(mockExportResult);
      uploadDocumentToGCS.mockResolvedValueOnce(mockUploadResult);

      const result = await documentService.handleDraftIntent(
        mockAnalysisCanProceed,
        updatedParams,
        mockConversationId,
        mockUserId,
        false
      );

      expect(generateDocumentContent).toHaveBeenCalledWith(updatedParams);
      expect(exportDocument).toHaveBeenCalledWith(
        'Generated document content',
        updatedParams.outputFormat,
        expect.objectContaining({
          title: updatedParams.title,
          documentType: updatedParams.documentType,
        })
      );
      expect(uploadDocumentToGCS).toHaveBeenCalledWith(mockExportResult.filePath, {
        userId: mockUserId,
        documentType: updatedParams.documentType,
        title: updatedParams.title,
      });
      expect(documentService.addMessage).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        'assistant',
        expect.stringContaining('I\'ve created a draft report for you in PDF format.'),
        expect.objectContaining({
          documentGenerated: true,
          isDraft: true,
          exportResult: mockExportResult,
          uploadResult: mockUploadResult,
        }),
        false
      );
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          needsMoreInfo: false,
          isDraft: true,
          document: {
            content: 'Generated document content',
            format: updatedParams.outputFormat,
            file: mockExportResult,
            url: mockUploadResult.publicUrl,
            metadata: expect.any(Object),
          },
          improvementQuestions: mockAnalysisCanProceed.improvementQuestions,
          collectedParams: updatedParams,
        })
      );
      expect(result.document.file.filePath).toBe(mockExportResult.filePath);
      expect(result.document.url).toBe(mockUploadResult.publicUrl);
    });

    it('should use default outputFormat if not provided in params', async () => {
      const analysis = {
        ...mockAnalysisCanProceed,
        parameters: { ...mockAnalysisCanProceed.parameters, outputFormat: undefined },
      };
      const updatedParams = analysis.parameters;

      await documentService.handleDraftIntent(
        analysis,
        updatedParams,
        mockConversationId,
        mockUserId,
        false
      );

      expect(exportDocument).toHaveBeenCalledWith(
        expect.any(String),
        DEFAULT_PARAMS.outputFormat,
        expect.any(Object)
      );
    });

    it('should re-throw errors from sub-functions', async () => {
      generateDocumentContent.mockRejectedValueOnce(new Error('Gen error'));

      await expect(
        documentService.handleDraftIntent(
          mockAnalysisCanProceed,
          mockAnalysisCanProceed.parameters,
          mockConversationId,
          mockUserId,
          false
        )
      ).rejects.toThrow('Gen error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error handling draft intent:',
        expect.any(Error)
      );
    });
  });

  describe('handleExportIntent', () => {
    const mockAnalysisExport = {
      intent: DOCUMENT_INTENTS.EXPORT,
      confidence: 0.9,
      canProceed: true,
      parameters: {
        content: 'Document content to export.',
        outputFormat: 'docx',
        title: 'Exported Doc',
        documentType: 'report',
      },
      suggestedResponse: 'Exporting your document.',
    };

    it('should export, upload, and return document details if content and format are provided', async () => {
      const updatedParams = mockAnalysisExport.parameters;
      const mockExportResult = {
        filePath: '/tmp/mock_doc.docx',
        fileName: 'mock_doc.docx',
        format: 'docx',
      };
      const mockUploadResult = {
        publicUrl: 'https://storage.googleapis.com/mock_bucket/mock_doc.docx',
        fileName: 'mock_doc.docx',
      };

      exportDocument.mockResolvedValueOnce(mockExportResult);
      uploadDocumentToGCS.mockResolvedValueOnce(mockUploadResult);

      const result = await documentService.handleExportIntent(
        mockAnalysisExport,
        updatedParams,
        mockConversationId,
        mockUserId,
        false
      );

      expect(exportDocument).toHaveBeenCalledWith(
        updatedParams.content,
        updatedParams.outputFormat,
        expect.objectContaining({
          title: updatedParams.title,
          documentType: updatedParams.documentType,
        })
      );
      expect(uploadDocumentToGCS).toHaveBeenCalledWith(mockExportResult.filePath, {
        userId: mockUserId,
        documentType: updatedParams.documentType,
        title: updatedParams.title,
      });
      expect(documentService.addMessage).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        'assistant',
        expect.stringContaining('I\'ve exported your document to DOCX format!'),
        expect.objectContaining({
          exportResult: mockExportResult,
          uploadResult: mockUploadResult,
        }),
        false
      );
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          needsMoreInfo: false,
          document: {
            format: updatedParams.outputFormat,
            file: mockExportResult,
            url: mockUploadResult.publicUrl,
          },
          collectedParams: updatedParams,
        })
      );
      expect(result.document.file.filePath).toBe(mockExportResult.filePath);
      expect(result.document.url).toBe(mockUploadResult.publicUrl);
    });

    it('should return needsMoreInfo if content is missing', async () => {
      const updatedParams = { ...mockAnalysisExport.parameters, content: '' };
      const result = await documentService.handleExportIntent(
        mockAnalysisExport,
        updatedParams,
        mockConversationId,
        mockUserId,
        false
      );

      expect(documentService.addMessage).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        'assistant',
        'I need the document content to export. Could you provide it?',
        {},
        false
      );
      expect(exportDocument).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          needsMoreInfo: true,
          message: 'I need the document content to export. Could you provide it?',
          collectedParams: updatedParams,
        })
      );
    });

    it('should return needsMoreInfo if outputFormat is missing', async () => {
      const updatedParams = {
        ...mockAnalysisExport.parameters,
        outputFormat: '',
      };
      const result = await documentService.handleExportIntent(
        mockAnalysisExport,
        updatedParams,
        mockConversationId,
        mockUserId,
        false
      );

      expect(documentService.addMessage).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        'assistant',
        'What format would you like to export to? (PDF, DOCX, TXT, HTML, or MD)',
        {},
        false
      );
      expect(exportDocument).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          needsMoreInfo: true,
          message:
            'What format would you like to export to? (PDF, DOCX, TXT, HTML, or MD)',
          collectedParams: updatedParams,
        })
      );
    });

    it('should re-throw errors from sub-functions', async () => {
      exportDocument.mockRejectedValueOnce(new Error('Export error'));

      await expect(
        documentService.handleExportIntent(
          mockAnalysisExport,
          mockAnalysisExport.parameters,
          mockConversationId,
          mockUserId,
          false
        )
      ).rejects.toThrow('Export error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error handling export intent:',
        expect.any(Error)
      );
    });
  });

  describe('processConversationalRequest', () => {
    const mockExistingConversation = {
      ...mockConversation,
      messages: [
        { role: 'user', content: 'Initial message' },
        { role: 'assistant', content: 'Response' },
      ],
      metadata: {
        ...mockConversation.metadata,
        collectedParams: { documentType: 'email' },
      },
      save: vi.fn().mockResolvedValue(true),
    };

    it('should handle new conversation, add user message, analyze intent, update metadata, and call draft intent handler', async () => {
      vi.spyOn(documentService, 'handleDocumentConversation').mockResolvedValueOnce(
        mockConversation
      );
      vi.spyOn(documentService, 'addMessage'); // Spy on the actual function
      vi.spyOn(documentService, 'updateConversationMetadata'); // Spy on the actual function
      vi.spyOn(documentService, 'handleDraftIntent').mockResolvedValueOnce({
        success: true,
        isDraft: true,
        message: 'Drafted!',
      });

      const result = await documentService.processConversationalRequest(
        mockUserId,
        mockUserMessage,
        null,
        false
      );

      expect(documentService.handleDocumentConversation).toHaveBeenCalledWith(
        mockUserId,
        null,
        mockUserMessage,
        false
      );
      expect(documentService.addMessage).toHaveBeenCalledWith(
        mockConversation.conversationId,
        mockUserId,
        'user',
        mockUserMessage,
        {},
        false
      );
      expect(conversationAnalyzer.analyzeIntent).toHaveBeenCalledWith(
        mockUserMessage,
        expect.arrayContaining([
          { role: 'user', content: mockUserMessage },
        ]),
        {},
        null
      );
      expect(documentService.updateConversationMetadata).toHaveBeenCalledWith(
        mockConversation.conversationId,
        mockUserId,
        expect.objectContaining({ documentType: 'business proposal' })
      );
      expect(documentService.handleDraftIntent).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true, isDraft: true, message: 'Drafted!' });
    });

    it('should handle existing conversation, add user message, analyze intent, update metadata, and call export intent handler', async () => {
      vi.spyOn(documentService, 'handleDocumentConversation').mockResolvedValueOnce(
        mockExistingConversation
      );
      vi.spyOn(documentService, 'addMessage');
      vi.spyOn(documentService, 'updateConversationMetadata');
      vi.spyOn(documentService, 'handleExportIntent').mockResolvedValueOnce({
        success: true,
        message: 'Exported!',
      });
      conversationAnalyzer.analyzeIntent.mockResolvedValueOnce({
        intent: DOCUMENT_INTENTS.EXPORT,
        confidence: 0.9,
        canProceed: true,
        parameters: {
          outputFormat: 'pdf',
          content: 'Some content',
        },
        suggestedResponse: 'Exporting.',
      });

      const result = await documentService.processConversationalRequest(
        mockUserId,
        'Export this to PDF',
        mockConversationId,
        false
      );

      expect(documentService.handleDocumentConversation).toHaveBeenCalledWith(
        mockUserId,
        mockConversationId,
        'Export this to PDF',
        false
      );
      expect(documentService.addMessage).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        'user',
        'Export this to PDF',
        {},
        false
      );
      expect(conversationAnalyzer.analyzeIntent).toHaveBeenCalledWith(
        'Export this to PDF',
        expect.arrayContaining([
          { role: 'user', content: 'Initial message' },
          { role: 'assistant', content: 'Response' },
          { role: 'user', content: 'Export this to PDF' },
        ]),
        mockExistingConversation.metadata.collectedParams,
        null
      );
      expect(documentService.updateConversationMetadata).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({
          documentType: 'email',
          outputFormat: 'pdf',
          content: 'Some content',
        })
      );
      expect(documentService.handleExportIntent).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true, message: 'Exported!' });
    });

    it('should trigger summarization if token count exceeds threshold and not recently summarized', async () => {
      const longConversation = {
        ...mockExistingConversation,
        messages: Array(10).fill({ role: 'user', content: 'long message' }),
        metadata: {
          ...mockExistingConversation.metadata,
          summarizedMessageCount: 0,
        },
      };
      vi.spyOn(documentService, 'handleDocumentConversation').mockResolvedValueOnce(
        longConversation
      );
      conversationAnalyzer._calculateConversationTokens.mockReturnValueOnce(6000);
      vi.spyOn(documentService, 'saveConversationSummary');
      vi.spyOn(documentService, 'handleDraftIntent').mockResolvedValueOnce({
        success: true,
        isDraft: true,
        message: 'Drafted!',
      });

      await documentService.processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false
      );

      expect(conversationAnalyzer._calculateConversationTokens).toHaveBeenCalled();
      expect(conversationAnalyzer.summarizeConversation).toHaveBeenCalled();
      expect(documentService.saveConversationSummary).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        'Mock summary'
      );
      expect(logger.info).toHaveBeenCalledWith('Summarizing conversation...');
    });

    it('should not trigger summarization if token count is below threshold', async () => {
      vi.spyOn(documentService, 'handleDocumentConversation').mockResolvedValueOnce(
        mockExistingConversation
      );
      conversationAnalyzer._calculateConversationTokens.mockReturnValueOnce(1000);
      vi.spyOn(documentService, 'saveConversationSummary');
      vi.spyOn(documentService, 'handleDraftIntent').mockResolvedValueOnce({
        success: true,
        isDraft: true,
        message: 'Drafted!',
      });

      await documentService.processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false
      );

      expect(conversationAnalyzer._calculateConversationTokens).toHaveBeenCalled();
      expect(conversationAnalyzer.summarizeConversation).not.toHaveBeenCalled();
      expect(documentService.saveConversationSummary).not.toHaveBeenCalled();
    });

    it('should not trigger summarization if recently summarized', async () => {
      const recentlySummarizedConversation = {
        ...mockExistingConversation,
        messages: Array(10).fill({ role: 'user', content: 'long message' }),
        metadata: {
          ...mockExistingConversation.metadata,
          conversationSummary: 'Old summary',
          summarizedMessageCount: 8, // Less than 5 messages difference
        },
      };
      vi.spyOn(documentService, 'handleDocumentConversation').mockResolvedValueOnce(
        recentlySummarizedConversation
      );
      conversationAnalyzer._calculateConversationTokens.mockReturnValueOnce(6000);
      vi.spyOn(documentService, 'saveConversationSummary');
      vi.spyOn(documentService, 'handleDraftIntent').mockResolvedValueOnce({
        success: true,
        isDraft: true,
        message: 'Drafted!',
      });

      await documentService.processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false
      );

      expect(conversationAnalyzer._calculateConversationTokens).toHaveBeenCalled();
      expect(conversationAnalyzer.summarizeConversation).not.toHaveBeenCalled();
      expect(documentService.saveConversationSummary).not.toHaveBeenCalled();
    });

    it('should handle CLARIFY/INFO/default intent', async () => {
      vi.spyOn(documentService, 'handleDocumentConversation').mockResolvedValueOnce(
        mockConversation
      );
      conversationAnalyzer.analyzeIntent.mockResolvedValueOnce({
        intent: DOCUMENT_INTENTS.CLARIFY,
        confidence: 0.8,
        canProceed: false,
        parameters: {},
        suggestedResponse: 'What exactly do you mean?',
      });
      vi.spyOn(documentService, 'addMessage');

      const result = await documentService.processConversationalRequest(
        mockUserId,
        'What is this?',
        mockConversationId,
        false
      );

      expect(documentService.addMessage).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        'assistant',
        'What exactly do you mean?',
        {},
        false
      );
      expect(result).toEqual({
        conversationId: mockConversationId,
        userId: mockUserId,
        success: true,
        needsMoreInfo: true,
        message: 'What exactly do you mean?',
        collectedParams: {},
      });
    });

    it('should throw ApiError on general failure', async () => {
      documentService.handleDocumentConversation.mockRejectedValueOnce(
        new Error('Conversation error')
      );

      await expect(
        documentService.processConversationalRequest(
          mockUserId,
          mockUserMessage,
          null,
          false
        )
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to process document request',
        })
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error processing conversational request:',
        expect.any(Error)
      );
    });
  });

  describe('generateDocument', () => {
    const mockParams = {
      content: 'Direct generation content',
      documentType: 'memo',
      outputFormat: 'html',
      title: 'Direct Memo',
      includeDate: true,
      includeTitle: true,
    };

    it('should generate content, export, upload, and return document details', async () => {
      const mockExportResult = {
        filePath: '/tmp/direct_doc.html',
        fileName: 'direct_doc.html',
        format: 'html',
      };
      const mockUploadResult = {
        publicUrl: 'https://storage.googleapis.com/mock_bucket/direct_doc.html',
        fileName: 'direct_doc.html',
      };

      generateDocumentContent.mockResolvedValueOnce('Generated direct content');
      exportDocument.mockResolvedValueOnce(mockExportResult);
      uploadDocumentToGCS.mockResolvedValueOnce(mockUploadResult);

      const result = await documentService.generateDocument(
        mockParams,
        mockUserId,
        false,
        mockReq
      );

      expect(generateDocumentContent).toHaveBeenCalledWith(mockParams);
      expect(exportDocument).toHaveBeenCalledWith(
        'Generated direct content',
        mockParams.outputFormat,
        expect.objectContaining({
          title: mockParams.title,
          documentType: mockParams.documentType,
          includeDate: mockParams.includeDate,
          includeTitle: mockParams.includeTitle,
        })
      );
      expect(uploadDocumentToGCS).toHaveBeenCalledWith(mockExportResult.filePath, {
        userId: mockUserId,
        documentType: mockParams.documentType,
        title: mockParams.title,
      });
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          document: {
            content: 'Generated direct content',
            format: mockParams.outputFormat,
            file: mockExportResult,
            url: mockUploadResult.publicUrl,
            metadata: expect.any(Object),
          },
        })
      );
      expect(result.document.file.filePath).toBe(mockExportResult.filePath);
      expect(result.document.url).toBe(mockUploadResult.publicUrl);
    });

    it('should use default outputFormat if not provided in params', async () => {
      const paramsWithoutFormat = { ...mockParams, outputFormat: undefined };

      await documentService.generateDocument(
        paramsWithoutFormat,
        mockUserId,
        false,
        mockReq
      );

      expect(exportDocument).toHaveBeenCalledWith(
        expect.any(String),
        DEFAULT_PARAMS.outputFormat,
        expect.any(Object)
      );
    });

    it('should throw ApiError on failure', async () => {
      generateDocumentContent.mockRejectedValueOnce(new Error('Direct gen error'));

      await expect(
        documentService.generateDocument(mockParams, mockUserId, false, mockReq)
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to generate document',
        })
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error generating document:',
        expect.any(Error)
      );
    });
  });
});