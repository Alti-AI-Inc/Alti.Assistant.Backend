import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { audioController } from './audio.controller.js';
import { audioService } from './audio.service.js';
import sendResponse from '../../../shared/sendResponse.js';

// Mock dependencies
vi.mock('../../../shared/catchAsync.js', () => ({
  default: vi.fn().mockImplementation(fn => fn),
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  default: vi.fn(),
}));

vi.mock('./audio.service.js', () => ({
  audioService: {
    generateGuestUserId: vi.fn().mockReturnValue('guest123'),
    generateAudioConversationId: vi.fn().mockReturnValue('aud-conv-123'),
    generateAudio: vi.fn(),
  },
}));

describe('Audio Controller', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      user: null,
      isGuest: false,
    };
    res = {};
    vi.clearAllMocks();
  });

  describe('generateAudio', () => {
    it('should throw or fail if message prompt is not provided', async () => {
      req.body = {};
      await expect(audioController.generateAudio(req, res)).rejects.toThrow(
        'A message prompt is required for audio generation'
      );
    });

    it('should generate audio successfully for authenticated users', async () => {
      req.user = { userId: 'auth_user_123' };
      req.body = { message: 'Write commercial and speak it' };

      const mockResult = {
        conversationId: 'aud-conv-123',
        responseMessage: {
          text: 'Here is your audio.',
          audioUrl: 'http://example.com/audio.mp3',
        },
      };

      audioService.generateAudio.mockResolvedValue(mockResult);

      await audioController.generateAudio(req, res);

      expect(audioService.generateAudio).toHaveBeenCalledWith(
        'auth_user_123',
        undefined,
        'Write commercial and speak it',
        false,
        req
      );

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Audio generation completed successfully',
        data: {
          ...mockResult,
          userType: 'authenticated',
          userId: undefined,
        },
      });
    });

    it('should generate audio successfully for guest users', async () => {
      req.isGuest = true;
      req.body = { message: 'Write commercial and speak it' };

      const mockResult = {
        conversationId: 'aud-conv-123',
        responseMessage: {
          text: 'Here is your audio.',
          audioUrl: 'http://example.com/audio.mp3',
        },
      };

      audioService.generateAudio.mockResolvedValue(mockResult);

      await audioController.generateAudio(req, res);

      expect(audioService.generateGuestUserId).toHaveBeenCalled();
      expect(audioService.generateAudio).toHaveBeenCalledWith(
        'guest123',
        undefined,
        'Write commercial and speak it',
        true,
        req
      );

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Audio generation completed successfully',
        data: {
          ...mockResult,
          userType: 'guest',
          userId: 'guest123',
        },
      });
    });
  });
});
