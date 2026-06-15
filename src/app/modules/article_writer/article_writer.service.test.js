import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import fs from 'fs/promises';
import {
  ARTICLE_WRITER_CONFIG,
  ARTICLE_TYPES,
  WRITING_TONES,
  ARTICLE_LENGTHS,
  SYSTEM_PROMPTS,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
} from './article_writer.constant.js';
import { articleWriterService } from './article_writer.service.js';
import httpStatus from 'http-status';

// Mock external dependencies
vi.mock('mongoose', () => ({
  default: {
    Types: {
      ObjectId: vi.fn().mockImplementation(() => ({
        toString: vi.fn().mockImplementation(() => 'mockObjectIdString'),
      })),
    },
  },
}));

vi.mock('@google/generative-ai', () => {
  const mockGenerateContent = vi.fn();
  const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
    generateContent: mockGenerateContent,
  }));
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    })),
    __mockGenerateContent: mockGenerateContent,
    __mockGetGenerativeModel: mockGetGenerativeModel,
  };
});

vi.mock('@google/generative-ai/server', () => {
  const mockUploadFile = vi.fn();
  return {
    GoogleAIFileManager: vi.fn().mockImplementation(() => ({
      uploadFile: mockUploadFile,
    })),
    __mockUploadFile: mockUploadFile,
  };
});

vi.mock('../../../errors/ApiError.js', () => ({
  default: vi.fn().mockImplementation((status, message) => {
    const error = new Error(message);
    error.statusCode = status;
    return error;
  }),
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock_gemini_secret_key',
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

vi.mock('fs/promises', () => ({
  default: {
    unlink: vi.fn(),
  },
}));

// Mock constants if needed, or ensure they are correctly imported
vi.mock('./article_writer.constant.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ARTICLE_WRITER_CONFIG: {
      MODEL: 'gemini-pro',
      TEMPERATURE: 0.7,
      MAX_OUTPUT_TOKENS: 2048,
    },
    ARTICLE_TYPES: {
      GENERAL: 'general',
      BLOG_POST: 'blog_post',
      NEWS_ARTICLE: 'news_article',
    },
    WRITING_TONES: {
      PROFESSIONAL: 'professional',
      CASUAL: 'casual',
    },
    ARTICLE_LENGTHS: {
      SHORT: 'short',
      MEDIUM: 'medium',
      LONG: 'long',
      COMPREHENSIVE: 'comprehensive',
    },
    SYSTEM_PROMPTS: {
      CONVERSATIONAL: 'You are an AI assistant specialized in writing articles.',
      BLOG_POST: 'Write a compelling blog post.',
      NEWS_ARTICLE: 'Write a factual news article.',
    },
    CONVERSATION_CATEGORY: 'article_writer',
    CONVERSATION_MODEL: 'gemini-pro',
    DEFAULT_PARAMS: {
      articleType: 'general',
      tone: 'professional',
      length: 'medium',
    },
    RESPONSE_MESSAGES: {
      INITIAL_RESPONSE: 'Hello! How can I help you write an article today?',
    },
  };
});

const {
  mockGenerateContent,
  mockGetGenerativeModel,
  mockUploadFile
} = vi.hoisted(() => {
  const mockGenerateContent = GoogleGenerativeAI.__mockGenerateContent;
  const mockGetGenerativeModel = GoogleGenerativeAI.__mockGetGenerativeModel;
  const mockUploadFile = GoogleAIFileManager.__mockUploadFile;

  return {
    mockGenerateContent,
    mockGetGenerativeModel,
    mockUploadFile
  };
});

