import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';

// Mock external dependencies first
vi.mock('mongoose', () => ({
  Types: {
    ObjectId: vi.fn(() => ({
      toString: vi.fn(() => 'mockObjectId'),
    })),
  },
}));

// Mock path.join to return predictable paths
vi.mock('path', () => ({
  join: vi.fn((...args) => {
    // This mock ensures that any call to path.join returns a predictable,
    // platform-agnostic path for testing purposes.
    // For example, if the call is path.join(process.cwd(), 'output', 'reports', 'file.pdf'),
    // it will return '/mock/base/path/output/reports/file.pdf'.
    // This avoids issues with actual OS path separators and process.cwd() variations.
    if (args.includes('output') && args.includes('reports')) {
      return `/mock/base/path/output/reports/${args[args.length - 1]}`;
    }
    return args.join('/');
  }),
}));

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(() => Promise.resolve()),
  },
}));

// Mock GoogleGenerativeAI and its methods
const mockGenerateContent = vi.fn(() =>
  Promise.resolve({
    response: {
      text: vi.fn(() => '{"mockKey": "mockValue"}'),
    },
  })
);
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));
const mockGoogleGenerativeAI = vi.fn(() => ({
  getGenerativeModel: mockGetGenerativeModel,
}));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: mockGoogleGenerativeAI,
  // Export the specific mock for generateContent so we can control its return value
  _mockGenerateContent: mockGenerateContent,
}));

vi.mock('../../../errors/ApiError.js', () => ({
  default: class ApiError extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../conversations/conversation.service.js', () => ({
  conversationService: {
    createConversation: vi.fn(),
    addMessageToConversation: vi.fn(),
  },
}));

vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers: {
    getConversationById: vi.fn(),
  },
}));

vi.mock('./utils/fileParser.js', () => ({
  extractContentFromFiles: vi.fn(),
}));

vi.mock('./utils/reportExporter.js', () => ({
  exportReport: vi.fn(),
}));

vi.mock('./middlewares/uploadReportFiles.js', () => ({
  cleanupUploadedFiles: vi.fn(),
}));

vi.mock('./services/gcsUploadService.js', () => ({
  uploadReportToGCS: vi.fn(),
}));

vi.mock('./report.constant.js', () => ({
  REPORT_CONFIG: {
    MODEL: 'gemini-pro',
    TEMPERATURE: 0.7,
    MAX_TOKENS: 4096,
  },
  REPORT_INTENTS: {
    GENERATE: 'generate_report',
    MODIFY: 'modify_report',
    EXPORT: 'export_report',
    ANALYZE: 'analyze_data',
    SUMMARIZE: 'summarize_content',
    COMPARE: 'compare_data',
  },
  REQUIRED_PARAMS: [],
  DEFAULT_PARAMS: {
    reportType: 'summary',
    outputFormat: 'pdf',
    tone: 'neutral',
    sections: ['introduction', 'conclusion'],
    includeTitlePage: true,
    includeTableOfContents: false,
    includeExecutiveSummary: false,
  },
  CONVERSATION_CATEGORY: 'report',
  CONVERSATION_MODEL: 'gemini-pro',
  TASK_STATUS: {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
  },
  SUPPORTED_OUTPUT_FORMATS: ['pdf', 'docx', 'html'],
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock_gemini_key',
  },
}));

// Now import the module under test
import { reportService } from './report.service.js';

// Get references to the mocked functions for spying/assertion
const { conversationService } = await import(
  '../conversations/conversation.service.js'
);
const { conversationHelpers } = await import(
  '../conversations/conversation.helpers.js'
);
const { extractContentFromFiles } = await import('./utils/fileParser.js');
const { exportReport } = await import('./utils/reportExporter.js');
const { cleanupUploadedFiles } = await import(
  './middlewares/uploadReportFiles.js'
);
const { uploadReportToGCS } = await import('./services/gcsUploadService.js');
const { logger } = await import('../../../shared/logger.js');
const fsPromises = (await import('fs')).promises;
const mongoose = (await import('mongoose')).default;
const path = await import('path');
const { _mockGenerateContent } = await import('@google/generative-ai');
const {
  REPORT_CONFIG,
  REPORT_INTENTS,
  DEFAULT_PARAMS,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  SUPPORTED_OUTPUT_FORMATS,
} = await import('./report.constant.js');

