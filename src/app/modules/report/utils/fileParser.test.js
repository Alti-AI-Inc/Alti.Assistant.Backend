import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  parseTextFile,
  parsePDFFile,
  parseCSVFile,
  parseJSONFile,
  parseXLSXFile,
  parseDOCXFile,
  parseFile,
  validateFile,
  extractContentFromFiles,
} from './fileParser.js';
import { logger } from '../../../../shared/logger.js';

// Mock dependencies
vi.mock('fs', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Promisify the mocked readFile
const readFileMock = vi.fn();
fs.readFile.mockImplementation((path, options, callback) => {
  // Handle the two-argument version of readFile
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }
  readFileMock(path, options)
    .then(data => callback(null, data))
    .catch(err => callback(err, null));
});

describe('fileParser utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseTextFile', () => {
    it('should parse a text file and return its content and metadata', async () => {
      const filePath = '/fake/test.txt';
      const fileContent = 'Hello, world!';
      readFileMock.mockResolvedValue(fileContent);

      const result = await parseTextFile(filePath);

      expect(readFileMock).toHaveBeenCalledWith(filePath, 'utf-8');
      expect(result).toEqual({
        content: fileContent,
        metadata: {
          type: 'text',
          size: fileContent.length,
        },
      });
    });

    it('should throw an error if file reading fails', async () => {
      const filePath = '/fake/nonexistent.txt';
      const readError = new Error('File not found');
      readFileMock.mockRejectedValue(readError);

      await expect(parseTextFile(filePath)).rejects.toThrow(
        `Failed to parse text file: ${readError.message}`
      );
      expect(logger.error).toHaveBeenCalledWith('Error parsing text file:', readError);
    });
  });

  describe('parsePDFFile (placeholder)', () => {
    it('should return placeholder content and log a warning', async () => {
      const filePath = '/fake/test.pdf';
      const result = await parsePDFFile(filePath);

      expect(result).toEqual({
        content: 'PDF content extraction requires pdf-parse package',
        metadata: {
          type: 'pdf',
          pages: 0,
        },
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'PDF parsing not fully implemented. Install pdf-parse package.'
      );
    });
  });

  describe('parseCSVFile', () => {
    it('should parse a valid CSV file', async () => {
      const filePath = '/fake/data.csv';
      const fileContent = 'id,name,value\n1,alpha,100\n2,beta,200';
      readFileMock.mockResolvedValue(fileContent);

      const result = await parseCSVFile(filePath);

      expect(result).toEqual({
        content: fileContent,
        data: [
          { id: '1', name: 'alpha', value: '100' },
          { id: '2', name: 'beta', value: '200' },
        ],
        headers: ['id', 'name', 'value'],
        metadata: {
          type: 'csv',
          rows: 2,
          columns: 3,
        },
      });
    });

    it('should handle an empty CSV file', async () => {
      const filePath = '/fake/empty.csv';
      const fileContent = '';
      readFileMock.mockResolvedValue(fileContent);

      const result = await parseCSVFile(filePath);

      expect(result).toEqual({
        content: '',
        data: [],
        headers: [],
        metadata: { type: 'csv', rows: 0, columns: 0 },
      });
    });

    it('should handle a CSV with only a header', async () => {
        const filePath = '/fake/header.csv';
        const fileContent = 'id,name,value\n';
        readFileMock.mockResolvedValue(fileContent);
  
        const result = await parseCSVFile(filePath);
  
        expect(result).toEqual({
          content: fileContent,
          data: [],
          headers: ['id', 'name', 'value'],
          metadata: {
            type: 'csv',
            rows: 0,
            columns: 3,
          },
        });
      });

    it('should throw an error if file reading fails', async () => {
      const filePath = '/fake/nonexistent.csv';
      const readError = new Error('Access denied');
      readFileMock.mockRejectedValue(readError);

      await expect(parseCSVFile(filePath)).rejects.toThrow(
        `Failed to parse CSV file: ${readError.message}`
      );
      expect(logger.error).toHaveBeenCalledWith('Error parsing CSV file:', readError);
    });
  });

  describe('parseJSONFile', () => {
    it('should parse a valid JSON object file', async () => {
      const filePath = '/fake/data.json';
      const fileContent = '{"key": "value", "number": 123}';
      const jsonData = { key: 'value', number: 123 };
      readFileMock.mockResolvedValue(fileContent);

      const result = await parseJSONFile(filePath);

      expect(result).toEqual({
        content: fileContent,
        data: jsonData,
        metadata: {
          type: 'json',
          keys: ['key', 'number'],
        },
      });
    });

    it('should throw an error for invalid JSON', async () => {
      const filePath = '/fake/invalid.json';
      const fileContent = '{"key": "value",}'; // Invalid trailing comma
      readFileMock.mockResolvedValue(fileContent);

      await expect(parseJSONFile(filePath)).rejects.toThrow(
        /Failed to parse JSON file/
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should throw an error if file reading fails', async () => {
        const filePath = '/fake/nonexistent.json';
        const readError = new Error('File not found');
        readFileMock.mockRejectedValue(readError);
  
        await expect(parseJSONFile(filePath)).rejects.toThrow(
          `Failed to parse JSON file: ${readError.message}`
        );
        expect(logger.error).toHaveBeenCalledWith('Error parsing JSON file:', readError);
      });
  });

  describe('parseXLSXFile (placeholder)', () => {
    it('should return placeholder content and log a warning', async () => {
      const filePath = '/fake/test.xlsx';
      const result = await parseXLSXFile(filePath);

      expect(result).toEqual({
        content: 'XLSX content extraction requires xlsx package',
        metadata: {
          type: 'xlsx',
          sheets: 0,
        },
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'XLSX parsing not fully implemented. Install xlsx package.'
      );
    });
  });

  describe('parseDOCXFile (placeholder)', () => {
    it('should return placeholder content and log a warning', async () => {
      const filePath = '/fake/test.docx';
      const result = await parseDOCXFile(filePath);

      expect(result).toEqual({
        content: 'DOCX content extraction requires mammoth package',
        metadata: {
          type: 'docx',
        },
      });
      expect(logger.warn).toHaveBeenCalledWith(
        'DOCX parsing not fully implemented. Install mammoth package.'
      );
    });
  });

  describe('parseFile (dispatcher)', () => {
    it.each([
        ['/path/to/file.txt', 'text'],
        ['/path/to/file.md', 'text'],
        ['/path/to/file.HTML', 'text'],
        ['/path/to/file.csv', 'csv'],
        ['/path/to/file.json', 'json'],
        ['/path/to/file.pdf', 'pdf'],
        ['/path/to/file.xlsx', 'xlsx'],
        ['/path/to/file.XLS', 'xlsx'],
        ['/path/to/file.docx', 'docx'],
        ['/path/to/file.doc', 'docx'],
      ])('should dispatch %s to the correct parser', async (filePath, type) => {
        readFileMock.mockResolvedValue('mock content'); // Generic mock for all parsers
        const result = await parseFile(filePath);
        expect(result.metadata.type).toBe(type);
      });

    it('should throw an error for an unsupported file format', async () => {
      const filePath = '/path/to/archive.zip';
      await expect(parseFile(filePath)).rejects.toThrow(
        'Unsupported file format: zip'
      );
    });
  });

  describe('validateFile', () => {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedFormats = ['txt', 'pdf', 'csv'];

    it('should return true for a valid file', () => {
      const file = {
        originalname: 'document.txt',
        size: 5 * 1024 * 1024, // 5MB
      };
      expect(validateFile(file, maxSize, allowedFormats)).toBe(true);
    });

    it('should throw an error for an unsupported file format', () => {
        const file = {
          originalname: 'image.jpg',
          size: 1024,
        };
        expect(() => validateFile(file, maxSize, allowedFormats)).toThrow(
          'File format .jpg is not supported. Allowed formats: txt, pdf, csv'
        );
      });
  
      it('should throw an error for an oversized file', () => {
        const file = {
          originalname: 'large_file.pdf',
          size: 15 * 1024 * 1024, // 15MB
        };
        expect(() => validateFile(file, maxSize, allowedFormats)).toThrow(
          'File size 15.00MB exceeds maximum 10.00MB'
        );
      });

      it('should handle case-insensitive file extensions', () => {
        const file = {
          originalname: 'REPORT.CSV',
          size: 1024,
        };
        expect(validateFile(file, maxSize, allowedFormats)).toBe(true);
      });
  });

  describe('extractContentFromFiles', () => {
    it('should process an array of files successfully', async () => {
        const files = [
            { path: '/fake/report.csv', originalname: 'report.csv' },
            { path: '/fake/notes.txt', originalname: 'notes.txt' },
        ];
        readFileMock.mockImplementation(async (filePath) => {
            if (filePath.endsWith('.csv')) return 'header,col\nval1,val2';
            if (filePath.endsWith('.txt')) return 'some text';
            return '';
        });

        const results = await extractContentFromFiles(files);

        expect(results).toHaveLength(2);
        expect(results[0].filename).toBe('report.csv');
        expect(results[0].metadata.type).toBe('csv');
        expect(results[1].filename).toBe('notes.txt');
        expect(results[1].metadata.type).toBe('text');
        expect(results.every(r => !r.error)).toBe(true);
    });

    it('should handle a mix of successful and failed files', async () => {
        const files = [
            { path: '/fake/data.json', originalname: 'data.json' },
            { path: '/fake/unsupported.zip', originalname: 'unsupported.zip' },
            { path: '/fake/broken.txt', originalname: 'broken.txt' },
        ];

        readFileMock.mockImplementation(async (filePath) => {
            if (filePath.endsWith('.json')) return '{"a": 1}';
            if (filePath.endsWith('.txt')) throw new Error('Read error');
            return '';
        });

        const results = await extractContentFromFiles(files);

        expect(results).toHaveLength(3);
        
        const successResult = results.find(r => r.filename === 'data.json');
        expect(successResult.metadata.type).toBe('json');
        expect(successResult.error).toBeUndefined();

        const unsupportedResult = results.find(r => r.filename === 'unsupported.zip');
        expect(unsupportedResult.error).toBe('Unsupported file format: zip');

        const failedResult = results.find(r => r.filename === 'broken.txt');
        expect(failedResult.error).toBe('Failed to parse text file: Read error');

        expect(logger.error).toHaveBeenCalledTimes(2);
    });

    it('should return an empty array if no files are provided', async () => {
        const results = await extractContentFromFiles([]);
        expect(results).toEqual([]);
    });
  });
});