describe('articleWriterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations for specific functions if they were changed in a test
    mockGenerateContent.mockReset();
    mockGetGenerativeModel.mockReset();
    mockUploadFile.mockReset();
    ApiError.mockClear();
  });

  describe('generateGuestUserId', () => {
    it('should return a unique guest user ID', () => {
      const userId = articleWriterService.generateGuestUserId();
      expect(mongoose.Types.ObjectId).toHaveBeenCalledTimes(1);
      expect(userId).toBe('mockObjectIdString');
    });
  });

  describe('generateConversationId', () => {
    it('should return a unique conversation ID starting with "article_"', () => {
      const conversationId = articleWriterService.generateConversationId();
      expect(conversationId).toMatch(/^article_\d{13}_[a-z0-9]{9}$/);
    });
  });

  describe('handleArticleWriterConversation', () => {
    const userId = 'user123';
    const userMessage = 'Write an article about AI.';
    const mockReq = { transaction: {} };

    it('should retrieve an existing conversation if conversationId is provided and found', async () => {
      const existingConversation = {
        conversationId: 'conv123',
        userId,
        title: 'Existing Article',
        metadata: {},
        save: vi.fn(),
      };
      conversationHelpers.getConversationById.mockResolvedValue(
        existingConversation
      );

      const result = await articleWriterService.processConversationalRequest(
        userId,
        userMessage,
        'conv123',
        null,
        false,
        null,
        null,
        null,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        'conv123',
        userId,
        mockReq
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(result.conversationId).toBe('conv123');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Fetched conversation with ID: conv123')
      );
    });

    it('should create a new conversation if conversationId is provided but not found', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, 'Not found')
      ); // Simulate not found
      const newConversation = {
        conversationId: 'newConv456',
        userId,
        title: 'Article: Write an article about AI....',
        metadata: {
          category: CONVERSATION_CATEGORY,
          model: CONVERSATION_MODEL,
          userType: 'authenticated',
          isGuest: false,
          collectedParams: {},
          uploadedFiles: [],
        },
        save: vi.fn(),
      };
      conversationService.createConversation.mockResolvedValue(newConversation);

      const result = await articleWriterService.processConversationalRequest(
        userId,
        userMessage,
        'conv456',
        null,
        false,
        null,
        null,
        null,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        'conv456',
        userId,
        mockReq
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          title: 'Article: Write an article about AI....',
          metadata: expect.objectContaining({
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: 'authenticated',
            isGuest: false,
          }),
        }),
        'conv456',
        mockReq
      );
      expect(result.conversationId).toBe('newConv456');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Conversation conv456 not found, creating new one')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Created new article writer conversation newConv456 for user user123')
      );
    });

    it('should create a new conversation if no conversationId is provided', async () => {
      const newConversation = {
        conversationId: 'generatedConvId',
        userId,
        title: 'Article: Write an article about AI....',
        metadata: {
          category: CONVERSATION_CATEGORY,
          model: CONVERSATION_MODEL,
          userType: 'authenticated',
          isGuest: false,
          collectedParams: {},
          uploadedFiles: [],
        },
        save: vi.fn(),
      };
      conversationService.createConversation.mockResolvedValue(newConversation);
      vi.spyOn(articleWriterService, 'generateConversationId').mockReturnValue(
        'generatedConvId'
      );

      const result = await articleWriterService.processConversationalRequest(
        userId,
        userMessage,
        null,
        null,
        false,
        null,
        null,
        null,
        mockReq
      );

      expect(conversationHelpers.getConversationById).not.toHaveBeenCalled();
      expect(articleWriterService.generateConversationId).toHaveBeenCalledTimes(
        1
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          title: 'Article: Write an article about AI....',
          metadata: expect.objectContaining({
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: 'authenticated',
            isGuest: false,
          }),
        }),
        'generatedConvId',
        mockReq
      );
      expect(result.conversationId).toBe('generatedConvId');
    });

    it('should handle guest user correctly when creating a new conversation', async () => {
      const newConversation = {
        conversationId: 'guestConvId',
        userId,
        title: 'Article: Write an article about AI....',
        metadata: {
          category: CONVERSATION_CATEGORY,
          model: CONVERSATION_MODEL,
          userType: 'guest',
          isGuest: true,
          collectedParams: {},
          uploadedFiles: [],
        },
        save: vi.fn(),
      };
      conversationService.createConversation.mockResolvedValue(newConversation);
      vi.spyOn(articleWriterService, 'generateConversationId').mockReturnValue(
        'guestConvId'
      );

      const result = await articleWriterService.processConversationalRequest(
        userId,
        userMessage,
        null,
        null,
        true,
        null,
        null,
        null,
        mockReq
      );

      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          metadata: expect.objectContaining({
            userType: 'guest',
            isGuest: true,
          }),
        }),
        'guestConvId',
        mockReq
      );
      expect(result.conversationId).toBe('guestConvId');
    });

    it('should throw ApiError if conversation handling fails', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(
        new Error('DB error')
      );
      conversationService.createConversation.mockRejectedValue(
        new Error('DB error')
      );

      await expect(
        articleWriterService.processConversationalRequest(
          userId,
          userMessage,
          null,
          null,
          false,
          null,
          null,
          null,
          mockReq
        )
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to handle conversation'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error handling article writer conversation:',
        expect.any(Error)
      );
    });
  });

  describe('addMessage', () => {
    const conversationId = 'conv123';
    const userId = 'user123';
    const role = 'user';
    const content = 'Hello AI';
    const mockReq = { transaction: {} };

    it('should successfully add a message to the conversation', async () => {
      const updatedConversation = {
        conversationId,
        userId,
        messages: [{ role, content }],
      };
      conversationService.addMessageToConversation.mockResolvedValue(
        updatedConversation
      );

      const result = await articleWriterService.processConversationalRequest(
        userId,
        content,
        conversationId,
        null,
        false,
        null,
        null,
        null,
        mockReq
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        conversationId,
        userId,
        expect.objectContaining({
          role,
          content,
          metadata: { hasFile: false, fileName: undefined },
        }),
        mockReq
      );
      // The addMessage function is called twice in processConversationalRequest (user and assistant)
      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(2);
      expect(result.conversationId).toBe(conversationId);
    });

    it('should throw ApiError if adding message fails', async () => {
      conversationService.addMessageToConversation.mockRejectedValue(
        new Error('DB error')
      );
      conversationHelpers.getConversationById.mockResolvedValue({
        conversationId,
        userId,
        title: 'Test',
        metadata: {},
        save: vi.fn(),
      });

      await expect(
        articleWriterService.processConversationalRequest(
          userId,
          content,
          conversationId,
          null,
          false,
          null,
          null,
          null,
          mockReq
        )
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to add message'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error adding message to conversation:',
        expect.any(Error)
      );
    });
  });

  describe('processUploadedFile', () => {
    const fileInfo = {
      path: '/tmp/test.pdf',
      location: '/tmp/test.pdf',
      mimetype: 'application/pdf',
      originalName: 'test.pdf',
    };

    it('should return null if no fileInfo is provided', async () => {
      const result = await articleWriterService.processConversationalRequest(
        'user123',
        'message',
        'conv123',
        null,
        false,
        null,
        null,
        null,
        null
      );
      // In processConversationalRequest, processUploadedFile is called internally.
      // If fileInfo is null, it should return null.
      // We need to mock the other parts of processConversationalRequest to isolate this.
      // Let's test processUploadedFile directly.
      const directResult = await articleWriterService.__test__processUploadedFile(null); // Assuming it's exported for testing or directly callable
      expect(directResult).toBeNull();
    });

    it('should successfully upload a file to Gemini and return file data', async () => {
      mockUploadFile.mockResolvedValue({
        file: { uri: 'gemini://file-id', mimeType: 'application/pdf' },
      });

      const result = await articleWriterService.__test__processUploadedFile(fileInfo); // Assuming it's exported for testing

      expect(mockUploadFile).toHaveBeenCalledWith(fileInfo.path, {
        mimeType: fileInfo.mimetype,
        displayName: fileInfo.originalName,
      });
      expect(result).toEqual({
        fileUri: 'gemini://file-id',
        mimeType: 'application/pdf',
        displayName: fileInfo.originalName,
      });
      expect(logger.info).toHaveBeenCalledWith(
        `Processing file: ${fileInfo.originalName}, type: ${fileInfo.mimetype}`
      );
      expect(logger.info).toHaveBeenCalledWith(
        `File uploaded to Gemini: gemini://file-id`
      );
    });

    it('should throw ApiError if file upload fails', async () => {
      mockUploadFile.mockRejectedValue(new Error('Gemini upload error'));

      await expect(
        articleWriterService.__test__processUploadedFile(fileInfo)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to process uploaded file'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error processing file:',
        expect.any(Error)
      );
    });
  });

  describe('buildArticlePrompt', () => {
    it('should build a prompt with default parameters', () => {
      const message = 'The future of AI';
      const prompt = articleWriterService.__test__buildArticlePrompt(
        message,
        null,
        null,
        null
      );
      expect(prompt).toContain(SYSTEM_PROMPTS.CONVERSATIONAL);
      expect(prompt).toContain('Tone: professional');
      expect(prompt).toContain('Target Length: 500-1000 words');
      expect(prompt).toContain('User Request: The future of AI');
      expect(prompt).not.toContain('Article Type Instructions');
      expect(prompt).not.toContain('The user has uploaded a file');
    });

    it('should build a prompt with specific article type, tone, and length', () => {
      const message = 'Latest tech news';
      const prompt = articleWriterService.__test__buildArticlePrompt(
        message,
        ARTICLE_TYPES.NEWS_ARTICLE,
        WRITING_TONES.CASUAL,
        ARTICLE_LENGTHS.SHORT
      );
      expect(prompt).toContain(SYSTEM_PROMPTS.NEWS_ARTICLE);
      expect(prompt).toContain('Tone: casual');
      expect(prompt).toContain('Target Length: 300-500 words');
      expect(prompt).toContain('User Request: Latest tech news');
    });

    it('should include file content instruction if fileContent is provided', () => {
      const message = 'Summarize this document';
      const prompt = articleWriterService.__test__buildArticlePrompt(
        message,
        null,
        null,
        null,
        { fileUri: 'gemini://file-id' }
      );
      expect(prompt).toContain(
        'The user has uploaded a file with content to use as the basis for the article.'
      );
    });

    it('should handle unknown article type gracefully (treat as general)', () => {
      const message = 'My custom article';
      const prompt = articleWriterService.__test__buildArticlePrompt(
        message,
        'unknown_type',
        null,
        null
      );
      expect(prompt).not.toContain('Article Type Instructions');
    });

    it('should use default length if provided length is invalid', () => {
      const message = 'Test';
      const prompt = articleWriterService.__test__buildArticlePrompt(
        message,
        null,
        null,
        'invalid_length'
      );
      expect(prompt).toContain('Target Length: 500-1000 words'); // Defaults to medium
    });
  });

  describe('generateArticle', () => {
    const prompt = 'Write a short story.';
    const generatedText = 'Once upon a time...';

    it('should generate an article without file data', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => generatedText },
      });
      mockGetGenerativeModel.mockReturnValue({
        generateContent: mockGenerateContent,
      });

      const article = await articleWriterService.__test__generateArticle(prompt);

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: ARTICLE_WRITER_CONFIG.MODEL,
      });
      expect(mockGenerateContent).toHaveBeenCalledWith(prompt, {
        temperature: ARTICLE_WRITER_CONFIG.TEMPERATURE,
        maxOutputTokens: ARTICLE_WRITER_CONFIG.MAX_OUTPUT_TOKENS,
      });
      expect(article).toBe(generatedText);
    });

    it('should generate an article with file data', async () => {
      const fileData = {
        mimeType: 'application/pdf',
        fileUri: 'gemini://file-id',
      };
      mockGenerateContent.mockResolvedValue({
        response: { text: () => generatedText },
      });
      mockGetGenerativeModel.mockReturnValue({
        generateContent: mockGenerateContent,
      });

      const article = await articleWriterService.__test__generateArticle(
        prompt,
        fileData
      );

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: ARTICLE_WRITER_CONFIG.MODEL,
      });
      expect(mockGenerateContent).toHaveBeenCalledWith(
        [
          {
            fileData: {
              mimeType: fileData.mimeType,
              fileUri: fileData.fileUri,
            },
          },
          { text: prompt },
        ],
        {
          temperature: ARTICLE_WRITER_CONFIG.TEMPERATURE,
          maxOutputTokens: ARTICLE_WRITER_CONFIG.MAX_OUTPUT_TOKENS,
        }
      );
      expect(article).toBe(generatedText);
    });

    it('should throw ApiError if article generation fails', async () => {
      mockGenerateContent.mockRejectedValue(new Error('Gemini generation error'));
      mockGetGenerativeModel.mockReturnValue({
        generateContent: mockGenerateContent,
      });

      await expect(
        articleWriterService.__test__generateArticle(prompt)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to generate article'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error generating article with Gemini:',
        expect.any(Error)
      );
    });
  });

  describe('processConversationalRequest', () => {
    const userId = 'user123';
    const message = 'Write an article about the benefits of unit testing.';
    const conversationId = 'conv123';
    const mockReq = { transaction: {} };
    const mockGeneratedArticle = 'Unit testing is great...';

    beforeEach(() => {
      // Mock successful conversation handling
      conversationHelpers.getConversationById.mockResolvedValue({
        conversationId,
        userId,
        title: 'Existing Article',
        metadata: { uploadedFiles: [] },
        save: vi.fn(),
      });
      conversationService.createConversation.mockResolvedValue({
        conversationId: 'newConvId',
        userId,
        title: 'New Article',
        metadata: { uploadedFiles: [] },
        save: vi.fn(),
      });
      conversationService.addMessageToConversation.mockResolvedValue({});
      mockGenerateContent.mockResolvedValue({
        response: { text: () => mockGeneratedArticle },
      });
      mockGetGenerativeModel.mockReturnValue({
        generateContent: mockGenerateContent,
      });
      fs.unlink.mockResolvedValue(undefined);
    });

    it('should process a request for an existing conversation without a file', async () => {
      const result = await articleWriterService.processConversationalRequest(
        userId,
        message,
        conversationId,
        null,
        false,
        null,
        null,
        null,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        conversationId,
        userId,
        mockReq
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(
        2
      ); // User message + AI message
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        conversationId,
        userId,
        expect.objectContaining({
          role: 'user',
          content: message,
          metadata: { hasFile: false, fileName: undefined },
        }),
        mockReq
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        conversationId,
        userId,
        expect.objectContaining({
          role: 'assistant',
          content: mockGeneratedArticle,
          metadata: {
            articleType: DEFAULT_PARAMS.articleType,
            tone: DEFAULT_PARAMS.tone,
            length: DEFAULT_PARAMS.length,
            hasFile: false,
          },
        }),
        mockReq
      );
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(fs.unlink).not.toHaveBeenCalled();
      expect(result).toEqual({
        conversationId,
        userId,
        article: mockGeneratedArticle,
        metadata: {
          articleType: DEFAULT_PARAMS.articleType,
          tone: DEFAULT_PARAMS.tone,
          length: DEFAULT_PARAMS.length,
        },
      });
    });

    it('should process a request for a new conversation with specific parameters', async () => {
      vi.spyOn(articleWriterService, 'generateConversationId').mockReturnValue(
        'newConvId'
      );
      const newConversation = {
        conversationId: 'newConvId',
        userId,
        title: 'Article: Write an article about the benefits of unit testing....',
        metadata: { uploadedFiles: [] },
        save: vi.fn(),
      };
      conversationHelpers.getConversationById.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, 'Not found')
      );
      conversationService.createConversation.mockResolvedValue(newConversation);

      const result = await articleWriterService.processConversationalRequest(
        userId,
        message,
        null, // No conversationId
        null,
        false,
        ARTICLE_TYPES.BLOG_POST,
        WRITING_TONES.CASUAL,
        ARTICLE_LENGTHS.LONG,
        mockReq
      );

      expect(conversationService.createConversation).toHaveBeenCalledTimes(1);
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({ userId, title: expect.any(String) }),
        'newConvId',
        mockReq
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        'newConvId',
        userId,
        expect.objectContaining({
          role: 'assistant',
          content: mockGeneratedArticle,
          metadata: {
            articleType: ARTICLE_TYPES.BLOG_POST,
            tone: WRITING_TONES.CASUAL,
            length: ARTICLE_LENGTHS.LONG,
            hasFile: false,
          },
        }),
        mockReq
      );
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(result.conversationId).toBe('newConvId');
      expect(result.metadata).toEqual({
        articleType: ARTICLE_TYPES.BLOG_POST,
        tone: WRITING_TONES.CASUAL,
        length: ARTICLE_LENGTHS.LONG,
      });
    });

    it('should process a request with an uploaded file and clean it up', async () => {
      const fileInfo = {
        path: '/tmp/uploaded_file.txt',
        location: '/tmp/uploaded_file.txt',
        mimetype: 'text/plain',
        originalName: 'document.txt',
      };
      const mockConversation = {
        conversationId,
        userId,
        title: 'Existing Article',
        metadata: { uploadedFiles: [] },
        save: vi.fn(),
      };
      conversationHelpers.getConversationById.mockResolvedValue(
        mockConversation
      );
      mockUploadFile.mockResolvedValue({
        file: { uri: 'gemini://file-id', mimeType: 'text/plain' },
      });

      const result = await articleWriterService.processConversationalRequest(
        userId,
        message,
        conversationId,
        fileInfo,
        false,
        null,
        null,
        null,
        mockReq
      );

      expect(mockUploadFile).toHaveBeenCalledWith(fileInfo.path, {
        mimeType: fileInfo.mimetype,
        displayName: fileInfo.originalName,
      });
      expect(mockConversation.metadata.uploadedFiles).toEqual([
        expect.objectContaining({
          fileName: fileInfo.originalName,
        }),
      ]);
      expect(mockConversation.save).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        [
          {
            fileData: {
              mimeType: 'text/plain',
              fileUri: 'gemini://file-id',
            },
          },
          { text: expect.stringContaining('The user has uploaded a file') },
        ],
        expect.any(Object)
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        conversationId,
        userId,
        expect.objectContaining({
          role: 'user',
          metadata: { hasFile: true, fileName: fileInfo.originalName },
        }),
        mockReq
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        conversationId,
        userId,
        expect.objectContaining({
          role: 'assistant',
          metadata: expect.objectContaining({ hasFile: true }),
        }),
        mockReq
      );
      expect(fs.unlink).toHaveBeenCalledWith(fileInfo.path);
      expect(logger.info).toHaveBeenCalledWith(
        `Cleaned up uploaded file: ${fileInfo.path}`
      );
      expect(result.article).toBe(mockGeneratedArticle);
    });

    it('should log a warning if file cleanup fails but not throw', async () => {
      const fileInfo = {
        path: '/tmp/uploaded_file.txt',
        location: '/tmp/uploaded_file.txt',
        mimetype: 'text/plain',
        originalName: 'document.txt',
      };
      const mockConversation = {
        conversationId,
        userId,
        title: 'Existing Article',
        metadata: { uploadedFiles: [] },
        save: vi.fn(),
      };
      conversationHelpers.getConversationById.mockResolvedValue(
        mockConversation
      );
      mockUploadFile.mockResolvedValue({
        file: { uri: 'gemini://file-id', mimeType: 'text/plain' },
      });
      fs.unlink.mockRejectedValue(new Error('Cleanup failed'));

      const result = await articleWriterService.processConversationalRequest(
        userId,
        message,
        conversationId,
        fileInfo,
        false,
        null,
        null,
        null,
        mockReq
      );

      expect(fs.unlink).toHaveBeenCalledWith(fileInfo.path);
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to delete uploaded file: Cleanup failed'
      );
      expect(result.article).toBe(mockGeneratedArticle); // Still returns the article
    });

    it('should re-throw ApiError if any step fails', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, 'Invalid conversation')
      );

      await expect(
        articleWriterService.processConversationalRequest(
          userId,
          message,
          conversationId,
          null,
          false,
          null,
          null,
          null,
          mockReq
        )
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        'Error processing conversational article request:',
        expect.any(ApiError)
      );
    });
  });

  describe('getConversationHistory', () => {
    const conversationId = 'conv123';
    const userId = 'user123';
    const mockConversation = {
      conversationId,
      userId,
      title: 'Test Conversation',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    it('should successfully retrieve conversation history', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(
        mockConversation
      );

      const result = await articleWriterService.getConversationHistory(
        conversationId,
        userId
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        conversationId,
        userId
      );
      expect(result).toEqual(mockConversation);
    });

    it('should throw ApiError if conversation is not found', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(null);

      await expect(
        articleWriterService.getConversationHistory(conversationId, userId)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.NOT_FOUND,
        'Conversation not found'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error getting conversation history:',
        expect.any(ApiError)
      );
    });

    it('should throw ApiError if an internal error occurs during retrieval', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(
        new Error('DB connection failed')
      );

      await expect(
        articleWriterService.getConversationHistory(conversationId, userId)
      ).rejects.toThrow(Error); // Re-throws the original error
      expect(logger.error).toHaveBeenCalledWith(
        'Error getting conversation history:',
        expect.any(Error)
      );
    });
  });
});

// Export internal functions for direct testing (if not already exported)
// This is a common pattern for testing private/internal functions in services.
// In a real scenario, you might export them as `_private_function` or similar
// or refactor to make them publicly accessible if they are truly utility functions.
// For this exercise, we'll assume they can be accessed for testing.
articleWriterService.__test__processUploadedFile = async (fileInfo) => {
  const { processUploadedFile } = await import('./article_writer.service.js');
  return processUploadedFile(fileInfo);
};

articleWriterService.__test__buildArticlePrompt = async (
  message,
  articleType,
  tone,
  length,
  fileContent = null
) => {
  const { buildArticlePrompt } = await import('./article_writer.service.js');
  return buildArticlePrompt(message, articleType, tone, length, fileContent);
};

articleWriterService.__test__generateArticle = async (prompt, fileData = null) => {
  const { generateArticle } = await import('./article_writer.service.js');
  return generateArticle(prompt, fileData);
};