const MOCK_USER_ID = 'testUserId';
const MOCK_CONVERSATION_ID = 'testConversationId';
const MOCK_REPORT_ID = 'testReportId';
const MOCK_GCS_PUBLIC_URL = 'http://mock.gcs/url/testReportId.pdf';
const MOCK_GCS_PATH = 'mock/gcs/path/testReportId.pdf';
const MOCK_REPORT_FILE_PATH = '/mock/base/path/output/reports/testReportId.pdf';

const resetAllMocks = () => {
  vi.clearAllMocks();
  _mockGenerateContent.mockResolvedValue({
    response: {
      text: vi.fn(() => '{"mockKey": "mockValue"}'),
    },
  });
  conversationService.createConversation.mockResolvedValue({
    conversationId: MOCK_CONVERSATION_ID,
    userId: MOCK_USER_ID,
    title: 'Report: user message...',
    metadata: {
      category: CONVERSATION_CATEGORY,
      model: CONVERSATION_MODEL,
      userType: 'authenticated',
      isGuest: false,
      collectedParams: {},
    },
    messages: [],
  });
  conversationService.addMessageToConversation.mockResolvedValue({});
  conversationHelpers.getConversationById.mockResolvedValue({
    conversationId: MOCK_CONVERSATION_ID,
    userId: MOCK_USER_ID,
    messages: [],
  });
  extractContentFromFiles.mockResolvedValue([]);
  exportReport.mockResolvedValue(MOCK_REPORT_FILE_PATH);
  uploadReportToGCS.mockResolvedValue({
    publicUrl: MOCK_GCS_PUBLIC_URL,
    gcsPath: MOCK_GCS_PATH,
    bucket: 'mock-bucket',
  });
  cleanupUploadedFiles.mockImplementation(() => {});
  fsPromises.mkdir.mockResolvedValue(undefined);
  mongoose.Types.ObjectId.mockImplementation(() => ({
    toString: vi.fn(() => 'mockObjectId'),
  }));
  path.join.mockImplementation((...args) => {
    if (args.includes('output') && args.includes('reports')) {
      return `/mock/base/path/output/reports/${args[args.length - 1]}`;
    }
    return args.join('/');
  });
  // Mock Math.random for predictable reportId generation
  vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
  vi.spyOn(Date, 'now').mockReturnValue(1678886400000); // Fixed timestamp
};

