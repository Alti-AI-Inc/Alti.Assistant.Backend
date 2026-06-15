import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockMemoryStorageInstance = { type: 'memory' };
const mockMulterInstance = {
  single: vi.fn().mockImplementation(() => (req, res, next) => next()),
};

const {
  mockMulter
} = vi.hoisted(() => {
  const mockMulter = vi.fn().mockReturnValue(mockMulterInstance);

  return {
    mockMulter
  };
});
mockMulter.memoryStorage = vi.fn().mockReturnValue(mockMemoryStorageInstance);

vi.mock('multer', () => ({
  default: mockMulter,
}));

vi.mock('../knowledge.constant.js', () => ({
  KNOWLEDGE_CONFIG: {
    SUPPORTED_FILE_EXTENSIONS: ['.pdf', '.docx', '.txt'],
    MAX_FILE_SIZE: 10485760,
  },
}));

import { uploadKnowledge } from './uploadKnowledge.js';

describe('uploadKnowledge Middleware', () => {
  it('should initialize multer with memory storage', () => {
    expect(mockMulter.memoryStorage).toHaveBeenCalled();
    expect(mockMulter).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: mockMemoryStorageInstance,
      })
    );
  });

  it('should configure multer with the correct file size limit', () => {
    expect(mockMulter).toHaveBeenCalledWith(
      expect.objectContaining({
        limits: {
          fileSize: 10485760,
        },
      })
    );
  });

  describe('fileFilter', () => {
    let fileFilter;

    beforeEach(() => {
      fileFilter = mockMulter.mock.calls[0][0].fileFilter;
    });

    it('should accept supported file extensions (lowercase)', () => {
      const req = {};
      const file = { originalname: 'document.pdf' };
      const cb = vi.fn();

      fileFilter(req, file, cb);

      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should accept supported file extensions (uppercase)', () => {
      const req = {};
      const file = { originalname: 'DOCUMENT.PDF' };
      const cb = vi.fn();

      fileFilter(req, file, cb);

      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should reject unsupported file extensions', () => {
      const req = {};
      const file = { originalname: 'malicious.exe' };
      const cb = vi.fn();

      fileFilter(req, file, cb);

      expect(cb).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
      
      const errorArg = cb.mock.calls[0][0];
      expect(errorArg.message).toContain('File type not supported');
      expect(errorArg.message).toContain('.pdf, .docx, .txt');
    });

    it('should handle files with no extension by rejecting them', () => {
      const req = {};
      const file = { originalname: 'no-extension' };
      const cb = vi.fn();

      fileFilter(req, file, cb);

      expect(cb).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
    });
  });
});