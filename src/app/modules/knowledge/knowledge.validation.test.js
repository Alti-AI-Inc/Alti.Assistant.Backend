import { vi, describe, it, expect } from 'vitest';

vi.mock('./knowledge.constant.js', () => ({
  OWNER_TYPES: {
    USER: 'USER',
    BOT: 'BOT',
  },
  FOLDER_COLORS: {
    RED: 'red',
    BLUE: 'blue',
  },
}));

import {
  uploadFileSchema,
  processFileSchema,
  getFilesSchema,
  getFileByIdSchema,
  deleteFileSchema,
  getStorageStatsSchema,
  createFolderSchema,
  getFoldersSchema,
  getFolderByIdSchema,
  updateFolderSchema,
  deleteFolderSchema,
  getFolderContentsSchema,
  KnowledgeValidation,
} from './knowledge.validation.js';

describe('Knowledge Validation Schemas', () => {
  describe('uploadFileSchema', () => {
    it('should validate successfully with valid data', () => {
      const validData = {
        body: {
          ownerType: 'USER',
          ownerId: 'user-123',
          folderId: 'folder-123',
          description: 'Test file description',
          tags: '["tag1", "tag2"]',
          processImmediately: 'true',
        },
      };
      const result = uploadFileSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate successfully with only required fields', () => {
      const validData = {
        body: {
          ownerType: 'BOT',
        },
      };
      const result = uploadFileSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail validation if ownerType is missing', () => {
      const invalidData = {
        body: {
          ownerId: 'user-123',
        },
      };
      const result = uploadFileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should fail validation if ownerType is invalid', () => {
      const invalidData = {
        body: {
          ownerType: 'INVALID_TYPE',
        },
      };
      const result = uploadFileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('processFileSchema', () => {
    it('should validate successfully with valid fileId', () => {
      const validData = {
        params: {
          fileId: 'file-123',
        },
      };
      const result = processFileSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail validation if fileId is empty', () => {
      const invalidData = {
        params: {
          fileId: '',
        },
      };
      const result = processFileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should fail validation if params is missing', () => {
      const invalidData = {};
      const result = processFileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('getFilesSchema', () => {
    it('should validate successfully with valid query', () => {
      const validData = {
        query: {
          ownerType: 'USER',
          ownerId: 'user-123',
          fileType: 'pdf',
          processingStatus: 'completed',
          isProcessed: 'true',
          folderId: 'folder-123',
          limit: '10',
          skip: '0',
        },
      };
      const result = getFilesSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate successfully with only required query fields', () => {
      const validData = {
        query: {
          ownerType: 'BOT',
        },
      };
      const result = getFilesSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail validation if ownerType is missing in query', () => {
      const invalidData = {
        query: {
          ownerId: 'user-123',
        },
      };
      const result = getFilesSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('getFileByIdSchema', () => {
    it('should validate successfully with valid params and query', () => {
      const validData = {
        params: {
          fileId: 'file-123',
        },
        query: {
          ownerType: 'USER',
          ownerId: 'user-123',
        },
      };
      const result = getFileByIdSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail validation if fileId is empty', () => {
      const invalidData = {
        params: {
          fileId: '',
        },
        query: {
          ownerType: 'USER',
        },
      };
      const result = getFileByIdSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should fail validation if ownerType is missing in query', () => {
      const invalidData = {
        params: {
          fileId: 'file-123',
          ownerType: 'USER',
        },
        query: {},
      };
      const result = getFileByIdSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('deleteFileSchema', () => {
    it('should validate successfully with valid params and body', () => {
      const validData = {
        params: {
          fileId: 'file-123',
        },
        body: {
          ownerType: 'BOT',
          ownerId: 'bot-123',
        },
      };
      const result = deleteFileSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail validation if fileId is missing', () => {
      const invalidData = {
        params: {},
        body: {
          ownerType: 'BOT',
        },
      };
      const result = deleteFileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should fail validation if ownerType is missing in body', () => {
      const invalidData = {
        params: {
          fileId: 'file-123',
        },
        body: {},
      };
      const result = deleteFileSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('getStorageStatsSchema', () => {
    it('should validate successfully with valid query', () => {
      const validData = {
        query: {
          ownerType: 'USER',
          ownerId: 'user-123',
        },
      };
      const result = getStorageStatsSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail validation if ownerType is missing', () => {
      const invalidData = {
        query: {},
      };
      const result = getStorageStatsSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('createFolderSchema', () => {
    it('should validate successfully with valid body', () => {
      const validData = {
        body: {
          name: 'New Folder',
          parentFolderId: 'parent-123',
          description: 'Folder description',
          color: 'blue',
          icon: 'folder-icon',
          tags: ['tag1', 'tag2'],
        },
      };
      const result = createFolderSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate successfully with only required fields', () => {
      const validData = {
        body: {
          name: 'A',
        },
      };
      const result = createFolderSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail validation if name is empty', () => {
      const invalidData = {
        body: {
          name: '',
        },
      };
      const result = createFolderSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should fail validation if name exceeds 100 characters', () => {
      const invalidData = {
        body: {
          name: 'a'.repeat(101),
        },
      };
      const result = createFolderSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should fail validation if description exceeds 500 characters', () => {
      const invalidData = {
        body: {
          name: 'Valid Name',
          description: 'a'.repeat(501),
        },
      };
      const result = createFolderSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('getFoldersSchema', () => {
    it('should validate successfully with parentFolderId', () => {
      const validData = {
        query: {
          parentFolderId: 'folder-123',
        },
      };
      const result = getFoldersSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate successfully with empty query', () => {
      const validData = {
        query: {},
      };
      const result = getFoldersSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('getFolderByIdSchema', () => {
    it('should validate successfully with valid folderId', () => {
      const validData = {
        params: {
          folderId: 'folder-123',
        },
      };
      const result = getFolderByIdSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail validation if folderId is empty', () => {
      const invalidData = {
        params: {
          folderId: '',
        },
      };
      const result = getFolderByIdSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('updateFolderSchema', () => {
    it('should validate successfully with valid params and body', () => {
      const validData = {
        params: {
          folderId: 'folder-123',
        },
        body: {
          name: 'Updated Name',
          description: 'Updated description',
          color: 'red',
          icon: 'new-icon',
          tags: ['new-tag'],
        },
      };
      const result = updateFolderSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate successfully with empty body', () => {
      const validData = {
        params: {
          folderId: 'folder-123',
        },
        body: {},
      };
      const result = updateFolderSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail validation if folderId is empty', () => {
      const invalidData = {
        params: {
          folderId: '',
        },
        body: {
          name: 'Valid Name',
        },
      };
      const result = updateFolderSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should fail validation if name is empty in body', () => {
      const invalidData = {
        params: {
          folderId: 'folder-123',
            },
            body: {
              name: '',
            },
          };
          const result = updateFolderSchema.safeParse(invalidData);
          expect(result.success).toBe(false);
        });
      });

      describe('deleteFolderSchema', () => {
        it('should validate successfully with boolean recursive', () => {
          const validData = {
            params: {
              folderId: 'folder-123',
            },
            body: {
              recursive: true,
            },
          };
          const result = deleteFolderSchema.safeParse(validData);
          expect(result.success).toBe(true);
        });

        it('should validate successfully with string recursive', () => {
          const validData = {
            params: {
              folderId: 'folder-123',
            },
            body: {
              recursive: 'true',
            },
          };
          const result = deleteFolderSchema.safeParse(validData);
          expect(result.success).toBe(true);
        });

        it('should validate successfully without recursive body', () => {
          const validData = {
            params: {
              folderId: 'folder-123',
            },
            body: {},
          };
          const result = deleteFolderSchema.safeParse(validData);
          expect(result.success).toBe(true);
        });

        it('should fail validation if folderId is empty', () => {
          const invalidData = {
            params: {
              folderId: '',
            },
          };
          const result = deleteFolderSchema.safeParse(invalidData);
          expect(result.success).toBe(false);
        });
      });

      describe('getFolderContentsSchema', () => {
        it('should validate successfully with folderId', () => {
          const validData = {
            params: {
              folderId: 'folder-123',
            },
          };
          const result = getFolderContentsSchema.safeParse(validData);
          expect(result.success).toBe(true);
        });

        it('should fail validation if folderId is missing', () => {
          const invalidData = {
            params: {},
          };
          const result = getFolderContentsSchema.safeParse(invalidData);
          expect(result.success).toBe(false);
        });
      });

      describe('KnowledgeValidation Namespace', () => {
        it('should contain all defined schemas', () => {
          expect(KnowledgeValidation.uploadFileSchema).toBe(uploadFileSchema);
          expect(KnowledgeValidation.processFileSchema).toBe(processFileSchema);
          expect(KnowledgeValidation.getFilesSchema).toBe(getFilesSchema);
          expect(KnowledgeValidation.getFileByIdSchema).toBe(getFileByIdSchema);
          expect(KnowledgeValidation.deleteFileSchema).toBe(deleteFileSchema);
          expect(KnowledgeValidation.getStorageStatsSchema).toBe(getStorageStatsSchema);
          expect(KnowledgeValidation.createFolderSchema).toBe(createFolderSchema);
          expect(KnowledgeValidation.getFoldersSchema).toBe(getFoldersSchema);
          expect(KnowledgeValidation.getFolderByIdSchema).toBe(getFolderByIdSchema);
          expect(KnowledgeValidation.updateFolderSchema).toBe(updateFolderSchema);
          expect(KnowledgeValidation.deleteFolderSchema).toBe(deleteFolderSchema);
          expect(KnowledgeValidation.getFolderContentsSchema).toBe(getFolderContentsSchema);
        });
      });
    });