import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

// Mock the entire @google/genai module
const mockEmbedContent = vi.fn();
const mockGenerateContent = vi.fn();
const mockGoogleGenAI = vi.fn().mockImplementation(() => ({
  models: {
    embedContent: mockEmbedContent,
    generateContent: mockGenerateContent,
  },
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: mockGoogleGenAI,
}));

// Store original environment variables
const originalEnv = { ...process.env };

describe('Gemini Utilities', () => {
  let embedText, generateContent, gemini;

  beforeAll(() => {
    // Set a dummy API key to allow the module to be imported
    process.env.GEMINI_API_KEY = 'test-api-key';
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  beforeEach(async () => {
    // Reset mocks and modules before each test to ensure isolation
    vi.clearAllMocks();
    vi.resetModules();

    // Dynamically import the module to apply mocks
    const module = await import('./gemini.js');
    embedText = module.embedText;
    generateContent = module.generateContent;
    gemini = module.gemini;

    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore all mocks
    vi.restoreAllMocks();
    // Reset env vars that might have been changed in specific tests
    process.env.EMBED_MODEL = originalEnv.EMBED_MODEL;
  });

  describe('Module Initialization', () => {
    it('should throw an error if GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;
      vi.resetModules(); // Force re-evaluation of the module-level code

      await expect(import('./gemini.js')).rejects.toThrow(
        'GEMINI_API_KEY environment variable is not set.'
      );
    });

    it('should initialize GoogleGenAI with the API key from environment variables', () => {
      expect(mockGoogleGenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
      });
    });
  });

  describe('embedText', () => {
    it('should throw a TypeError if the input is not a string', async () => {
      await expect(embedText(null)).rejects.toThrow(TypeError);
      await expect(embedText(123)).rejects.toThrow(TypeError);
      await expect(embedText({})).rejects.toThrow(TypeError);
      await expect(embedText(undefined)).rejects.toThrow(TypeError);
    });

    it('should call embedContent with the correct parameters for short text', async () => {
      const text = 'Hello, world!';
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbedContent.mockResolvedValue({
        embeddings: [{ values: mockEmbedding }],
      });

      await embedText(text);

      expect(mockEmbedContent).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        contents: text,
        config: {
          outputDimensionality: 1536,
        },
      });
    });

    it('should truncate text longer than 8000 characters', async () => {
      const longText = 'a'.repeat(8001);
      const truncatedText = 'a'.repeat(8000);
      const mockEmbedding = [0.4, 0.5, 0.6];
      mockEmbedContent.mockResolvedValue({
        embeddings: [{ values: mockEmbedding }],
      });

      await embedText(longText);

      expect(mockEmbedContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: truncatedText,
        })
      );
    });

    it('should return the embedding values on a successful API call', async () => {
      const text = 'Test text';
      const mockEmbedding = [0.7, 0.8, 0.9];
      mockEmbedContent.mockResolvedValue({
        embeddings: [{ values: mockEmbedding }],
      });

      const result = await embedText(text);

      expect(result).toEqual(mockEmbedding);
    });

    it.each([
      ['null response', null],
      ['undefined response', undefined],
      ['response with no embeddings property', {}],
      ['response with non-array embeddings', { embeddings: 'not-an-array' }],
      ['response with empty embeddings array', { embeddings: [] }],
      ['response with embedding object but no values', { embeddings: [{}] }],
      ['response with non-array values', { embeddings: [{ values: 'not-an-array' }] }],
    ])('should throw an error for a malformed API response: %s', async (desc, response) => {
      mockEmbedContent.mockResolvedValue(response);
      await expect(embedText('some text')).rejects.toThrow(
        'Failed to retrieve valid embeddings from Gemini API.'
      );
      expect(console.error).toHaveBeenCalledWith(
        'Unexpected API response structure for embedContent:',
        response
      );
    });

    it('should use the default embedding model when EMBED_MODEL is not set', async () => {
      delete process.env.EMBED_MODEL;
      vi.resetModules(); // Re-import to read the new env var state
      const { embedText: newEmbedText } = await import('./gemini.js');

      mockEmbedContent.mockResolvedValue({ embeddings: [{ values: [1] }] });
      await newEmbedText('test');

      expect(mockEmbedContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'text-embedding-3-small',
        })
      );
    });

    it('should use the embedding model from the environment variable when set', async () => {
      process.env.EMBED_MODEL = 'custom-embedding-model';
      vi.resetModules(); // Re-import to read the new env var state
      const { embedText: newEmbedText } = await import('./gemini.js');

      mockEmbedContent.mockResolvedValue({ embeddings: [{ values: [1] }] });
      await newEmbedText('test');

      expect(mockEmbedContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'custom-embedding-model',
        })
      );
    });
  });

  describe('generateContent', () => {
    const model = 'gemini-pro';
    const contents = 'What is the meaning of life?';

    it('should call generateContent with the correct model and contents', async () => {
      mockGenerateContent.mockResolvedValue({ result: '42' });
      await generateContent(model, contents);
      expect(mockGenerateContent).toHaveBeenCalledWith(expect.objectContaining({ model, contents }));
    });

    it('should use default config when no configParam is provided', async () => {
      mockGenerateContent.mockResolvedValue({ result: '42' });
      await generateContent(model, contents);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            thinkingConfig: {
              includeThoughts: false,
            },
          },
        })
      );
    });

    it('should merge provided configParam with the default config', async () => {
      const customConfig = {
        thinkingConfig: { includeThoughts: true },
        temperature: 0.9,
      };
      mockGenerateContent.mockResolvedValue({ result: '42' });
      await generateContent(model, contents, customConfig);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            thinkingConfig: { includeThoughts: true },
            temperature: 0.9,
          },
        })
      );
    });

    it('should return the raw response from the API call', async () => {
      const mockResponse = { candidate: { text: '42' }, thoughts: [] };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const result = await generateContent(model, contents);

      expect(result).toEqual(mockResponse);
    });

    it('should propagate errors from the API call', async () => {
      const apiError = new Error('API limit reached');
      mockGenerateContent.mockRejectedValue(apiError);

      await expect(generateContent(model, contents)).rejects.toThrow(apiError);
    });
  });
});