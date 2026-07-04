import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { audioService } from './audio.service.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { vertexClaudeService } from '../search/services/vertexClaudeService.js';
import { GcpSpeechService } from '../gcp_native/gcp-speech.service.js';

// Mock storage client
const mockSave = vi.fn().mockResolvedValue(undefined);
const mockGetSignedUrl = vi.fn().mockResolvedValue(['http://mock-signed-url.mp3']);

vi.mock('@google-cloud/storage', () => {
  return {
    Storage: function() {
      return {
        bucket: function() {
          return {
            file: function() {
              return {
                save: mockSave,
                getSignedUrl: mockGetSignedUrl,
              };
            }
          };
        }
      };
    }
  };
});

// Mock other services
vi.mock('../conversations/conversation.service.js', () => ({
  conversationService: {
    createConversation: vi.fn(),
    addMessageToConversation: vi.fn(),
  },
}));

vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers: {
    getConversationById: vi.fn(),
    getConversationMessages: vi.fn(),
  },
}));

vi.mock('../search/services/vertexClaudeService.js', () => ({
  vertexClaudeService: {
    generateText: vi.fn(),
  },
}));

vi.mock('../gcp_native/gcp-speech.service.js', () => ({
  GcpSpeechService: {
    synthesizeSpeech: vi.fn(),
  },
}));

vi.mock('../subscription/subscription.service.js', () => ({
  default: {
    trackAndIncrementMonthlyUsage: vi.fn().mockResolvedValue(true),
  },
}));

describe('Audio Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateGuestUserId', () => {
    it('should generate a valid mongoose ObjectId string', () => {
      const id = audioService.generateGuestUserId();
      expect(mongoose.Types.ObjectId.isValid(id)).toBe(true);
    });
  });

  describe('generateAudioConversationId', () => {
    it('should generate a string starting with aud-conv-', () => {
      const id = audioService.generateAudioConversationId();
      expect(id.startsWith('aud-conv-')).toBe(true);
    });
  });

  describe('handleAudioConversation', () => {
    it('should fetch existing conversation if ID is provided', async () => {
      const mockConv = { conversationId: 'aud-conv-123', userId: 'user1' };
      conversationHelpers.getConversationById.mockResolvedValue(mockConv);

      const result = await audioService.handleAudioConversation('user1', 'aud-conv-123', 'test query');
      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        'aud-conv-123',
        'user1',
        { lean: true }
      );
      expect(result).toEqual(mockConv);
    });

    it('should create new conversation if ID not found or not provided', async () => {
      const mockNewConv = { conversationId: 'aud-conv-new', userId: 'user1' };
      conversationHelpers.getConversationById.mockRejectedValue(new Error('not found'));
      conversationService.createConversation.mockResolvedValue(mockNewConv);

      const result = await audioService.handleAudioConversation('user1', null, 'test query');
      expect(conversationService.createConversation).toHaveBeenCalled();
      expect(result).toEqual(mockNewConv);
    });
  });

  describe('generateAudio', () => {
    it('should execute full audio generation flow successfully', async () => {
      const mockConv = { conversationId: 'aud-conv-123', messageCount: 0 };
      conversationHelpers.getConversationById.mockResolvedValue(mockConv);
      conversationHelpers.getConversationMessages.mockResolvedValue({ messages: [] });
      
      vertexClaudeService.generateText.mockResolvedValue({
        text: 'Background info... [SCRIPT_START] Welcome to Alti Assistant! [SCRIPT_END] extra info...',
      });

      GcpSpeechService.synthesizeSpeech.mockResolvedValue({
        success: true,
        audioContent: 'base64audiobuffercontent',
      });

      const req = {
        user: { userId: 'user123', tenantId: 'tenant456' },
      };

      const result = await audioService.generateAudio(
        'user123',
        'aud-conv-123',
        'Write a commercial voiceover for Alti Assistant',
        false,
        req
      );

      // Verify prompt mapping
      expect(vertexClaudeService.generateText).toHaveBeenCalled();
      
      // Verify Speech Synthesis
      expect(GcpSpeechService.synthesizeSpeech).toHaveBeenCalledWith(
        { userId: 'user123', tenantId: 'tenant456' },
        'Welcome to Alti Assistant!',
        expect.any(Object)
      );

      // Verify file upload
      expect(mockSave).toHaveBeenCalled();
      expect(mockGetSignedUrl).toHaveBeenCalled();

      // Verify returned data
      expect(result).toEqual({
        conversationId: 'aud-conv-123',
        responseMessage: {
          text: 'Background info... [SCRIPT_START] Welcome to Alti Assistant! [SCRIPT_END] extra info...',
          audioUrl: 'http://mock-signed-url.mp3',
        },
      });
    });
  });
});
