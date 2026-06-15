import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';
import {
  TRANSCRIPTION_CONSTANTS,
  AUDIO_PROCESSING,
  ERROR_MESSAGES,
} from './transcription.constant.js';
import { transcriptionService } from './transcription.service.js';

// Mock external dependencies
vi.mock('http-status', () => ({ default: { INTERNAL_SERVER_ERROR: 500, BAD_REQUEST: 400 } }));
vi.mock('../../../errors/ApiError.js', () => ({ default: class ApiError extends Error { constructor(statusCode, message) { super(message); this.statusCode = statusCode; } } }));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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
    getUserConversations: vi.fn(),
  },
}));
vi.mock('mongoose', () => ({
  default: {
    Types: {
      ObjectId: vi.fn().mockImplementation(() => ({
        toString: vi.fn().mockImplementation(() => 'mockObjectIdString'),
      })),
    },
  },
}));

// Mock Date.now() and Math.random() for predictable IDs
const MOCK_DATE_NOW = 1678886400000; // March 15, 2023 12:00:00 PM UTC
const MOCK_MATH_RANDOM = 0.123456789;
vi.spyOn(Date, 'now').mockReturnValue(MOCK_DATE_NOW);
vi.spyOn(Math, 'random').mockReturnValue(MOCK_MATH_RANDOM);

