import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// Mock external dependencies
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-key',
    google: { gcp_project_id: 'mock-gcp-project' },
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const {
  mockRagInitialize,
  mockRagAddDocumentFromBuffer,
  mockRagQuery,
  mockKnowledgeBaseFind,
  mockKnowledgeBaseFindOne,
  mockKnowledgeBaseSave,
  mockKnowledgeBaseDeleteOne,
  mockKnowledgebaseFileFind,
  mockKnowledgebaseFileFindOne,
  mockKnowledgebaseFileSave,
  mockKnowledgebaseFileDeleteOne,
  mockGetGenerativeModel,
  mockUploadFile,
  mockGetFile,
  mockDeleteFile,
  mockStorageBucket
} = vi.hoisted(() => {
  const mockRagInitialize = vi.fn();
  const mockRagAddDocumentFromBuffer = vi.fn().mockImplementation(() => ({
    success: true,
    documentId: 'doc-123',
    chunkCount: 5,
    title: 'Mock Document Title',
  }));
  const mockRagQuery = vi.fn().mockImplementation(() => ({
    answer: 'Mock RAG answer',
    sources: [{ url: 'http://source.com', title: 'Source' }],
    confidence: 0.9,
    model: 'gemini-2.5-flash',
    tokensUsed: 100,
    chatHistory: [],
    sessionId: 'conv-123',
  }));

  // Mongoose Model Mocks
  const mockKnowledgeBaseFind = vi.fn();
  const mockKnowledgeBaseFindOne = vi.fn();
  const mockKnowledgeBaseSave = vi.fn(function () {
    this._id = this._id || 'kb-id-123';
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.formattedFileSize = '0 B'; // Default for new KB
    return Promise.resolve(this);
  });
  const mockKnowledgeBaseDeleteOne = vi.fn();

  const mockKnowledgebaseFileFind = vi.fn();
  const mockKnowledgebaseFileFindOne = vi.fn();
  const mockKnowledgebaseFileSave = vi.fn(function () {
    this._id = this._id || 'file-id-123';
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.formattedFileSize = '10 KB'; // Default for new file
    return Promise.resolve(this);
  });
  const mockKnowledgebaseFileDeleteOne = vi.fn();

  const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
    generateContent: mockGenerateContent,
  }));

  const mockUploadFile = vi.fn().mockImplementation(() => ({
    file: { name: 'files/mock-file-id', mimeType: 'image/png', uri: 'gs://mock-bucket/mock-file' },
  }));
  const mockGetFile = vi.fn().mockImplementation(() => ({ state: 'COMPLETED' }));
  const mockDeleteFile = vi.fn();
  const mockStorageBucket = vi.fn().mockImplementation(() => ({
    file: mockBucketFile,
  }));

  return {
    mockRagInitialize,
    mockRagAddDocumentFromBuffer,
    mockRagQuery,
    mockKnowledgeBaseFind,
    mockKnowledgeBaseFindOne,
    mockKnowledgeBaseSave,
    mockKnowledgeBaseDeleteOne,
    mockKnowledgebaseFileFind,
    mockKnowledgebaseFileFindOne,
    mockKnowledgebaseFileSave,
    mockKnowledgebaseFileDeleteOne,
    mockGetGenerativeModel,
    mockUploadFile,
    mockGetFile,
    mockDeleteFile,
    mockStorageBucket
  };
});

vi.mock('rag-system-pgvector', () => ({
  RAGSystem: vi.fn().mockImplementation(() => ({
    initialize: mockRagInitialize,
    addDocumentFromBuffer: mockRagAddDocumentFromBuffer,
    query: mockRagQuery,
  })),
}));

vi.mock('../../../shared/hybridSearch.js', () => ({
  enableHybridSearch: vi.fn(),
}));

vi.mock('./knowledgebase.model.js', () => ({
  default: vi.fn(function (data) {
    Object.assign(this, data);
    this.save = mockKnowledgeBaseSave;
  }),
  find: mockKnowledgeBaseFind,
  findOne: mockKnowledgeBaseFindOne,
  deleteOne: mockKnowledgeBaseDeleteOne,
}));

vi.mock('./knowledgebase.files.model.js', () => ({
  default: vi.fn(function (data) {
    Object.assign(this, data);
    this.save = mockKnowledgebaseFileSave;
  }),
  find: mockKnowledgebaseFileFind,
  findOne: mockKnowledgebaseFileFindOne,
  deleteOne: mockKnowledgebaseFileDeleteOne,
}));

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn(),
}));
vi.mock('../../../shared/embeddings.js', () => ({
  SafeGoogleGenerativeAIEmbeddings: vi.fn(),
}));

const mockGenerateContent = vi.fn().mockImplementation(() => ({
  response: {
    text: vi.fn().mockImplementation(() => 'Mock summarized context'),
  },
}));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

vi.mock('@google/generative-ai/server', () => ({
  GoogleAIFileManager: vi.fn().mockImplementation(() => ({
    uploadFile: mockUploadFile,
    getFile: mockGetFile,
    deleteFile: mockDeleteFile,
  })),
}));

const mockFileSave = vi.fn();
const mockBucketFile = vi.fn().mockImplementation(() => ({
  save: mockFileSave,
}));
vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn().mockImplementation(() => ({
    bucket: mockStorageBucket,
  })),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn().mockImplementation(() => Buffer.from('mock file content')),
    unlink: vi.fn(),
  },
}));

vi.mock('../../helpers/tenantQuery.js', () => ({
  withTenantContext: vi.fn().mockImplementation((req, data) => ({ ...data, tenantId: req?.tenantId || 'mockTenantId' })),
  withTenantFilter: vi.fn().mockImplementation((req, query) => ({ ...query, tenantId: req?.tenantId || 'mockTenantId' })),
}));

