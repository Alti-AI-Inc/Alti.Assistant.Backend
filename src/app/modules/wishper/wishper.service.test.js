import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import fsp from 'fs/promises';
import { GoogleAuth } from 'google-auth-library';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { whisperTranscribeService } from './wishper.service.js';

// --- Mocks ---

// Mock file system modules
vi.mock('fs');
vi.mock('fs/promises');

// Mock config
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-gemini-key'
  }
}));

// Mock Redis client for rate limiter (to allow module to load without a real Redis instance)
vi.mock('redis', () => ({
  createClient: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
    isOpen: true,
  })),
}));
vi.mock('rate-limit-redis', () => ({
  RedisStore: vi.fn().mockImplementation(() => ({
    // Mock implementation of the store if needed, but for now, just the constructor
  })),
}));


const {
  mockGetAccessToken,
  mockGenerateContent
} = vi.hoisted(() => {
  // Mock Google Auth Library
  const mockGetAccessToken = vi.fn();

  // Mock Google Generative AI (Gemini)
  const mockGenerateContent = vi.fn();

  return {
    mockGetAccessToken,
    mockGenerateContent
  };
});

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn().mockImplementation(() => ({
    getClient: vi.fn().mockResolvedValue({
      getAccessToken: mockGetAccessToken,
    }),
  })),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Whisper Service: transcribeAudioToTextService', () => {

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers(); // To control Date.now() for token caching logic

    // Default mock implementations
    fsp.readFile.mockResolvedValue(Buffer.from('fake-audio-data'));
    fs.existsSync.mockReturnValue(false); // Default to no key file found
    process.env.GOOGLE_APPLICATION_CREDENTIALS = ''; // Clear env var
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Test Cases ---

  it('should successfully transcribe audio using Google Cloud STT on the first try', async () => {
    // Arrange
    mockGetAccessToken.mockResolvedValue({ token: 'fake-gcp-token', res: { expires_in: 3600 } });
    fs.existsSync.mockReturnValueOnce(true); // Pretend a key file exists

    const mockGcpResponse = {
      results: [{
        alternatives: [{
          transcript: 'Hello world from Google STT'
        }]
      }]
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockGcpResponse),
    });

    // Act
    const result = await whisperTranscribeService.transcribeAudioToTextService('test.mp3');

    // Assert
    expect(result).toBe('Hello world from Google STT');
    expect(mockGetAccessToken).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledOnce();
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.config.encoding).toBe('MP3'); // Checks getGcpSpeechConfig logic
    expect(mockGenerateContent).not.toHaveBeenCalled(); // Gemini fallback should not be called
  });

  it('should use a cached GCP access token on subsequent calls', async () => {
    // Arrange
    mockGetAccessToken.mockResolvedValue({ token: 'fake-gcp-token', res: { expires_in: 3600 } });
    fs.existsSync.mockReturnValue(true);

    const mockGcpResponse = {
      results: [{ alternatives: [{ transcript: 'test' }] }]
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockGcpResponse),
    });

    // Act
    await whisperTranscribeService.transcribeAudioToTextService('test.wav');
    await whisperTranscribeService.transcribeAudioToTextService('test.wav');

    // Assert
    expect(GoogleAuth).toHaveBeenCalledOnce(); // Auth should only be instantiated once
    expect(mockGetAccessToken).toHaveBeenCalledOnce(); // Token should only be fetched once
    expect(mockFetch).toHaveBeenCalledTimes(2); // Fetch is called for each transcription
  });

  it('should refresh an expired GCP access token', async () => {
    // Arrange
    mockGetAccessToken
      .mockResolvedValueOnce({ token: 'first-token', res: { expires_in: 60 } }) // Expires in 1 minute
      .mockResolvedValueOnce({ token: 'refreshed-token', res: { expires_in: 3600 } });
    fs.existsSync.mockReturnValue(true);

    const mockGcpResponse = {
      results: [{ alternatives: [{ transcript: 'test' }] }]
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockGcpResponse),
    });

    // Act
    // First call, caches the token
    await whisperTranscribeService.transcribeAudioToTextService('test.wav');
    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);

    // Advance time past the token's expiry
    vi.advanceTimersByTime(70 * 1000); // 70 seconds

    // Second call, should refresh the token
    await whisperTranscribeService.transcribeAudioToTextService('test.wav');

    // Assert
    expect(mockGetAccessToken).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer refreshed-token');
  });

  it('should fall back to Gemini if Google Cloud STT API returns an error', async () => {
    // Arrange
    mockGetAccessToken.mockResolvedValue({ token: 'fake-gcp-token', res: { expires_in: 3600 } });
    fs.existsSync.mockReturnValue(true);

    // GCP STT fails
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: 'GCP API error' } }),
    });

    // Gemini succeeds
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Hello world from Gemini'
      }
    });

    // Act
    const result = await whisperTranscribeService.transcribeAudioToTextService('test.webm');

    // Assert
    expect(result).toBe('Hello world from Gemini');
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-gemini-key');
    expect(mockGenerateContent).toHaveBeenCalledOnce();
    const geminiCallArgs = mockGenerateContent.mock.calls[0][0];
    expect(geminiCallArgs[1].inlineData.mimeType).toBe('audio/webm'); // Checks getMimeType logic
  });

  it('should fall back to Gemini if Google Cloud STT returns no results', async () => {
    // Arrange
    mockGetAccessToken.mockResolvedValue({ token: 'fake-gcp-token', res: { expires_in: 3600 } });
    fs.existsSync.mockReturnValue(true);

    // GCP STT returns empty results
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    // Gemini succeeds
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Hello world from Gemini'
      }
    });

    // Act
    const result = await whisperTranscribeService.transcribeAudioToTextService('test.flac');

    // Assert
    expect(result).toBe('Hello world from Gemini');
    expect(mockFetch).toHaveBeenCalledOnce();
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.config.encoding).toBe('FLAC'); // Checks getGcpSpeechConfig logic
    expect(mockGenerateContent).toHaveBeenCalledOnce();
  });

  it('should fall back to Gemini if GCP authentication fails', async () => {
    // Arrange
    // All auth methods fail
    fs.existsSync.mockReturnValue(false);
    mockGetAccessToken.mockRejectedValue(new Error('Auth failed'));

    // Gemini succeeds
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Hello world from Gemini'
      }
    });

    // Act
    const result = await whisperTranscribeService.transcribeAudioToTextService('test.m4a');

    // Assert
    expect(result).toBe('Hello world from Gemini');
    expect(mockFetch).not.toHaveBeenCalled(); // GCP STT should not be called
    expect(mockGenerateContent).toHaveBeenCalledOnce();
    const geminiCallArgs = mockGenerateContent.mock.calls[0][0];
    expect(geminiCallArgs[1].inlineData.mimeType).toBe('audio/m4a'); // Checks getMimeType logic
  });

  it('should throw an error if both Google Cloud STT and Gemini fail', async () => {
    // Arrange
    mockGetAccessToken.mockResolvedValue({ token: 'fake-gcp-token', res: { expires_in: 3600 } });
    fs.existsSync.mockReturnValue(true);

    // GCP STT fails
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: 'GCP API error' } }),
    });

    // Gemini also fails
    mockGenerateContent.mockRejectedValue(new Error('Gemini API error'));

    // Act & Assert
    await expect(whisperTranscribeService.transcribeAudioToTextService('test.ogg'))
      .rejects.toThrow('All transcription services failed. Google Cloud STT: HTTP 500 from Google Speech-to-Text API. Google Gemini: Gemini API error');
  });

  it('should throw an error during Gemini fallback if no API key is configured', async () => {
    // Arrange
    vi.mocked(config).gemini_secret_key = undefined;
    delete process.env.GEMINI_API_KEY;

    // GCP STT fails, triggering fallback
    mockFetch.mockRejectedValue(new Error('Network error'));
    mockGetAccessToken.mockResolvedValue({ token: 'fake-gcp-token', res: { expires_in: 3600 } });
    fs.existsSync.mockReturnValue(true);

    // Act & Assert
    await expect(whisperTranscribeService.transcribeAudioToTextService('test.mp3'))
      .rejects.toThrow('All transcription services failed. Google Cloud STT: Network error. Google Gemini: Gemini API key is not configured');
  });

  it('should correctly determine GCP config for a .wav file', async () => {
    // Arrange
    mockGetAccessToken.mockResolvedValue({ token: 'fake-gcp-token', res: { expires_in: 3600 } });
    fs.existsSync.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [{ alternatives: [{ transcript: 'wav test' }] }] }),
    });

    // Act
    await whisperTranscribeService.transcribeAudioToTextService('audio/test.wav');

    // Assert
    expect(mockFetch).toHaveBeenCalledOnce();
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.config.encoding).toBe('LINEAR16');
    expect(fetchBody.config.sampleRateHertz).toBe(16000);
  });
});