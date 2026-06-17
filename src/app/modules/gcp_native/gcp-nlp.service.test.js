import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GcpNlpService } from './gcp-nlp.service.js';
import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../../shared/logger.js';

const { mockGetClient, mockRequest } = vi.hoisted(() => {
  const mockRequest = vi.fn();
  const mockGetClient = vi.fn().mockResolvedValue({ request: mockRequest });
  return { mockGetClient, mockRequest };
});

vi.mock('google-auth-library', () => ({
  GoogleAuth: function() {
    return {
      getClient: mockGetClient
    };
  }
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock data for API responses
const mockSentimentResponse = {
  documentSentiment: { score: 0.8, magnitude: 1.6 },
  sentences: [
    {
      text: { content: 'Vitest is great.' },
      sentiment: { score: 0.9, magnitude: 0.9 }
    },
    {
      text: { content: 'Testing is important.' },
      sentiment: { score: 0.7, magnitude: 0.7 }
    }
  ]
};

const mockEntityResponse = {
  entities: [
    {
      name: 'Vitest',
      type: 'ORGANIZATION',
      salience: 0.9,
      metadata: { wikipedia_url: 'http://en.wikipedia.org/wiki/Vitest' }
    }
  ]
};

const mockClassificationResponse = {
  categories: [
    {
      name: '/Computers & Electronics/Software',
      confidence: 0.95
    }
  ]
};

describe('GcpNlpService', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    mockGetClient.mockResolvedValue({ request: mockRequest });

    // Default mock implementation for API requests
    mockRequest.mockImplementation(async ({ url }) => {
      if (url.includes('analyzeSentiment')) {
        return { data: mockSentimentResponse };
      }
      if (url.includes('analyzeEntities')) {
        return { data: mockEntityResponse };
      }
      if (url.includes('classifyText')) {
        return { data: mockClassificationResponse };
      }
      throw new Error(`Unexpected request to URL: ${url}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should analyze text with default operations (SENTIMENT and ENTITY)', async () => {
    const text = 'Vitest is great. Testing is important.';
    const result = await GcpNlpService.analyzeText(text);

    expect(logger.info).toHaveBeenCalledWith('NLP API: Analyzing text for operations: SENTIMENT, ENTITY');
    expect(mockGetClient).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledTimes(2);

    // Check sentiment call
    expect(mockRequest).toHaveBeenCalledWith({
      url: 'https://language.googleapis.com/v1/documents:analyzeSentiment',
      method: 'POST',
      data: { document: { type: 'PLAIN_TEXT', content: text } }
    });

    // Check entity call
    expect(mockRequest).toHaveBeenCalledWith({
      url: 'https://language.googleapis.com/v1/documents:analyzeEntities',
      method: 'POST',
      data: { document: { type: 'PLAIN_TEXT', content: text } }
    });

    // Check result structure and content
    expect(result.success).toBe(true);
    expect(result.textLength).toBe(text.length);
    expect(result.results.sentiment).toBeDefined();
    expect(result.results.sentiment.score).toBe(0.8);
    expect(result.results.sentiment.sentences.length).toBe(2);
    expect(result.results.entities).toBeDefined();
    expect(result.results.entities[0].name).toBe('Vitest');
    expect(result.results.classification).toBeUndefined();
  });

  it('should perform all operations when specified', async () => {
    const longText = 'Google, headquartered in Mountain View, unveiled the new Android phone. It is a fantastic piece of technology that will revolutionize the mobile industry with its advanced software and hardware integration.';
    const operations = ['SENTIMENT', 'ENTITY', 'CLASSIFY'];
    const result = await GcpNlpService.analyzeText(longText, operations);

    expect(logger.info).toHaveBeenCalledWith('NLP API: Analyzing text for operations: SENTIMENT, ENTITY, CLASSIFY');
    expect(mockRequest).toHaveBeenCalledTimes(3);

    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('analyzeSentiment') }));
    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('analyzeEntities') }));
    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('classifyText') }));

    expect(result.success).toBe(true);
    expect(result.results.sentiment).toBeDefined();
    expect(result.results.entities).toBeDefined();
    expect(result.results.classification).toBeDefined();
    expect(result.results.classification[0].name).toBe('/Computers & Electronics/Software');
  });

  it('should perform only sentiment analysis when specified', async () => {
    const text = 'I am happy.';
    const result = await GcpNlpService.analyzeText(text, ['SENTIMENT']);

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('analyzeSentiment') }));

    expect(result.success).toBe(true);
    expect(result.results.sentiment).toBeDefined();
    expect(result.results.entities).toBeUndefined();
    expect(result.results.classification).toBeUndefined();
  });

  it('should skip classification for text with less than 20 words', async () => {
    const shortText = 'This is a short text. It will not be classified.';
    const operations = ['CLASSIFY'];
    const result = await GcpNlpService.analyzeText(shortText, operations);

    expect(logger.warn).toHaveBeenCalledWith('NLP API: Skipped classification operation. Input text must be at least 20 words.');
    expect(mockRequest).not.toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('classifyText') }));
    expect(result.success).toBe(true);
    expect(result.results.classification).toEqual([]);
  });

  it('should handle API responses with missing data gracefully', async () => {
    mockRequest.mockImplementation(async ({ url }) => {
      if (url.includes('analyzeSentiment')) {
        return { data: {} }; // Empty response
      }
      if (url.includes('analyzeEntities')) {
        return { data: { entities: null } }; // Null entities
      }
      return { data: {} };
    });

    const text = 'Some text.';
    const result = await GcpNlpService.analyzeText(text, ['SENTIMENT', 'ENTITY']);

    expect(result.success).toBe(true);
    expect(result.results.sentiment).toEqual({
      score: 0,
      magnitude: 0,
      sentences: []
    });
    expect(result.results.entities).toEqual([]);
  });

  it('should throw an error and log it if getClient fails', async () => {
    const authError = new Error('Authentication failed');
    mockGetClient.mockRejectedValue(authError);

    const text = 'This will fail.';
    await expect(GcpNlpService.analyzeText(text)).rejects.toThrow(`GCP NLP Analysis failed: ${authError.message}`);
    expect(logger.error).toHaveBeenCalledWith('GCP NLP Service Error:', authError);
  });

  it('should throw an error and log it if a client request fails', async () => {
    const requestError = new Error('API request failed');
    mockRequest.mockRejectedValue(requestError);

    const text = 'This will also fail.';
    await expect(GcpNlpService.analyzeText(text)).rejects.toThrow(`GCP NLP Analysis failed: ${requestError.message}`);
    expect(logger.error).toHaveBeenCalledWith('GCP NLP Service Error:', requestError);
  });
});