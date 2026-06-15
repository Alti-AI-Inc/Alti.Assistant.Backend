import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GcpSpeechService } from './gcp-speech.service.js';
import { UsageService } from '../usage/usage.service.js';
import { logger } from '../../../shared/logger.js';
import { GoogleAuth } from 'google-auth-library';

const {
  mockGcpClient
} = vi.hoisted(() => {
  // Mock dependencies
  const mockGcpClient = {
    request: vi.fn(),
  };

  return {
    mockGcpClient
  };
});
vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn().mockImplementation(() => ({
    getClient: vi.fn().mockResolvedValue(mockGcpClient),
  })),
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../usage/usage.service.js', () => ({
  UsageService: {
    checkLimit: vi.fn().mockResolvedValue(undefined),
    recordUsage: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('GcpSpeechService', () => {
  // This service does not perform role-based access checks directly (e.g., checking for 'admin' or 'user' roles).
  // Instead, it enforces a critical context boundary by requiring a valid `userContext` (with `userId` and `tenantId`)
  // for every operation. This ensures all actions are authorized and tracked against a specific tenant.
  // Our tests will verify this context validation is robust.
  const userContext = { userId: 'user-123', tenantId: 'tenant-abc' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('synthesizeSpeech', () => {
    const validText = 'Hello, world!';
    const validOptions = {
      languageCode: 'en-GB',
      voiceName: 'en-GB-Wavenet-A',
      gender: 'MALE',
      audioEncoding: 'OGG_OPUS',
    };

    it('should synthesize speech successfully with valid inputs', async () => {
      const mockAudioContent = 'base64-encoded-audio-string';
      mockGcpClient.request.mockResolvedValue({
        data: { audioContent: mockAudioContent },
      });

      const result = await GcpSpeechService.synthesizeSpeech(userContext, validText, validOptions);

      expect(UsageService.checkLimit).toHaveBeenCalledWith(
        userContext.tenantId,
        'gcp_tts_characters',
        validText.length
      );

      expect(GoogleAuth).toHaveBeenCalledWith({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      expect(mockGcpClient.request).toHaveBeenCalledWith({
        url: 'https://texttospeech.googleapis.com/v1/text:synthesize',
        method: 'POST',
        data: {
          input: { text: validText },
          voice: {
            languageCode: validOptions.languageCode,
            name: validOptions.voiceName,
            ssmlGender: validOptions.gender,
          },
          audioConfig: { audioEncoding: validOptions.audioEncoding },
        },
      });

      expect(UsageService.recordUsage).toHaveBeenCalledWith(
        userContext.tenantId,
        userContext.userId,
        'gcp_tts_characters',
        validText.length
      );

      expect(result).toEqual({
        success: true,
        audioContent: mockAudioContent,
        encoding: validOptions.audioEncoding,
        voice: validOptions.voiceName,
        textLength: validText.length,
      });
    });

    it('should use default options when none are provided', async () => {
      mockGcpClient.request.mockResolvedValue({
        data: { audioContent: 'default-audio' },
      });

      await GcpSpeechService.synthesizeSpeech(userContext, validText);

      expect(mockGcpClient.request).toHaveBeenCalledWith(expect.objectContaining({
        data: {
          input: { text: validText },
          voice: {
            languageCode: 'en-US',
            name: 'en-US-Neural2-F',
            ssmlGender: 'FEMALE',
          },
          audioConfig: { audioEncoding: 'MP3' },
        },
      }));
    });

    it('should throw an error for invalid user context', async () => {
      await expect(GcpSpeechService.synthesizeSpeech(null, validText)).rejects.toThrow(
        'Invalid user context provided. Action cannot be authorized or tracked.'
      );
      await expect(GcpSpeechService.synthesizeSpeech({ userId: 'user-123' }, validText)).rejects.toThrow(
        'Invalid user context provided. Action cannot be authorized or tracked.'
      );
      await expect(GcpSpeechService.synthesizeSpeech({ tenantId: 'tenant-abc' }, validText)).rejects.toThrow(
        'Invalid user context provided. Action cannot be authorized or tracked.'
      );
    });

    it('should throw an error for empty or invalid text input', async () => {
      await expect(GcpSpeechService.synthesizeSpeech(userContext, '')).rejects.toThrow(
        'Text input is required and cannot be empty.'
      );
      await expect(GcpSpeechService.synthesizeSpeech(userContext, '   ')).rejects.toThrow(
        'Text input is required and cannot be empty.'
      );
      await expect(GcpSpeechService.synthesizeSpeech(userContext, null)).rejects.toThrow(
        'Text input is required and cannot be empty.'
      );
      await expect(GcpSpeechService.synthesizeSpeech(userContext, 123)).rejects.toThrow(
        'Text input is required and cannot be empty.'
      );
    });

    it('should throw an error if text exceeds maximum length', async () => {
      const longText = 'a'.repeat(5001);
      await expect(GcpSpeechService.synthesizeSpeech(userContext, longText)).rejects.toThrow(
        'Text input exceeds the maximum allowed length of 5000 characters.'
      );
    });

    it('should re-throw LimitExceededError from UsageService.checkLimit', async () => {
      const limitError = new Error('TTS character limit exceeded');
      limitError.name = 'LimitExceededError';
      UsageService.checkLimit.mockRejectedValue(limitError);

      await expect(GcpSpeechService.synthesizeSpeech(userContext, validText)).rejects.toThrow(limitError);
      expect(mockGcpClient.request).not.toHaveBeenCalled();
      expect(UsageService.recordUsage).not.toHaveBeenCalled();
    });

    it('should throw an error if GCP API call fails', async () => {
      const apiError = new Error('GCP API Error');
      mockGcpClient.request.mockRejectedValue(apiError);

      await expect(GcpSpeechService.synthesizeSpeech(userContext, validText)).rejects.toThrow(
        `GCP Speech Synthesis failed: ${apiError.message}`
      );
      expect(logger.error).toHaveBeenCalledWith(`GCP Text-to-Speech Service Error for tenant ${userContext.tenantId}:`, apiError);
    });

    it('should throw an error if GCP API response is missing audioContent', async () => {
      mockGcpClient.request.mockResolvedValue({ data: {} });

      await expect(GcpSpeechService.synthesizeSpeech(userContext, validText)).rejects.toThrow(
        'GCP Text-to-Speech API did not return audioContent.'
      );
    });

    it('should log an error but not fail if UsageService.recordUsage throws', async () => {
      const recordUsageError = new Error('DB connection failed');
      UsageService.recordUsage.mockRejectedValue(recordUsageError);
      mockGcpClient.request.mockResolvedValue({ data: { audioContent: 'some-audio' } });

      const result = await GcpSpeechService.synthesizeSpeech(userContext, validText);

      expect(result.success).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        `Failed to record TTS usage for tenant ${userContext.tenantId}:`,
        recordUsageError
      );
    });
  });

  describe('transcribeSpeech', () => {
    const validAudioBuffer = Buffer.from('fake-audio-data');
    const validOptions = {
      languageCode: 'es-ES',
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
    };

    it('should transcribe speech successfully with valid inputs', async () => {
      const mockApiResponse = {
        data: {
          results: [{ alternatives: [{ transcript: 'hola mundo', confidence: 0.95 }] }],
        },
      };
      mockGcpClient.request.mockResolvedValue(mockApiResponse);

      const result = await GcpSpeechService.transcribeSpeech(userContext, validAudioBuffer, validOptions);

      expect(UsageService.checkLimit).toHaveBeenCalledWith(
        userContext.tenantId,
        'gcp_stt_requests',
        1
      );

      expect(mockGcpClient.request).toHaveBeenCalledWith({
        url: 'https://speech.googleapis.com/v1/speech:recognize',
        method: 'POST',
        data: {
          config: {
            encoding: validOptions.encoding,
            sampleRateHertz: validOptions.sampleRateHertz,
            languageCode: validOptions.languageCode,
            enableAutomaticPunctuation: true,
          },
          audio: {
            content: validAudioBuffer.toString('base64'),
          },
        },
      });

      expect(UsageService.recordUsage).toHaveBeenCalledWith(
        userContext.tenantId,
        userContext.userId,
        'gcp_stt_requests',
        1
      );

      expect(result).toEqual({
        success: true,
        transcript: 'hola mundo',
        confidence: 0.95,
        raw: mockApiResponse.data.results,
      });
    });

    it('should use default options when none are provided', async () => {
      mockGcpClient.request.mockResolvedValue({ data: { results: [] } });

      await GcpSpeechService.transcribeSpeech(userContext, validAudioBuffer);

      expect(mockGcpClient.request).toHaveBeenCalledWith(expect.objectContaining({
        data: {
          config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 48000,
            languageCode: 'en-US',
            enableAutomaticPunctuation: true,
          },
          audio: { content: validAudioBuffer.toString('base64') },
        },
      }));
    });

    it('should throw an error for invalid user context', async () => {
      await expect(GcpSpeechService.transcribeSpeech(null, validAudioBuffer)).rejects.toThrow(
        'Invalid user context provided. Action cannot be authorized or tracked.'
      );
    });

    it('should throw an error for empty or invalid audio buffer', async () => {
      await expect(GcpSpeechService.transcribeSpeech(userContext, null)).rejects.toThrow(
        'Audio buffer is required and cannot be empty.'
      );
      await expect(GcpSpeechService.transcribeSpeech(userContext, Buffer.from(''))).rejects.toThrow(
        'Audio buffer is required and cannot be empty.'
      );
      await expect(GcpSpeechService.transcribeSpeech(userContext, 'not-a-buffer')).rejects.toThrow(
        'Audio buffer is required and cannot be empty.'
      );
    });

    it('should throw an error if audio buffer exceeds maximum size', async () => {
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1); // 10MB + 1 byte
      await expect(GcpSpeechService.transcribeSpeech(userContext, largeBuffer)).rejects.toThrow(
        'Audio buffer exceeds the maximum allowed size of 10 MB.'
      );
    });

    it('should re-throw LimitExceededError from UsageService.checkLimit', async () => {
      const limitError = new Error('STT request limit exceeded');
      limitError.name = 'LimitExceededError';
      UsageService.checkLimit.mockRejectedValue(limitError);

      await expect(GcpSpeechService.transcribeSpeech(userContext, validAudioBuffer)).rejects.toThrow(limitError);
      expect(mockGcpClient.request).not.toHaveBeenCalled();
    });

    it('should throw an error if GCP API call fails', async () => {
      const apiError = new Error('GCP API Error');
      mockGcpClient.request.mockRejectedValue(apiError);

      await expect(GcpSpeechService.transcribeSpeech(userContext, validAudioBuffer)).rejects.toThrow(
        `GCP Speech Transcription failed: ${apiError.message}`
      );
      expect(logger.error).toHaveBeenCalledWith(`GCP Speech-to-Text Service Error for tenant ${userContext.tenantId}:`, apiError);
    });

    it('should return an empty transcript if API returns no results', async () => {
      mockGcpClient.request.mockResolvedValue({ data: { results: [] } });

      const result = await GcpSpeechService.transcribeSpeech(userContext, validAudioBuffer);

      expect(result).toEqual({
        success: true,
        transcript: '',
        confidence: 0,
        raw: [],
      });
    });

    it('should log an error but not fail if UsageService.recordUsage throws', async () => {
      const recordUsageError = new Error('DB connection failed');
      UsageService.recordUsage.mockRejectedValue(recordUsageError);
      mockGcpClient.request.mockResolvedValue({ data: { results: [] } });

      const result = await GcpSpeechService.transcribeSpeech(userContext, validAudioBuffer);

      expect(result.success).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        `Failed to record STT usage for tenant ${userContext.tenantId}:`,
        recordUsageError
      );
    });
  });
});