import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VertexAiService } from './vertexAiService.js'; // Assuming the default export is also named VertexAiService for easier import

// Mock external dependencies
const mockGenerateContent = vi.fn();

const {
  mockGoogleGenAI,
  mockDynamicTool,
  mockConfig
} = vi.hoisted(() => {
  const mockGoogleGenAI = vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  }));

  const mockDynamicTool = vi.fn();

  const mockConfig = {
    gemini_secret_key: 'test-gemini-key',
    google: {
      gcp_project_id: 'test-gcp-project',
    },
  };

  return {
    mockGoogleGenAI,
    mockDynamicTool,
    mockConfig
  };
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: mockGoogleGenAI,
}));

vi.mock('@langchain/core/tools', () => ({
  DynamicTool: mockDynamicTool,
}));

vi.mock('../../../../../config/index.js', () => ({
  default: mockConfig,
}));

describe('VertexAiService', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    mockConfig.gemini_secret_key = 'test-gemini-key';
    mockConfig.google.gcp_project_id = 'test-gcp-project';
    process.env.VERTEX_AI_DATASTORE_ID = undefined; // Clear env var for consistent testing

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console methods after each test
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize GoogleGenAI with the secret key if present', () => {
      new VertexAiService();
      expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-gemini-key' });
    });

    it('should throw an error if GEMINI_SECRET_KEY is not configured', () => {
      mockConfig.gemini_secret_key = undefined;
      expect(() => new VertexAiService()).toThrow('GEMINI_SECRET_KEY is not configured. Please ensure config/index.js or environment variables are set correctly.');
      expect(mockGoogleGenAI).not.toHaveBeenCalled();
    });
  });

  describe('searchVertexStore', () => {
    let service;
    const mockQuery = 'What is the capital of France?';
    const mockGroundingResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Paris is the capital of France.' }],
          },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://example.com/paris', title: 'Paris Info' } },
              { document: { uri: 'https://internal.doc/france', title: 'France Guide' } },
              { web: { uri: 'https://example.com/paris', title: 'Duplicate Paris Info' } }, // Duplicate URI
              { web: { uri: 'https://example.com/other', title: 'Other Info' } },
              { web: { uri: 'https://example.com/ref5', title: 'Ref 5' } },
              { web: { uri: 'https://example.com/ref6', title: 'Ref 6 - Should be ignored' } }, // More than 5
            ],
          },
        },
      ],
    };

    beforeEach(() => {
      service = new VertexAiService();
      mockGenerateContent.mockResolvedValue(mockGroundingResponse);
    });

    it('should call generateContent with the correct model and query', async () => {
      await service.searchVertexStore(mockQuery);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.5-flash',
          contents: mockQuery,
        })
      );
    });

    it('should use a custom datastoreId if provided', async () => {
      const customDatastore = 'projects/custom/locations/global/collections/default_collection/dataStores/my-custom-store';
      await service.searchVertexStore(mockQuery, customDatastore);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            temperature: 0.2,
            maxOutputTokens: 4000,
            tools: [
              {
                vertexAISearch: {
                  datastore: customDatastore,
                },
              },
            ],
          },
        })
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(`📍 Scoping search to Datastore: ${customDatastore}`);
    });

    it('should use process.env.VERTEX_AI_DATASTORE_ID if available and no custom ID is provided', async () => {
      process.env.VERTEX_AI_DATASTORE_ID = 'env-datastore-id';
      await service.searchVertexStore(mockQuery);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            tools: [
              {
                vertexAISearch: {
                  datastore: 'env-datastore-id',
                },
              },
            ],
          },
        })
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(`📍 Scoping search to Datastore: env-datastore-id`);
    });

    it('should use the default datastore if no custom ID or env var is provided', async () => {
      const expectedDefaultDatastore = `projects/test-gcp-project/locations/global/collections/default_collection/dataStores/alti-knowledge-base`;
      await service.searchVertexStore(mockQuery);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: {
            tools: [
              {
                vertexAISearch: {
                  datastore: expectedDefaultDatastore,
                },
              },
            ],
          },
        })
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(`📍 Scoping search to Datastore: ${expectedDefaultDatastore}`);
    });

    it('should correctly parse the answer, references, and citations from a successful response', async () => {
      const result = await service.searchVertexStore(mockQuery);

      expect(result.answer).toBe('Paris is the capital of France.');
      expect(result.reference).toEqual([
        { url: 'https://example.com/paris', domain: 'Paris Info', title: 'Paris Info' },
        { url: 'https://internal.doc/france', domain: 'France Guide', title: 'France Guide' },
        { url: 'https://example.com/other', domain: 'Other Info', title: 'Other Info' },
        { url: 'https://example.com/ref5', domain: 'Ref 5', title: 'Ref 5' },
      ]);
      expect(result.citations).toEqual([
        { index: 1, url: 'https://example.com/paris', domain: 'Paris Info', title: 'Paris Info' },
        { index: 2, url: 'https://internal.doc/france', domain: 'France Guide', title: 'France Guide' },
        { index: 3, url: 'https://example.com/other', domain: 'Other Info', title: 'Other Info' },
        { index: 4, url: 'https://example.com/ref5', domain: 'Ref 5', title: 'Ref 5' },
      ]);
      expect(result.citationMetadata).toEqual(
        expect.objectContaining({
          model: 'gemini-2.5-flash',
          totalSources: 6, // All chunks are counted for totalSources
          searchMethod: 'vertex_ai_search',
        })
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(`✅ Vertex AI Search Grounding completed successfully.`);
    });

    it('should handle responses with no candidates', async () => {
      mockGenerateContent.mockResolvedValue({ candidates: [] });
      const result = await service.searchVertexStore(mockQuery);
      expect(result.answer).toBe('');
      expect(result.reference).toEqual([]);
      expect(result.citations).toEqual([]);
      expect(result.citationMetadata).toEqual(
        expect.objectContaining({
          totalSources: 0,
        })
      );
    });

    it('should handle responses with no groundingMetadata', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'No grounding.' }] } }],
      });
      const result = await service.searchVertexStore(mockQuery);
      expect(result.answer).toBe('No grounding.');
      expect(result.reference).toEqual([]);
      expect(result.citations).toEqual([]);
      expect(result.citationMetadata).toEqual(
        expect.objectContaining({
          totalSources: 0,
        })
      );
    });

    it('should handle responses with groundingMetadata but no groundingChunks', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'No chunks.' }] }, groundingMetadata: {} }],
      });
      const result = await service.searchVertexStore(mockQuery);
      expect(result.answer).toBe('No chunks.');
      expect(result.reference).toEqual([]);
      expect(result.citations).toEqual([]);
      expect(result.citationMetadata).toEqual(
        expect.objectContaining({
          totalSources: 0,
        })
      );
    });

    it('should handle references with invalid URLs gracefully', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: { parts: [{ text: 'Invalid URL test.' }] },
            groundingMetadata: {
              groundingChunks: [
                { web: { uri: 'invalid-url', title: 'Bad URL' } },
                { document: { uri: 'another-bad-url', title: 'Another Bad URL' } },
              ],
            },
          },
        ],
      });
      const result = await service.searchVertexStore(mockQuery);
      expect(result.reference).toEqual([
        { url: 'invalid-url', domain: 'Bad URL', title: 'Bad URL' },
        { url: 'another-bad-url', domain: 'Another Bad URL', title: 'Another Bad URL' },
      ]);
      expect(result.citations).toEqual([
        { index: 1, url: 'invalid-url', domain: 'Bad URL', title: 'Bad URL' },
        { index: 2, url: 'another-bad-url', domain: 'Another Bad URL', title: 'Another Bad URL' },
      ]);
    });

    it('should throw an error if generateContent fails', async () => {
      const mockError = new Error('API Error');
      mockGenerateContent.mockRejectedValue(mockError);
      await expect(service.searchVertexStore(mockQuery)).rejects.toThrow('API Error');
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Vertex AI Search Grounding failed:', mockError);
    });
  });

  describe('asTool', () => {
    let service;
    beforeEach(() => {
      service = new VertexAiService();
      mockDynamicTool.mockImplementation(function (options) {
        this.name = options.name;
        this.description = options.description;
        this.func = options.func;
      });
    });

    it('should return a DynamicTool instance', () => {
      const tool = service.asTool();
      expect(mockDynamicTool).toHaveBeenCalledTimes(1);
      expect(tool).toBeInstanceOf(mockDynamicTool);
      expect(tool.name).toBe('vertex-ai-search');
      expect(tool.description).toContain('Search enterprise knowledge base');
      expect(typeof tool.func).toBe('function');
    });

    it('should call searchVertexStore when the tool func is executed successfully', async () => {
      const mockSearchResult = {
        answer: 'Tool answer',
        reference: [{ url: 'tool.com', domain: 'tool.com', title: 'Tool Ref' }],
        citations: [],
        citationMetadata: {},
      };
      vi.spyOn(service, 'searchVertexStore').mockResolvedValue(mockSearchResult);

      const tool = service.asTool();
      const query = 'tool query';
      const result = await tool.func(query);

      expect(service.searchVertexStore).toHaveBeenCalledWith(query);
      expect(result).toBe(JSON.stringify({
        answer: mockSearchResult.answer,
        references: mockSearchResult.reference,
      }));
    });

    it('should handle errors gracefully when the tool func is executed', async () => {
      const mockError = new Error('Tool search failed');
      vi.spyOn(service, 'searchVertexStore').mockRejectedValue(mockError);

      const tool = service.asTool();
      const query = 'tool query';
      const result = await tool.func(query);

      expect(service.searchVertexStore).toHaveBeenCalledWith(query);
      expect(result).toBe(`Vertex AI Search failed: ${mockError.message}`);
    });
  });
});