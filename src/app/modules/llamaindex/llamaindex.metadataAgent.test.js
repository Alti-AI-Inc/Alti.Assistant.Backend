import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { metadataAgentService } from './llamaindex.metadataAgent.js';
import DocumentMetadata from './llamaindex.metadata.model.js';
import * as llama from './llamaindex.indexer.js';

// Mock external modules
vi.mock('fs/promises');
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});
vi.mock('path');
vi.mock('@google/generative-ai');
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-key',
  },
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('./llamaindex.metadata.model.js', () => ({
  default: {
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
  },
}));
vi.mock('./llamaindex.indexer.js', () => ({
  listDocuments: vi.fn(),
}));

// Import mocks
import fsPromises from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../../shared/logger.js';

// Helper for mocking Gemini response structure
const mockGeminiResponse = (text) => ({
  response: {
    text: () => text,
  },
});

describe('metadataAgentService', () => {
  // Access the unexported cleanJSONResponse for direct testing
  let cleanJSONResponse;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Dynamically import the module to access unexported functions
    const module = await import('./llamaindex.metadataAgent.js');
    cleanJSONResponse = module.cleanJSONResponse;

    // Default mocks for common dependencies
    existsSync.mockReturnValue(true);
    fsPromises.stat.mockResolvedValue({ size: 1000 });
    fsPromises.readFile.mockResolvedValue('Mock file content for testing.');
    path.extname.mockReturnValue('.txt');

    // Mock Gemini API
    const mockGenerateContent = vi.fn().mockResolvedValue(
      mockGeminiResponse(
        '{"summary": "Test summary", "topics": ["test"], "entities": ["entity"], "complexity": "Intermediate", "audience": "General", "temporalContext": "Timeless"}'
      )
    );
    const mockGetGenerativeModel = vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    });
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    }));

    // Mock DocumentMetadata model
    DocumentMetadata.findOneAndUpdate.mockImplementation((query, update, options) => {
      return Promise.resolve({ _id: 'mockId', ...query, ...update }); // Simulate a saved document
    });
    DocumentMetadata.findOne.mockResolvedValue(null); // Default: no existing metadata
  });

  describe('cleanJSONResponse', () => {
    it('should remove markdown backticks from a JSON string with language specifier', () => {
      const input = '```json\n{"key": "value"}\n```';
      const expected = '{"key": "value"}';
      expect(cleanJSONResponse(input)).toBe(expected);
    });

    it('should remove markdown backticks without language specifier', () => {
      const input = '```\n{"key": "value"}\n```';
      const expected = '{"key": "value"}';
      expect(cleanJSONResponse(input)).toBe(expected);
    });

    it('should return the string as is if no backticks', () => {
      const input = '{"key": "value"}';
      expect(cleanJSONResponse(input)).toBe(input);
    });

    it('should handle empty string', () => {
      expect(cleanJSONResponse('')).toBe('');
    });

    it('should handle string with only backticks', () => {
      expect(cleanJSONResponse('```\n```')).toBe('');
    });

    it('should handle string with leading/trailing whitespace outside backticks', () => {
      const input = '  ```json\n{"key": "value"}\n```  ';
      const expected = '{"key": "value"}';
      expect(cleanJSONResponse(input)).toBe(expected);
    });
  });

  describe('enrichDocument', () => {
    const mockFilePath = '/path/to/doc.txt';
    const mockFileName = 'doc.txt';
    const mockDocId = 'doc123';
    const mockUserId = 'user456';

    it('should enrich a document with text content successfully', async () => {
      const mockContent = 'This is a test document content.';
      fsPromises.readFile.mockResolvedValue(mockContent);
      path.extname.mockReturnValue('.txt');

      const mockGeminiParsedResponse = {
        summary: 'Test summary',
        topics: ['test'],
        entities: ['entity'],
        complexity: 'Intermediate',
        audience: 'General',
        temporalContext: 'Timeless',
      };
      const mockGeminiRawResponse = JSON.stringify(mockGeminiParsedResponse);
      GoogleGenerativeAI.mock.results[0].value.getGenerativeModel().generateContent.mockResolvedValue(
        mockGeminiResponse(mockGeminiRawResponse)
      );

      const result = await metadataAgentService.enrichDocument(
        mockFilePath,
        mockFileName,
        mockDocId,
        mockUserId
      );

      expect(logger.info).toHaveBeenCalledWith(
        `MetadataAgent: enriching "${mockFileName}" (ID: ${mockDocId}) for user ${mockUserId}`
      );
      expect(existsSync).toHaveBeenCalledWith(mockFilePath);
      expect(fsPromises.stat).toHaveBeenCalledWith(mockFilePath);
      expect(path.extname).toHaveBeenCalledWith(mockFilePath);
      expect(fsPromises.readFile).toHaveBeenCalledWith(mockFilePath, 'utf-8');

      const expectedSystemPrompt = expect.stringContaining(
        `Document Preview:\n${mockContent.substring(0, 15000)}`
      );
      expect(GoogleGenerativeAI.mock.results[0].value.getGenerativeModel().generateContent).toHaveBeenCalledWith({
        contents: [{ role: 'user', parts: [{ text: expectedSystemPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      });

      expect(DocumentMetadata.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: mockUserId, docId: mockDocId },
        {
          fileName: mockFileName,
          summary: mockGeminiParsedResponse.summary,
          topics: mockGeminiParsedResponse.topics,
          entities: mockGeminiParsedResponse.entities,
          complexity: mockGeminiParsedResponse.complexity,
          audience: mockGeminiParsedResponse.audience,
          temporalContext: mockGeminiParsedResponse.temporalContext,
        },
        { new: true, upsert: true }
      );
      expect(logger.info).toHaveBeenCalledWith(
        `MetadataAgent: successfully enriched document profile in MongoDB for "${mockFileName}"`
      );
      expect(result).toEqual(expect.objectContaining({
        userId: mockUserId,
        docId: mockDocId,
        fileName: mockFileName,
        summary: mockGeminiParsedResponse.summary,
      }));
    });

    it('should enrich a document with binary content successfully', async () => {
      path.extname.mockReturnValue('.pdf'); // Simulate binary file
      fsPromises.readFile.mockClear(); // Should not be called for binary
      const mockFileSize = 50000;
      fsPromises.stat.mockResolvedValue({ size: mockFileSize });

      const mockGeminiParsedResponse = {
        summary: 'Binary doc summary',
        topics: ['binary'],
        entities: ['pdf'],
        complexity: 'Elementary',
        audience: 'Technical',
        temporalContext: 'Timeless',
      };
      const mockGeminiRawResponse = JSON.stringify(mockGeminiParsedResponse);
      GoogleGenerativeAI.mock.results[0].value.getGenerativeModel().generateContent.mockResolvedValue(
        mockGeminiResponse(mockGeminiRawResponse)
      );

      await metadataAgentService.enrichDocument(mockFilePath, mockFileName, mockDocId, mockUserId);

      expect(fsPromises.readFile).not.toHaveBeenCalled();
      const expectedSystemPrompt = expect.stringContaining(
        `Document Preview:\nDocument file name: ${mockFileName}. Size: ${mockFileSize} bytes. Binary format.`
      );
      expect(GoogleGenerativeAI.mock.results[0].value.getGenerativeModel().generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [{ role: 'user', parts: [{ text: expectedSystemPrompt }] }],
        })
      );
      expect(DocumentMetadata.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: mockUserId, docId: mockDocId }),
        expect.objectContaining({ summary: mockGeminiParsedResponse.summary }),
        expect.any(Object)
      );
    });

    it('should enrich a document without a file path (remote asset)', async () => {
      existsSync.mockReturnValue(false); // Simulate file not existing locally
      fsPromises.stat.mockClear();
      fsPromises.readFile.clear();
      path.extname.mockClear();

      const mockGeminiParsedResponse = {
        summary: 'Remote asset summary',
        topics: ['remote'],
        entities: ['cloud'],
        complexity: 'Intermediate',
        audience: 'Developers',
        temporalContext: 'Current',
      };
      const mockGeminiRawResponse = JSON.stringify(mockGeminiParsedResponse);
      GoogleGenerativeAI.mock.results[0].value.getGenerativeModel().generateContent.mockResolvedValue(
        mockGeminiResponse(mockGeminiRawResponse)
      );

      await metadataAgentService.enrichDocument(null, mockFileName, mockDocId, mockUserId);

      expect(existsSync).toHaveBeenCalledWith(null); // Called with null path
      expect(fsPromises.stat).not.toHaveBeenCalled();
      expect(fsPromises.readFile).not.toHaveBeenCalled();
      expect(path.extname).not.toHaveBeenCalled();

      const expectedSystemPrompt = expect.stringContaining(
        `Document Preview:\nDocument file name: ${mockFileName}. Online/remote asset.`
      );
      expect(GoogleGenerativeAI.mock.results[0].value.getGenerativeModel().generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [{ role: 'user', parts: [{ text: expectedSystemPrompt }] }],
        })
      );
      expect(DocumentMetadata.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: mockUserId, docId: mockDocId }),
        expect.objectContaining({ summary: mockGeminiParsedResponse.summary }),
        expect.any(Object)
      );
    });

    it('should handle Gemini API error gracefully with fallback', async () => {
      const errorMessage = 'Gemini API failed';
      GoogleGenerativeAI.mock.results[0].value.getGenerativeModel().generateContent.mockRejectedValue(new Error(errorMessage));

      const result = await metadataAgentService.enrichDocument(
        mockFilePath,
        mockFileName,
        mockDocId,
        mockUserId
      );

      expect(logger.error).toHaveBeenCalledWith(
        `MetadataAgent error enriching "${mockFileName}":`,
        expect.any(Error)
      );
      expect(DocumentMetadata.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: mockUserId, docId: mockDocId },
        {
          fileName: mockFileName,
          summary: `Auto-generated profile for ${mockFileName}. Extraction encountered an error: ${errorMessage}`,
          topics: ['general'],
          entities: [mockFileName],
          complexity: 'Intermediate',
          audience: 'General',
          temporalContext: 'Timeless',
        },
        { new: true, upsert: true }
      );
      expect(result).toEqual(expect.objectContaining({
        userId: mockUserId,
        docId: mockDocId,
        fileName: mockFileName,
        summary: expect.stringContaining('Extraction encountered an error'),
      }));
    });

    it('should handle JSON parsing error gracefully with fallback', async () => {
      GoogleGenerativeAI.mock.results[0].value.getGenerativeModel().generateContent.mockResolvedValue(
        mockGeminiResponse('This is not valid JSON.')
      );

      const result = await metadataAgentService.enrichDocument(
        mockFilePath,
        mockFileName,
        mockDocId,
        mockUserId
      );

      expect(logger.error).toHaveBeenCalledWith(
        `MetadataAgent error enriching "${mockFileName}":`,
        expect.any(Error)
      );
      expect(DocumentMetadata.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: mockUserId, docId: mockDocId },
        expect.objectContaining({
          summary: expect.stringContaining('Extraction encountered an error'),
        }),
        { new: true, upsert: true }
      );
      expect(result).toEqual(expect.objectContaining({
        userId: mockUserId,
        docId: mockDocId,
        fileName: mockFileName,
        summary: expect.stringContaining('Extraction encountered an error'),
      }));
    });

    it('should handle file system read error gracefully with fallback', async () => {
      const errorMessage = 'File read error';
      fsPromises.readFile.mockRejectedValue(new Error(errorMessage));

      const result = await metadataAgentService.enrichDocument(
        mockFilePath,
        mockFileName,
        mockDocId,
        mockUserId
      );

      expect(logger.error).toHaveBeenCalledWith(
        `MetadataAgent error enriching "${mockFileName}":`,
        expect.any(Error)
      );
      expect(DocumentMetadata.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: mockUserId, docId: mockDocId },
        expect.objectContaining({
          summary: expect.stringContaining('Extraction encountered an error'),
        }),
        { new: true, upsert: true }
      );
      expect(result).toEqual(expect.objectContaining({
        userId: mockUserId,
        docId: mockDocId,
        fileName: mockFileName,
        summary: expect.stringContaining('Extraction encountered an error'),
      }));
    });

    it('should use default values if Gemini response fields are missing', async () => {
      const mockGeminiParsedResponse = {
        summary: 'Only summary provided',
        // Missing topics, entities, complexity, audience, temporalContext
      };
      const mockGeminiRawResponse = JSON.stringify(mockGeminiParsedResponse);
      GoogleGenerativeAI.mock.results[0].value.getGenerativeModel().generateContent.mockResolvedValue(
        mockGeminiResponse(mockGeminiRawResponse)
      );

      await metadataAgentService.enrichDocument(
        mockFilePath,
        mockFileName,
        mockDocId,
        mockUserId
      );

      expect(DocumentMetadata.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: mockUserId, docId: mockDocId },
        {
          fileName: mockFileName,
          summary: mockGeminiParsedResponse.summary,
          topics: [], // Default
          entities: [], // Default
          complexity: 'Intermediate', // Default
          audience: 'General', // Default
          temporalContext: 'Timeless', // Default
        },
        { new: true, upsert: true }
      );
    });
  });

  describe('enrichAllUserDocuments', () => {
    const mockUserId = 'user456';

    it('should enrich new documents and skip existing ones', async () => {
      const mockDocs = [
        { id: 'doc1', fileName: 'file1.txt' },
        { docId: 'doc2', fileName: 'file2.txt' },
        { id_: 'doc3', name: 'file3.txt' }, // Already enriched
        { id: 'doc4', fileName: 'file4.txt' },
      ];
      llama.listDocuments.mockResolvedValue(mockDocs);

      // doc3 already exists
      DocumentMetadata.findOne.mockImplementation((query) => {
        if (query.docId === 'doc3') {
          return Promise.resolve({ userId: mockUserId, docId: 'doc3', summary: 'Existing summary' });
        }
        return Promise.resolve(null);
      });

      // Mock enrichDocument to return a simple record
      const enrichDocumentSpy = vi.spyOn(metadataAgentService, 'enrichDocument');
      enrichDocumentSpy.mockImplementation(async (filePath, fileName, docId, userId) => {
        return { userId, docId, fileName, summary: 'Enriched summary' };
      });

      const result = await metadataAgentService.enrichAllUserDocuments(mockUserId);

      expect(llama.listDocuments).toHaveBeenCalledWith(mockUserId);
      expect(DocumentMetadata.findOne).toHaveBeenCalledTimes(mockDocs.length); // Called for each doc
      expect(enrichDocumentSpy).toHaveBeenCalledTimes(3); // For doc1, doc2, doc4
      expect(enrichDocumentSpy).toHaveBeenCalledWith(null, 'file1.txt', 'doc1', mockUserId);
      expect(enrichDocumentSpy).toHaveBeenCalledWith(null, 'file2.txt', 'doc2', mockUserId);
      expect(enrichDocumentSpy).toHaveBeenCalledWith(null, 'file4.txt', 'doc4', mockUserId);
      expect(enrichDocumentSpy).not.toHaveBeenCalledWith(null, 'file3.txt', 'doc3', mockUserId);

      expect(result).toEqual({
        success: true,
        message: `Enrichment cycle completed. Analyzed ${mockDocs.length} files. Enriched 3 new files.`,
        enrichedCount: 3,
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should return 0 enriched count if no documents in corpus', async () => {
      llama.listDocuments.mockResolvedValue([]);
      const enrichDocumentSpy = vi.spyOn(metadataAgentService, 'enrichDocument');

      const result = await metadataAgentService.enrichAllUserDocuments(mockUserId);

      expect(llama.listDocuments).toHaveBeenCalledWith(mockUserId);
      expect(DocumentMetadata.findOne).not.toHaveBeenCalled();
      expect(enrichDocumentSpy).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'No documents in corpus to enrich.',
        enrichedCount: 0,
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should return 0 enriched count if all documents are already enriched', async () => {
      const mockDocs = [
        { id: 'doc1', fileName: 'file1.txt' },
        { docId: 'doc2', fileName: 'file2.txt' },
      ];
      llama.listDocuments.mockResolvedValue(mockDocs);
      DocumentMetadata.findOne.mockResolvedValue({ userId: mockUserId, docId: 'doc1', summary: 'Existing' }); // All exist

      const enrichDocumentSpy = vi.spyOn(metadataAgentService, 'enrichDocument');

      const result = await metadataAgentService.enrichAllUserDocuments(mockUserId);

      expect(llama.listDocuments).toHaveBeenCalledWith(mockUserId);
      expect(DocumentMetadata.findOne).toHaveBeenCalledTimes(mockDocs.length);
      expect(enrichDocumentSpy).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: `Enrichment cycle completed. Analyzed ${mockDocs.length} files. Enriched 0 new files.`,
        enrichedCount: 0,
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should handle error from llama.listDocuments', async () => {
      const errorMessage = 'LlamaIndex listDocuments failed';
      llama.listDocuments.mockRejectedValue(new Error(errorMessage));

      await expect(metadataAgentService.enrichAllUserDocuments(mockUserId)).rejects.toThrow(errorMessage);

      expect(llama.listDocuments).toHaveBeenCalledWith(mockUserId);
      expect(logger.error).toHaveBeenCalledWith(
        `MetadataAgent enrichAllUserDocuments failed:`,
        expect.any(Error)
      );
      expect(DocumentMetadata.findOne).not.toHaveBeenCalled();
      expect(metadataAgentService.enrichDocument).not.toHaveBeenCalled();
    });

    it('should continue processing if enrichDocument encounters an internal error (handled by enrichDocument)', async () => {
      const mockDocs = [
        { id: 'doc1', fileName: 'file1.txt' },
        { docId: 'doc2', fileName: 'file2.txt' },
      ];
      llama.listDocuments.mockResolvedValue(mockDocs);
      DocumentMetadata.findOne.mockResolvedValue(null); // All need enrichment

      // Mock enrichDocument to fail for the first doc, succeed for the second
      const enrichDocumentSpy = vi.spyOn(metadataAgentService, 'enrichDocument');
      enrichDocumentSpy.mockImplementationOnce(async () => {
        // Simulate an internal error in enrichDocument that it handles (returns fallback)
        logger.error('Simulated enrichDocument error'); // This will be caught by enrichDocument's try/catch
        return { userId: mockUserId, docId: 'doc1', fileName: 'file1.txt', summary: 'Fallback summary' };
      }).mockImplementationOnce(async (filePath, fileName, docId, userId) => {
        return { userId, docId, fileName, summary: 'Successfully enriched' };
      });

      const result = await metadataAgentService.enrichAllUserDocuments(mockUserId);

      expect(llama.listDocuments).toHaveBeenCalledWith(mockUserId);
      expect(DocumentMetadata.findOne).toHaveBeenCalledTimes(mockDocs.length);
      expect(enrichDocumentSpy).toHaveBeenCalledTimes(2);
      expect(enrichDocumentSpy).toHaveBeenCalledWith(null, 'file1.txt', 'doc1', mockUserId);
      expect(enrichDocumentSpy).toHaveBeenCalledWith(null, 'file2.txt', 'doc2', mockUserId);

      // enrichDocument's internal error handling means enrichAllUserDocuments still counts it as "processed"
      // and doesn't throw an error itself.
      expect(result).toEqual({
        success: true,
        message: `Enrichment cycle completed. Analyzed ${mockDocs.length} files. Enriched 2 new files.`,
        enrichedCount: 2,
      });
      // The error from enrichDocument is logged internally by enrichDocument, not by enrichAllUserDocuments
      expect(logger.error).toHaveBeenCalledWith('Simulated enrichDocument error');
    });
  });
});