describe('reportService', () => {
  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateGuestUserId', () => {
    it('should generate a unique guest user ID', () => {
      const userId = reportService.generateGuestUserId();
      expect(mongoose.Types.ObjectId).toHaveBeenCalledTimes(1);
      expect(userId).toBe('mockObjectId');
    });
  });

  describe('generateConversationId', () => {
    it('should generate a unique conversation ID', () => {
      const conversationId = reportService.generateConversationId();
      expect(conversationId).toMatch(/^report_\d+_[a-z0-9]{9}$/);
      expect(conversationId).toBe('report_1678886400000_123456789');
    });
  });

  describe('generateReportContent', () => {
    const mockReportData = {
      title: 'Generated Report Title',
      subtitle: 'Subtitle',
      executiveSummary: 'Summary',
      sections: [{ title: 'Intro', content: 'Content' }],
      metadata: { reportType: 'analytical', tone: 'professional' },
    };

    it('should generate report content based on provided parameters', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn(() => JSON.stringify(mockReportData)) },
      });

      const params = {
        content: 'User provided content for the report.',
        title: 'My Custom Report',
        reportType: 'analytical',
        tone: 'professional',
        sections: ['introduction', 'findings'],
        includeTitlePage: true,
        includeTableOfContents: true,
        includeExecutiveSummary: true,
        customInstructions: 'Be very detailed.',
      };

      const result = await reportService.generateReportContent(params);

      expect(_mockGenerateContent).toHaveBeenCalledTimes(1);
      const prompt = _mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
      expect(prompt).toContain('You are an expert report writer.');
      expect(prompt).toContain('Generate a comprehensive analytical report with a professional tone.');
      expect(prompt).toContain('The report should include the following sections: introduction, findings.');
      expect(prompt).toContain('Additional instructions: Be very detailed.');
      expect(prompt).toContain('Generate a report titled "My Custom Report" based on the following content:');
      expect(prompt).toContain('User provided content for the report.');
      expect(prompt).toContain('Respond with valid JSON only.');

      expect(result).toEqual(
        expect.objectContaining({
          ...mockReportData,
          includeTitlePage: true,
          includeTableOfContents: true,
          includeExecutiveSummary: true,
          metadata: expect.objectContaining({
            reportType: 'analytical',
            tone: 'professional',
            generatedAt: expect.any(String),
          }),
        })
      );
      expect(logger.info).toHaveBeenCalledWith('Report content generated successfully');
    });

    it('should use default parameters if not provided', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn(() => JSON.stringify(mockReportData)) },
      });

      const params = {
        content: 'Simple content.',
      };

      await reportService.generateReportContent(params);

      const prompt = _mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
      expect(prompt).toContain(`Generate a comprehensive ${DEFAULT_PARAMS.reportType} report with a ${DEFAULT_PARAMS.tone} tone.`);
      expect(prompt).toContain(`The report should include the following sections: ${DEFAULT_PARAMS.sections.join(', ')}.`);
    });

    it('should handle AI response in markdown code block', async () => {
      const markdownResponse = '```json\n' + JSON.stringify(mockReportData) + '\n```';
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn(() => markdownResponse) },
      });

      const result = await reportService.generateReportContent({ content: 'test' });
      expect(result.title).toBe(mockReportData.title);
    });

    it('should throw ApiError on AI generation failure', async () => {
      _mockGenerateContent.mockRejectedValueOnce(new Error('AI error'));

      await expect(
        reportService.generateReportContent({ content: 'test' })
      ).rejects.toThrow(httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error generating report content:',
        expect.any(Error)
      );
    });

    it('should throw ApiError on invalid JSON response', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn(() => 'invalid json') },
      });

      await expect(
        reportService.generateReportContent({ content: 'test' })
      ).rejects.toThrow(httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error generating report content:',
        expect.any(Error)
      );
    });
  });

  describe('analyzeConversationalRequest', () => {
    const mockAnalysis = {
      intent: REPORT_INTENTS.GENERATE,
      parameters: {
        reportType: 'summary',
        outputFormat: 'pdf',
        title: 'Sales Report',
      },
      needsMoreInfo: false,
      missingParams: [],
      response: 'I can generate a sales report for you in PDF format.',
    };

    it('should analyze user message and conversation history', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn(() => JSON.stringify(mockAnalysis)) },
      });

      const userMessage = 'Generate a sales report in PDF.';
      const conversationHistory = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'How can I help?' },
      ];

      const result = await reportService.analyzeConversationalRequest(
        userMessage,
        conversationHistory
      );

      expect(_mockGenerateContent).toHaveBeenCalledTimes(1);
      const prompt = _mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
      expect(prompt).toContain('You are an AI assistant that analyzes user requests for report generation.');
      expect(prompt).toContain(`Available report types: ${Object.values(REPORT_INTENTS).join(', ')}`);
      expect(prompt).toContain(`Available output formats: ${SUPPORTED_OUTPUT_FORMATS.join(', ')}`);
      expect(prompt).toContain('User: Hello');
      expect(prompt).toContain('Assistant: How can I help?');
      expect(prompt).toContain(`User: ${userMessage}`);
      expect(prompt).toContain('Respond with valid JSON only.');

      expect(result).toEqual(mockAnalysis);
      expect(logger.info).toHaveBeenCalledWith('Conversation analysis:', mockAnalysis);
    });

    it('should handle AI response in markdown code block', async () => {
      const markdownResponse = '```json\n' + JSON.stringify(mockAnalysis) + '\n```';
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn(() => markdownResponse) },
      });

      const result = await reportService.analyzeConversationalRequest('test');
      expect(result.intent).toBe(mockAnalysis.intent);
    });

    it('should throw ApiError on AI analysis failure', async () => {
      _mockGenerateContent.mockRejectedValueOnce(new Error('AI analysis error'));

      await expect(
        reportService.analyzeConversationalRequest('test')
      ).rejects.toThrow(httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error analyzing conversational request:',
        expect.any(Error)
      );
    });

    it('should throw ApiError on invalid JSON response', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn(() => 'invalid json') },
      });

      await expect(
        reportService.analyzeConversationalRequest('test')
      ).rejects.toThrow(httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error analyzing conversational request:',
        expect.any(Error)
      );
    });
  });

  describe('processConversationalRequest', () => {
    const mockUserMessage = 'Generate a summary report about the attached files.';
    const mockFiles = [
      {
        fieldname: 'files',
        originalname: 'file1.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        destination: '/tmp',
        filename: 'file1.txt',
        path: '/tmp/file1.txt',
        size: 1024,
      },
    ];
    const mockExtractedContent = [
      { filename: 'file1.txt', content: 'Content of file 1.' },
    ];
    const mockAnalysisReportReady = {
      intent: REPORT_INTENTS.GENERATE,
      parameters: {
        reportType: 'summary',
        outputFormat: 'pdf',
        title: 'Summary Report',
      },
      needsMoreInfo: false,
      missingParams: [],
      response: 'I have enough information to generate your summary report.',
    };
    const mockAnalysisNeedsMoreInfo = {
      intent: REPORT_INTENTS.GENERATE,
      parameters: {},
      needsMoreInfo: true,
      missingParams: ['reportType', 'outputFormat'],
      response: 'What type of report would you like and in what format?',
    };
    const mockGeneratedReportData = {
      title: 'Generated Summary Report',
      sections: [{ title: 'Introduction', content: 'Report content.' }],
      metadata: { reportType: 'summary', tone: 'neutral' },
    };

    it('should create a new conversation, process files, generate report, and upload', async () => {
      conversationService.createConversation.mockResolvedValueOnce({
        conversationId: MOCK_CONVERSATION_ID,
        userId: MOCK_USER_ID,
        title: `Report: ${mockUserMessage.substring(0, 50)}...`,
        metadata: {
          category: CONVERSATION_CATEGORY,
          model: CONVERSATION_MODEL,
          userType: 'authenticated',
          isGuest: false,
          collectedParams: {},
        },
        messages: [],
      });
      conversationHelpers.getConversationById.mockResolvedValueOnce({
        conversationId: MOCK_CONVERSATION_ID,
        userId: MOCK_USER_ID,
        messages: [
          { role: 'user', content: mockUserMessage },
          { role: 'assistant', content: 'How can I help?' },
        ],
      });
      extractContentFromFiles.mockResolvedValueOnce(mockExtractedContent);
      _mockGenerateContent
        .mockResolvedValueOnce({
          response: { text: vi.fn(() => JSON.stringify(mockAnalysisReportReady)) },
        })
        .mockResolvedValueOnce({
          response: { text: vi.fn(() => JSON.stringify(mockGeneratedReportData)) },
        });

      const result = await reportService.processConversationalRequest(
        MOCK_USER_ID,
        mockUserMessage,
        null, // new conversation
        false,
        mockFiles
      );

      expect(conversationService.createConversation).toHaveBeenCalledTimes(1);
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({ userId: MOCK_USER_ID }),
        expect.stringMatching(/^report_\d+_[a-z0-9]{9}$/),
        null
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(2);
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        MOCK_CONVERSATION_ID,
        MOCK_USER_ID,
        expect.objectContaining({
          role: 'user',
          content: mockUserMessage,
          metadata: { hasFiles: true, fileCount: 1 },
        }),
        null
      );
      expect(conversationHelpers.getConversationById).toHaveBeenCalledTimes(1);
      expect(extractContentFromFiles).toHaveBeenCalledWith(mockFiles);
      expect(cleanupUploadedFiles).toHaveBeenCalledWith(mockFiles);
      expect(_mockGenerateContent).toHaveBeenCalledTimes(2); // One for analysis, one for generation
      expect(fsPromises.mkdir).toHaveBeenCalledWith(
        '/mock/base/path/output/reports',
        { recursive: true }
      );
      expect(exportReport).toHaveBeenCalledWith(
        expect.objectContaining({ title: mockGeneratedReportData.title }),
        mockAnalysisReportReady.parameters.outputFormat,
        expect.stringContaining(MOCK_REPORT_ID)
      );
      expect(uploadReportToGCS).toHaveBeenCalledWith(
        MOCK_REPORT_FILE_PATH,
        expect.stringContaining(`${MOCK_REPORT_ID}.pdf`),
        MOCK_USER_ID,
        MOCK_CONVERSATION_ID
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        MOCK_CONVERSATION_ID,
        MOCK_USER_ID,
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('I\'ve generated your summary report in PDF format.'),
          metadata: expect.objectContaining({
            reportGenerated: true,
            reportId: expect.stringContaining(MOCK_REPORT_ID),
            publicUrl: MOCK_GCS_PUBLIC_URL,
          }),
        }),
        null
      );

      expect(result).toEqual(
        expect.objectContaining({
          conversationId: MOCK_CONVERSATION_ID,
          userId: MOCK_USER_ID,
          success: true,
          needsMoreInfo: false,
          response: expect.stringContaining('I\'ve generated your summary report in PDF format.'),
          report: expect.objectContaining({
            reportId: expect.stringContaining(MOCK_REPORT_ID),
            title: mockGeneratedReportData.title,
            outputFormat: 'pdf',
            filePath: MOCK_REPORT_FILE_PATH,
            downloadUrl: expect.stringContaining(`/api/v1/reports/download/${MOCK_REPORT_ID}.pdf`),
            publicUrl: MOCK_GCS_PUBLIC_URL,
            gcsPath: MOCK_GCS_PATH,
          }),
        })
      );
    });

    it('should retrieve existing conversation if conversationId is provided', async () => {
      conversationHelpers.getConversationById.mockResolvedValueOnce({
        conversationId: MOCK_CONVERSATION_ID,
        userId: MOCK_USER_ID,
        messages: [{ role: 'user', content: 'Previous message' }],
      });
      _mockGenerateContent
        .mockResolvedValueOnce({
          response: { text: vi.fn(() => JSON.stringify(mockAnalysisReportReady)) },
        })
        .mockResolvedValueOnce({
          response: { text: vi.fn(() => JSON.stringify(mockGeneratedReportData)) },
        });

      await reportService.processConversationalRequest(
        MOCK_USER_ID,
        mockUserMessage,
        MOCK_CONVERSATION_ID
      );

      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        MOCK_CONVERSATION_ID,
        MOCK_USER_ID,
        null
      );
    });

    it('should create new conversation if conversationId is provided but not found', async () => {
      conversationHelpers.getConversationById.mockRejectedValueOnce(
        new Error('Conversation not found')
      ); // Simulate not found
      conversationService.createConversation.mockResolvedValueOnce({
        conversationId: 'newlyCreatedConvId',
        userId: MOCK_USER_ID,
        messages: [],
      });
      conversationHelpers.getConversationById.mockResolvedValueOnce({
        conversationId: 'newlyCreatedConvId',
        userId: MOCK_USER_ID,
        messages: [],
      }); // For subsequent get
      _mockGenerateContent
        .mockResolvedValueOnce({
          response: { text: vi.fn(() => JSON.stringify(mockAnalysisReportReady)) },
        })
        .mockResolvedValueOnce({
          response: { text: vi.fn(() => JSON.stringify(mockGeneratedReportData)) },
        });

      await reportService.processConversationalRequest(
        MOCK_USER_ID,
        mockUserMessage,
        MOCK_CONVERSATION_ID
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        MOCK_CONVERSATION_ID,
        MOCK_USER_ID,
        null
      );
      expect(conversationService.createConversation).toHaveBeenCalledTimes(1);
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({ userId: MOCK_USER_ID }),
        MOCK_CONVERSATION_ID, // Should use the provided ID for new conversation
        null
      );
      expect(logger.warn).toHaveBeenCalledWith(
        `Conversation ${MOCK_CONVERSATION_ID} not found, creating new one`
      );
    });

    it('should return needsMoreInfo if AI analysis indicates it', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn(() => JSON.stringify(mockAnalysisNeedsMoreInfo)) },
      });

      const result = await reportService.processConversationalRequest(
        MOCK_USER_ID,
        mockUserMessage
      );

      expect(_mockGenerateContent).toHaveBeenCalledTimes(1); // Only analysis, no generation
      expect(generateReportContent).not.toHaveBeenCalled();
      expect(exportReport).not.toHaveBeenCalled();
      expect(uploadReportToGCS).not.toHaveBeenCalled();
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        MOCK_CONVERSATION_ID,
        MOCK_USER_ID,
        expect.objectContaining({
          role: 'assistant',
          content: mockAnalysisNeedsMoreInfo.response,
          metadata: {
            needsMoreInfo: true,
            missingParams: mockAnalysisNeedsMoreInfo.missingParams,
          },
        }),
        null
      );

      expect(result).toEqual(
        expect.objectContaining({
          conversationId: MOCK_CONVERSATION_ID,
          userId: MOCK_USER_ID,
          success: true,
          needsMoreInfo: true,
          response: mockAnalysisNeedsMoreInfo.response,
          missingParams: mockAnalysisNeedsMoreInfo.missingParams,
        })
      );
    });

    it('should handle errors during file processing gracefully', async () => {
      extractContentFromFiles.mockRejectedValueOnce(new Error('File processing failed'));
      _mockGenerateContent
        .mockResolvedValueOnce({
          response: { text: vi.fn(() => JSON.stringify(mockAnalysisReportReady)) },
        })
        .mockResolvedValueOnce({
          response: { text: vi.fn(() => JSON.stringify(mockGeneratedReportData)) },
        });

      const result = await reportService.processConversationalRequest(
        MOCK_USER_ID,
        mockUserMessage,
        null,
        false,
        mockFiles
      );

      expect(extractContentFromFiles).toHaveBeenCalledWith(mockFiles);
      expect(cleanupUploadedFiles).toHaveBeenCalledWith(mockFiles);
      expect(logger.error).toHaveBeenCalledWith(
        'Error processing files:',
        expect.any(Error)
      );
      // Should still proceed with report generation based on user message only
      expect(_mockGenerateContent).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    it('should throw error if conversation handling fails', async () => {
      conversationService.createConversation.mockRejectedValueOnce(
        new Error('Failed to create conversation')
      );

      await expect(
        reportService.processConversationalRequest(MOCK_USER_ID, mockUserMessage)
      ).rejects.toThrow(httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error handling report conversation:',
        expect.any(Error)
      );
    });

    it('should throw error if adding user message fails', async () => {
      conversationService.addMessageToConversation.mockRejectedValueOnce(
        new Error('Failed to add message')
      );

      await expect(
        reportService.processConversationalRequest(MOCK_USER_ID, mockUserMessage)
      ).rejects.toThrow(httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error adding message to conversation:',
        expect.any(Error)
      );
    });

    it('should throw error if AI analysis fails', async () => {
      _mockGenerateContent.mockRejectedValueOnce(new Error('AI analysis error'));

      await expect(
        reportService.processConversationalRequest(MOCK_USER_ID, mockUserMessage)
      ).rejects.toThrow(httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error analyzing conversational request:',
        expect.any(Error)
      );
    });

    it('should throw error if report generation fails', async () => {
      _mockGenerateContent
        .mockResolvedValueOnce({
          response: { text: vi.fn(() => JSON.stringify(mockAnalysisReportReady)) },
        })
        .mockRejectedValueOnce(new Error('Report generation error'));

      await expect(
        reportService.processConversationalRequest(MOCK_USER_ID, mockUserMessage)
      ).rejects.toThrow(httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error generating report content:',
        expect.any(Error)
      );
    });

    it('should throw error if report export fails', async () => {
      _mockGenerateContent
        .mockResolvedValueOnce({
          response: { text: vi.fn(() => JSON.stringify(mockAnalysisReportReady)) },
        })
        .mockResolvedValueOnce({
          response: { text: vi.fn(() => JSON.stringify(mockGeneratedReportData)) },
        });
      exportReport.mockRejectedValueOnce(new Error('Export failed'));

      await expect(
        reportService.processConversationalRequest(MOCK_USER_ID, mockUserMessage)
      ).rejects.toThrow(expect.any(Error)); // ExportReport throws its own error
      expect(logger.error).toHaveBeenCalledWith('Error in processConversationalRequest:', expect.any(Error));
    });

    it('should throw error if GCS upload fails', async () => {
      _mockGenerateContent
        .mockResolvedValueOnce({
          response: { text: vi.fn(() => JSON.stringify(mockAnalysisReportReady)) },
        })
        .mockResolvedValueOnce({
          response: { text: vi.fn(() => JSON.stringify(mockGeneratedReportData)) },
        });
      uploadReportToGCS.mockRejectedValueOnce(new Error('GCS upload failed'));

      await expect(
        reportService.processConversationalRequest(MOCK_USER_ID, mockUserMessage)
      ).rejects.toThrow(expect.any(Error)); // uploadReportToGCS throws its own error
      expect(logger.error).toHaveBeenCalledWith('Error in processConversationalRequest:', expect.any(Error));
    });
  });

  describe('generateReport', () => {
    const mockParams = {
      content: 'Direct report content.',
      reportType: 'technical',
      outputFormat: 'docx',
      title: 'Technical Document',
    };
    const mockGeneratedReportData = {
      title: 'Generated Technical Document',
      sections: [{ title: 'Abstract', content: 'Doc content.' }],
      metadata: { reportType: 'technical', tone: 'neutral' },
    };

    it('should generate, export, and upload a report directly', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn(() => JSON.stringify(mockGeneratedReportData)) },
      });

      const result = await reportService.generateReport(mockParams, MOCK_USER_ID);

      expect(reportService.generateReportContent).toHaveBeenCalledWith(mockParams);
      expect(fsPromises.mkdir).toHaveBeenCalledWith(
        '/mock/base/path/output/reports',
        { recursive: true }
      );
      expect(exportReport).toHaveBeenCalledWith(
        expect.objectContaining({ title: mockGeneratedReportData.title }),
        mockParams.outputFormat,
        expect.stringContaining(MOCK_REPORT_ID)
      );
      expect(uploadReportToGCS).toHaveBeenCalledWith(
        MOCK_REPORT_FILE_PATH,
        expect.stringContaining(`${MOCK_REPORT_ID}.docx`),
        MOCK_USER_ID,
        expect.stringContaining(MOCK_REPORT_ID) // reportId used as conversationId for direct gen
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Report generated and uploaded to GCS: ${expect.stringContaining(MOCK_REPORT_ID)}`
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          userId: MOCK_USER_ID,
          report: expect.objectContaining({
            reportId: expect.stringContaining(MOCK_REPORT_ID),
            title: mockGeneratedReportData.title,
            outputFormat: 'docx',
            filePath: MOCK_REPORT_FILE_PATH,
            downloadUrl: expect.stringContaining(`/api/v1/reports/download/${MOCK_REPORT_ID}.docx`),
            publicUrl: MOCK_GCS_PUBLIC_URL,
            gcsPath: MOCK_GCS_PATH,
            sections: mockGeneratedReportData.sections,
            metadata: mockGeneratedReportData.metadata,
          }),
        })
      );
    });

    it('should use default output format if not provided', async () => {
      const paramsWithoutFormat = { ...mockParams, outputFormat: undefined };
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn(() => JSON.stringify(mockGeneratedReportData)) },
      });

      await reportService.generateReport(paramsWithoutFormat, MOCK_USER_ID);

      expect(exportReport).toHaveBeenCalledWith(
        expect.any(Object),
        DEFAULT_PARAMS.outputFormat,
        expect.stringContaining(MOCK_REPORT_ID)
      );
      expect(uploadReportToGCS).toHaveBeenCalledWith(
        MOCK_REPORT_FILE_PATH,
        expect.stringContaining(`${MOCK_REPORT_ID}.${DEFAULT_PARAMS.outputFormat}`),
        MOCK_USER_ID,
        expect.stringContaining(MOCK_REPORT_ID)
      );
    });

    it('should throw error if report content generation fails', async () => {
      reportService.generateReportContent = vi
        .fn()
        .mockRejectedValueOnce(new Error('Content generation failed'));

      await expect(
        reportService.generateReport(mockParams, MOCK_USER_ID)
      ).rejects.toThrow(expect.any(Error));
      expect(logger.error).toHaveBeenCalledWith(
        'Error in generateReport:',
        expect.any(Error)
      );
    });

    it('should throw error if report export fails', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn(() => JSON.stringify(mockGeneratedReportData)) },
      });
      exportReport.mockRejectedValueOnce(new Error('Export failed'));

      await expect(
        reportService.generateReport(mockParams, MOCK_USER_ID)
      ).rejects.toThrow(expect.any(Error));
      expect(logger.error).toHaveBeenCalledWith(
        'Error in generateReport:',
        expect.any(Error)
      );
    });

    it('should throw error if GCS upload fails', async () => {
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn(() => JSON.stringify(mockGeneratedReportData)) },
      });
      uploadReportToGCS.mockRejectedValueOnce(new Error('GCS upload failed'));

      await expect(
        reportService.generateReport(mockParams, MOCK_USER_ID)
      ).rejects.toThrow(expect.any(Error));
      expect(logger.error).toHaveBeenCalledWith(
        'Error in generateReport:',
        expect.any(Error)
      );
    });
  });

  describe('analyzeFiles', () => {
    const mockFiles = [
      {
        fieldname: 'files',
        originalname: 'doc1.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        destination: '/tmp',
        filename: 'doc1.pdf',
        path: '/tmp/doc1.pdf',
        size: 2048,
      },
    ];
    const mockExtractedData = [
      { filename: 'doc1.pdf', content: 'Content of document 1.' },
    ];
    const mockAnalysisResult = 'Comprehensive analysis of the provided documents.';

    it('should analyze uploaded files and return analysis', async () => {
      extractContentFromFiles.mockResolvedValueOnce(mockExtractedData);
      _mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn(() => mockAnalysisResult) },
      });

      const result = await reportService.analyzeFiles(
        mockFiles,
        'summary',
        'Focus on key findings.',
        MOCK_USER_ID
      );

      expect(extractContentFromFiles).toHaveBeenCalledWith(mockFiles);
      expect(cleanupUploadedFiles).toHaveBeenCalledWith(mockFiles);
      expect(_mockGenerateContent).toHaveBeenCalledTimes(1);
      const prompt = _mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
      expect(prompt).toContain('You are an expert data analyst.');
      expect(prompt).toContain('Provide a comprehensive summary analysis of the provided files.');
      expect(prompt).toContain('Additional instructions: Focus on key findings.');
      expect(prompt).toContain('Files content:\n--- doc1.pdf ---\nContent of document 1.');

      expect(result).toEqual({
        success: true,
        analysis: mockAnalysisResult,
        filesAnalyzed: 1,
        extractedData: mockExtractedData,
      });
    });

    it('should throw ApiError if no files are provided', async () => {
      await expect(reportService.analyzeFiles([], 'summary', '', MOCK_USER_ID)).rejects.toThrow(
        httpStatus.BAD_REQUEST
      );
      expect(logger.error).not.toHaveBeenCalled(); // Should not log error for bad request
    });

    it('should throw error if file extraction fails', async () => {
      extractContentFromFiles.mockRejectedValueOnce(new Error('Extraction error'));

      await expect(
        reportService.analyzeFiles(mockFiles, 'summary', '', MOCK_USER_ID)
      ).rejects.toThrow(expect.any(Error));
      expect(logger.error).toHaveBeenCalledWith(
        'Error analyzing files:',
        expect.any(Error)
      );
      expect(cleanupUploadedFiles).toHaveBeenCalledWith(mockFiles); // Cleanup on error
    });

    it('should throw error if AI analysis fails', async () => {
      extractContentFromFiles.mockResolvedValueOnce(mockExtractedData);
      _mockGenerateContent.mockRejectedValueOnce(new Error('AI analysis error'));

      await expect(
        reportService.analyzeFiles(mockFiles, 'summary', '', MOCK_USER_ID)
      ).rejects.toThrow(expect.any(Error));
      expect(logger.error).toHaveBeenCalledWith(
        'Error analyzing files:',
        expect.any(Error)
      );
      expect(cleanupUploadedFiles).toHaveBeenCalledWith(mockFiles); // Cleanup on error
    });
  });

  describe('Re-exports', () => {
    it('should re-export exportReport from utils/reportExporter', () => {
      const { exportReport: originalExportReport } = vi.importActual('./utils/reportExporter.js');
      expect(reportService.exportReport).toBe(originalExportReport);
    });
  });
});