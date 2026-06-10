import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WishperAiController } from './wishper.controller.js';
import httpStatus from 'http-status';
import fs from 'fs';
import { whisperTranscribeService } from './wishper.service.js';

// Mock external dependencies
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('./wishper.service.js', () => ({
  whisperTranscribeService: {
    transcribeAudioToTextService: vi.fn(),
  },
}));

describe('WishperAiController', () => {
  let req;
  let res;
  let consoleErrorSpy;

  beforeEach(() => {
    req = {
      file: undefined,
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe('transcribeAudioToTextController', () => {
    it('should return BAD_REQUEST if no audio file is uploaded', async () => {
      req.file = undefined; // Ensure req.file is undefined

      await WishperAiController.transcribeAudioToTextController(req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No audio file uploaded.',
      });
      expect(whisperTranscribeService.transcribeAudioToTextService).not.toHaveBeenCalled();
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if audio file path is missing', async () => {
      req.file = { path: undefined }; // Ensure req.file.path is undefined

      await WishperAiController.transcribeAudioToTextController(req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'No audio file uploaded.',
      });
      expect(whisperTranscribeService.transcribeAudioToTextService).not.toHaveBeenCalled();
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should transcribe audio, delete the file, and return OK on success', async () => {
      const mockAudioFilePath = '/tmp/audio-123.wav';
      const mockTranscriptionText = 'This is a test transcription.';
      req.file = { path: mockAudioFilePath };

      whisperTranscribeService.transcribeAudioToTextService.mockResolvedValue(mockTranscriptionText);
      fs.existsSync.mockReturnValue(true); // Simulate file exists for deletion

      await WishperAiController.transcribeAudioToTextController(req, res);

      expect(whisperTranscribeService.transcribeAudioToTextService).toHaveBeenCalledWith(mockAudioFilePath);
      expect(fs.existsSync).toHaveBeenCalledWith(mockAudioFilePath);
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockAudioFilePath);
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        transcription: mockTranscriptionText,
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle file deletion gracefully if file does not exist after transcription', async () => {
      const mockAudioFilePath = '/tmp/audio-123.wav';
      const mockTranscriptionText = 'This is a test transcription.';
      req.file = { path: mockAudioFilePath };

      whisperTranscribeService.transcribeAudioToTextService.mockResolvedValue(mockTranscriptionText);
      fs.existsSync.mockReturnValue(false); // Simulate file does not exist for deletion

      await WishperAiController.transcribeAudioToTextController(req, res);

      expect(whisperTranscribeService.transcribeAudioToTextService).toHaveBeenCalledWith(mockAudioFilePath);
      expect(fs.existsSync).toHaveBeenCalledWith(mockAudioFilePath);
      expect(fs.unlinkSync).not.toHaveBeenCalled(); // unlinkSync should not be called if existsSync returns false
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        transcription: mockTranscriptionText,
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return INTERNAL_SERVER_ERROR and delete file if transcription service fails', async () => {
      const mockAudioFilePath = '/tmp/audio-456.wav';
      const mockErrorMessage = 'Transcription service error';
      req.file = { path: mockAudioFilePath };

      whisperTranscribeService.transcribeAudioToTextService.mockRejectedValue(new Error(mockErrorMessage));
      fs.existsSync.mockReturnValue(true); // Simulate file exists for deletion

      await WishperAiController.transcribeAudioToTextController(req, res);

      expect(whisperTranscribeService.transcribeAudioToTextService).toHaveBeenCalledWith(mockAudioFilePath);
      expect(fs.existsSync).toHaveBeenCalledWith(mockAudioFilePath);
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockAudioFilePath);
      expect(res.status).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Transcription failed',
        error: mockErrorMessage,
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Whisper transcription failed:',
        mockErrorMessage
      );
    });

    it('should return INTERNAL_SERVER_ERROR and delete file if transcription service fails with response data', async () => {
      const mockAudioFilePath = '/tmp/audio-789.wav';
      const mockErrorResponseData = { code: 'API_ERROR', message: 'Groq API failed' };
      const mockError = { response: { data: mockErrorResponseData }, message: 'Network error' };
      req.file = { path: mockAudioFilePath };

      whisperTranscribeService.transcribeAudioToTextService.mockRejectedValue(mockError);
      fs.existsSync.mockReturnValue(true); // Simulate file exists for deletion

      await WishperAiController.transcribeAudioToTextController(req, res);

      expect(whisperTranscribeService.transcribeAudioToTextService).toHaveBeenCalledWith(mockAudioFilePath);
      expect(fs.existsSync).toHaveBeenCalledWith(mockAudioFilePath);
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockAudioFilePath);
      expect(res.status).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Transcription failed',
        error: mockErrorResponseData,
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Whisper transcription failed:',
        mockErrorResponseData
      );
    });

    it('should handle file deletion gracefully on error if file does not exist', async () => {
      const mockAudioFilePath = '/tmp/audio-error.wav';
      const mockErrorMessage = 'Transcription service error';
      req.file = { path: mockAudioFilePath };

      whisperTranscribeService.transcribeAudioToTextService.mockRejectedValue(new Error(mockErrorMessage));
      fs.existsSync.mockReturnValue(false); // Simulate file does not exist for deletion

      await WishperAiController.transcribeAudioToTextController(req, res);

      expect(whisperTranscribeService.transcribeAudioToTextService).toHaveBeenCalledWith(mockAudioFilePath);
      expect(fs.existsSync).toHaveBeenCalledWith(mockAudioFilePath);
      expect(fs.unlinkSync).not.toHaveBeenCalled(); // unlinkSync should not be called if existsSync returns false
      expect(res.status).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Transcription failed',
        error: mockErrorMessage,
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Whisper transcription failed:',
        mockErrorMessage
      );
    });
  });
});