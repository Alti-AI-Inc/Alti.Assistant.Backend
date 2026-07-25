import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import KnowledgeBankFile from '../../../../../src/app/modules/knowledge_bank/knowledge_bank.model.js';

// Mocking PubSub
const mockPublishMessage = vi.fn();
const {
  mockTopic
} = vi.hoisted(() => {
  const mockTopic = vi.fn().mockImplementation(() => ({
    publishMessage: mockPublishMessage,
  }));

  return {
    mockTopic
  };
});
vi.mock('@google-cloud/pubsub', () => ({
  PubSub: vi.fn().mockImplementation(() => ({
    topic: mockTopic,
  })),
}));

// Mocking console to prevent test log pollution and to spy on calls
vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('KnowledgeBankFile Model', () => {
  const userId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const fileId = new mongoose.Types.ObjectId();

  const mockFileData = {
    _id: fileId,
    fileName: 'test-file.pdf',
    originalName: 'My Test Document.pdf',
    fileType: 'application/pdf',
    fileSize: 123456,
    gcsUrl: 'http://fake.storage.com/test-file.pdf',
    gcsPath: 'files/test-file.pdf',
    gcsBucket: 'test-bucket',
    userId,
    tenantId,
    folderId: null,
    processingStatus: 'pending',
    isActive: true,
    isProcessed: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Schema Definition', () => {
    it('should create a new file with default values', () => {
      const file = new KnowledgeBankFile({
        fileName: 'unique-name.txt',
        originalName: 'Original Name.txt',
        fileType: 'text/plain',
        fileSize: 100,
        gcsUrl: 'http://fake.url/file',
        gcsPath: 'path/to/file',
        userId: new mongoose.Types.ObjectId(),
      });

      expect(file.gcsBucket).toBe('inso_knowledge_bank_files');
      expect(file.folderId).toBe(null);
      expect(file.chunkCount).toBe(0);
      expect(file.isProcessed).toBe(false);
      expect(file.processingStatus).toBe('pending'); // Default value
      expect(file.isActive).toBe(true);
      expect(file.tags).toEqual([]);
      expect(file.metadata).toEqual({});
      expect(file.uploadSource).toBe('web');
      expect(file.tenantId).toBe(null);
    });

    it('should fail validation if required fields are missing', () => {
      const file = new KnowledgeBankFile({ originalName: 'test.pdf' });
      const error = file.validateSync();
      expect(error.errors.fileName).toBeDefined();
      expect(error.errors.fileType).toBeDefined();
      expect(error.errors.fileSize).toBeDefined();
      expect(error.errors.gcsUrl).toBeDefined();
      expect(error.errors.gcsPath).toBeDefined();
      expect(error.errors.userId).toBeDefined();
    });

    it('should enforce constraints like min size and max length', () => {
      const file = new KnowledgeBankFile({
        ...mockFileData,
        fileSize: -10,
        description: 'a'.repeat(1001),
      });
      const error = file.validateSync();
      expect(error.errors.fileSize).toBeDefined();
      expect(error.errors.description).toBeDefined();
    });
  });

  describe('Virtual Properties', () => {
    it('formattedFileSize should format bytes correctly', () => {
      const file = new KnowledgeBankFile({ fileSize: 0 });
      expect(file.formattedFileSize).toBe('0 Bytes');

      file.fileSize = 1024;
      expect(file.formattedFileSize).toBe('1 KB');

      file.fileSize = 1572864; // 1.5 MB
      expect(file.formattedFileSize).toBe('1.5 MB');

      file.fileSize = 1234567890; // 1.15 GB
      expect(file.formattedFileSize).toBe('1.15 GB');
    });

    it('fileExtension should return lowercase fileType', () => {
      const file = new KnowledgeBankFile({ fileType: 'application/PDF' });
      expect(file.fileExtension).toBe('application/pdf');
    });
  });

  describe('Static Methods', () => {
    describe('findByUserId', () => {
      const mockQueryBuilder = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([{ ...mockFileData }]),
      };

      beforeEach(() => {
        vi.spyOn(KnowledgeBankFile, 'find').mockReturnValue(mockQueryBuilder);
      });

      it('should find files by userId with default options', async () => {
        await KnowledgeBankFile.findByUserId(userId);
        expect(KnowledgeBankFile.find).toHaveBeenCalledWith({
          userId,
          isActive: true,
        });
        expect(mockQueryBuilder.sort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(mockQueryBuilder.limit).toHaveBeenCalledWith(100);
        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
        expect(mockQueryBuilder.lean).toHaveBeenCalled();
      });

      it('should apply all provided filters', async () => {
        const options = {
          fileType: 'pdf',
          processingStatus: 'completed',
          isProcessed: true,
          folderId: null,
          limit: 50,
          skip: 10,
        };
        await KnowledgeBankFile.findByUserId(userId, options);
        expect(KnowledgeBankFile.find).toHaveBeenCalledWith({
          userId,
          isActive: true,
          fileType: 'pdf',
          processingStatus: 'completed',
          isProcessed: true,
          folderId: null,
        });
        expect(mockQueryBuilder.limit).toHaveBeenCalledWith(50);
        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
      });

      it('should allow disabling lean queries', async () => {
        await KnowledgeBankFile.findByUserId(userId, { lean: false });
        expect(mockQueryBuilder.lean).not.toHaveBeenCalled();
      });
    });

    describe('countByUserId', () => {
      it('should count active files by default', async () => {
        vi.spyOn(KnowledgeBankFile, 'countDocuments').mockResolvedValue(5);
        const count = await KnowledgeBankFile.countByUserId(userId);
        expect(KnowledgeBankFile.countDocuments).toHaveBeenCalledWith({
          userId,
          isActive: true,
        });
        expect(count).toBe(5);
      });

      it('should count all files when activeOnly is false', async () => {
        vi.spyOn(KnowledgeBankFile, 'countDocuments').mockResolvedValue(10);
        const count = await KnowledgeBankFile.countByUserId(userId, false);
        expect(KnowledgeBankFile.countDocuments).toHaveBeenCalledWith({ userId });
        expect(count).toBe(10);
      });
    });

    describe('getTotalStorageByUserId', () => {
      it('should calculate total storage for active files by default', async () => {
        const aggregateResult = [{ _id: null, totalSize: 5000 }];
        vi.spyOn(KnowledgeBankFile, 'aggregate').mockResolvedValue(aggregateResult);
        const totalSize = await KnowledgeBankFile.getTotalStorageByUserId(userId);

        expect(KnowledgeBankFile.aggregate).toHaveBeenCalledWith([
          { $match: { userId, isActive: true } },
          { $group: { _id: null, totalSize: { $sum: '$fileSize' } } },
        ]);
        expect(totalSize).toBe(5000);
      });

      it('should calculate total storage for all files when activeOnly is false', async () => {
        const aggregateResult = [{ _id: null, totalSize: 10000 }];
        vi.spyOn(KnowledgeBankFile, 'aggregate').mockResolvedValue(aggregateResult);
        const totalSize = await KnowledgeBankFile.getTotalStorageByUserId(
          userId,
          false
        );

        expect(KnowledgeBankFile.aggregate).toHaveBeenCalledWith([
          { $match: { userId } },
          { $group: { _id: null, totalSize: { $sum: '$fileSize' } } },
        ]);
        expect(totalSize).toBe(10000);
      });

      it('should return 0 if user has no files', async () => {
        vi.spyOn(KnowledgeBankFile, 'aggregate').mockResolvedValue([]);
        const totalSize = await KnowledgeBankFile.getTotalStorageByUserId(userId);
        expect(totalSize).toBe(0);
      });
    });
  });

  describe('Instance Methods', () => {
    let file;
    let saveSpy;

    beforeEach(() => {
      file = new KnowledgeBankFile(mockFileData);
      saveSpy = vi.spyOn(file, 'save').mockResolvedValue(file);
    });

    it('markAsProcessed should update fields and save', async () => {
      const documentId = 'doc-123';
      const chunkCount = 42;
      const title = 'Processed Title';

      await file.markAsProcessed(documentId, chunkCount, title);

      expect(file.isProcessed).toBe(true);
      expect(file.processingStatus).toBe('completed');
      expect(file.documentId).toBe(documentId);
      expect(file.chunkCount).toBe(chunkCount);
      expect(file.title).toBe(title);
      expect(file.processedAt).toBeInstanceOf(Date);
      expect(saveSpy).toHaveBeenCalled();
    });

    it('markAsProcessed should use originalName as default title', async () => {
      await file.markAsProcessed('doc-123', 10);
      expect(file.title).toBe(file.originalName);
      expect(saveSpy).toHaveBeenCalled();
    });

    it('markProcessingFailed should update fields and save', async () => {
      const error = new Error('Processing failed badly');
      await file.markProcessingFailed(error);

      expect(file.processingStatus).toBe('failed');
      expect(file.processingError).toBe(error.toString());
      expect(saveSpy).toHaveBeenCalled();
    });

    it('softDelete should set isActive to false and save', async () => {
      await file.softDelete();
      expect(file.isActive).toBe(false);
      expect(saveSpy).toHaveBeenCalled();
    });
  });

  describe('Middleware (Hooks)', () => {
    // We test hooks by extracting them from the schema to avoid a DB connection
    const preSaveHook = KnowledgeBankFile.schema.s.hooks.get('save.pre')[0].fn;
    const postSaveHook = KnowledgeBankFile.schema.s.hooks.get('save.post')[0].fn;

    describe('pre(\'save\') hook', () => {
      it('should set processingStatus and _wasNew for a new document', () => {
        const doc = { isNew: true };
        const next = vi.fn();
        preSaveHook.call(doc, next);

        expect(doc.processingStatus).toBe('pending');
        expect(doc._wasNew).toBe(true);
        expect(next).toHaveBeenCalled();
      });

      it('should not set fields for an existing document', () => {
        const doc = { isNew: false, processingStatus: 'completed' };
        const next = vi.fn();
        preSaveHook.call(doc, next);

        expect(doc.processingStatus).toBe('completed');
        expect(doc._wasNew).toBeUndefined();
        expect(next).toHaveBeenCalled();
      });
    });

    describe('post(\'save\') hook', () => {
      const KNOWLEDGE_FILE_PROCESSING_TOPIC =
        process.env.KNOWLEDGE_FILE_PROCESSING_TOPIC ||
        'knowledge-file-processing-trigger';

      it('should publish a message for a new, pending document', async () => {
        const context = { _wasNew: true };
        const doc = {
          ...mockFileData,
          _id: fileId,
          tenantId,
          userId,
          processingStatus: 'pending',
        };

        await postSaveHook.call(context, doc);

        expect(mockTopic).toHaveBeenCalledWith(KNOWLEDGE_FILE_PROCESSING_TOPIC);
        expect(mockPublishMessage).toHaveBeenCalledTimes(1);

        const expectedPayload = {
          knowledgeBankFileId: fileId.toString(),
          tenantId: tenantId.toString(),
          userId: userId.toString(),
        };
        const actualData = JSON.parse(
          mockPublishMessage.mock.calls[0][0].data.toString()
        );
        expect(actualData).toEqual(expectedPayload);
      });

      it('should handle null tenantId in the payload', async () => {
        const context = { _wasNew: true };
        const doc = {
          ...mockFileData,
          tenantId: null,
          processingStatus: 'pending',
        };

        await postSaveHook.call(context, doc);

        expect(mockPublishMessage).toHaveBeenCalledTimes(1);
        const actualData = JSON.parse(
          mockPublishMessage.mock.calls[0][0].data.toString()
        );
        expect(actualData.tenantId).toBeNull();
      });

      it('should NOT publish a message if document is not new', async () => {
        const context = { _wasNew: false }; // Set by pre-hook logic
        const doc = { ...mockFileData, processingStatus: 'pending' };

        await postSaveHook.call(context, doc);
        expect(mockPublishMessage).not.toHaveBeenCalled();
      });

      it('should NOT publish a message if status is not pending', async () => {
        const context = { _wasNew: true };
        const doc = { ...mockFileData, processingStatus: 'completed' };

        await postSaveHook.call(context, doc);
        expect(mockPublishMessage).not.toHaveBeenCalled();
      });

      it('should catch and log errors from Pub/Sub without throwing', async () => {
        const pubSubError = new Error('PubSub publish failed');
        mockPublishMessage.mockRejectedValue(pubSubError);

        const context = { _wasNew: true };
        const doc = { ...mockFileData, processingStatus: 'pending' };

        await expect(postSaveHook.call(context, doc)).resolves.toBeUndefined();

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            `CRITICAL: Failed to publish processing message for file ${doc._id} to Pub/Sub.`
          ),
          pubSubError
        );
      });
    });
  });
});