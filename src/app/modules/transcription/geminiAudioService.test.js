import { vi } from 'vitest';

// Mock config
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-gemini-key',
  },
}));

// Mock logger
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock ApiError
vi.mock('../../../errors/ApiError.js', () => ({
  default: vi.fn((status, message) => {
    const error = new Error(message);
    error.statusCode = status;
    return error;
  }),
}));

// Mock @google/generative-ai and @google/generative-ai/server
const mockGenerateContentResponse = {
  response: {
    text: vi.fn(() => 'Generated text content'),
  },
};

const mockCountTokensResponse = {
  totalTokens: 123,
};

const mockSendMessageResponse = {
  response: {
    text: vi.fn(() => 'Chat response text'),
  },
};

const mockStartChat = vi.fn(() => ({
  sendMessage: vi.fn(() => Promise.resolve(mockSendMessageResponse)),
}));

const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: vi.fn(() => Promise.resolve(mockGenerateContentResponse)),
  countTokens: vi.fn(() => Promise.resolve(mockCountTokensResponse)),
  startChat: mockStartChat,
}));

const mockGoogleGenerativeAI = vi.fn(() => ({
  getGenerativeModel: mockGetGenerativeModel,
}));

const mockUploadFileResult = {
  file: {
    uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file-uri',
    name: 'test-file-name',
    mimeType: 'audio/mp3',
    sizeBytes: 12345,
  },
};

const mockFileManager = {
  uploadFile: vi.fn(() => Promise.resolve(mockUploadFileResult)),
  deleteFile: vi.fn(() => Promise.resolve()),
};

const mockGoogleAIFileManager = vi.fn(() => mockFileManager);

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: mockGoogleGenerativeAI,
}));

vi.mock('@google/generative-ai/server', () => ({
  GoogleAIFileManager: mockGoogleAIFileManager,
}));

// Mock path
vi.mock('path', () => ({
  default: {
    basename: vi.fn((filePath) => filePath.split('/').pop()),
  },
}));