describe('transcriptionService', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Ensure constants are as expected for tests
    TRANSCRIPTION_CONSTANTS.CATEGORY = 'transcription';
    TRANSCRIPTION_CONSTANTS.MODEL = 'whisper';
    TRANSCRIPTION_CONSTANTS.TYPE = 'audio';
    AUDIO_PROCESSING.MAX_GUEST_AUDIO_LENGTH = 60; // 1 minute
    AUDIO_PROCESSING.MAX_AUDIO_LENGTH = 300; // 5 minutes
    AUDIO_PROCESSING.TOKENS_PER_SECOND = 10;
    ERROR_MESSAGES.INVALID_TIMESTAMP = 'Invalid timestamp format. Expected MM:SS.';
  });

  afterEach(() => {
    // Clean up if necessary
  });

  describe('generateGuestUserId', () => {
    it('should return a string', () => {
      const id = transcriptionService.generateGuestUserId();
      expect(typeof id).toBe('string');
    });

    it('should return a unique ID each time', () => {
      // Restore original Math.random for this test to ensure uniqueness
      vi.spyOn(mongoose.Types, 'ObjectId').mockImplementationOnce(() => ({ toString: () => 'id1' }));
      vi.spyOn(mongoose.Types, 'ObjectId').mockImplementationOnce(() => ({ toString: () => 'id2' }));

      const id1 = transcriptionService.generateGuestUserId();
      const id2 = transcriptionService.generateGuestUserId();
      expect(id1).not.toBe(id2);
      expect(id1).toBe('id1');
      expect(id2).toBe('id2');
    });

    it('should call mongoose.Types.ObjectId and toString', () => {
      transcriptionService.generateGuestUserId();
      expect(mongoose.Types.ObjectId).toHaveBeenCalledTimes(1);
      expect(mongoose.Types.ObjectId().toString).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateTranscriptionConversationId', () => {
    it('should return a string', () => {
      const id = transcriptionService.generateTranscriptionConversationId();
      expect(typeof id).toBe('string');
    });

    it('should contain the "transcription-" prefix', () => {
      const id = transcriptionService.generateTranscriptionConversationId();
      expect(id).toMatch(/^transcription-/);
    });

    it('should contain the current timestamp', () => {
      const id = transcriptionService.generateTranscriptionConversationId();
      expect(id).toContain(MOCK_DATE_NOW.toString());
    });

    it('should contain a random string part', () => {
      const id = transcriptionService.generateTranscriptionConversationId();
      expect(id).toContain(MOCK_MATH_RANDOM.toString(36).substring(7));
    });

    it('should return unique IDs (due to timestamp and random)', () => {
      // Temporarily restore Math.random for this test to ensure uniqueness
      vi.spyOn(Date, 'now').mockReturnValueOnce(1);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);
      const id1 = transcriptionService.generateTranscriptionConversationId();

      vi.spyOn(Date, 'now').mockReturnValueOnce(2);
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.2);
      const id2 = transcriptionService.generateTranscriptionConversationId();

      expect(id1).not.toBe(id2);
    });
  });

  describe('handleTranscriptionConversation', () => {
    const mockUserId = 'user123';
    const mockFileName = 'audio.mp3';
    const mockReq = { ip: '127.0.0.1' };
    const mockNewConversation = {
      _id: 'newConvId',
      userId: mockUserId,
      title: `Transcription: ${mockFileName}...`,
      metadata: {
        category: TRANSCRIPTION_CONSTANTS.CATEGORY,
        model: TRANSCRIPTION_CONSTANTS.MODEL,
        type: TRANSCRIPTION_CONSTANTS.TYPE,
        userType: 'authenticated',
        isGuest: false,
      },
    };
    const mockExistingConversation = {
      _id: 'existingConvId',
      userId: mockUserId,
      title: 'Existing Transcription',
      metadata: { userType: 'authenticated' },
    };
    const mockExistingGuestConversation = {
      _id: 'existingGuestConvId',
      userId: mockUserId,
      title: 'Existing Guest Transcription',
      metadata: { userType: 'guest' },
    };

    it('should create a new conversation if no conversationId is provided', async () => {
      conversationService.createConversation.mockResolvedValue(mockNewConversation);

      const result = await transcriptionService.handleTranscriptionConversation(
        mockUserId,
        null,
        mockFileName,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).not.toHaveBeenCalled();
      expect(conversationService.createConversation).toHaveBeenCalledTimes(1);
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: `Transcription: ${mockFileName.substring(0, 50)}...`,
          metadata: {
            category: TRANSCRIPTION_CONSTANTS.CATEGORY,
            model: TRANSCRIPTION_CONSTANTS.MODEL,
            type: TRANSCRIPTION_CONSTANTS.TYPE,
            userType: 'authenticated',
            isGuest: false,
          },
        },
        `transcription-${MOCK_DATE_NOW}-${MOCK_MATH_RANDOM.toString(36).substring(7)}`
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Created new transcription conversation transcription-${MOCK_DATE_NOW}-${MOCK_MATH_RANDOM.toString(36).substring(7)} for user ${mockUserId} (guest: false)`)
      );
      expect(result).toEqual(mockNewConversation);
    });

    it('should retrieve an existing conversation if conversationId is provided and valid (authenticated user)', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(mockExistingConversation);

      const result = await transcriptionService.handleTranscriptionConversation(
        mockUserId,
        mockExistingConversation._id,
        mockFileName,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledTimes(1);
      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockExistingConversation._id,
        mockUserId,
        mockReq
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(result).toEqual(mockExistingConversation);
    });

    it('should retrieve an existing guest conversation if conversationId is provided and valid (guest user)', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(mockExistingGuestConversation);

      const result = await transcriptionService.handleTranscriptionConversation(
        mockUserId,
        mockExistingGuestConversation._id,
        mockFileName,
        true,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledTimes(1);
      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockExistingGuestConversation._id,
        null, // userId is null for guest in getConversationById
        mockReq
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(result).toEqual(mockExistingGuestConversation);
    });

    it('should create a new guest conversation if guest user tries to access non-guest conversation', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(mockExistingConversation); // non-guest conversation
      conversationService.createConversation.mockResolvedValue({
        ...mockNewConversation,
        _id: 'newGuestConvId',
        metadata: { ...mockNewConversation.metadata, userType: 'guest', isGuest: true },
      });

      const result = await transcriptionService.handleTranscriptionConversation(
        mockUserId,
        mockExistingConversation._id,
        mockFileName,
        true, // isGuest = true
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        `Guest user ${mockUserId} trying to access non-guest conversation ${mockExistingConversation._id}`
      );
      expect(conversationService.createConversation).toHaveBeenCalledTimes(1);
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          metadata: expect.objectContaining({ userType: 'guest', isGuest: true }),
        }),
        expect.any(String)
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Created new transcription conversation newGuestConvId for user ${mockUserId} (guest: true)`)
      );
      expect(result._id).toBe('newGuestConvId');
      expect(result.metadata.userType).toBe('guest');
    });

    it('should create a new conversation if conversationId is provided but not found', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
      conversationService.createConversation.mockResolvedValue(mockNewConversation);

      const result = await transcriptionService.handleTranscriptionConversation(
        mockUserId,
        'nonExistentConvId',
        mockFileName,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        `Conversation nonExistentConvId not found or inaccessible for user ${mockUserId}, creating new one`
      );
      expect(conversationService.createConversation).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockNewConversation);
    });

    it('should create a new conversation if getConversationById throws an unexpected error', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(new Error('Database error'));
      conversationService.createConversation.mockResolvedValue(mockNewConversation);

      const result = await transcriptionService.handleTranscriptionConversation(
        mockUserId,
        'errorConvId',
        mockFileName,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        `Conversation errorConvId not found or inaccessible for user ${mockUserId}, creating new one`
      );
      expect(conversationService.createConversation).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockNewConversation);
    });

    it('should throw ApiError if createConversation fails', async () => {
      conversationService.createConversation.mockRejectedValue(new Error('DB write error'));

      await expect(
        transcriptionService.handleTranscriptionConversation(mockUserId, null, mockFileName)
      ).rejects.toThrow(ApiError);
      await expect(
        transcriptionService.handleTranscriptionConversation(mockUserId, null, mockFileName)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error handling transcription conversation:',
        expect.any(Error)
      );
    });

    it('should throw ApiError if an unexpected error occurs in the service', async () => {
      // Force an error in the service logic itself (e.g., if a dependency was not mocked correctly)
      // For this test, we'll mock a dependency to throw an error at an unexpected point
      vi.spyOn(transcriptionService, 'generateTranscriptionConversationId').mockImplementationOnce(() => {
        throw new Error('Forced internal error');
      });

      await expect(
        transcriptionService.handleTranscriptionConversation(mockUserId, null, mockFileName)
      ).rejects.toThrow(ApiError);
      await expect(
        transcriptionService.handleTranscriptionConversation(mockUserId, null, mockFileName)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error handling transcription conversation:',
        expect.any(Error)
      );
    });
  });

  describe('addAudioUploadMessage', () => {
    const mockConversationId = 'conv123';
    const mockUserId = 'user123';
    const mockFileName = 'test_audio.wav';
    const mockMessageResult = { _id: 'msg1', conversation: mockConversationId };

    it('should add an audio upload message to the conversation', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockMessageResult);

      const result = await transcriptionService.addAudioUploadMessage(
        mockConversationId,
        mockUserId,
        mockFileName
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(1);
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        {
          role: 'user',
          content: `Uploaded audio file: ${mockFileName}`,
          metadata: {
            type: 'audio_upload',
            fileName: mockFileName,
          },
        }
      );
      expect(result).toEqual(mockMessageResult);
    });

    it('should include additional metadata if provided', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockMessageResult);
      const additionalMetadata = { size: 1024, format: 'mp3' };

      await transcriptionService.addAudioUploadMessage(
        mockConversationId,
        mockUserId,
        mockFileName,
        additionalMetadata
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({
          metadata: expect.objectContaining({
            type: 'audio_upload',
            fileName: mockFileName,
            size: 1024,
            format: 'mp3',
          }),
        })
      );
    });

    it('should throw ApiError if addMessageToConversation fails', async () => {
      conversationService.addMessageToConversation.mockRejectedValue(new Error('DB error'));

      await expect(
        transcriptionService.addAudioUploadMessage(mockConversationId, mockUserId, mockFileName)
      ).rejects.toThrow(ApiError);
      await expect(
        transcriptionService.addAudioUploadMessage(mockConversationId, mockUserId, mockFileName)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error adding audio upload message:',
        expect.any(Error)
      );
    });
  });

  describe('addTranscriptionResult', () => {
    const mockConversationId = 'conv123';
    const mockUserId = 'user123';
    const mockResult = {
      text: 'This is the transcribed text.',
      processingType: 'transcribe',
      duration: 120,
      tokenCount: 1200,
      metadata: { language: 'en' },
    };
    const mockMessageResult = { _id: 'msg2', conversation: mockConversationId };

    it('should add a transcription result message to the conversation', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockMessageResult);

      const result = await transcriptionService.addTranscriptionResult(
        mockConversationId,
        mockUserId,
        mockResult
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(1);
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        {
          role: 'assistant',
          content: mockResult.text,
          metadata: {
            type: 'transcription_result',
            processingType: mockResult.processingType,
            duration: mockResult.duration,
            tokenCount: mockResult.tokenCount,
            timestamp: expect.any(String),
            language: 'en',
          },
        }
      );
      expect(result).toEqual(mockMessageResult);
    });

    it('should use result.content if result.text is not present', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockMessageResult);
      const resultWithContent = { ...mockResult, text: undefined, content: 'Alternative content' };

      await transcriptionService.addTranscriptionResult(
        mockConversationId,
        mockUserId,
        resultWithContent
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({
          content: 'Alternative content',
        })
      );
    });

    it('should throw ApiError if addMessageToConversation fails', async () => {
      conversationService.addMessageToConversation.mockRejectedValue(new Error('DB error'));

      await expect(
        transcriptionService.addTranscriptionResult(mockConversationId, mockUserId, mockResult)
      ).rejects.toThrow(ApiError);
      await expect(
        transcriptionService.addTranscriptionResult(mockConversationId, mockUserId, mockResult)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error adding transcription result:',
        expect.any(Error)
      );
    });
  });

  describe('addChatMessage', () => {
    const mockConversationId = 'conv123';
    const mockUserId = 'user123';
    const mockMessageContent = 'Hello, assistant!';
    const mockMessageResult = { _id: 'msg3', conversation: mockConversationId };

    it('should add a user chat message to the conversation by default', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockMessageResult);

      const result = await transcriptionService.addChatMessage(
        mockConversationId,
        mockUserId,
        mockMessageContent
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(1);
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        {
          role: 'user',
          content: mockMessageContent,
          metadata: {
            type: 'chat_message',
            timestamp: expect.any(String),
          },
        }
      );
      expect(result).toEqual(mockMessageResult);
    });

    it('should add an assistant chat message if role is specified', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockMessageResult);

      const result = await transcriptionService.addChatMessage(
        mockConversationId,
        mockUserId,
        mockMessageContent,
        false,
        'assistant'
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(1);
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        {
          role: 'assistant',
          content: mockMessageContent,
          metadata: {
            type: 'chat_message',
            timestamp: expect.any(String),
          },
        }
      );
      expect(result).toEqual(mockMessageResult);
    });

    it('should throw ApiError if addMessageToConversation fails', async () => {
      conversationService.addMessageToConversation.mockRejectedValue(new Error('DB error'));

      await expect(
        transcriptionService.addChatMessage(mockConversationId, mockUserId, mockMessageContent)
      ).rejects.toThrow(ApiError);
      await expect(
        transcriptionService.addChatMessage(mockConversationId, mockUserId, mockMessageContent)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error adding chat message:',
        expect.any(Error)
      );
    });
  });

  describe('validateAudioDuration', () => {
    it('should return true for duration within guest limit', () => {
      expect(transcriptionService.validateAudioDuration(AUDIO_PROCESSING.MAX_GUEST_AUDIO_LENGTH - 1, true)).toBe(true);
      expect(transcriptionService.validateAudioDuration(AUDIO_PROCESSING.MAX_GUEST_AUDIO_LENGTH, true)).toBe(true);
    });

    it('should return false for duration exceeding guest limit', () => {
      expect(transcriptionService.validateAudioDuration(AUDIO_PROCESSING.MAX_GUEST_AUDIO_LENGTH + 1, true)).toBe(false);
    });

    it('should return true for duration within authenticated limit', () => {
      expect(transcriptionService.validateAudioDuration(AUDIO_PROCESSING.MAX_AUDIO_LENGTH - 1, false)).toBe(true);
      expect(transcriptionService.validateAudioDuration(AUDIO_PROCESSING.MAX_AUDIO_LENGTH, false)).toBe(true);
    });

    it('should return false for duration exceeding authenticated limit', () => {
      expect(transcriptionService.validateAudioDuration(AUDIO_PROCESSING.MAX_AUDIO_LENGTH + 1, false)).toBe(false);
    });

    it('should use authenticated limit if isGuest is false or not provided', () => {
      expect(transcriptionService.validateAudioDuration(AUDIO_PROCESSING.MAX_GUEST_AUDIO_LENGTH + 1, false)).toBe(true);
      expect(transcriptionService.validateAudioDuration(AUDIO_PROCESSING.MAX_AUDIO_LENGTH, false)).toBe(true);
      expect(transcriptionService.validateAudioDuration(AUDIO_PROCESSING.MAX_AUDIO_LENGTH + 1)).toBe(false);
    });

    it('should handle zero duration', () => {
      expect(transcriptionService.validateAudioDuration(0, true)).toBe(true);
      expect(transcriptionService.validateAudioDuration(0, false)).toBe(true);
    });
  });

  describe('calculateAudioTokens', () => {
    it('should calculate tokens correctly for a given duration', () => {
      expect(transcriptionService.calculateAudioTokens(10)).toBe(10 * AUDIO_PROCESSING.TOKENS_PER_SECOND);
      expect(transcriptionService.calculateAudioTokens(30)).toBe(30 * AUDIO_PROCESSING.TOKENS_PER_SECOND);
    });

    it('should use Math.ceil for token calculation', () => {
      // If TOKENS_PER_SECOND is 10, 1.1 seconds should be 11 tokens
      AUDIO_PROCESSING.TOKENS_PER_SECOND = 10;
      expect(transcriptionService.calculateAudioTokens(1.1)).toBe(11);
      expect(transcriptionService.calculateAudioTokens(1.0)).toBe(10);
    });

    it('should return 0 for zero duration', () => {
      expect(transcriptionService.calculateAudioTokens(0)).toBe(0);
    });

    it('should handle fractional durations', () => {
      AUDIO_PROCESSING.TOKENS_PER_SECOND = 10;
      expect(transcriptionService.calculateAudioTokens(0.5)).toBe(5);
      expect(transcriptionService.calculateAudioTokens(0.1)).toBe(1);
      expect(transcriptionService.calculateAudioTokens(0.01)).toBe(1); // ceil(0.1) = 1
    });
  });

  describe('parseTimestamp', () => {
    it('should parse valid "MM:SS" format to seconds', () => {
      expect(transcriptionService.parseTimestamp('01:30')).toBe(90);
      expect(transcriptionService.parseTimestamp('00:00')).toBe(0);
      expect(transcriptionService.parseTimestamp('05:00')).toBe(300);
      expect(transcriptionService.parseTimestamp('10:15')).toBe(615);
      expect(transcriptionService.parseTimestamp('60:00')).toBe(3600); // 1 hour
    });

    it('should return null for null, undefined, or empty string input', () => {
      expect(transcriptionService.parseTimestamp(null)).toBeNull();
      expect(transcriptionService.parseTimestamp(undefined)).toBeNull();
      expect(transcriptionService.parseTimestamp('')).toBeNull();
    });

    it('should throw ApiError for invalid timestamp format', () => {
      expect(() => transcriptionService.parseTimestamp('1:30')).toThrow(ApiError);
      expect(() => transcriptionService.parseTimestamp('01:3')).toThrow(ApiError);
      expect(() => transcriptionService.parseTimestamp('123:45')).toThrow(ApiError);
      expect(() => transcriptionService.parseTimestamp('01-30')).toThrow(ApiError);
      expect(() => transcriptionService.parseTimestamp('abc')).toThrow(ApiError);
      expect(() => transcriptionService.parseTimestamp('01:60')).toThrow(ApiError); // Invalid seconds
      expect(() => transcriptionService.parseTimestamp('60:60')).toThrow(ApiError); // Invalid seconds
      expect(() => transcriptionService.parseTimestamp('01:30:00')).toThrow(ApiError);

      try {
        transcriptionService.parseTimestamp('invalid');
      } catch (e) {
        expect(e).toHaveProperty('statusCode', httpStatus.BAD_REQUEST);
        expect(e.message).toBe(ERROR_MESSAGES.INVALID_TIMESTAMP);
      }
    });
  });

  describe('formatTimestamp', () => {
    it('should format seconds into "MM:SS" string', () => {
      expect(transcriptionService.formatTimestamp(0)).toBe('00:00');
      expect(transcriptionService.formatTimestamp(59)).toBe('00:59');
      expect(transcriptionService.formatTimestamp(60)).toBe('01:00');
      expect(transcriptionService.formatTimestamp(90)).toBe('01:30');
      expect(transcriptionService.formatTimestamp(300)).toBe('05:00');
      expect(transcriptionService.formatTimestamp(3600)).toBe('60:00'); // 1 hour
      expect(transcriptionService.formatTimestamp(3661)).toBe('61:01'); // 1 hour 1 min 1 sec
      expect(transcriptionService.formatTimestamp(7200)).toBe('120:00'); // 2 hours
    });

    it('should handle single-digit minutes/seconds with padding', () => {
      expect(transcriptionService.formatTimestamp(5)).toBe('00:05');
      expect(transcriptionService.formatTimestamp(65)).toBe('01:05');
    });

    it('should handle large numbers of seconds', () => {
      expect(transcriptionService.formatTimestamp(6000)).toBe('100:00');
      expect(transcriptionService.formatTimestamp(60000)).toBe('1000:00');
    });
  });

  describe('getTranscriptionStats', () => {
    const mockUserId = 'user123';
    const mockReq = { ip: '127.0.0.1' };

    it('should return default stats if no conversations are found', async () => {
      conversationHelpers.getUserConversations.mockResolvedValue([]);

      const stats = await transcriptionService.getTranscriptionStats(mockUserId, mockReq);

      expect(conversationHelpers.getUserConversations).toHaveBeenCalledTimes(1);
      expect(conversationHelpers.getUserConversations).toHaveBeenCalledWith(mockUserId, {
        'metadata.category': TRANSCRIPTION_CONSTANTS.CATEGORY,
      });
      expect(stats).toEqual({
        totalTranscriptions: 0,
        totalDuration: 0,
        totalTokens: 0,
        averageDuration: 0,
        processingTypes: {},
        conversationCount: 0,
      });
    });

    it('should correctly aggregate stats from multiple conversations and messages', async () => {
      const mockConversations = [
        {
          _id: 'conv1',
          messages: [
            { metadata: { type: 'chat_message' } }, // Should be ignored
            {
              metadata: {
                type: 'transcription_result',
                processingType: 'transcribe',
                duration: 60,
                tokenCount: 600,
              },
            },
            {
              metadata: {
                type: 'transcription_result',
                processingType: 'summarize',
                duration: 30,
                tokenCount: 300,
              },
            },
          ],
        },
        {
          _id: 'conv2',
          messages: [
            {
              metadata: {
                type: 'transcription_result',
                processingType: 'transcribe',
                duration: 90,
                tokenCount: 900,
              },
            },
            { metadata: { type: 'audio_upload' } }, // Should be ignored
          ],
        },
        {
          _id: 'conv3',
          messages: [], // Empty messages
        },
        {
          _id: 'conv4',
          messages: [
            {
              metadata: {
                type: 'transcription_result',
                // Missing processingType, should default to 'transcribe'
                duration: 10,
                tokenCount: 100,
              },
            },
          ],
        },
      ];
      conversationHelpers.getUserConversations.mockResolvedValue(mockConversations);

      const stats = await transcriptionService.getTranscriptionStats(mockUserId, mockReq);

      expect(stats).toEqual({
        totalTranscriptions: 4,
        totalDuration: 60 + 30 + 90 + 10, // 190
        totalTokens: 600 + 300 + 900 + 100, // 1900
        averageDuration: 190 / 4, // 47.5
        processingTypes: {
          transcribe: 3, // 1 from conv1, 1 from conv2, 1 from conv4 (default)
          summarize: 1,
        },
        conversationCount: 4,
      });
    });

    it('should handle conversations with no messages or no transcription results', async () => {
      const mockConversations = [
        { _id: 'conv1', messages: [] },
        { _id: 'conv2', messages: [{ metadata: { type: 'chat_message' } }] },
      ];
      conversationHelpers.getUserConversations.mockResolvedValue(mockConversations);

      const stats = await transcriptionService.getTranscriptionStats(mockUserId, mockReq);

      expect(stats).toEqual({
        totalTranscriptions: 0,
        totalDuration: 0,
        totalTokens: 0,
        averageDuration: 0,
        processingTypes: {},
        conversationCount: 2,
      });
    });

    it('should throw ApiError if getUserConversations fails', async () => {
      conversationHelpers.getUserConversations.mockRejectedValue(new Error('DB error'));

      await expect(transcriptionService.getTranscriptionStats(mockUserId, mockReq)).rejects.toThrow(
        ApiError
      );
      await expect(transcriptionService.getTranscriptionStats(mockUserId, mockReq)).rejects.toHaveProperty(
        'statusCode',
        httpStatus.INTERNAL_SERVER_ERROR
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error getting transcription stats:',
        expect.any(Error)
      );
    });
  });
});