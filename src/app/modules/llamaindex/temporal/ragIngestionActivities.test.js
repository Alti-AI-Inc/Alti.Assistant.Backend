import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
// Using vi.doMock and then re-importing the module under test in beforeEach
// to ensure module-level state (activityTransitiveState) is reset for each test.

let downloadAndLoadFileActivity, parseToMarkdownActivity, chunkAndEmbedActivity, commitToVectorStoreActivity, cleanupFailedIngestionActivity;
let mockExtractTextAndBuildDocuments, mockSaveManifest, mockLoadManifest, mockNodeToMetadata, mockSettings, mockLlm, mockEmbedModel;
let mockTitleExtractor, mockKeywordExtractor, mockIngestionPipeline, mockMarkdownNodeParser, mockSentenceWindowNodeParser;
let mockFsPromisesStat, mockFsPromisesMkdir, mockFsPromisesReadFile, mockFsPromisesWriteFile;
let mockExistsSync;
let mockPathResolve, mockPathJoin;
let mockLoggerInfo, mockLoggerError, mockLoggerWarn;

beforeEach(async () => {
  vi.resetAllMocks(); // Reset all mock calls and instances
  vi.resetModules(); // Reset the module cache, ensuring a fresh `activityTransitiveState`

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
    get and embed() { return vi.fn(() => ({ embedding: [0.1, 0.2, 0.3] })); },
    transform: vi.fn((nodes) => nodes.map(node => ({ ...node, embedding: [0.1, 0.2, 0.3] }))),
  };
  mockSettings = { llm: mockLlm, embedModel: mockEmbedModel };

  vi.doMock('../llamaindex/llamaindex.indexer.js', () => ({
    extractTextAndBuildDocuments: mockExtractTextAndBuildDocuments,
    saveManifest: mockSaveManifest,
    loadManifest: mockLoadManifest,
    nodeToMetadata: mockNodeToMetadata,
    Settings: mockSettings,
  }));

  const mockPipelineRun = vi.fn(async ({ documents }) => {
    if (documents.length === 0) return [];
    return documents.map((doc, i) => ({
      id: `node-${i}`,
      text: `chunk of ${doc.text}`,
      metadata: { ...doc.metadata, chunked: true },
      embedding: [0.1, 0.2, 0.3],
    }));
  });
  mockTitleExtractor = vi.fn(() => ({ transform: vi.fn((nodes) => nodes.map(n => ({ ...n, metadata: { ...n.metadata, title: 'Mock Title' } }))) }));
  mockKeywordExtractor = vi.fn(() => ({ transform: vi.fn((nodes) => nodes.map(n => ({ ...n, metadata: { ...n.metadata, keywords: ['mock', 'keywords'] } }))) }));
  mockIngestionPipeline = vi.fn(() => ({ run: mockPipelineRun }));
  mockMarkdownNodeParser = vi.fn(() => ({ transform: vi.fn((nodes) => nodes.map(n => ({ ...n, metadata: { ...n.metadata, parsedBy: 'Markdown' } }))) }));
  mockSentenceWindowNodeParser = vi.fn(() => ({ transform: vi.fn((nodes) => nodes.map(n => ({ ...n, metadata: { ...n.metadata, parsedBy: 'SentenceWindow' } }))) }));

  vi.doMock('llamaindex', () => ({
    TitleExtractor: mockTitleExtractor,
    KeywordExtractor: mockKeywordExtractor,
    IngestionPipeline: mockIngestionPipeline,
    MarkdownNodeParser: mockMarkdownNodeParser,
    SentenceWindowNodeParser: mockSentenceWindowNodeParser,
  }));

  mockFsPromisesStat = vi.fn();
  mockFsPromisesMkdir = vi.fn();
  mockFsPromisesReadFile = vi.fn();
  mockFsPromisesWriteFile = vi.fn();
  vi.doMock('node:fs/promises', () => ({
    default: {
      stat: mockFsPromisesStat,
      mkdir: mockFsPromisesMkdir,
      readFile: mockFsPromisesReadFile,
      writeFile: mockFsPromisesWriteFile,
    },
  }));

  mockExistsSync = vi.fn();
  vi.doMock('node:fs', () => ({
    existsSync: mockExistsSync,
  }));

  mockPathResolve = vi.fn((p) => p);
  mockPathJoin = vi.fn((...args) => args.join('/'));
  vi.doMock('node:path', () => ({
    default: {
      resolve: mockPathResolve,
      join: mockPathJoin,
    },
  }));

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
      mockExistsSync.mockReturnValue(true);
      mockFsPromisesStat.mockResolvedValue({ size: 1024 });

      const result = await downloadAndLoadFileActivity(mockFilePath, mockOriginalName, mockDocId);

      expect(result).toEqual({
        success: true,
        sizeBytes: 1024,
        filePath: mockFilePath,
        originalName: mockOriginalName,
      });
      expect(mockExistsSync).toHaveBeenCalledWith(mockFilePath);
      expect(mockFsPromisesStat).toHaveBeenCalledWith(mockFilePath);
      expect(mockLoggerInfo).toHaveBeenCalledWith(`[Temporal Activity] Loading document: ${mockOriginalName} (ID: ${mockDocId})`);
    });

    it('should throw an error if the file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      await expect(downloadAndLoadFileActivity(mockFilePath, mockOriginalName, mockDocId)).rejects.toThrow(
        `Document file path does not exist on disk: ${mockFilePath}`
      );
      expect(mockExistsSync).toHaveBeenCalledWith(mockFilePath);
      expect(mockFsPromisesStat).not.toHaveBeenCalled();
      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('downloadAndLoadFileActivity failed'));
    });

    it('should throw an error if fsPromises.stat fails', async () => {
      mockExistsSync.mockReturnValue(true);
      const statError = new Error('Stat failed');
      mockFsPromisesStat.mockRejectedValue(statError);

      await expect(downloadAndLoadFileActivity(mockFilePath, mockOriginalName, mockDocId)).rejects.toThrow(statError);
      expect(mockExistsSync).toHaveBeenCalledWith(mockFilePath);
      expect(mockFsPromisesStat).toHaveBeenCalledWith(mockFilePath);
      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('downloadAndLoadFileActivity failed'));
    });
  });

  describe('parseToMarkdownActivity', () => {
    const mockDocuments = [{ text: 'doc1', metadata: {} }, { text: 'doc2', metadata: { useMarkdownParser: true } }];

    it('should successfully parse documents and store them in transitive state', async () => {
      mockExtractTextAndBuildDocuments.mockResolvedValue(mockDocuments);

      const result = await parseToMarkdownActivity(mockFilePath, mockOriginalName, mockDocId);

      expect(result).toEqual({
        success: true,
        documentCount: 2,
        isMarkdown: true,
      });
      expect(mockExtractTextAndBuildDocuments).toHaveBeenCalledWith(mockFilePath, mockOriginalName, mockDocId);
      expect(mockLoggerInfo).toHaveBeenCalledWith(`[Temporal Activity] High-fidelity parsing document: ${mockOriginalName}`);

      // Verify internal state by re-importing the module to get its current state
      const module = await import('./ragIngestionActivities.js');
      expect(module.activityTransitiveState.get(`${mockDocId}_documents`)).toEqual(mockDocuments);
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
      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('parseToMarkdownActivity failed'));
    });

    it('should throw an error if extractTextAndBuildDocuments fails', async () => {
      const parseError = new Error('Parsing failed');
      mockExtractTextAndBuildDocuments.mockRejectedValue(parseError);

      await expect(parseToMarkdownActivity(mockFilePath, mockOriginalName, mockDocId)).rejects.toThrow(parseError);
      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('parseToMarkdownActivity failed'));
    });
  });

  describe('chunkAndEmbedActivity', () => {
    const mockDocumentsMarkdown = [{ text: 'doc1', metadata: { useMarkdownParser: true } }];
    const mockDocumentsPlain = [{ text: 'doc1', metadata: {} }];
    const mockNodes = [{ id: 'node-0', text: 'chunk of doc1', metadata: { chunked: true }, embedding: [0.1, 0.2, 0.3] }];

    beforeEach(async () => {
      // Ensure activityTransitiveState is set up for this test block
      const module = await import('./ragIngestionActivities.js');
      module.activityTransitiveState.clear(); // Clear any state from previous tests
    });

    it('should successfully chunk and embed documents using MarkdownNodeParser', async () => {
      const module = await import('./ragIngestionActivities.js');
      module.activityTransitiveState.set(`${mockDocId}_documents`, mockDocumentsMarkdown);
      mockIngestionPipeline.mock.results[0].value.run.mockResolvedValue(mockNodes);

      const result = await chunkAndEmbedActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId);

      expect(result).toEqual({
        success: true,
        nodeCount: mockNodes.length,
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith(`[Temporal Activity] Segmenting and generating vector embeddings for: ${mockOriginalName} (User: ${mockUserId})`);
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
      expect(mockIngestionPipeline.mock.results[0].value.run).toHaveBeenCalledWith({ documents: mockDocumentsMarkdown });
      expect(module.activityTransitiveState.get(`${mockDocId}_nodes`)).toEqual(mockNodes);
    });

    it('should successfully chunk and embed documents using SentenceWindowNodeParser', async () => {
      const module = await import('./ragIngestionActivities.js');
      module.activityTransitiveState.set(`${mockDocId}_documents`, mockDocumentsPlain);
      mockIngestionPipeline.mock.results[0].value.run.mockResolvedValue(mockNodes);

      const result = await chunkAndEmbedActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId);

      expect(result).toEqual({
        success: true,
        nodeCount: mockNodes.length,
      });
      expect(mockSentenceWindowNodeParser).toHaveBeenCalledWith({
        windowSize: 3,
        windowMetadataKey: '_window',
        originalTextMetadataKey: '_original_text',
      });
      expect(mockMarkdownNodeParser).not.toHaveBeenCalled();
      expect(mockIngestionPipeline.mock.results[0].value.run).toHaveBeenCalledWith({ documents: mockDocumentsPlain });
      expect(module.activityTransitiveState.get(`${mockDocId}_nodes`)).toEqual(mockNodes);
    });

    it('should throw an error if transitive document states are not found', async () => {
      // Ensure activityTransitiveState is empty
      const module = await import('./ragIngestionActivities.js');
      module.activityTransitiveState.clear();

      await expect(chunkAndEmbedActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId)).rejects.toThrow(
        'Transitive document states not found. Ensure activities are run sequentially.'
      );
      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('chunkAndEmbedActivity failed'));
    });

    it('should throw an error if IngestionPipeline.run fails', async () => {
      const pipelineError = new Error('Pipeline failed');
      const module = await import('./ragIngestionActivities.js');
      module.activityTransitiveState.set(`${mockDocId}_documents`, mockDocumentsPlain);
      mockIngestionPipeline.mock.results[0].value.run.mockRejectedValue(pipelineError);

      await expect(chunkAndEmbedActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId)).rejects.toThrow(pipelineError);
      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('chunkAndEmbedActivity failed'));
    });

    it('should log a warning if metadata extractors fail to configure but continue', async () => {
      // Simulate TitleExtractor constructor throwing an error
      mockTitleExtractor.mockImplementation(() => { throw new Error('LLM not configured'); });
      const module = await import('./ragIngestionActivities.js');
      module.activityTransitiveState.set(`${mockDocId}_documents`, mockDocumentsPlain);
      mockIngestionPipeline.mock.results[0].value.run.mockResolvedValue(mockNodes);

      const result = await chunkAndEmbedActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId);

      expect(result.success).toBe(true);
      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Metadata extractors configuration warning: LLM not configured'));
      // Ensure the pipeline still runs with other transformations
      expect(mockIngestionPipeline.mock.results[0].value.run).toHaveBeenCalled();
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
      const module = await import('./ragIngestionActivities.js');
      module.activityTransitiveState.clear();
      module.activityTransitiveState.set(`${mockDocId}_nodes`, mockNodes);

      mockPathResolve.mockReturnValue(`storage/ragsystem/${mockUserId}`);
      mockPathJoin.mockImplementation((...args) => args.join('/'));
      mockFsPromisesMkdir.mockResolvedValue(undefined);
      mockLoadManifest.mockResolvedValue(JSON.parse(JSON.stringify(mockManifest))); // Deep copy
      mockSaveManifest.mockResolvedValue(undefined);
      mockNodeToMetadata.mockImplementation((node) => ({ ...node, metadata: { ...node.metadata, converted: true } }));
    });

    it('should successfully commit nodes to a new vector store and update manifest', async () => {
      mockExistsSync.mockReturnValue(false); // No existing vector store
      mockFsPromisesReadFile.mockRejectedValue(new Error('File not found')); // Ensure readFile is not called or fails gracefully

      const result = await commitToVectorStoreActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId);

      expect(result).toEqual({
        success: true,
        vectorStorePath: `storage/ragsystem/${mockUserId}/vector_store.json`,
        docId: mockDocId,
      });
      expect(mockFsPromisesMkdir).toHaveBeenCalledWith(`storage/ragsystem/${mockUserId}`, { recursive: true });
      expect(mockExistsSync).toHaveBeenCalledWith(`storage/ragsystem/${mockUserId}/vector_store.json`);
      expect(mockFsPromisesReadFile).toHaveBeenCalledWith(`storage/ragsystem/${mockUserId}/vector_store.json`, 'utf-8');
      expect(mockFsPromisesWriteFile).toHaveBeenCalledWith(
        `storage/ragsystem/${mockUserId}/vector_store.json`,
        JSON.stringify(mockNodes.map(mockNodeToMetadata), null, 2),
        'utf-8'
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

      const module = await import('./ragIngestionActivities.js');
      expect(module.activityTransitiveState.get(`${mockDocId}_documents`)).toBeUndefined();
      expect(module.activityTransitiveState.get(`${mockDocId}_nodes`)).toBeUndefined();
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Ingestion committed successfully. Manifest registered.'));
    });

    it('should upsert nodes into an existing vector store and update manifest', async () => {
      mockExistsSync.mockReturnValue(true); // Existing vector store
      mockFsPromisesReadFile.mockResolvedValue(mockExistingVectorStoreContent);

      const result = await commitToVectorStoreActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId);

      expect(result.success).toBe(true);
      const expectedFinalNodes = [
        { id: 'node-old', metadata: { fileName: 'old-doc.pdf', converted: true } }, // Existing node not matching originalName
        ...mockNodes.map(mockNodeToMetadata), // New nodes
      ];
      expect(mockFsPromisesWriteFile).toHaveBeenCalledWith(
        `storage/ragsystem/${mockUserId}/vector_store.json`,
        JSON.stringify(expectedFinalNodes, null, 2),
        'utf-8'
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
      mockFsPromisesReadFile.mockRejectedValue(new Error('File not found'));

      await commitToVectorStoreActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId);

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
      expect(existingDocManifest.documents.length).toBe(1); // Ensure it was updated, not added
    });

    it('should throw an error if transitive vector nodes state not found', async () => {
      const module = await import('./ragIngestionActivities.js');
      module.activityTransitiveState.clear(); // Clear nodes

      await expect(commitToVectorStoreActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId)).rejects.toThrow(
        'Transitive vector nodes state not found.'
      );
      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('commitToVectorStoreActivity failed'));
    });

    it('should handle fsPromises.readFile error for vector store gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFsPromisesReadFile.mockRejectedValue(new Error('Corrupt JSON')); // Simulate file read error

      await commitToVectorStoreActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId);

      expect(mockFsPromisesWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(mockNodes.map(mockNodeToMetadata), null, 2), // Should write only new nodes
        'utf-8'
      );
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Ingestion committed successfully. Manifest registered.'));
    });

    it('should throw an error if fsPromises.writeFile fails', async () => {
      mockExistsSync.mockReturnValue(false);
      const writeError = new Error('Disk full');
      mockFsPromisesWriteFile.mockRejectedValue(writeError);

      await expect(commitToVectorStoreActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId)).rejects.toThrow(writeError);
      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('commitToVectorStoreActivity failed'));
    });

    it('should throw an error if saveManifest fails', async () => {
      mockExistsSync.mockReturnValue(false);
      const manifestError = new Error('Manifest save failed');
      mockSaveManifest.mockRejectedValue(manifestError);

      await expect(commitToVectorStoreActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId)).rejects.toThrow(manifestError);
      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('commitToVectorStoreActivity failed'));
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
      const module = await import('./ragIngestionActivities.js');
      module.activityTransitiveState.clear();
      module.activityTransitiveState.set(`${mockDocId}_documents`, [{ text: 'doc' }]);
      module.activityTransitiveState.set(`${mockDocId}_nodes`, [{ text: 'node' }]);

      mockPathResolve.mockReturnValue(`storage/ragsystem/${mockUserId}`);
      mockPathJoin.mockImplementation((...args) => args.join('/'));
      mockFsPromisesReadFile.mockResolvedValue(mockExistingVectorStoreContent);
      mockFsPromisesWriteFile.mockResolvedValue(undefined);
      mockLoadManifest.mockResolvedValue(JSON.parse(JSON.stringify(mockManifestWithDoc))); // Deep copy
      mockSaveManifest.mockResolvedValue(undefined);
    });

    it('should successfully clean up vector store and manifest, and clear transitive state', async () => {
      mockExistsSync.mockReturnValue(true);

      const result = await cleanupFailedIngestionActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId);

      expect(result).toEqual({
        success: true,
        docId: mockDocId,
        reverted: true,
      });
      expect(mockExistsSync).toHaveBeenCalledWith(`storage/ragsystem/${mockUserId}/vector_store.json`);
      expect(mockFsPromisesReadFile).toHaveBeenCalledWith(`storage/ragsystem/${mockUserId}/vector_store.json`, 'utf-8');
      expect(mockFsPromisesWriteFile).toHaveBeenCalledWith(
        `storage/ragsystem/${mockUserId}/vector_store.json`,
        JSON.stringify([
          { id: 'node-old', metadata: { fileName: 'old-doc.pdf', docId: 'doc-old' } },
          { id: 'node-other-doc', metadata: { fileName: 'other-doc.pdf', docId: 'doc-456' } },
        ], null, 2),
        'utf-8'
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

      const module = await import('./ragIngestionActivities.js');
      expect(module.activityTransitiveState.get(`${mockDocId}_documents`)).toBeUndefined();
      expect(module.activityTransitiveState.get(`${mockDocId}_nodes`)).toBeUndefined();
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Successfully purged transaction records from vector store.'));
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Reverted document index manifest registers to failed state.'));
    });

    it('should do nothing to vector store if it does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      await cleanupFailedIngestionActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId);

      expect(mockFsPromisesReadFile).not.toHaveBeenCalled();
      expect(mockFsPromisesWriteFile).not.toHaveBeenCalled();
      expect(mockLoggerWarn).not.toHaveBeenCalledWith(expect.stringContaining('Could not revert vector store database records'));
    });

    it('should log a warning if vector store readFile fails but continue with manifest cleanup', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFsPromisesReadFile.mockRejectedValue(new Error('Corrupt vector store'));

      await cleanupFailedIngestionActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId);

      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Could not revert vector store database records: Corrupt vector store'));
      expect(mockSaveManifest).toHaveBeenCalled(); // Manifest cleanup should still happen
    });

    it('should handle manifest not containing the document gracefully', async () => {
      mockLoadManifest.mockResolvedValue({ documents: [{ docId: 'other-doc', fileName: 'other.pdf' }] });
      mockExistsSync.mockReturnValue(false); // No vector store for simplicity

      await cleanupFailedIngestionActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId);

      expect(mockSaveManifest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          documents: expect.arrayContaining([
            expect.objectContaining({ docId: 'other-doc' }),
          ]),
        })
      );
      // No specific log for "reverted document index manifest" if doc not found
      expect(mockLoggerInfo).not.toHaveBeenCalledWith(expect.stringContaining('Reverted document index manifest registers to failed state.'));
    });

    it('should throw an error if saveManifest fails', async () => {
      mockExistsSync.mockReturnValue(false);
      const manifestError = new Error('Manifest save failed');
      mockSaveManifest.mockRejectedValue(manifestError);

      await expect(cleanupFailedIngestionActivity(mockFilePath, mockOriginalName, mockDocId, mockUserId)).rejects.toThrow(manifestError);
      expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('Compensating transaction failed'));
    });
  });
});