import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
// Using vi.doMock and then re-importing the module under test in beforeEach
// to ensure module-level state is reset for each test.

let downloadAndLoadFileActivity, parseToMarkdownActivity, chunkAndEmbedActivity, commitToVectorStoreActivity, cleanupFailedIngestionActivity;
let mockExtractTextAndBuildDocuments, mockSaveManifest, mockLoadManifest, mockNodeToMetadata, mockSettings, mockLlm, mockEmbedModel;
let mockTitleExtractor, mockKeywordExtractor, mockIngestionPipeline, mockMarkdownNodeParser, mockSentenceWindowNodeParser;
let mockFsPromisesStat, mockFsPromisesMkdir, mockFsPromisesReadFile, mockFsPromisesWriteFile, mockFsPromisesUnlink, mockFsPromisesRename, mockFsPromisesAccess;
let mockExistsSync;
let mockPathResolve, mockPathJoin;
let mockLoggerInfo, mockLoggerError, mockLoggerWarn;

let mockWriteStream, mockReadlineInterface, mockPipelineRun;

beforeEach(async () => {
  vi.resetAllMocks(); // Reset all mock calls and instances
  vi.resetModules(); // Reset the module cache

  // Re-mock all dependencies using vi.doMock
  mockExtractTextAndBuildDocuments = vi.fn();
  mockSaveManifest = vi.fn();
  mockLoadManifest = vi.fn();
  mockNodeToMetadata = vi.fn((node) => ({ ...node, metadata: { ...node.metadata, converted: true } }));
  mockLlm = {
    metadata: { model_name: 'mock-llm' },
    call: vi.fn(() => 'mock-llm-response'),
  };
  mockEmbedModel = {
    getTextEmbedding: vi.fn(() => Promise.resolve([0.1, 0.2, 0.3])),
    getQueryEmbedding: vi.fn(() => Promise.resolve([0.1, 0.2, 0.3])),
    transform: vi.fn((nodes) => nodes.map(node => ({ ...node, embedding: [0.1, 0.2, 0.3] }))),
  };
  mockSettings = { llm: mockLlm, embedModel: mockEmbedModel };

  vi.doMock('../llamaindex.indexer.js', () => ({
    extractTextAndBuildDocuments: mockExtractTextAndBuildDocuments,
    saveManifest: mockSaveManifest,
    loadManifest: mockLoadManifest,
    nodeToMetadata: mockNodeToMetadata,
    Settings: mockSettings,
  }));

  mockPipelineRun = vi.fn(async ({ documents }) => {
    if (documents.length === 0) return [];
    return documents.map((doc, i) => ({
      id: `node-${i}`,
      text: `chunk of ${doc.text}`,
      metadata: { ...doc.metadata, chunked: true },
      embedding: [0.1, 0.2, 0.3],
    }));
  });
  mockTitleExtractor = vi.fn(function() {
    return { transform: vi.fn((nodes) => nodes.map(n => ({ ...n, metadata: { ...n.metadata, title: 'Mock Title' } }))) };
  });
  mockKeywordExtractor = vi.fn(function() {
    return { transform: vi.fn((nodes) => nodes.map(n => ({ ...n, metadata: { ...n.metadata, keywords: ['mock', 'keywords'] } }))) };
  });
  mockIngestionPipeline = vi.fn(function() {
    return { run: mockPipelineRun };
  });
  mockMarkdownNodeParser = vi.fn(function() {
    return { transform: vi.fn((nodes) => nodes.map(n => ({ ...n, metadata: { ...n.metadata, parsedBy: 'Markdown' } }))) };
  });
  mockSentenceWindowNodeParser = vi.fn(function() {
    return { transform: vi.fn((nodes) => nodes.map(n => ({ ...n, metadata: { ...n.metadata, parsedBy: 'SentenceWindow' } }))) };
  });

  vi.doMock('llamaindex', async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      TitleExtractor: mockTitleExtractor,
      KeywordExtractor: mockKeywordExtractor,
      IngestionPipeline: mockIngestionPipeline,
      MarkdownNodeParser: mockMarkdownNodeParser,
      SentenceWindowNodeParser: mockSentenceWindowNodeParser,
    };
  });

  mockFsPromisesStat = vi.fn();
  mockFsPromisesMkdir = vi.fn();
  mockFsPromisesReadFile = vi.fn();
  mockFsPromisesWriteFile = vi.fn();
  mockFsPromisesUnlink = vi.fn().mockResolvedValue(undefined);
  mockFsPromisesRename = vi.fn().mockResolvedValue(undefined);
  mockFsPromisesAccess = vi.fn().mockResolvedValue(undefined);
  vi.doMock('node:fs/promises', () => ({
    default: {
      stat: mockFsPromisesStat,
      mkdir: mockFsPromisesMkdir,
      readFile: mockFsPromisesReadFile,
      writeFile: mockFsPromisesWriteFile,
      unlink: mockFsPromisesUnlink,
      rename: mockFsPromisesRename,
      access: mockFsPromisesAccess,
    },
  }));

  mockExistsSync = vi.fn();
  mockWriteStream = {
    write: vi.fn(),
    end: vi.fn(function() {
      process.nextTick(() => {
        if (this.onFinish) this.onFinish();
      });
    }),
    on: vi.fn(function(event, cb) {
      if (event === 'finish') this.onFinish = cb;
      if (event === 'error') this.onError = cb;
    })
  };

  vi.doMock('node:fs', () => {
    const fsMock = {
      existsSync: mockExistsSync,
      createWriteStream: vi.fn(() => mockWriteStream),
      createReadStream: vi.fn(() => ({})),
      constants: {
        R_OK: 4,
        W_OK: 2,
      }
    };
    return {
      default: fsMock,
      ...fsMock
    };
  });

  mockReadlineInterface = {
    [Symbol.asyncIterator]: vi.fn(() => {
      return {
        async next() {
          return { done: true };
        }
      };
    })
  };

  vi.doMock('node:readline', () => {
    const readlineMock = {
      createInterface: vi.fn(() => mockReadlineInterface),
    };
    return {
      default: readlineMock,
      ...readlineMock
    };
  });

  mockPathResolve = vi.fn((p) => p);
  mockPathJoin = vi.fn((...args) => args.join('/'));
  
  const mockPathFactory = async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      default: {
        ...actual.default,
        resolve: mockPathResolve,
        join: mockPathJoin,
      },
      resolve: mockPathResolve,
      join: mockPathJoin,
    };
  };

  vi.doMock('node:path', mockPathFactory);
  vi.doMock('path', mockPathFactory);

  vi.doMock('node:crypto', () => ({
    default: {
      randomUUID: vi.fn(() => 'mock-uuid'),
    },
  }));

  mockLoggerInfo = vi.fn();
  mockLoggerError = vi.fn();
  mockLoggerWarn = vi.fn();
  vi.doMock('../../../../shared/logger.js', () => ({
    logger: {
      info: mockLoggerInfo,
      error: mockLoggerError,
      warn: mockLoggerWarn,
    },
  }));

  vi.doMock('../../../../../config/index.js', () => ({
    default: {},
  }));

  vi.doMock('./ragIngestionActivities.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      activityTransitiveState: new Map(),
    };
  });

  // Dynamically import the module under test AFTER all mocks are set up
  const module = await import('./ragIngestionActivities.js');
  downloadAndLoadFileActivity = module.downloadAndLoadFileActivity;
  parseToMarkdownActivity = module.parseToMarkdownActivity;
  chunkAndEmbedActivity = module.chunkAndEmbedActivity;
  commitToVectorStoreActivity = module.commitToVectorStoreActivity;
  cleanupFailedIngestionActivity = module.cleanupFailedIngestionActivity;
});