// Now import the module under test
import { geminiAudioService } from './geminiAudioService.js';
import {
  TRANSCRIPTION_CONSTANTS,
  SUPPORTED_AUDIO_FORMATS,
  PROCESSING_TYPES,
  ERROR_MESSAGES,
} from './transcription.constant.js';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('geminiAudioService', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Ensure the mock implementations are consistent
    mockGoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    }));
    mockGoogleAIFileManager.mockImplementation(() => mockFileManager);
    mockGetGenerativeModel.mockImplementation(() => ({
      generateContent: vi.fn(() => Promise.resolve(mockGenerateContentResponse)),
      countTokens: vi.fn(() => Promise.resolve(mockCountTokensResponse)),
      startChat: mockStartChat,
    }));
    mockStartChat.mockImplementation(() => ({
      sendMessage: vi.fn(() => Promise.resolve(mockSendMessageResponse)),
    }));
    mockGenerateContentResponse.response.text.mockReturnValue('Generated text content');
    mockSendMessageResponse.response.text.mockReturnValue('Chat response text');
    mockFileManager.uploadFile.mockResolvedValue(mockUploadFileResult);
    mockFileManager.deleteFile.mockResolvedValue(undefined);
  });

  describe('uploadAudioFile', () => {
    const filePath = '/tmp/test-audio.mp3';
    const mimeType = 'audio/mp3';

    it('should upload an audio file successfully', async () => {
      const result = await geminiAudioService.uploadAudioFile(filePath, mimeType);

      expect(mockGoogleAIFileManager).toHaveBeenCalledWith('test-gemini-key');
      expect(mockFileManager.uploadFile).toHaveBeenCalledWith(filePath, {
        mimeType,
        displayName: 'test-audio.mp3',
      });
      expect(logger.info).toHaveBeenCalledWith(`Uploading audio file: ${filePath}`);
      expect(logger.info).toHaveBeenCalledWith(
        `File uploaded successfully: ${mockUploadFileResult.file.uri}`
      );
      expect(result).toEqual({
        fileUri: mockUploadFileResult.file.uri,
        fileName: mockUploadFileResult.file.name,
        mimeType: mockUploadFileResult.file.mimeType,
        sizeBytes: mockUploadFileResult.file.sizeBytes,
      });
    });

    it('should throw ApiError if upload fails', async () => {
      const uploadError = new Error('Upload failed');
      mockFileManager.uploadFile.mockRejectedValueOnce(uploadError);

      await expect(geminiAudioService.uploadAudioFile(filePath, mimeType)).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to upload audio file'
      );
      expect(logger.error).toHaveBeenCalledWith('Error uploading audio file:', uploadError);
    });
  });

  describe('processAudioWithGemini', () => {
    const audioFile = {
      fileUri: 'gs://test-bucket/audio.mp3',
      fileName: 'audio.mp3',
      mimeType: 'audio/mp3',
    };
    const prompt = 'Transcribe this audio.';
    const processingType = PROCESSING_TYPES.TRANSCRIBE;

    it('should process audio with Gemini using fileUri successfully', async () => {
      const result = await geminiAudioService.processAudioWithGemini(
        audioFile,
        prompt,
        processingType
      );

      expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-key');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: TRANSCRIPTION_CONSTANTS.MODEL,
      });
      expect(mockGetGenerativeModel().generateContent).toHaveBeenCalledWith([
        'Generate a detailed transcript of the speech in this audio file.\n\nTranscribe this audio.',
        {
          fileData: {
            fileUri: audioFile.fileUri,
            mimeType: audioFile.mimeType,
          },
        },
      ]);
      expect(logger.info).toHaveBeenCalledWith(`Processing audio with type: ${processingType}`);
      expect(logger.info).toHaveBeenCalledWith('Audio processed successfully');
      expect(result).toEqual({
        text: 'Generated text content',
        processingType,
        metadata: {
          model: TRANSCRIPTION_CONSTANTS.MODEL,
          fileUri: audioFile.fileUri,
          fileName: audioFile.fileName,
          gsUri: undefined, // because it was not in the input audioFile
        },
      });
    });

    it('should process audio with Gemini using gsUri successfully', async () => {
      const audioFileWithGsUri = {
        gsUri: 'gs://test-bucket/audio-gcs.mp3',
        fileName: 'audio-gcs.mp3',
        mimeType: 'audio/mp3',
      };
      const result = await geminiAudioService.processAudioWithGemini(
        audioFileWithGsUri,
        prompt,
        processingType
      );

      expect(mockGetGenerativeModel().generateContent).toHaveBeenCalledWith([
        'Generate a detailed transcript of the speech in this audio file.\n\nTranscribe this audio.',
        {
          fileData: {
            fileUri: audioFileWithGsUri.gsUri,
            mimeType: audioFileWithGsUri.mimeType,
          },
        },
      ]);
      expect(result.metadata.fileUri).toBe(audioFileWithGsUri.gsUri);
      expect(result.metadata.gsUri).toBe(audioFileWithGsUri.gsUri);
    });

    it('should process audio with Gemini with options', async () => {
      const options = { includeTimestamps: true, startTimestamp: '00:00', endTimestamp: '00:30' };
      await geminiAudioService.processAudioWithGemini(
        audioFile,
        prompt,
        PROCESSING_TYPES.TRANSCRIBE,
        options
      );

      expect(mockGetGenerativeModel().generateContent).toHaveBeenCalledWith([
        'Generate a detailed transcript of the speech in this audio file. Include timestamps for each segment. Focus on the audio segment from 00:00 to 00:30.\n\nTranscribe this audio.',
        expect.any(Object),
      ]);
    });

    it('should throw ApiError if processing fails', async () => {
      const processingError = new Error('Processing failed');
      mockGetGenerativeModel().generateContent.mockRejectedValueOnce(processingError);

      await expect(
        geminiAudioService.processAudioWithGemini(audioFile, prompt, processingType)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.PROCESSING_FAILED
      );
      expect(logger.error).toHaveBeenCalledWith('Error processing audio with Gemini:', processingError);
    });
  });

  describe('processInlineAudio', () => {
    const audioBuffer = Buffer.from('test audio data');
    const mimeType = 'audio/wav';
    const prompt = 'Summarize this inline audio.';
    const processingType = PROCESSING_TYPES.SUMMARIZE;

    it('should process inline audio successfully', async () => {
      const result = await geminiAudioService.processInlineAudio(
        audioBuffer,
        mimeType,
        prompt,
        processingType
      );

      expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-key');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: TRANSCRIPTION_CONSTANTS.MODEL,
      });
      expect(mockGetGenerativeModel().generateContent).toHaveBeenCalledWith([
        'Provide a concise summary of the content in this audio file.\n\nSummarize this inline audio.',
        {
          inlineData: {
            data: audioBuffer.toString('base64'),
            mimeType,
          },
        },
      ]);
      expect(logger.info).toHaveBeenCalledWith(`Processing inline audio with type: ${processingType}`);
      expect(logger.info).toHaveBeenCalledWith('Inline audio processed successfully');
      expect(result).toEqual({
        text: 'Generated text content',
        processingType,
        metadata: {
          model: TRANSCRIPTION_CONSTANTS.MODEL,
          processedInline: true,
        },
      });
    });

    it('should process inline audio with options', async () => {
      const options = { customOption: 'value' };
      await geminiAudioService.processInlineAudio(
        audioBuffer,
        mimeType,
        prompt,
        processingType,
        options
      );

      expect(mockGetGenerativeModel().generateContent).toHaveBeenCalledWith([
        'Provide a concise summary of the content in this audio file.\n\nSummarize this inline audio.',
        expect.any(Object),
      ]);
      // Check metadata includes options
      const result = await geminiAudioService.processInlineAudio(
        audioBuffer,
        mimeType,
        prompt,
        processingType,
        options
      );
      expect(result.metadata).toHaveProperty('customOption', 'value');
    });

    it('should throw ApiError if inline processing fails', async () => {
      const inlineError = new Error('Inline processing failed');
      mockGetGenerativeModel().generateContent.mockRejectedValueOnce(inlineError);

      await expect(
        geminiAudioService.processInlineAudio(audioBuffer, mimeType, prompt, processingType)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        ERROR_MESSAGES.PROCESSING_FAILED
      );
      expect(logger.error).toHaveBeenCalledWith('Error processing inline audio:', inlineError);
    });
  });

  describe('buildPromptForType', () => {
    it('should build prompt for TRANSCRIBE without timestamps', () => {
      const prompt = geminiAudioService.buildPromptForType(PROCESSING_TYPES.TRANSCRIBE);
      expect(prompt).toBe('Generate a detailed transcript of the speech in this audio file.');
    });

    it('should build prompt for TRANSCRIBE with timestamps', () => {
      const prompt = geminiAudioService.buildPromptForType(PROCESSING_TYPES.TRANSCRIBE, {
        includeTimestamps: true,
      });
      expect(prompt).toBe(
        'Generate a detailed transcript of the speech in this audio file. Include timestamps for each segment.'
      );
    });

    it('should build prompt for DESCRIBE', () => {
      const prompt = geminiAudioService.buildPromptForType(PROCESSING_TYPES.DESCRIBE);
      expect(prompt).toBe(
        'Describe this audio clip in detail. Include information about speech, sounds, music, and any other audio elements.'
      );
    });

    it('should build prompt for SUMMARIZE', () => {
      const prompt = geminiAudioService.buildPromptForType(PROCESSING_TYPES.SUMMARIZE);
      expect(prompt).toBe('Provide a concise summary of the content in this audio file.');
    });

    it('should build prompt for ANALYZE', () => {
      const prompt = geminiAudioService.buildPromptForType(PROCESSING_TYPES.ANALYZE);
      expect(prompt).toBe(
        'Analyze this audio clip. Identify key themes, topics, speakers, tone, and any significant audio elements.'
      );
    });

    it('should build prompt for SEGMENT', () => {
      const prompt = geminiAudioService.buildPromptForType(PROCESSING_TYPES.SEGMENT);
      expect(prompt).toBe(
        'Break down this audio into distinct segments and provide a summary of each segment with timestamps.'
      );
    });

    it('should build prompt for QUESTION', () => {
      const prompt = geminiAudioService.buildPromptForType(PROCESSING_TYPES.QUESTION);
      expect(prompt).toBe('Answer questions about this audio clip based on its content.');
    });

    it('should build default prompt for unknown type', () => {
      const prompt = geminiAudioService.buildPromptForType('UNKNOWN_TYPE');
      expect(prompt).toBe('Process this audio file.');
    });

    it('should add startTimestamp to prompt', () => {
      const prompt = geminiAudioService.buildPromptForType(PROCESSING_TYPES.TRANSCRIBE, {
        startTimestamp: '00:05',
      });
      expect(prompt).toContain('Start from 00:05.');
    });

    it('should add endTimestamp to prompt', () => {
      const prompt = geminiAudioService.buildPromptForType(PROCESSING_TYPES.TRANSCRIBE, {
        endTimestamp: '00:30',
      });
      expect(prompt).toContain('Process up to 00:30.');
    });

    it('should add start and end timestamps to prompt', () => {
      const prompt = geminiAudioService.buildPromptForType(PROCESSING_TYPES.TRANSCRIBE, {
        startTimestamp: '00:05',
        endTimestamp: '00:30',
      });
      expect(prompt).toContain('Focus on the audio segment from 00:05 to 00:30.');
    });

    it('should combine timestamps and includeTimestamps for TRANSCRIBE', () => {
      const prompt = geminiAudioService.buildPromptForType(PROCESSING_TYPES.TRANSCRIBE, {
        includeTimestamps: true,
        startTimestamp: '00:05',
        endTimestamp: '00:30',
      });
      expect(prompt).toBe(
        'Generate a detailed transcript of the speech in this audio file. Include timestamps for each segment. Focus on the audio segment from 00:05 to 00:30.'
      );
    });
  });

  describe('countAudioTokens', () => {
    const audioFile = {
      fileUri: 'gs://test-bucket/audio.mp3',
      mimeType: 'audio/mp3',
    };

    it('should count tokens successfully', async () => {
      const result = await geminiAudioService.countAudioTokens(audioFile);

      expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-key');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: TRANSCRIPTION_CONSTANTS.MODEL,
      });
      expect(mockGetGenerativeModel().countTokens).toHaveBeenCalledWith([
        {
          fileData: {
            fileUri: audioFile.fileUri,
            mimeType: audioFile.mimeType,
          },
        },
      ]);
      expect(result).toEqual({ totalTokens: mockCountTokensResponse.totalTokens });
    });

    it('should throw ApiError if counting tokens fails', async () => {
      const countError = new Error('Token count failed');
      mockGetGenerativeModel().countTokens.mockRejectedValueOnce(countError);

      await expect(geminiAudioService.countAudioTokens(audioFile)).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to count tokens'
      );
      expect(logger.error).toHaveBeenCalledWith('Error counting audio tokens:', countError);
    });
  });

  describe('processBatchAudio', () => {
    const audioFiles = [
      {
        file: { fileUri: 'uri1', fileName: 'file1.mp3', mimeType: 'audio/mp3' },
        prompt: 'Prompt 1',
        processingType: PROCESSING_TYPES.TRANSCRIBE,
      },
      {
        file: { fileUri: 'uri2', fileName: 'file2.mp3', mimeType: 'audio/wav' },
        prompt: 'Prompt 2',
        processingType: PROCESSING_TYPES.SUMMARIZE,
      },
    ];
    const options = { batchOption: true };

    it('should process multiple audio files in batch successfully', async () => {
      // Mock processAudioWithGemini for batch processing
      const mockProcessAudioWithGemini = vi.fn();
      mockProcessAudioWithGemini.mockResolvedValueOnce({
        text: 'Result 1',
        processingType: PROCESSING_TYPES.TRANSCRIBE,
        metadata: { model: TRANSCRIPTION_CONSTANTS.MODEL, fileUri: 'uri1', fileName: 'file1.mp3', batchOption: true },
      });
      mockProcessAudioWithGemini.mockResolvedValueOnce({
        text: 'Result 2',
        processingType: PROCESSING_TYPES.SUMMARIZE,
        metadata: { model: TRANSCRIPTION_CONSTANTS.MODEL, fileUri: 'uri2', fileName: 'file2.mp3', batchOption: true },
      });

      // Temporarily replace the actual service function with the mock
      const originalProcessAudioWithGemini = geminiAudioService.processAudioWithGemini;
      geminiAudioService.processAudioWithGemini = mockProcessAudioWithGemini;

      const results = await geminiAudioService.processBatchAudio(audioFiles, options);

      expect(mockProcessAudioWithGemini).toHaveBeenCalledTimes(2);
      expect(mockProcessAudioWithGemini).toHaveBeenCalledWith(
        audioFiles[0].file,
        audioFiles[0].prompt,
        audioFiles[0].processingType,
        options
      );
      expect(mockProcessAudioWithGemini).toHaveBeenCalledWith(
        audioFiles[1].file,
        audioFiles[1].prompt,
        audioFiles[1].processingType,
        options
      );

      expect(results).toEqual([
        {
          fileName: 'file1.mp3',
          result: {
            text: 'Result 1',
            processingType: PROCESSING_TYPES.TRANSCRIBE,
            metadata: { model: TRANSCRIPTION_CONSTANTS.MODEL, fileUri: 'uri1', fileName: 'file1.mp3', batchOption: true },
          },
        },
        {
          fileName: 'file2.mp3',
          result: {
            text: 'Result 2',
            processingType: PROCESSING_TYPES.SUMMARIZE,
            metadata: { model: TRANSCRIPTION_CONSTANTS.MODEL, fileUri: 'uri2', fileName: 'file2.mp3', batchOption: true },
          },
        },
      ]);

      // Restore the original function
      geminiAudioService.processAudioWithGemini = originalProcessAudioWithGemini;
    });

    it('should use default processing type if not provided', async () => {
      const audioFilesWithDefault = [
        {
          file: { fileUri: 'uri3', fileName: 'file3.mp3', mimeType: 'audio/mp3' },
          prompt: 'Prompt 3',
        },
      ];

      const mockProcessAudioWithGemini = vi.fn();
      mockProcessAudioWithGemini.mockResolvedValueOnce({
        text: 'Result 3',
        processingType: PROCESSING_TYPES.TRANSCRIBE,
        metadata: { model: TRANSCRIPTION_CONSTANTS.MODEL, fileUri: 'uri3', fileName: 'file3.mp3' },
      });

      const originalProcessAudioWithGemini = geminiAudioService.processAudioWithGemini;
      geminiAudioService.processAudioWithGemini = mockProcessAudioWithGemini;

      await geminiAudioService.processBatchAudio(audioFilesWithDefault, options);

      expect(mockProcessAudioWithGemini).toHaveBeenCalledWith(
        audioFilesWithDefault[0].file,
        audioFilesWithDefault[0].prompt,
        PROCESSING_TYPES.TRANSCRIBE, // Default type
        options
      );

      geminiAudioService.processAudioWithGemini = originalProcessAudioWithGemini;
    });

    it('should throw ApiError if any batch processing fails', async () => {
      const batchError = new Error('Batch item failed');
      const mockProcessAudioWithGemini = vi.fn();
      mockProcessAudioWithGemini.mockResolvedValueOnce({ text: 'Success' });
      mockProcessAudioWithGemini.mockRejectedValueOnce(batchError);

      const originalProcessAudioWithGemini = geminiAudioService.processAudioWithGemini;
      geminiAudioService.processAudioWithGemini = mockProcessAudioWithGemini;

      await expect(geminiAudioService.processBatchAudio(audioFiles, options)).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to process batch audio'
      );
      expect(logger.error).toHaveBeenCalledWith('Error processing batch audio:', batchError);

      geminiAudioService.processAudioWithGemini = originalProcessAudioWithGemini;
    });
  });

  describe('deleteUploadedFile', () => {
    const fileName = 'test-file-name';

    it('should delete a file successfully', async () => {
      await geminiAudioService.deleteUploadedFile(fileName);

      expect(mockGoogleAIFileManager).toHaveBeenCalledWith('test-gemini-key');
      expect(mockFileManager.deleteFile).toHaveBeenCalledWith(fileName);
      expect(logger.info).toHaveBeenCalledWith(`Deleted file: ${fileName}`);
    });

    it('should log error but not throw if deletion fails', async () => {
      const deleteError = new Error('Deletion failed');
      mockFileManager.deleteFile.mockRejectedValueOnce(deleteError);

      await expect(geminiAudioService.deleteUploadedFile(fileName)).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith('Error deleting file:', deleteError);
    });
  });

  describe('isValidAudioFormat', () => {
    it('should return true for supported audio formats', () => {
      expect(geminiAudioService.isValidAudioFormat(SUPPORTED_AUDIO_FORMATS.MP3)).toBe(true);
      expect(geminiAudioService.isValidAudioFormat(SUPPORTED_AUDIO_FORMATS.WAV)).toBe(true);
      expect(geminiAudioService.isValidAudioFormat(SUPPORTED_AUDIO_FORMATS.M4A)).toBe(true);
      expect(geminiAudioService.isValidAudioFormat(SUPPORTED_AUDIO_FORMATS.WEBM)).toBe(true);
    });

    it('should return false for unsupported audio formats', () => {
      expect(geminiAudioService.isValidAudioFormat('audio/mpeg')).toBe(false); // Not in constants
      expect(geminiAudioService.isValidAudioFormat('video/mp4')).toBe(false);
      expect(geminiAudioService.isValidAudioFormat('application/json')).toBe(false);
      expect(geminiAudioService.isValidAudioFormat('')).toBe(false);
      expect(geminiAudioService.isValidAudioFormat(null)).toBe(false);
      expect(geminiAudioService.isValidAudioFormat(undefined)).toBe(false);
    });
  });

  describe('processChatMessage', () => {
    const message = 'What was discussed?';
    const conversationHistory = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'system', content: 'System message' }, // Should be filtered out
      { role: 'user', content: 'Tell me about the audio.' },
    ];
    const audioFileUri = 'gs://chat-context/audio.mp3';

    it('should process chat message without audio context successfully', async () => {
      const result = await geminiAudioService.processChatMessage(message, conversationHistory);

      expect(mockGoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-key');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: TRANSCRIPTION_CONSTANTS.MODEL,
      });
      expect(mockStartChat).toHaveBeenCalledWith({
        history: [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi there!' }] },
          { role: 'user', parts: [{ text: 'Tell me about the audio.' }] },
        ],
      });
      expect(mockStartChat().sendMessage).toHaveBeenCalledWith(message);
      expect(logger.info).toHaveBeenCalledWith('Chat message processed successfully');
      expect(result).toEqual({
        text: 'Chat response text',
        metadata: {
          model: TRANSCRIPTION_CONSTANTS.MODEL,
          hasAudioContext: false,
          historyLength: conversationHistory.length,
        },
      });
    });

    it('should process chat message with audio context successfully', async () => {
      const result = await geminiAudioService.processChatMessage(
        message,
        conversationHistory,
        audioFileUri
      );

      expect(mockStartChat().sendMessage).toHaveBeenCalledWith([
        message,
        {
          fileData: {
            fileUri: audioFileUri,
            mimeType: 'audio/mp3',
          },
        },
      ]);
      expect(result.metadata.hasAudioContext).toBe(true);
    });

    it('should throw ApiError if chat message processing fails', async () => {
      const chatError = new Error('Chat processing failed');
      mockStartChat().sendMessage.mockRejectedValueOnce(chatError);

      await expect(
        geminiAudioService.processChatMessage(message, conversationHistory)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to process chat message'
      );
      expect(logger.error).toHaveBeenCalledWith('Error processing chat message:', chatError);
    });
  });
});