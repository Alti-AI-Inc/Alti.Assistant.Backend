import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { summaryController } from './summary.controller.js';

const {
  mockPDFParse,
  mockPDFParseGetText,
  mockPDFParseConstructor,
  mockMammothExtractRawText,
  mockCsvParse,
  mockCatchAsync,
  mockLoggerInfo,
  mockLoggerError,
  mockSendResponse,
  mockSummaryService,
  mockSummarizerAppInvoke,
  mockStorageInstance
} = vi.hoisted(() => {
  // Mock external dependencies
  const mockPDFParseGetText = vi.fn();
  const mockPDFParseConstructor = vi.fn();
  class mockPDFParse {
    constructor(options) {
      mockPDFParseConstructor(options);
    }
    getText() {
      return mockPDFParseGetText();
    }
  }

  const mockMammothExtractRawText = vi.fn();

  const mockCsvParse = vi.fn().mockImplementation(() => {
    const emitter = {
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === 'data') {
          const records = mockCsvParse.mockRecords || [];
          records.forEach(callback);
        } else if (event === 'end') {
          callback();
        }
        return emitter;
      }),
    };
    return emitter;
  });

  // Mock shared utilities
  const mockCatchAsync = (fn) => fn; // Directly execute the async function for testing
  const mockLoggerInfo = vi.fn();
  const mockLoggerError = vi.fn();
  const mockSendResponse = vi.fn();

  // Mock summaryService
  const mockSummaryService = {
    generateGuestUserId: vi.fn(),
    generateSummaryConversationId: vi.fn(),
    handleSummaryConversation: vi.fn(),
    addSummaryQueryMessage: vi.fn(),
    addSummaryResultMessage: vi.fn(),
    addErrorMessage: vi.fn(),
    getSummaryStats: vi.fn(),
  };

  // Mock summarizerApp
  const mockSummarizerAppInvoke = vi.fn();

  // Mock storage
  const mockStorageInstance = {
    bucket: vi.fn().mockImplementation(() => ({
      file: vi.fn().mockImplementation((name) => ({
        save: vi.fn().mockResolvedValue(undefined),
        getSignedUrl: vi.fn().mockResolvedValue(['https://mock-gcs-signed-url.com']),
        name: name,
      })),
    })),
  };

  return {
    mockPDFParse,
    mockPDFParseGetText,
    mockPDFParseConstructor,
    mockMammothExtractRawText,
    mockCsvParse,
    mockCatchAsync,
    mockLoggerInfo,
    mockLoggerError,
    mockSendResponse,
    mockSummaryService,
    mockSummarizerAppInvoke,
    mockStorageInstance
  };
});

vi.mock('@google-cloud/storage', () => {
  class Storage {
    constructor() {
      return mockStorageInstance;
    }
  }
  return { Storage };
});

vi.mock('pdf-parse', () => ({
  PDFParse: mockPDFParse,
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: mockMammothExtractRawText,
  },
}));

vi.mock('csv-parse', () => ({
  parse: mockCsvParse,
}));

vi.mock('../../../shared/catchAsync.js', () => ({
  default: mockCatchAsync,
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
  },
}));
vi.mock('../../../shared/sendResponse.js', () => ({
  default: mockSendResponse,
}));

vi.mock('./summary.service.js', () => ({
  summaryService: mockSummaryService,
}));

vi.mock('./summarizer/workflow.js', () => ({
  summarizerApp: {
    invoke: mockSummarizerAppInvoke,
  },
}));

// Mock SubscriptionModel and conversationHelpers if they were directly used,
// but they are not in the controller, so no need to mock them for controller tests.
// vi.mock('../subscription/subscription.model.js', () => ({
//   default: {},
// }));
// vi.mock('../conversations/conversation.helpers.js', () => ({
//   conversationHelpers: {},
// }));

