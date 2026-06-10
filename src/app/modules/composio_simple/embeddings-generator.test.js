import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Tool from '../composio_v2/tools.model.js';

// --- Mocks ---

// Mock @google/generative-ai
const mockEmbedContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  embedContent: mockEmbedContent,
}));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

// Mock mongoose and Tool model
const mockToolFind = vi.fn();
const mockToolUpdateOne = vi.fn();
const mockMongooseConnect = vi.fn();
const mockMongooseDisconnect = vi.fn().mockResolvedValue(undefined);

vi.mock('../composio_v2/tools.model.js', () => ({
  default: {
    find: mockToolFind,
    updateOne: mockToolUpdateOne,
  },
}));

vi.mock('mongoose', () => ({
  default: {
    connect: mockMongooseConnect,
    disconnect: mockMongooseDisconnect,
  },
}));

// Mock config
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-key',
    database_url: 'test-db-url',
  },
}));

// --- End Mocks ---

// Dynamically import the module to be tested after mocks are set up.
// We need to extract the functions to test them individually.
const { generateEmbedding, generateEmbeddingsForTools } = await import('./embeddings-generator.js');

describe('embeddings-generator.js', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let processExitSpy;

  beforeEach(() => {
    vi.clearAllMocks();

    // Spy on console and process methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    // Default mock implementations for a clean run
    mockMongooseConnect.mockResolvedValue(true);
    mockMongooseDisconnect.mockResolvedValue(true);
    mockToolFind.mockResolvedValue([]); // Default to no tools found
    mockToolUpdateOne.mockResolvedValue({ nModified: 1 });
    mockEmbedContent.mockResolvedValue({
      embedding: { values: Array(768).fill(0.1) },
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('generateEmbedding', () => {
    it('should generate and return embedding values on success', async () => {
      const text = 'Test tool description';
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockEmbedContent.mockResolvedValue({
        embedding: { values: mockEmbedding },
      });

      const result = await generateEmbedding(text);

      expect(result).toEqual(mockEmbedding);
      expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-key');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'text-embedding-004' });
      expect(mockEmbedContent).toHaveBeenCalledWith(text);
    });

    it('should return null and log an error if embedding generation fails', async () => {
      const error = new Error('API Error');
      mockEmbedContent.mockRejectedValue(error);

      const result = await generateEmbedding('some text');

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error generating embedding:', error);
    });
  });

  describe('generateEmbeddingsForTools', () => {
    it('should connect, find no tools, log a message, and disconnect', async () => {
      mockToolFind.mockResolvedValue([]);

      await generateEmbeddingsForTools();

      expect(mockMongooseConnect).toHaveBeenCalledWith('test-db-url');
      expect(mockToolFind).toHaveBeenCalledWith({
        $or: [{ embedding: { $exists: false } }, { embedding: null }, { embedding: [] }],
      });
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ All tools already have embeddings!');
      expect(mockMongooseDisconnect).toHaveBeenCalled();
      expect(mockToolUpdateOne).not.toHaveBeenCalled();
    });

    it('should process tools without embeddings successfully', async () => {
      const mockTools = [
        { _id: '1', name: 'Tool A', description: 'Description A', appName: 'App1' },
        { _id: '2', name: 'Tool B', description: 'Description B', slug: 'app2' }, // Test slug fallback
      ];
      const mockEmbedding = Array(768).fill(0.5);
      mockToolFind.mockResolvedValue(mockTools);
      mockEmbedContent.mockResolvedValue({
        embedding: { values: mockEmbedding },
      });

      await generateEmbeddingsForTools();

      expect(mockToolFind).toHaveBeenCalledTimes(1);
      expect(mockEmbedContent).toHaveBeenCalledTimes(2);
      expect(mockEmbedContent).toHaveBeenCalledWith('Tool A - Description A');
      expect(mockEmbedContent).toHaveBeenCalledWith('Tool B - Description B');

      expect(mockToolUpdateOne).toHaveBeenCalledTimes(2);
      expect(mockToolUpdateOne).toHaveBeenCalledWith(
        { _id: '1' },
        { $set: { embedding: mockEmbedding, appName: 'App1' } }
      );
      expect(mockToolUpdateOne).toHaveBeenCalledWith(
        { _id: '2' },
        { $set: { embedding: mockEmbedding, appName: 'app2' } } // Checks if appName is set from slug
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Success: 2'));
      expect(mockMongooseDisconnect).toHaveBeenCalledTimes(1);
    });

    it('should handle failures in embedding generation for some tools', async () => {
      const mockTools = [
        { _id: '1', name: 'Success Tool', description: 'Will work' },
        { _id: '2', name: 'Failure Tool', description: 'Will fail' },
      ];
      mockToolFind.mockResolvedValue(mockTools);

      // First call succeeds, second fails
      mockEmbedContent
        .mockResolvedValueOnce({ embedding: { values: [0.1] } })
        .mockResolvedValueOnce(null); // Simulate failure from generateEmbedding

      await generateEmbeddingsForTools();

      expect(mockToolUpdateOne).toHaveBeenCalledTimes(1);
      expect(mockToolUpdateOne).toHaveBeenCalledWith(
        { _id: '1' },
        { $set: { embedding: [0.1], appName: undefined } }
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('  ❌ Failed to generate embedding'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Success: 1'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Errors: 1'));
      expect(mockMongooseDisconnect).toHaveBeenCalledTimes(1);
    });

    it('should handle MongoDB connection error', async () => {
      const error = new Error('DB Connection Failed');
      mockMongooseConnect.mockRejectedValue(error);

      await generateEmbeddingsForTools();

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error:', error);
      expect(mockToolFind).not.toHaveBeenCalled();
      expect(mockMongooseDisconnect).toHaveBeenCalledTimes(1);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle error when finding tools', async () => {
      const error = new Error('DB Find Failed');
      mockToolFind.mockRejectedValue(error);

      await generateEmbeddingsForTools();

      expect(mockMongooseConnect).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error:', error);
      expect(mockToolUpdateOne).not.toHaveBeenCalled();
      expect(mockMongooseDisconnect).toHaveBeenCalledTimes(1);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});