// Import the service after all mocks are set up
import { knowledgebaseService } from './knowledgebase.service.js';
import { logger } from '../../../shared/logger.js';
import KnowledgeBase from './knowledgebase.model.js';
import KnowledgebaseFile from './knowledgebase.files.model.js';
import fsPromises from 'fs/promises';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { Storage } from '@google-cloud/storage';
import { RAGSystem } from 'rag-system-pgvector';
import { withTenantContext, withTenantFilter } from '../../helpers/tenantQuery.js';

describe('KnowledgebaseService', () => {
  const mockReq = { tenantId: 'testTenant123' };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset specific mock implementations if they change during tests
    mockGetGenerativeModel.mockReturnValue({ generateContent: mockGenerateContent });
    mockGenerateContent.mockResolvedValue({ response: { text: vi.fn().mockImplementation(() => 'Mock summarized context') } });
    mockRagAddDocumentFromBuffer.mockResolvedValue({
      success: true,
      documentId: 'rag-doc-id-1',
      chunkCount: 3,
      title: 'Processed Document',
    });
    mockRagQuery.mockResolvedValue({
      answer: 'Mock RAG answer',
      sources: [{ url: 'http://source.com', title: 'Source' }],
      confidence: 0.9,
      model: 'gemini-2.5-flash',
      tokensUsed: 100,
      chatHistory: [],
      sessionId: 'conv-123',
    });
    mockKnowledgeBaseFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockKnowledgeBaseFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockKnowledgebaseFileFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockKnowledgebaseFileFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockFileSave.mockResolvedValue(undefined);
    mockUploadFile.mockResolvedValue({
      file: { name: 'files/mock-file-id', mimeType: 'image/png', uri: 'gs://mock-bucket/mock-file' },
    });
    mockGetFile.mockResolvedValue({ state: 'COMPLETED' });
    mockDeleteFile.mockResolvedValue(undefined);
    fsPromises.readFile.mockResolvedValue(Buffer.from('mock file content'));
    fsPromises.unlink.mockResolvedValue(undefined);
  });

  // Helper for estimateTokenCount, which is a private function but used internally
  const estimateTokenCount = (text) => Math.ceil(text.length / 4);

  describe('summarizeContext', () => {
    it('should summarize context successfully', async () => {
      const longContext = 'a'.repeat(5000); // 5000 chars / 4 = 1250 tokens
      const summarizedText = 'short summary';
      mockGenerateContent.mockResolvedValueOnce({ response: { text: vi.fn().mockImplementation(() => summarizedText) } });

      const result = await knowledgebaseService.summarizeContext(longContext);

      expect(logger.info).toHaveBeenCalledWith('Summarizing conversation context due to token limit');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-2.5-flash' });
      expect(mockGenerateContent).toHaveBeenCalledWith(expect.stringContaining(longContext));
      expect(result).toBe(summarizedText);
      expect(logger.info).toHaveBeenCalledWith(
        `Context summarized: ${estimateTokenCount(longContext)} tokens -> ${estimateTokenCount(summarizedText)} tokens`
      );
    });

    it('should handle summarization error and truncate context', async () => {
      const longContext = 'a'.repeat(15000); // 15000 chars
      mockGenerateContent.mockRejectedValueOnce(new Error('LLM error'));

      const result = await knowledgebaseService.summarizeContext(longContext);

      expect(logger.error).toHaveBeenCalledWith('Error summarizing context:', expect.any(Error));
      expect(result).toBe(longContext.substring(0, 10000)); // Fallback truncation
    });

    it('should return "No summary generated" if LLM response is empty', async () => {
      const longContext = 'a'.repeat(5000);
      mockGenerateContent.mockResolvedValueOnce({ response: { text: vi.fn().mockImplementation(() => '') } });

      const result = await knowledgebaseService.summarizeContext(longContext);
      expect(result).toBe('No summary generated');
    });
  });

  describe('formatConversationContext', () => {
    it('should return context string if token count is within limit', async () => {
      const conversationHistory = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      const expectedContext = 'USER: Hello\n\nASSISTANT: Hi there!';

      const result = await knowledgebaseService.formatConversationContext(conversationHistory);

      expect(result).toBe(expectedContext);
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Context exceeds'));
    });

    it('should summarize context if token count exceeds limit', async () => {
      const longContent = 'a'.repeat(4500 * 4); // 4500 tokens
      const conversationHistory = [{ role: 'user', content: longContent }];
      const expectedContext = `USER: ${longContent}`;
      const summarizedText = 'short summary';

      // Mock summarizeContext directly as it's called internally
      const summarizeContextSpy = vi.spyOn(knowledgebaseService, 'summarizeContext');
      summarizeContextSpy.mockResolvedValueOnce(summarizedText);

      const result = await knowledgebaseService.formatConversationContext(conversationHistory);

      expect(logger.info).toHaveBeenCalledWith(
        `Context exceeds 4000 tokens (${estimateTokenCount(expectedContext)}), summarizing...`
      );
      expect(summarizeContextSpy).toHaveBeenCalledWith(expectedContext);
      expect(result).toBe(summarizedText);
      summarizeContextSpy.mockRestore();
    });

    it('should handle errors during formatting', async () => {
      const conversationHistory = [{ role: 'user', content: 'Hello' }];
      // Force an error, e.g., by making map throw
      vi.spyOn(conversationHistory, 'map').mockImplementationOnce(() => {
        throw new Error('Map error');
      });

      const result = await knowledgebaseService.formatConversationContext(conversationHistory);

      expect(logger.error).toHaveBeenCalledWith('Error formatting conversation context:', expect.any(Error));
      expect(result).toBe('');
    });
  });

  describe('uploadToGCS', () => {
    const mockBuffer = Buffer.from('test content');
    const mockFileName = 'test.pdf';
    const mockKnowledgebotId = 'kb-123';
    const expectedGcsFileName = expect.stringMatching(
      new RegExp(`${mockKnowledgebotId}/\\d+_test\\.pdf`)
    );
    const expectedPublicUrl = expect.stringMatching(
      new RegExp(`https://storage.googleapis.com/alti_assistant_knowledge_bot_files/${mockKnowledgebotId}/\\d+_test\\.pdf`)
    );

    it('should upload a file to GCS successfully and return public URL', async () => {
      const result = await knowledgebaseService.uploadToGCS(
        mockBuffer,
        mockFileName,
        mockKnowledgebotId
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Uploading file to GCS: alti_assistant_knowledge_bot_files/`)
      );
      expect(mockStorageBucket).toHaveBeenCalledWith('alti_assistant_knowledge_bot_files');
      expect(mockBucketFile).toHaveBeenCalledWith(expectedGcsFileName);
      expect(mockFileSave).toHaveBeenCalledWith(mockBuffer, {
        metadata: {
          contentType: 'application/pdf',
          metadata: {
            knowledgebotId: mockKnowledgebotId,
            originalName: mockFileName,
            uploadedAt: expect.any(String),
          },
        },
        resumable: false,
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`File uploaded successfully to GCS: `)
      );
      expect(result).toMatch(expectedPublicUrl);
    });

    it('should determine correct content type for docx', async () => {
      await knowledgebaseService.uploadToGCS(mockBuffer, 'document.docx', mockKnowledgebotId);
      expect(mockFileSave).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          metadata: expect.objectContaining({
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          }),
        })
      );
    });

    it('should use default content type for unknown extensions', async () => {
      await knowledgebaseService.uploadToGCS(mockBuffer, 'unknown.xyz', mockKnowledgebotId);
      expect(mockFileSave).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          metadata: expect.objectContaining({
            contentType: 'application/octet-stream',
          }),
        })
      );
    });

    it('should throw an error if GCS upload fails', async () => {
      mockFileSave.mockRejectedValueOnce(new Error('GCS upload failed'));

      await expect(
        knowledgebaseService.uploadToGCS(mockBuffer, mockFileName, mockKnowledgebotId)
      ).rejects.toThrow('Failed to upload file to GCS: GCS upload failed');
      expect(logger.error).toHaveBeenCalledWith('Error uploading file to GCS:', expect.any(Error));
    });
  });

  describe('extractMediaContent', () => {
    const mockFilePath = '/tmp/test.png';
    const mockMimeType = 'image/png';
    const mockGeminiResponse = {
      transcript: 'This is a test image description.',
      summary: 'A brief summary.',
      tags: ['test', 'image'],
      language: 'en',
    };

    it('should extract media content successfully for image', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn().mockImplementation(() => JSON.stringify(mockGeminiResponse)) },
      });

      const result = await knowledgebaseService.extractMediaContent(mockFilePath, mockMimeType);

      expect(logger.info).toHaveBeenCalledWith(
        `Extracting media content using Gemini 1.5 Pro File API for mimeType: ${mockMimeType}`
      );
      expect(mockUploadFile).toHaveBeenCalledWith(mockFilePath, { mimeType: mockMimeType });
      expect(mockGetFile).toHaveBeenCalledWith('files/mock-file-id'); // Check for processing state
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-2.5-pro',
        generationConfig: { responseMimeType: 'application/json' },
      });
      expect(mockGenerateContent).toHaveBeenCalledWith([
        expect.stringContaining('You are a multi-modal ingestion pipeline.'),
        { fileData: { mimeType: 'image/png', fileUri: 'gs://mock-bucket/mock-file' } },
      ]);
      expect(mockDeleteFile).toHaveBeenCalledWith('files/mock-file-id');
      expect(result).toBe(JSON.stringify(mockGeminiResponse));
    });

    it('should wait for media processing if state is PROCESSING', async () => {
      mockGetFile
        .mockResolvedValueOnce({ state: 'PROCESSING' })
        .mockResolvedValueOnce({ state: 'PROCESSING' })
        .mockResolvedValueOnce({ state: 'COMPLETED' }); // Simulate processing taking time

      mockGenerateContent.mockResolvedValueOnce({
        response: { text: vi.fn().mockImplementation(() => JSON.stringify(mockGeminiResponse)) },
      });

      await knowledgebaseService.extractMediaContent(mockFilePath, mockMimeType);

      expect(mockGetFile).toHaveBeenCalledTimes(3); // Initial call + 2 waits
      expect(logger.info).toHaveBeenCalledWith('Waiting for media processing...');
    });

    it('should throw an error if media processing fails', async () => {
      mockGetFile.mockResolvedValueOnce({ state: 'FAILED' });

      await expect(
        knowledgebaseService.extractMediaContent(mockFilePath, mockMimeType)
      ).rejects.toThrow('Media processing failed in Google AI Studio.');
      expect(logger.error).toHaveBeenCalledWith('Error extracting media content with Gemini:', expect.any(Error));
      expect(mockDeleteFile).toHaveBeenCalledWith('files/mock-file-id'); // Still attempts cleanup
    });

    it('should throw an error if Gemini content generation fails', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Gemini generation error'));

      await expect(
        knowledgebaseService.extractMediaContent(mockFilePath, mockMimeType)
      ).rejects.toThrow('Media extraction failed: Gemini generation error');
      expect(logger.error).toHaveBeenCalledWith('Error extracting media content with Gemini:', expect.any(Error));
      expect(mockDeleteFile).toHaveBeenCalledWith('files/mock-file-id'); // Still attempts cleanup
    });

    it('should handle empty Gemini response text', async () => {
      mockGenerateContent.mockResolvedValueOnce({ response: { text: vi.fn().mockImplementation(() => '') } });

      const result = await knowledgebaseService.extractMediaContent(mockFilePath, mockMimeType);
      expect(result).toBe('{}');
    });
  });

  describe('processUploadedFile', () => {
    const mockKnowledgebotId = 'kb-456';
    const mockUserId = 'user-789';
    const mockFileBuffer = Buffer.from('This is a test document content.');
    const mockFilePath = '/tmp/upload/document.txt';
    const mockFileName = 'document.txt';
    const mockFileObject = {
      path: mockFilePath,
      originalname: mockFileName,
      size: mockFileBuffer.length,
    };
    const mockGcsUrl = 'https://storage.googleapis.com/alti_assistant_knowledge_bot_files/kb-456/123_document.txt';

    beforeEach(() => {
      vi.spyOn(knowledgebaseService, 'uploadToGCS').mockResolvedValue(mockGcsUrl);
      vi.spyOn(knowledgebaseService, 'extractMediaContent').mockResolvedValue(
        JSON.stringify({
          transcript: 'This is a media transcription.',
          summary: 'Media summary',
          tags: ['media'],
          language: 'en',
        })
      );
      fsPromises.readFile.mockResolvedValue(mockFileBuffer);
      mockRagAddDocumentFromBuffer.mockResolvedValue({
        success: true,
        documentId: 'rag-doc-id-1',
        chunkCount: 3,
        title: 'Processed Document',
      });
    });

    it('should process a text file from path, upload to GCS, add to RAG, and save file record', async () => {
      const result = await knowledgebaseService.processUploadedFile(
        mockFileObject,
        mockKnowledgebotId,
        mockUserId,
        mockReq
      );

      expect(mockRagInitialize).toHaveBeenCalled();
      expect(fsPromises.readFile).toHaveBeenCalledWith(mockFilePath);
      expect(knowledgebaseService.uploadToGCS).toHaveBeenCalledWith(
        mockFileBuffer,
        mockFileName,
        mockKnowledgebotId
      );
      expect(mockRagAddDocumentFromBuffer).toHaveBeenCalledWith(
        mockFileBuffer,
        mockFileName,
        'txt',
        {
          knowledgebotId: mockKnowledgebotId,
          gcsUrl: mockGcsUrl,
        }
      );
      expect(fsPromises.unlink).toHaveBeenCalledWith(mockFilePath);
      expect(KnowledgebaseFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: expect.stringMatching(new RegExp(`\\d+_${mockFileName}`)),
          originalName: mockFileName,
          fileType: 'txt',
          fileSize: mockFileBuffer.length,
          gcsUrl: mockGcsUrl,
          gcsPath: expect.stringMatching(new RegExp(`${mockKnowledgebotId}/\\d+_${mockFileName}`)),
          documentId: 'rag-doc-id-1',
          knowledgebotId: mockKnowledgebotId,
          userId: mockUserId,
          title: 'Processed Document',
          chunkCount: 3,
          isActive: true,
          metadata: {},
          tenantId: mockReq.tenantId,
        })
      );
      expect(mockKnowledgebaseFileSave).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          fileName: mockFileName,
          fileType: 'txt',
          documentId: 'rag-doc-id-1',
          title: 'Processed Document',
          chunkCount: 3,
          gcsUrl: mockGcsUrl,
          fileId: 'file-id-123',
          uploadedAt: expect.any(String),
        })
      );
    });

    it('should process a media file from path, extract content, upload to GCS, add transcription to RAG, and save file record', async () => {
      const mediaFileName = 'image.png';
      const mediaFilePath = '/tmp/upload/image.png';
      const mediaFileObject = {
        path: mediaFilePath,
        originalname: mediaFileName,
        size: mockFileBuffer.length,
      };
      const mediaGcsUrl = 'https://storage.googleapis.com/alti_assistant_knowledge_bot_files/kb-456/123_image.png';
      knowledgebaseService.uploadToGCS.mockResolvedValueOnce(mediaGcsUrl);

      const result = await knowledgebaseService.processUploadedFile(
        mediaFileObject,
        mockKnowledgebotId,
        mockUserId,
        mockReq
      );

      expect(knowledgebaseService.extractMediaContent).toHaveBeenCalledWith(mediaFilePath, 'image/png');
      expect(mockRagAddDocumentFromBuffer).toHaveBeenCalledWith(
        Buffer.from('This is a media transcription.', 'utf-8'),
        'image.png_transcription.txt',
        'txt',
        {
          knowledgebotId: mockKnowledgebotId,
          gcsUrl: mediaGcsUrl,
          originalFile: mediaFileName,
        }
      );
      expect(KnowledgebaseFile).toHaveBeenCalledWith(
        expect.objectContaining({
          originalName: mediaFileName,
          fileType: 'png',
          gcsUrl: mediaGcsUrl,
          metadata: {
            summary: 'Media summary',
            tags: ['media'],
            language: 'en',
          },
        })
      );
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          fileName: mediaFileName,
          fileType: 'png',
          documentId: 'rag-doc-id-1',
          gcsUrl: mediaGcsUrl,
        })
      );
    });

    it('should handle media extraction returning non-JSON or parsing error', async () => {
      const mediaFileName = 'audio.mp3';
      const mediaFilePath = '/tmp/upload/audio.mp3';
      const mediaFileObject = {
        path: mediaFilePath,
        originalname: mediaFileName,
        size: mockFileBuffer.length,
      };
      const mediaGcsUrl = 'https://storage.googleapis.com/alti_assistant_knowledge_bot_files/kb-456/123_audio.mp3';
      knowledgebaseService.uploadToGCS.mockResolvedValueOnce(mediaGcsUrl);
      knowledgebaseService.extractMediaContent.mockResolvedValueOnce('This is plain text transcription, not JSON.');

      await knowledgebaseService.processUploadedFile(
        mediaFileObject,
        mockKnowledgebotId,
        mockUserId,
        mockReq
      );

      expect(logger.error).toHaveBeenCalledWith('Failed to parse JSON from Gemini', expect.any(Error));
      expect(mockRagAddDocumentFromBuffer).toHaveBeenCalledWith(
        Buffer.from('This is plain text transcription, not JSON.', 'utf-8'),
        'audio.mp3_transcription.txt',
        'txt',
        expect.objectContaining({
          knowledgebotId: mockKnowledgebotId,
          gcsUrl: mediaGcsUrl,
          originalFile: mediaFileName,
        })
      );
      expect(KnowledgebaseFile).toHaveBeenCalledWith(
        expect.objectContaining({
          originalName: mediaFileName,
          fileType: 'mp3',
          metadata: {}, // Metadata should be empty if JSON parsing failed
        })
      );
    });

    it('should throw an error for invalid file input', async () => {
      await expect(
        knowledgebaseService.processUploadedFile(
          { invalid: 'input' },
          mockKnowledgebotId,
          mockUserId,
          mockReq
        )
      ).rejects.toThrow('Invalid file input: must be either a file path string or a file object with buffer');
      expect(logger.error).toHaveBeenCalledWith('Error processing uploaded file:', expect.any(Error));
    });

    it('should throw an error if GCS upload fails', async () => {
      knowledgebaseService.uploadToGCS.mockRejectedValueOnce(new Error('GCS upload failed'));

      await expect(
        knowledgebaseService.processUploadedFile(mockFileObject, mockKnowledgebotId, mockUserId, mockReq)
      ).rejects.toThrow('GCS upload failed');
      expect(logger.error).toHaveBeenCalledWith('Error processing uploaded file:', expect.any(Error));
    });

    it('should throw an error if RAG addDocumentFromBuffer fails', async () => {
      mockRagAddDocumentFromBuffer.mockRejectedValueOnce(new Error('RAG error'));

      await expect(
        knowledgebaseService.processUploadedFile(mockFileObject, mockKnowledgebotId, mockUserId, mockReq)
      ).rejects.toThrow('RAG error');
      expect(logger.error).toHaveBeenCalledWith('Error processing uploaded file:', expect.any(Error));
    });

    it('should still attempt to unlink temp file even if RAG fails', async () => {
      mockRagAddDocumentFromBuffer.mockRejectedValueOnce(new Error('RAG error'));

      await expect(
        knowledgebaseService.processUploadedFile(mockFileObject, mockKnowledgebotId, mockUserId, mockReq)
      ).rejects.toThrow('RAG error');
      expect(fsPromises.unlink).toHaveBeenCalledWith(mockFilePath);
    });

    it('should handle `file` as a string (direct path)', async () => {
      const result = await knowledgebaseService.processUploadedFile(
        mockFilePath, // direct path string
        mockKnowledgebotId,
        mockUserId,
        mockReq
      );

      expect(fsPromises.readFile).toHaveBeenCalledWith(mockFilePath);
      expect(knowledgebaseService.uploadToGCS).toHaveBeenCalledWith(
        mockFileBuffer,
        mockFileName,
        mockKnowledgebotId
      );
      expect(mockRagAddDocumentFromBuffer).toHaveBeenCalledWith(
        mockFileBuffer,
        mockFileName,
        'txt',
        expect.any(Object)
      );
      expect(fsPromises.unlink).not.toHaveBeenCalledWith(mockFilePath); // No unlink for direct path string
      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          fileName: mockFileName,
          filePath: mockFilePath, // filePath should be the string itself
        })
      );
    });
  });

  describe('invokeRagSystem', () => {
    it('should initialize RAG and query it', async () => {
      const query = 'Test query';
      const knowledgebotId = 'kb-invoke-1';
      const contextString = 'Some context';

      const response = await knowledgebaseService.invokeRagSystem(
        query,
        knowledgebotId,
        contextString
      );

      expect(mockRagInitialize).toHaveBeenCalled();
      expect(mockRagQuery).toHaveBeenCalledWith(query, {
        filter: { knowledgebotId: knowledgebotId },
      });
      expect(response).toEqual({
        answer: 'Mock RAG answer',
        sources: [{ url: 'http://source.com', title: 'Source' }],
        confidence: 0.9,
        model: 'gemini-2.5-flash',
        tokensUsed: 100,
        chatHistory: [],
        sessionId: 'conv-123',
      });
    });
  });

  describe('getUserFiles', () => {
    const mockFiles = [
      {
        _id: 'file1',
        originalName: 'file1.pdf',
        fileType: 'pdf',
        fileSize: 1024,
        gcsUrl: 'url1',
        documentId: 'doc1',
        knowledgebotId: 'kb1',
        userId: 'user1',
        title: 'Title 1',
        chunkCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: 'file2',
        originalName: 'file2.txt',
        fileType: 'txt',
        fileSize: 2048,
        gcsUrl: 'url2',
        documentId: 'doc2',
        knowledgebotId: 'kb1',
        userId: 'user1',
        title: 'Title 2',
        chunkCount: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should retrieve all active files for a user', async () => {
      mockKnowledgebaseFileFind.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockFiles) });

      const result = await knowledgebaseService.getUserFiles('user1', null, mockReq);

      expect(logger.info).toHaveBeenCalledWith('Retrieving files for user: user1');
      expect(mockKnowledgebaseFileFind).toHaveBeenCalledWith({
        userId: 'user1',
        isActive: true,
        tenantId: mockReq.tenantId,
      });
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { userId: 'user1', isActive: true });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'file1',
          fileName: 'file1.pdf',
          fileType: 'pdf',
        })
      );
    });

    it('should retrieve files for a user filtered by knowledgebotId', async () => {
      mockKnowledgebaseFileFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([mockFiles[0]]) });

      const result = await knowledgebaseService.getUserFiles('user1', 'kb1', mockReq);

      expect(logger.info).toHaveBeenCalledWith('Retrieving files for user: user1, knowledgebot: kb1');
      expect(mockKnowledgebaseFileFind).toHaveBeenCalledWith({
        userId: 'user1',
        isActive: true,
        knowledgebotId: 'kb1',
        tenantId: mockReq.tenantId,
      });
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, {
        userId: 'user1',
        isActive: true,
        knowledgebotId: 'kb1',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('file1');
    });

    it('should return an empty array if no files are found', async () => {
      mockKnowledgebaseFileFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

      const result = await knowledgebaseService.getUserFiles('user-no-files', null, mockReq);

      expect(result).toHaveLength(0);
    });

    it('should throw an error if database operation fails', async () => {
      mockKnowledgebaseFileFind.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB error')) });

      await expect(knowledgebaseService.getUserFiles('user1', null, mockReq)).rejects.toThrow('DB error');
      expect(logger.error).toHaveBeenCalledWith('Error retrieving user files:', expect.any(Error));
    });
  });

  describe('getKnowledgebotFiles', () => {
    const mockFiles = [
      {
        _id: 'file1',
        originalName: 'file1.pdf',
        fileType: 'pdf',
        fileSize: 1024,
        gcsUrl: 'url1',
        documentId: 'doc1',
        knowledgebotId: 'kb1',
        userId: 'user1',
        title: 'Title 1',
        chunkCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should retrieve all active files for a knowledgebot', async () => {
      mockKnowledgebaseFileFind.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockFiles) });

      const result = await knowledgebaseService.getKnowledgebotFiles('kb1', mockReq);

      expect(logger.info).toHaveBeenCalledWith('Retrieving files for knowledgebot: kb1');
      expect(mockKnowledgebaseFileFind).toHaveBeenCalledWith({
        knowledgebotId: 'kb1',
        isActive: true,
        tenantId: mockReq.tenantId,
      });
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { knowledgebotId: 'kb1', isActive: true });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'file1',
          fileName: 'file1.pdf',
          knowledgebotId: 'kb1',
        })
      );
    });

    it('should return an empty array if no files are found', async () => {
      mockKnowledgebaseFileFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

      const result = await knowledgebaseService.getKnowledgebotFiles('kb-no-files', mockReq);

      expect(result).toHaveLength(0);
    });

    it('should throw an error if database operation fails', async () => {
      mockKnowledgebaseFileFind.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB error')) });

      await expect(knowledgebaseService.getKnowledgebotFiles('kb1', mockReq)).rejects.toThrow('DB error');
      expect(logger.error).toHaveBeenCalledWith('Error retrieving knowledgebot files:', expect.any(Error));
    });
  });

  describe('getUserKnowledgeBases', () => {
    const mockKBs = [
      {
        _id: 'kb1',
        name: 'KB One',
        description: 'Desc One',
        isActive: true,
        documentsCount: 5,
        totalFileSize: 5120,
        formattedFileSize: '5 KB',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: 'kb2',
        name: 'KB Two',
        description: 'Desc Two',
        isActive: true,
        documentsCount: 10,
        totalFileSize: 10240,
        formattedFileSize: '10 KB',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should retrieve all active knowledge bases for a user', async () => {
      mockKnowledgeBaseFind.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockKBs) });

      const result = await knowledgebaseService.getUserKnowledgeBases('user1', mockReq);

      expect(logger.info).toHaveBeenCalledWith('Retrieving knowledge bases for user: user1');
      expect(mockKnowledgeBaseFind).toHaveBeenCalledWith({
        userId: 'user1',
        isActive: true,
        tenantId: mockReq.tenantId,
      });
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { userId: 'user1', isActive: true });
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({
          id: 'kb1',
          name: 'KB One',
          documentsCount: 5,
        })
      );
    });

    it('should return an empty array if no knowledge bases are found', async () => {
      mockKnowledgeBaseFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

      const result = await knowledgebaseService.getUserKnowledgeBases('user-no-kbs', mockReq);

      expect(result).toHaveLength(0);
    });

    it('should throw an error if database operation fails', async () => {
      mockKnowledgeBaseFind.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB error')) });

      await expect(knowledgebaseService.getUserKnowledgeBases('user1', mockReq)).rejects.toThrow('DB error');
      expect(logger.error).toHaveBeenCalledWith('Error retrieving user knowledge bases:', expect.any(Error));
    });
  });

  describe('createKnowledgeBase', () => {
    const payload = { name: 'New KB', description: 'A new knowledge base' };
    const userId = 'user-create';

    it('should create a new knowledge base successfully', async () => {
      mockKnowledgeBaseFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }); // No existing KB

      const result = await knowledgebaseService.createKnowledgeBase(payload, userId, mockReq);

      expect(logger.info).toHaveBeenCalledWith(`Creating knowledge base: ${payload.name} for user: ${userId}`);
      expect(mockKnowledgeBaseFindOne).toHaveBeenCalledWith({
        userId: userId,
        name: payload.name,
        isActive: true,
        tenantId: mockReq.tenantId,
      });
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { userId, name: payload.name, isActive: true });
      expect(KnowledgeBase).toHaveBeenCalledWith(
        expect.objectContaining({
          name: payload.name,
          userId: userId,
          description: payload.description,
          isActive: true,
          documentsCount: 0,
          totalFileSize: 0,
          tenantId: mockReq.tenantId,
        })
      );
      expect(mockKnowledgeBaseSave).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(`Knowledge base created successfully: kb-id-123`);
      expect(result).toEqual(
        expect.objectContaining({
          id: 'kb-id-123',
          name: payload.name,
          userId: userId,
          description: payload.description,
          isActive: true,
          documentsCount: 0,
          totalFileSize: 0,
          formattedFileSize: '0 B',
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
    });

    it('should throw an error if a knowledge base with the same name already exists', async () => {
      mockKnowledgeBaseFindOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: 'existing-kb-id', name: payload.name }),
      });

      await expect(knowledgebaseService.createKnowledgeBase(payload, userId, mockReq)).rejects.toThrow(
        'Knowledge base with this name already exists'
      );
      expect(logger.error).toHaveBeenCalledWith('Error creating knowledge base:', expect.any(Error));
      expect(mockKnowledgeBaseSave).not.toHaveBeenCalled();
    });

    it('should handle database save error', async () => {
      mockKnowledgeBaseFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
      mockKnowledgeBaseSave.mockRejectedValueOnce(new Error('DB save error'));

      await expect(knowledgebaseService.createKnowledgeBase(payload, userId, mockReq)).rejects.toThrow(
        'DB save error'
      );
      expect(logger.error).toHaveBeenCalledWith('Error creating knowledge base:', expect.any(Error));
    });
  });

  describe('getKnowledgeBaseById', () => {
    const knowledgebaseId = 'kb-get-id';
    const userId = 'user-get';
    const mockKB = {
      _id: knowledgebaseId,
      name: 'Test KB',
      description: 'Test Description',
      isActive: true,
      documentsCount: 5,
      totalFileSize: 5120,
      formattedFileSize: '5 KB',
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should retrieve a knowledge base by ID for a user', async () => {
      mockKnowledgeBaseFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(mockKB) });

      const result = await knowledgebaseService.getKnowledgeBaseById(knowledgebaseId, userId, mockReq);

      expect(logger.info).toHaveBeenCalledWith(
        `Retrieving knowledge base: ${knowledgebaseId} for user: ${userId}`
      );
      expect(mockKnowledgeBaseFindOne).toHaveBeenCalledWith({
        _id: knowledgebaseId,
        userId: userId,
        isActive: true,
        tenantId: mockReq.tenantId,
      });
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, {
        _id: knowledgebaseId,
        userId: userId,
        isActive: true,
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: knowledgebaseId,
          name: 'Test KB',
        })
      );
    });

    it('should return null if knowledge base is not found', async () => {
      mockKnowledgeBaseFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

      const result = await knowledgebaseService.getKnowledgeBaseById(knowledgebaseId, userId, mockReq);

      expect(result).toBeNull();
    });

    it('should throw an error if database operation fails', async () => {
      mockKnowledgeBaseFindOne.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('DB error')) });

      await expect(
        knowledgebaseService.getKnowledgeBaseById(knowledgebaseId, userId, mockReq)
      ).rejects.toThrow('DB error');
      expect(logger.error).toHaveBeenCalledWith('Error retrieving knowledge base:', expect.any(Error));
    });
  });

  describe('chatWithKnowledgeBase', () => {
    const message = 'What is the capital of France?';
    const knowledgebaseId = 'kb-chat-id';
    const conversationId = 'conv-chat-id';
    const conversationHistory = [{ role: 'user', content: 'Hello' }];

    it('should initialize RAG and query with provided parameters', async () => {
      const result = await knowledgebaseService.chatWithKnowledgeBase(
        message,
        knowledgebaseId,
        conversationId,
        conversationHistory
      );

      expect(logger.info).toHaveBeenCalledWith(
        `Processing chat message for knowledge base: ${knowledgebaseId}, conversation: ${conversationId}`
      );
      expect(mockRagInitialize).toHaveBeenCalled();
      expect(mockRagQuery).toHaveBeenCalledWith(message, {
        filter: { knowledgebotId: knowledgebaseId },
        chatHistory: conversationHistory,
        sessionId: conversationId,
        persistSession: true,
        knowledgebotId: knowledgebaseId,
        limit: 10,
        threshold: 0.1,
      });
      expect(logger.info).toHaveBeenCalledWith(
        `RAG response generated for knowledge base: ${knowledgebaseId}`
      );
      expect(result).toEqual({
        answer: 'Mock RAG answer',
        sources: [{ url: 'http://source.com', title: 'Source' }],
        confidence: 0.9,
        model: 'gemini-2.5-flash',
        tokensUsed: 100,
        chatHistory: conversationHistory, // Should return the provided history if RAG doesn't modify it
        sessionId: conversationId,
      });
    });

    it('should provide a default answer if RAG response is empty', async () => {
      mockRagQuery.mockResolvedValueOnce({
        answer: '',
        sources: [],
        confidence: 0,
        model: 'gemini-2.5-flash',
        tokensUsed: 0,
        chatHistory: [],
        sessionId: 'conv-chat-id',
      });

      const result = await knowledgebaseService.chatWithKnowledgeBase(
        message,
        knowledgebaseId,
        conversationId,
        conversationHistory
      );

      expect(result.answer).toBe(
        "I apologize, but I couldn't find relevant information in the knowledge base to answer your question."
      );
    });

    it('should handle errors during chat with knowledge base', async () => {
      mockRagQuery.mockRejectedValueOnce(new Error('RAG chat error'));

      await expect(
        knowledgebaseService.chatWithKnowledgeBase(
          message,
          knowledgebaseId,
          conversationId,
          conversationHistory
        )
      ).rejects.toThrow('RAG chat error');
      expect(logger.error).toHaveBeenCalledWith('Error in chat with knowledge base:', expect.any(Error));
    });
  });

  describe('deleteKnowledgeBase', () => {
    const knowledgebaseId = 'kb-delete-id';
    const userId = 'user-delete';
    const mockKB = {
      _id: knowledgebaseId,
      userId: userId,
      isActive: true,
      save: vi.fn().mockResolvedValue(true),
    };

    it('should soft delete a knowledge base successfully', async () => {
      mockKnowledgeBaseFindOne.mockResolvedValueOnce(mockKB);

      const result = await knowledgebaseService.deleteKnowledgeBase(knowledgebaseId, userId, mockReq);

      expect(logger.info).toHaveBeenCalledWith(
        `Deleting knowledge base: ${knowledgebaseId} for user: ${userId}`
      );
      expect(mockKnowledgeBaseFindOne).toHaveBeenCalledWith({
        _id: knowledgebaseId,
        userId: userId,
        tenantId: mockReq.tenantId,
      });
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: knowledgebaseId, userId: userId });
      expect(mockKB.isActive).toBe(false);
      expect(mockKB.save).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(`Knowledge base deleted successfully: ${knowledgebaseId}`);
      expect(result).toBe(true);
    });

    it('should throw an error if knowledge base is not found', async () => {
      mockKnowledgeBaseFindOne.mockResolvedValueOnce(null);

      await expect(
        knowledgebaseService.deleteKnowledgeBase(knowledgebaseId, userId, mockReq)
      ).rejects.toThrow('Knowledge base not found');
      expect(logger.error).toHaveBeenCalledWith('Error deleting knowledge base:', expect.any(Error));
    });

    it('should throw an error if database operation fails during find', async () => {
      mockKnowledgeBaseFindOne.mockRejectedValueOnce(new Error('DB find error'));

      await expect(
        knowledgebaseService.deleteKnowledgeBase(knowledgebaseId, userId, mockReq)
      ).rejects.toThrow('DB find error');
      expect(logger.error).toHaveBeenCalledWith('Error deleting knowledge base:', expect.any(Error));
    });

    it('should throw an error if database operation fails during save', async () => {
      mockKnowledgeBaseFindOne.mockResolvedValueOnce({
        ...mockKB,
        save: vi.fn().mockRejectedValueOnce(new Error('DB save error')),
      });

      await expect(
        knowledgebaseService.deleteKnowledgeBase(knowledgebaseId, userId, mockReq)
      ).rejects.toThrow('DB save error');
      expect(logger.error).toHaveBeenCalledWith('Error deleting knowledge base:', expect.any(Error));
    });
  });

  describe('deleteUserFile', () => {
    const fileId = 'file-delete-id';
    const userId = 'user-delete-file';
    const mockFile = {
      _id: fileId,
      userId: userId,
      fileSize: 1024,
    };

    it('should delete a user file successfully', async () => {
      mockKnowledgebaseFileFindOne.mockResolvedValueOnce(mockFile);
      mockKnowledgebaseFileDeleteOne.mockResolvedValueOnce({ deletedCount: 1 });

      const result = await knowledgebaseService.deleteUserFile(fileId, userId, mockReq);

      expect(logger.info).toHaveBeenCalledWith(`Deleting file ${fileId} for user: ${userId}`);
      expect(mockKnowledgebaseFileFindOne).toHaveBeenCalledWith({ _id: fileId, tenantId: mockReq.tenantId });
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: fileId });
      expect(mockKnowledgebaseFileDeleteOne).toHaveBeenCalledWith({ _id: fileId, tenantId: mockReq.tenantId });
      expect(logger.info).toHaveBeenCalledWith(`File ${fileId} deleted successfully for user: ${userId}`);
      expect(result).toEqual({ deleted: true, fileSize: 1024 });
    });

    it('should return false if file is not found', async () => {
      mockKnowledgebaseFileFindOne.mockResolvedValueOnce(null);

      const result = await knowledgebaseService.deleteUserFile(fileId, userId, mockReq);

      expect(result).toBe(false);
      expect(mockKnowledgebaseFileDeleteOne).not.toHaveBeenCalled();
    });

    it('should handle file with no fileSize property', async () => {
      mockKnowledgebaseFileFindOne.mockResolvedValueOnce({ ...mockFile, fileSize: undefined });
      mockKnowledgebaseFileDeleteOne.mockResolvedValueOnce({ deletedCount: 1 });

      const result = await knowledgebaseService.deleteUserFile(fileId, userId, mockReq);

      expect(result).toEqual({ deleted: true, fileSize: 0 });
    });

    it('should throw an error if database operation fails during find', async () => {
      mockKnowledgebaseFileFindOne.mockRejectedValueOnce(new Error('DB find error'));

      await expect(knowledgebaseService.deleteUserFile(fileId, userId, mockReq)).rejects.toThrow('DB find error');
      expect(logger.error).toHaveBeenCalledWith('Error deleting user file:', expect.any(Error));
    });

    it('should throw an error if database operation fails during delete', async () => {
      mockKnowledgebaseFileFindOne.mockResolvedValueOnce(mockFile);
      mockKnowledgebaseFileDeleteOne.mockRejectedValueOnce(new Error('DB delete error'));

      await expect(knowledgebaseService.deleteUserFile(fileId, userId, mockReq)).rejects.toThrow('DB delete error');
      expect(logger.error).toHaveBeenCalledWith('Error deleting user file:', expect.any(Error));
    });
  });
});