describe('ragIngestionActivities', () => {
  const mockFilePath = '/tmp/test-doc.pdf';
  const mockOriginalName = 'test-doc.pdf';
  const mockDocId = 'doc-123';
  const mockUserId = 'user-456';

  describe('downloadAndLoadFileActivity', () => {
    it('should successfully load a file if it exists', async () => {
      mockFsPromisesStat.mockResolvedValue({ size: 1024 });

      const result = await downloadAndLoadFileActivity(mockFilePath, mockOriginalName, mockDocId, 'tenant-123');

      expect(result).toEqual({
        success: true,
        sizeBytes: 1024,
        filePath: mockFilePath,
        originalName: mockOriginalName,
      });
      expect(mockFsPromisesStat).toHaveBeenCalledWith(mockFilePath);
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Starting document load and validation'
      }));
    });

    it('should throw an error if the file does not exist', async () => {
      const statError = new Error('ENOENT: no such file or directory');
      statError.code = 'ENOENT';
      mockFsPromisesStat.mockRejectedValue(statError);

      await expect(downloadAndLoadFileActivity(mockFilePath, mockOriginalName, mockDocId, 'tenant-123')).rejects.toThrow(
        statError
      );
      expect(mockFsPromisesStat).toHaveBeenCalledWith(mockFilePath);
      expect(mockLoggerError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('downloadAndLoadFileActivity failed')
      }));
    });

    it('should propagate stat errors', async () => {
      const statError = new Error('Stat failed');
      mockFsPromisesStat.mockRejectedValue(statError);

      await expect(downloadAndLoadFileActivity(mockFilePath, mockOriginalName, mockDocId, 'tenant-123')).rejects.toThrow(statError);
      expect(mockFsPromisesStat).toHaveBeenCalledWith(mockFilePath);
      expect(mockLoggerError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('downloadAndLoadFileActivity failed')
      }));
    });
  });

  describe('parseToMarkdownActivity', () => {
    const mockDocuments = [{ text: 'doc1', metadata: {} }, { text: 'doc2', metadata: { useMarkdownParser: true } }];

    it('should successfully parse documents and return them', async () => {
      mockExtractTextAndBuildDocuments.mockResolvedValue(mockDocuments);

      const result = await parseToMarkdownActivity(mockFilePath, mockOriginalName, mockDocId);

      expect(result).toEqual({
        success: true,
        documents: mockDocuments,
        documentCount: 2,
        isMarkdown: true,
      });
      expect(mockExtractTextAndBuildDocuments).toHaveBeenCalledWith(mockFilePath, mockOriginalName, mockDocId);
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.objectContaining({
        message: 'High-fidelity parsing document'
      }));
    });

    it('should return isMarkdown: false if no documents have useMarkdownParser', async () => {
      const plainDocuments = [{ text: 'doc1', metadata: {} }, { text: 'doc2', metadata: {} }];
      mockExtractTextAndBuildDocuments.mockResolvedValue(plainDocuments);

      const result = await parseToMarkdownActivity(mockFilePath, mockOriginalName, mockDocId);

      expect(result.isMarkdown).toBe(false);
    });

    it('should throw an error if parsing produces no documents', async () => {
      mockExtractTextAndBuildDocuments.mockResolvedValue([]);

      await expect(parseToMarkdownActivity(mockFilePath, mockOriginalName, mockDocId)).rejects.toThrow(
        'Parsing produced no document instances.'
      );
      expect(mockLoggerError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('parseToMarkdownActivity failed')
      }));
    });

    it('should throw an error if extractTextAndBuildDocuments fails', async () => {
      const parseError = new Error('Parsing failed');
      mockExtractTextAndBuildDocuments.mockRejectedValue(parseError);

      await expect(parseToMarkdownActivity(mockFilePath, mockOriginalName, mockDocId)).rejects.toThrow(parseError);
      expect(mockLoggerError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('parseToMarkdownActivity failed')
      }));
    });
  });

  describe('chunkAndEmbedActivity', () => {
    const mockDocumentsMarkdown = [{ text: 'doc1', metadata: { useMarkdownParser: true } }];
    const mockDocumentsPlain = [{ text: 'doc1', metadata: {} }];
    const mockNodes = [{ id: 'node-0', text: 'chunk of doc1', metadata: { chunked: true }, embedding: [0.1, 0.2, 0.3] }];

    it('should successfully chunk and embed documents using MarkdownNodeParser', async () => {
      mockPipelineRun.mockResolvedValue(mockNodes);

      const result = await chunkAndEmbedActivity(mockDocumentsMarkdown, mockOriginalName, mockDocId, mockUserId);

      expect(result).toEqual({
        success: true,
        nodes: mockNodes,
        nodeCount: mockNodes.length,
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Segmenting and generating vector embeddings'
      }));
      expect(mockMarkdownNodeParser).toHaveBeenCalled();
      expect(mockSentenceWindowNodeParser).not.toHaveBeenCalled();
      expect(mockTitleExtractor).toHaveBeenCalledWith({ llm: mockSettings.llm, nodes: 3 });
      expect(mockKeywordExtractor).toHaveBeenCalledWith({ llm: mockSettings.llm, keywords: 5 });
      expect(mockIngestionPipeline).toHaveBeenCalledWith({
        transformations: [
          expect.any(Object), // MarkdownNodeParser instance
          expect.any(Object), // TitleExtractor instance
          expect.any(Object), // KeywordExtractor instance
          mockSettings.embedModel,
        ],
      });
      expect(mockPipelineRun).toHaveBeenCalledWith({ documents: mockDocumentsMarkdown });
    });

    it('should successfully chunk and embed documents using SentenceWindowNodeParser', async () => {
      mockPipelineRun.mockResolvedValue(mockNodes);

      const result = await chunkAndEmbedActivity(mockDocumentsPlain, mockOriginalName, mockDocId, mockUserId);

      expect(result).toEqual({
        success: true,
        nodes: mockNodes,
        nodeCount: mockNodes.length,
      });
      expect(mockSentenceWindowNodeParser).toHaveBeenCalledWith({
        windowSize: 3,
        windowMetadataKey: '_window',
        originalTextMetadataKey: '_original_text',
      });
      expect(mockMarkdownNodeParser).not.toHaveBeenCalled();
      expect(mockPipelineRun).toHaveBeenCalledWith({ documents: mockDocumentsPlain });
    });

    it('should throw an error if input documents are not provided', async () => {
      await expect(chunkAndEmbedActivity(null, mockOriginalName, mockDocId, mockUserId)).rejects.toThrow(
        'Input documents not provided.'
      );
      expect(mockLoggerError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('chunkAndEmbedActivity failed')
      }));
    });

    it('should throw an error if IngestionPipeline.run fails', async () => {
      const pipelineError = new Error('Pipeline failed');
      mockPipelineRun.mockRejectedValue(pipelineError);

      await expect(chunkAndEmbedActivity(mockDocumentsPlain, mockOriginalName, mockDocId, mockUserId)).rejects.toThrow(pipelineError);
      expect(mockLoggerError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('chunkAndEmbedActivity failed')
      }));
    });

    it('should log a warning if metadata extractors fail to configure but continue', async () => {
      // Simulate TitleExtractor constructor throwing an error
      mockTitleExtractor.mockImplementation(function() { throw new Error('LLM not configured'); });
      mockPipelineRun.mockResolvedValue(mockNodes);

      const result = await chunkAndEmbedActivity(mockDocumentsPlain, mockOriginalName, mockDocId, mockUserId);

      expect(result.success).toBe(true);
      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Metadata extractors configuration warning',
        error: 'LLM not configured'
      }));
      expect(mockPipelineRun).toHaveBeenCalled();
    });
  });

  describe('commitToVectorStoreActivity', () => {
    const mockNodes = [
      { id: 'node-0', text: 'chunk of doc1', metadata: { chunked: true, fileName: 'test-doc.pdf', docId: 'doc-123' }, embedding: [0.1, 0.2, 0.3] },
      { id: 'node-1', text: 'chunk of doc2', metadata: { chunked: true, fileName: 'test-doc.pdf', docId: 'doc-123' }, embedding: [0.4, 0.5, 0.6] },
    ];
    const mockManifest = {
      documents: [
        { docId: 'doc-old', fileName: 'old-doc.pdf', isProcessed: true },
      ],
    };
    const mockExistingVectorStoreContent = JSON.stringify([
      { id: 'node-old', metadata: { fileName: 'old-doc.pdf' } },
      { id: 'node-to-replace', metadata: { fileName: 'test-doc.pdf' } },
    ], null, 2);

    beforeEach(async () => {
      mockPathResolve.mockReturnValue(`storage/ragsystem/${mockUserId}`);
      mockPathJoin.mockImplementation((...args) => args.join('/'));
      mockFsPromisesMkdir.mockResolvedValue(undefined);
      mockLoadManifest.mockResolvedValue(JSON.parse(JSON.stringify(mockManifest))); // Deep copy
      mockSaveManifest.mockResolvedValue(undefined);
      mockNodeToMetadata.mockImplementation((node) => ({ ...node, metadata: { ...node.metadata, converted: true } }));
    });

    it('should successfully commit nodes to a new vector store and update manifest', async () => {
      mockExistsSync.mockReturnValue(false); // No existing vector store
      mockFsPromisesAccess.mockRejectedValue({ code: 'ENOENT' }); // access throws ENOENT

      const result = await commitToVectorStoreActivity(mockNodes, mockOriginalName, mockDocId, mockUserId);

      expect(result).toEqual({
        success: true,
        vectorStorePath: `storage/ragsystem/${mockUserId}/vector_store.jsonl`,
        docId: mockDocId,
      });
      expect(mockFsPromisesMkdir).toHaveBeenCalledWith(`storage/ragsystem/${mockUserId}`, { recursive: true });
      
      const expectedNewNodes = mockNodes.map(mockNodeToMetadata);
      for (const nodeMeta of expectedNewNodes) {
        expect(mockWriteStream.write).toHaveBeenCalledWith(JSON.stringify(nodeMeta) + '\n');
      }

      expect(mockFsPromisesRename).toHaveBeenCalledWith(
        "storage/ragsystem/user-456/vector_store_mock-uuid.tmp",
        `storage/ragsystem/${mockUserId}/vector_store.jsonl`
      );

      expect(mockLoadManifest).toHaveBeenCalledWith(`storage/ragsystem/${mockUserId}`);
      expect(mockSaveManifest).toHaveBeenCalledWith(
        `storage/ragsystem/${mockUserId}`,
        expect.objectContaining({
          documents: expect.arrayContaining([
            expect.objectContaining({ docId: 'doc-old' }),
            expect.objectContaining({ docId: mockDocId, fileName: mockOriginalName, isProcessed: true, chunkCount: mockNodes.length }),
          ]),
        })
      );
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Ingestion committed successfully. Manifest registered.'
      }));
    });

    it('should upsert nodes into an existing vector store and update manifest', async () => {
      mockExistsSync.mockReturnValue(true); // Existing vector store
      mockFsPromisesAccess.mockResolvedValue(undefined);

      mockReadlineInterface[Symbol.asyncIterator].mockImplementation(() => {
        const parsed = JSON.parse(mockExistingVectorStoreContent);
        const lines = parsed.map(item => JSON.stringify(item));
        let index = 0;
        return {
          async next() {
            if (index < lines.length) {
              return { value: lines[index++], done: false };
            }
            return { done: true };
          }
        };
      });

      const result = await commitToVectorStoreActivity(mockNodes, mockOriginalName, mockDocId, mockUserId);

      expect(result.success).toBe(true);
      
      // new nodes should be written
      const expectedNewNodes = mockNodes.map(mockNodeToMetadata);
      for (const nodeMeta of expectedNewNodes) {
        expect(mockWriteStream.write).toHaveBeenCalledWith(JSON.stringify(nodeMeta) + '\n');
      }

      // the old node not matching originalName should be written
      expect(mockWriteStream.write).toHaveBeenCalledWith(JSON.stringify({ id: 'node-old', metadata: { fileName: 'old-doc.pdf' } }) + '\n');
      // the node matching originalName (test-doc.pdf) should NOT be written (it's filtered out to replace it)
      expect(mockWriteStream.write).not.toHaveBeenCalledWith(expect.stringContaining('node-to-replace'));

      expect(mockFsPromisesRename).toHaveBeenCalledWith(
        "storage/ragsystem/user-456/vector_store_mock-uuid.tmp",
        `storage/ragsystem/${mockUserId}/vector_store.jsonl`
      );
      expect(mockLoadManifest).toHaveBeenCalled();
      expect(mockSaveManifest).toHaveBeenCalled();
    });

    it('should update an existing document record in the manifest', async () => {
      const existingDocManifest = {
        documents: [
          { docId: mockDocId, fileName: mockOriginalName, isProcessed: false, processingStatus: 'pending' },
        ],
      };
      mockLoadManifest.mockResolvedValue(existingDocManifest);
      mockExistsSync.mockReturnValue(false);
      mockFsPromisesAccess.mockRejectedValue({ code: 'ENOENT' });

      await commitToVectorStoreActivity(mockNodes, mockOriginalName, mockDocId, mockUserId);

      expect(mockSaveManifest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          documents: expect.arrayContaining([
            expect.objectContaining({
              docId: mockDocId,
              fileName: mockOriginalName,
              isProcessed: true,
              processingStatus: 'completed',
              chunkCount: mockNodes.length,
            }),
          ]),
        })
      );
    });

    it('should throw an error if input vector nodes not provided', async () => {
      await expect(commitToVectorStoreActivity(null, mockOriginalName, mockDocId, mockUserId)).rejects.toThrow(
        'Input vector nodes not provided.'
      );
      expect(mockLoggerError).toHaveBeenCalledWith(expect.objectContaining({
        message: 'commitToVectorStoreActivity failed'
      }));
    });

    it('should handle fsPromises.access error code other than ENOENT gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFsPromisesAccess.mockRejectedValue(new Error('Permission denied')); // Simulate permission error

      await expect(commitToVectorStoreActivity(mockNodes, mockOriginalName, mockDocId, mockUserId)).rejects.toThrow('Permission denied');
      expect(mockLoggerError).toHaveBeenCalledWith(expect.objectContaining({
        message: 'commitToVectorStoreActivity failed'
      }));
    });

    it('should throw an error if writeStream fails', async () => {
      mockExistsSync.mockReturnValue(false);
      mockFsPromisesAccess.mockRejectedValue({ code: 'ENOENT' });
      
      const writeError = new Error('Disk full');
      // Mock writeStream to fail immediately
      mockWriteStream.write.mockImplementation(() => {
        throw writeError;
      });

      await expect(commitToVectorStoreActivity(mockNodes, mockOriginalName, mockDocId, mockUserId)).rejects.toThrow(writeError);
      expect(mockLoggerError).toHaveBeenCalledWith(expect.objectContaining({
        message: 'commitToVectorStoreActivity failed'
      }));
    });

    it('should throw an error if saveManifest fails', async () => {
      mockExistsSync.mockReturnValue(false);
      mockFsPromisesAccess.mockRejectedValue({ code: 'ENOENT' });
      const manifestError = new Error('Manifest save failed');
      mockSaveManifest.mockRejectedValue(manifestError);

      await expect(commitToVectorStoreActivity(mockNodes, mockOriginalName, mockDocId, mockUserId)).rejects.toThrow(manifestError);
      expect(mockLoggerError).toHaveBeenCalledWith(expect.objectContaining({
        message: 'commitToVectorStoreActivity failed'
      }));
    });
  });

  describe('cleanupFailedIngestionActivity', () => {
    const mockExistingVectorStoreContent = JSON.stringify([
      { id: 'node-old', metadata: { fileName: 'old-doc.pdf', docId: 'doc-old' } },
      { id: 'node-to-purge-1', metadata: { fileName: 'test-doc.pdf', docId: 'doc-123' } },
      { id: 'node-to-purge-2', metadata: { fileName: 'test-doc.pdf', docId: 'doc-123' } },
      { id: 'node-other-doc', metadata: { fileName: 'other-doc.pdf', docId: 'doc-456' } },
    ], null, 2);
    const mockManifestWithDoc = {
      documents: [
        { docId: 'doc-old', fileName: 'old-doc.pdf', isProcessed: true },
        { docId: mockDocId, fileName: mockOriginalName, isProcessed: true, processingStatus: 'completed' },
      ],
    };

    beforeEach(async () => {
      mockPathResolve.mockReturnValue(`storage/ragsystem/${mockUserId}`);
      mockPathJoin.mockImplementation((...args) => args.join('/'));
      mockLoadManifest.mockResolvedValue(JSON.parse(JSON.stringify(mockManifestWithDoc))); // Deep copy
      mockSaveManifest.mockResolvedValue(undefined);
    });

    it('should successfully clean up vector store and manifest', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFsPromisesAccess.mockResolvedValue(undefined);

      mockReadlineInterface[Symbol.asyncIterator].mockImplementation(() => {
        const parsed = JSON.parse(mockExistingVectorStoreContent);
        const lines = parsed.map(item => JSON.stringify(item));
        let index = 0;
        return {
          async next() {
            if (index < lines.length) {
              return { value: lines[index++], done: false };
            }
            return { done: true };
          }
        };
      });

      const result = await cleanupFailedIngestionActivity(mockOriginalName, mockDocId, mockUserId);

      expect(result).toEqual({
        success: true,
        docId: mockDocId,
        reverted: true,
      });
      expect(mockFsPromisesAccess).toHaveBeenCalledWith(`storage/ragsystem/${mockUserId}/vector_store.jsonl`, 4);
      
      // it should write node-old and node-other-doc
      expect(mockWriteStream.write).toHaveBeenCalledWith(JSON.stringify({ id: 'node-old', metadata: { fileName: 'old-doc.pdf', docId: 'doc-old' } }) + '\n');
      expect(mockWriteStream.write).toHaveBeenCalledWith(JSON.stringify({ id: 'node-other-doc', metadata: { fileName: 'other-doc.pdf', docId: 'doc-456' } }) + '\n');

      // it should NOT write nodes to purge
      expect(mockWriteStream.write).not.toHaveBeenCalledWith(expect.stringContaining('node-to-purge-1'));
      expect(mockWriteStream.write).not.toHaveBeenCalledWith(expect.stringContaining('node-to-purge-2'));

      expect(mockFsPromisesRename).toHaveBeenCalledWith(
        "storage/ragsystem/user-456/vector_store_cleanup_mock-uuid.tmp",
        `storage/ragsystem/${mockUserId}/vector_store.jsonl`
      );

      expect(mockLoadManifest).toHaveBeenCalledWith(`storage/ragsystem/${mockUserId}`);
      expect(mockSaveManifest).toHaveBeenCalledWith(
        `storage/ragsystem/${mockUserId}`,
        expect.objectContaining({
          documents: expect.arrayContaining([
            expect.objectContaining({ docId: 'doc-old' }),
            expect.objectContaining({
              docId: mockDocId,
              fileName: mockOriginalName,
              isProcessed: false,
              processingStatus: 'failed',
              processingError: 'Temporal execution crashed, transaction rolled back.',
            }),
          ]),
        })
      );
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Successfully purged transaction records from vector store.'
      }));
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Reverted document index manifest registers to failed state.'
      }));
    });

    it('should do nothing to vector store if it does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      mockFsPromisesAccess.mockRejectedValue({ code: 'ENOENT' });

      await cleanupFailedIngestionActivity(mockOriginalName, mockDocId, mockUserId);

      expect(mockReadlineInterface[Symbol.asyncIterator]).not.toHaveBeenCalled();
      expect(mockWriteStream.write).not.toHaveBeenCalled();
    });

    it('should log a warning and throw if vector store access or reading fails', async () => {
      mockExistsSync.mockReturnValue(true);
      const accessError = new Error('Permission denied');
      mockFsPromisesAccess.mockRejectedValue(accessError);

      await expect(cleanupFailedIngestionActivity(mockOriginalName, mockDocId, mockUserId)).rejects.toThrow(accessError);

      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.objectContaining({
        severity: 'WARNING',
        message: 'Could not revert vector store database records.',
        error: 'Permission denied'
      }));
      expect(mockLoggerError).toHaveBeenCalledWith(expect.objectContaining({
        severity: 'ERROR',
        message: 'Compensating transaction failed',
        error: 'Permission denied'
      }));
      expect(mockSaveManifest).not.toHaveBeenCalled(); // Manifest cleanup should NOT happen because it threw
    });

    it('should handle manifest not containing the document gracefully', async () => {
      mockLoadManifest.mockResolvedValue({ documents: [{ docId: 'other-doc', fileName: 'other.pdf' }] });
      mockExistsSync.mockReturnValue(false); // No vector store for simplicity
      mockFsPromisesAccess.mockRejectedValue({ code: 'ENOENT' });

      await cleanupFailedIngestionActivity(mockOriginalName, mockDocId, mockUserId);

      expect(mockSaveManifest).not.toHaveBeenCalled();
      // No specific log for "reverted document index manifest" if doc not found
      expect(mockLoggerInfo).not.toHaveBeenCalledWith(expect.stringContaining('Reverted document index manifest registers to failed state.'));
    });

    it('should throw an error if saveManifest fails', async () => {
      mockExistsSync.mockReturnValue(false);
      mockFsPromisesAccess.mockRejectedValue({ code: 'ENOENT' });
      const manifestError = new Error('Manifest save failed');
      mockSaveManifest.mockRejectedValue(manifestError);

      await expect(cleanupFailedIngestionActivity(mockOriginalName, mockDocId, mockUserId)).rejects.toThrow(manifestError);
      expect(mockLoggerError).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Compensating transaction failed'
      }));
    });
  });
});