describe('summaryController', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Default mock request and response objects
    req = {
      body: {},
      user: null,
      isGuest: false,
      file: null,
    };
    res = {}; // sendResponse handles the actual response, so `res` itself doesn't need methods like `status` or `json`
  });

  describe('summarizeContent', () => {
    it('should return BAD_REQUEST if message is missing', async () => {
      req.body = {}; // No message

      await summaryController.summarizeContent(req, res);

      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'A URL or content is required for summarization',
      });
    });

    it('should return INTERNAL_SERVER_ERROR if userId cannot be determined', async () => {
      req.body = { message: 'test message' };
      req.user = null;
      req.isGuest = false; // Not a guest, but no user info
      mockSummaryService.generateGuestUserId.mockReturnValueOnce(null); // Simulate failure to generate guest ID

      await summaryController.summarizeContent(req, res);

      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to generate user identifier',
      });
    });

    it('should handle guest user summarization successfully', async () => {
      const guestUserId = 'guest-123';
      const conversationId = 'conv-123';
      const summaryResult = 'This is a summary.';

      req.body = { message: 'http://example.com/article' };
      req.isGuest = true;
      req.user = null; // Ensure no authenticated user
      mockSummaryService.generateGuestUserId.mockReturnValueOnce(guestUserId);
      mockSummaryService.generateSummaryConversationId.mockReturnValueOnce(
        conversationId
      );
      mockSummaryService.handleSummaryConversation.mockResolvedValueOnce({
        conversationId: conversationId,
        messages: [],
        messageCount: 0,
      });
      mockSummarizerAppInvoke.mockResolvedValueOnce({ summary: summaryResult });

      await summaryController.summarizeContent(req, res);

      expect(mockSummaryService.generateGuestUserId).toHaveBeenCalled();
      expect(mockSummaryService.generateSummaryConversationId).toHaveBeenCalled();
      expect(mockSummaryService.handleSummaryConversation).toHaveBeenCalledWith(
        guestUserId,
        undefined, // No conversationId in req.body
        req.body.message,
        true,
        req
      );
      expect(mockSummaryService.addSummaryQueryMessage).toHaveBeenCalledWith(
        conversationId,
        guestUserId,
        req.body.message,
        true,
        req
      );
      expect(mockSummarizerAppInvoke).toHaveBeenCalledWith({
        user_input: req.body.message,
        history: [{ role: 'user', content: req.body.message }],
        isFilePassed: false,
      });
      expect(mockSummaryService.addSummaryResultMessage).toHaveBeenCalledWith(
        conversationId,
        guestUserId,
        summaryResult,
        expect.objectContaining({ summaryType: 'url' }),
        true,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Summarization completed successfully',
        data: {
          responseMessage: {
            answer: summaryResult,
            summaryType: 'url',
            fileMetadata: null,
            metadata: expect.any(Object),
          },
          conversationId: conversationId,
          messageCount: 2,
          userType: 'guest',
          userId: guestUserId,
        },
      });
      expect(mockLoggerInfo).toHaveBeenCalled();
    });

    it('should handle authenticated user summarization with existing conversation', async () => {
      const userId = 'user-456';
      const conversationId = 'conv-456';
      const summaryResult = 'Authored summary.';
      const existingMessages = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ];

      req.body = { message: 'new query', conversationId: conversationId };
      req.user = { userId: userId };
      req.isGuest = false;
      mockSummaryService.handleSummaryConversation.mockResolvedValueOnce({
        conversationId: conversationId,
        messages: existingMessages,
        messageCount: existingMessages.length,
      });
      mockSummarizerAppInvoke.mockResolvedValueOnce({ summary: summaryResult });

      await summaryController.summarizeContent(req, res);

      expect(mockSummaryService.handleSummaryConversation).toHaveBeenCalledWith(
        userId,
        conversationId,
        req.body.message,
        false,
        req
      );
      expect(mockSummaryService.addSummaryQueryMessage).toHaveBeenCalledWith(
        conversationId,
        userId,
        req.body.message,
        false,
        req
      );
      expect(mockSummarizerAppInvoke).toHaveBeenCalledWith({
        user_input: req.body.message,
        history: [
          ...existingMessages,
          { role: 'user', content: req.body.message },
        ],
        isFilePassed: false,
      });
      expect(mockSummaryService.addSummaryResultMessage).toHaveBeenCalledWith(
        conversationId,
        userId,
        summaryResult,
        expect.objectContaining({ summaryType: 'url' }),
        false,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Summarization completed successfully',
        data: {
          responseMessage: {
            answer: summaryResult,
            summaryType: 'url',
            fileMetadata: null,
            metadata: expect.any(Object),
          },
          conversationId: conversationId,
          messageCount: existingMessages.length + 2,
          userType: 'authenticated',
          userId: undefined,
        },
      });
    });

    it('should process and summarize an uploaded PDF file', async () => {
      const userId = 'user-789';
      const conversationId = 'conv-789';
      const pdfContent = 'This is the extracted text from a PDF file.';
      const summaryResult = 'PDF summary.';

      req.body = { message: 'Summarize this PDF' };
      req.user = { userId: userId };
      req.file = {
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('PDF_FILE_BUFFER'),
        size: 1024,
      };
      mockSummaryService.handleSummaryConversation.mockResolvedValueOnce({
        conversationId: conversationId,
        messages: [],
        messageCount: 0,
      });
      mockPDFParseGetText.mockResolvedValueOnce({ text: pdfContent });
      mockSummarizerAppInvoke.mockResolvedValueOnce({ summary: summaryResult });

      await summaryController.summarizeContent(req, res);

      expect(mockPDFParseConstructor).toHaveBeenCalledWith({ data: req.file.buffer });
      expect(mockSummaryService.addSummaryQueryMessage).toHaveBeenCalledWith(
        conversationId,
        userId,
        'Summarize the uploaded file: document.pdf',
        false,
        req
      );
      expect(mockSummarizerAppInvoke).toHaveBeenCalledWith({
        user_input: pdfContent,
        history: [
          { role: 'user', content: 'Summarize the uploaded file: document.pdf' },
        ],
        isFilePassed: true,
      });
      expect(mockSummaryService.addSummaryResultMessage).toHaveBeenCalledWith(
        conversationId,
        userId,
        summaryResult,
        expect.objectContaining({
          summaryType: 'file',
          fileMetadata: expect.objectContaining({
            fileName: 'document.pdf',
            fileType: 'application/pdf',
            fileSize: 1024,
          }),
        }),
        false,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Summarization completed successfully',
        data: {
          responseMessage: {
            answer: summaryResult,
            summaryType: 'file',
            fileMetadata: expect.objectContaining({
              fileName: 'document.pdf',
              fileType: 'application/pdf',
              fileSize: 1024,
            }),
            metadata: expect.any(Object),
          },
          conversationId: conversationId,
          messageCount: 2,
          userType: 'authenticated',
          userId: undefined,
        },
      });
    });

    it('should process and summarize an uploaded DOCX file', async () => {
      const userId = 'user-docx';
      const conversationId = 'conv-docx';
      const docxContent = 'This is the extracted text from a DOCX file.';
      const summaryResult = 'DOCX summary.';

      req.body = { message: 'Summarize this DOCX' };
      req.user = { userId: userId };
      req.file = {
        originalname: 'report.docx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('DOCX_FILE_BUFFER'),
        size: 2048,
      };
      mockSummaryService.handleSummaryConversation.mockResolvedValueOnce({
        conversationId: conversationId,
        messages: [],
        messageCount: 0,
      });
      mockMammothExtractRawText.mockResolvedValueOnce({ value: docxContent });
      mockSummarizerAppInvoke.mockResolvedValueOnce({ summary: summaryResult });

      await summaryController.summarizeContent(req, res);

      expect(mockMammothExtractRawText).toHaveBeenCalledWith({
        buffer: req.file.buffer,
      });
      expect(mockSummarizerAppInvoke).toHaveBeenCalledWith({
        user_input: docxContent,
        history: [
          { role: 'user', content: 'Summarize the uploaded file: report.docx' },
        ],
        isFilePassed: true,
      });
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Summarization completed successfully',
        data: expect.objectContaining({
          responseMessage: expect.objectContaining({
            answer: summaryResult,
            summaryType: 'file',
            fileMetadata: expect.objectContaining({
              fileName: 'report.docx',
              fileType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              fileSize: 2048,
            }),
          }),
        }),
      });
    });

    it('should process and summarize an uploaded CSV file', async () => {
      const userId = 'user-csv';
      const conversationId = 'conv-csv';
      const csvData = [{ header1: 'value1', header2: 'value2' }];
      const csvContent = JSON.stringify(csvData, null, 2);
      const summaryResult = 'CSV summary.';

      req.body = { message: 'Summarize this CSV' };
      req.user = { userId: userId };
      req.file = {
        originalname: 'data.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from('header1,header2\nvalue1,value2'),
        size: 50,
      };
      mockSummaryService.handleSummaryConversation.mockResolvedValueOnce({
        conversationId: conversationId,
        messages: [],
        messageCount: 0,
      });
      mockCsvParse.mockRecords = csvData;
      mockSummarizerAppInvoke.mockResolvedValueOnce({ summary: summaryResult });

      await summaryController.summarizeContent(req, res);

      expect(mockCsvParse).toHaveBeenCalledWith(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
      });
      expect(mockSummarizerAppInvoke).toHaveBeenCalledWith({
        user_input: 'header1, header2\nvalue1, value2',
        history: [
          { role: 'user', content: 'Summarize the uploaded file: data.csv' },
        ],
        isFilePassed: true,
      });
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Summarization completed successfully',
        data: expect.objectContaining({
          responseMessage: expect.objectContaining({
            answer: summaryResult,
            summaryType: 'file',
            fileMetadata: expect.objectContaining({
              fileName: 'data.csv',
              fileType: 'text/csv',
              fileSize: 50,
            }),
          }),
        }),
      });
    });

    it('should process and summarize an uploaded TXT file', async () => {
      const userId = 'user-txt';
      const conversationId = 'conv-txt';
      const txtContent = 'This is a plain text file.';
      const summaryResult = 'TXT summary.';

      req.body = { message: 'Summarize this TXT' };
      req.user = { userId: userId };
      req.file = {
        originalname: 'notes.txt',
        mimetype: 'text/plain',
        buffer: Buffer.from(txtContent),
        size: txtContent.length,
      };
      mockSummaryService.handleSummaryConversation.mockResolvedValueOnce({
        conversationId: conversationId,
        messages: [],
        messageCount: 0,
      });
      mockSummarizerAppInvoke.mockResolvedValueOnce({ summary: summaryResult });

      await summaryController.summarizeContent(req, res);

      expect(mockSummarizerAppInvoke).toHaveBeenCalledWith({
        user_input: txtContent,
        history: [
          { role: 'user', content: 'Summarize the uploaded file: notes.txt' },
        ],
        isFilePassed: true,
      });
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Summarization completed successfully',
        data: expect.objectContaining({
          responseMessage: expect.objectContaining({
            answer: summaryResult,
            summaryType: 'file',
            fileMetadata: expect.objectContaining({
              fileName: 'notes.txt',
              fileType: 'text/plain',
              fileSize: txtContent.length,
            }),
          }),
        }),
      });
    });

    it('should return INTERNAL_SERVER_ERROR for unsupported file types', async () => {
      const userId = 'user-unsupported';
      const conversationId = 'conv-unsupported';

      req.body = { message: 'Summarize this unsupported file' };
      req.user = { userId: userId };
      req.file = {
        originalname: 'image.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from('IMAGE_BUFFER'),
        size: 1000,
      };
      mockSummaryService.handleSummaryConversation.mockResolvedValueOnce({
        conversationId: conversationId,
        messages: [],
        messageCount: 0,
      });

      await summaryController.summarizeContent(req, res);

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Summarizer Assistant Error:',
        expect.any(Error)
      );
      expect(mockSummaryService.addErrorMessage).toHaveBeenCalledWith(
        conversationId,
        userId,
        'I apologize, but an error occurred while processing your summarization request.',
        expect.any(Error),
        false,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message:
          'An internal error occurred while processing your summarization request',
        data: {
          conversationId: conversationId,
          userType: 'authenticated',
          error: 'Unsupported file type: image/jpeg',
        },
      });
    });

    it('should handle errors during summarization and save error message', async () => {
      const userId = 'user-error';
      const conversationId = 'conv-error';
      const errorMessage = 'AI model failed to respond.';

      req.body = { message: 'problematic query' };
      req.user = { userId: userId };
      mockSummaryService.handleSummaryConversation.mockResolvedValueOnce({
        conversationId: conversationId,
        messages: [],
        messageCount: 0,
      });
      mockSummarizerAppInvoke.mockRejectedValueOnce(new Error(errorMessage));

      await summaryController.summarizeContent(req, res);

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Summarizer Assistant Error:',
        expect.any(Error)
      );
      expect(mockSummaryService.addErrorMessage).toHaveBeenCalledWith(
        conversationId,
        userId,
        'I apologize, but an error occurred while processing your summarization request.',
        expect.any(Error),
        false,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message:
          'An internal error occurred while processing your summarization request',
        data: {
          conversationId: conversationId,
          userType: 'authenticated',
          error: errorMessage,
        },
      });
    });

    it('should handle errors during summarization even if conversationId is not yet established', async () => {
      const guestUserId = 'guest-error-no-conv';
      const generatedConversationId = 'generated-conv-id';
      const errorMessage = 'AI model failed to respond.';

      req.body = { message: 'problematic query' };
      req.isGuest = true;
      req.user = null;
      mockSummaryService.generateGuestUserId.mockReturnValueOnce(guestUserId);
      mockSummaryService.generateSummaryConversationId.mockReturnValue(
        generatedConversationId
      );
      // Simulate error before handleSummaryConversation can return a valid conversationId
      mockSummaryService.handleSummaryConversation.mockRejectedValueOnce(
        new Error('DB connection failed')
      );

      await summaryController.summarizeContent(req, res);

      expect(mockLoggerError).toHaveBeenCalledWith(
        'Summarizer Assistant Error:',
        expect.any(Error)
      );
      // It should still try to save the error message using the generated conversation ID
      expect(mockSummaryService.addErrorMessage).toHaveBeenCalledWith(
        generatedConversationId,
        guestUserId,
        'I apologize, but an error occurred while processing your summarization request.',
        expect.any(Error),
        true,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message:
          'An internal error occurred while processing your summarization request',
        data: {
          conversationId: generatedConversationId,
          userType: 'guest',
          error: 'DB connection failed',
        },
      });
    });
  });

  describe('getSummaryStats', () => {
    it('should return UNAUTHORIZED for guest users', async () => {
      req.isGuest = true;
      req.user = null;

      await summaryController.getSummaryStats(req, res);

      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'Statistics are only available for authenticated users',
      });
    });

    it('should return UNAUTHORIZED if userId is missing for authenticated user', async () => {
      req.isGuest = false;
      req.user = {}; // Authenticated but no userId/ _id

      await summaryController.getSummaryStats(req, res);

      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return summary statistics for an authenticated user', async () => {
      const userId = 'auth-user-1';
      const statsData = { totalSummaries: 10, fileSummaries: 5 };

      req.user = { userId: userId };
      req.isGuest = false;
      mockSummaryService.getSummaryStats.mockResolvedValueOnce(statsData);

      await summaryController.getSummaryStats(req, res);

      expect(mockSummaryService.getSummaryStats).toHaveBeenCalledWith(
        userId,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Summary statistics retrieved successfully',
        data: statsData,
      });
    });

    it('should handle errors during statistics retrieval', async () => {
      const userId = 'auth-user-error';
      const errorMessage = 'Database error fetching stats.';

      req.user = { userId: userId };
      req.isGuest = false;
      mockSummaryService.getSummaryStats.mockRejectedValueOnce(
        new Error(errorMessage)
      );

      await expect(summaryController.getSummaryStats(req, res)).rejects.toThrow(errorMessage);
    });
  });
});