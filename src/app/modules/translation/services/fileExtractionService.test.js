import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import mammoth from 'mammoth';
import PDFParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import { promisify } from 'util';

import { fileExtractionService } from './fileExtractionService.js';
import { logger } from '../../../../shared/logger.js';
import { ERROR_MESSAGES } from '../translation.constant.js';

// --- Mocks ---
vi.mock('fs', () => ({
  default: {
    readFile: vi.fn(),
    promises: {
      stat: vi.fn(),
      unlink: vi.fn(),
    },
  },
}));

vi.mock('util', () => ({
  promisify: vi.fn(fn => fn), // Pass through the mocked fs.readFile
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}));

vi.mock('xlsx', () => ({
  read: vi.fn(),
  utils: {
    sheet_to_csv: vi.fn(),
  },
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('FileExtractionService', () => {
  const mockFilePath = '/tmp/testfile';
  const mockFileSize = 1234;
  const mockFileBuffer = Buffer.from('mock file content');

  beforeEach(() => {
    vi.resetAllMocks();
    fs.promises.stat.mockResolvedValue({ size: mockFileSize });
    fs.default.readFile.mockResolvedValue(mockFileBuffer);
  });

  describe('extractTextFromFile', () => {
    const plainTextFormats = [
      { ext: '.txt', name: 'document.txt' },
      { ext: '.md', name: 'readme.md' },
      { ext: '.html', name: 'index.html' },
      { ext: '.json', name: 'data.json' },
      { ext: '.csv', name: 'sheet.csv' },
    ];

    it.each(plainTextFormats)('should extract text from a $ext file', async ({ ext, name }) => {
      const mockText = `Hello from ${ext}`;
      const mockBuffer = Buffer.from(mockText);
      fs.default.readFile.mockResolvedValue(mockBuffer);

      const result = await fileExtractionService.extractTextFromFile(mockFilePath, name);

      expect(fs.default.readFile).toHaveBeenCalledWith(mockFilePath);
      expect(result.success).toBe(true);
      expect(result.text).toBe(mockText);
      expect(result.metadata).toEqual({
        fileName: name,
        fileExtension: ext,
        fileSize: mockFileSize,
        characterCount: mockText.length,
        wordCount: 3,
      });
      expect(logger.info).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith('Extracting text from file', expect.any(Object));
      expect(logger.info).toHaveBeenCalledWith('Text extraction completed', expect.any(Object));
    });

    it('should extract text from a .docx file', async () => {
      const mockText = 'This is a docx file.';
      mammoth.default.extractRawText.mockResolvedValue({ value: mockText });

      const result = await fileExtractionService.extractTextFromFile(mockFilePath, 'report.docx');

      expect(fs.default.readFile).toHaveBeenCalledWith(mockFilePath);
      expect(mammoth.default.extractRawText).toHaveBeenCalledWith({ buffer: mockFileBuffer });
      expect(result.success).toBe(true);
      expect(result.text).toBe(mockText);
      expect(result.metadata.wordCount).toBe(5);
      expect(result.metadata.characterCount).toBe(mockText.length);
    });

    it('should extract text from a .pdf file', async () => {
      const mockText = 'This is a pdf file.';
      PDFParse.default.mockResolvedValue({ text: mockText });

      const result = await fileExtractionService.extractTextFromFile(mockFilePath, 'manual.pdf');

      expect(fs.default.readFile).toHaveBeenCalledWith(mockFilePath);
      expect(PDFParse.default).toHaveBeenCalledWith(mockFileBuffer);
      expect(result.success).toBe(true);
      expect(result.text).toBe(mockText);
      expect(result.metadata.wordCount).toBe(5);
      expect(result.metadata.characterCount).toBe(mockText.length);
    });

    it('should extract text from a .xlsx file', async () => {
      const mockSheetData = 'col1,col2\nval1,val2';
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      };
      XLSX.read.mockReturnValue(mockWorkbook);
      XLSX.utils.sheet_to_csv.mockReturnValue(mockSheetData);

      const result = await fileExtractionService.extractTextFromFile(mockFilePath, 'data.xlsx');

      expect(fs.default.readFile).toHaveBeenCalledWith(mockFilePath);
      expect(XLSX.read).toHaveBeenCalledWith(mockFileBuffer, { type: 'buffer' });
      expect(XLSX.utils.sheet_to_csv).toHaveBeenCalledWith(mockWorkbook.Sheets.Sheet1);
      expect(result.success).toBe(true);
      expect(result.text).toBe(`${mockSheetData}\n\n`);
      expect(result.metadata.wordCount).toBe(2); // Based on regex match of "col1,col2" and "val1,val2"
      expect(result.metadata.characterCount).toBe(20);
    });

    it('should throw an error for unsupported file formats', async () => {
      const originalName = 'archive.zip';
      await expect(
        fileExtractionService.extractTextFromFile(mockFilePath, originalName)
      ).rejects.toThrow(ERROR_MESSAGES.UNSUPPORTED_FORMAT);

      expect(logger.error).toHaveBeenCalledWith('File extraction failed:', expect.any(Error));
    });

    it('should throw an error if file stat fails', async () => {
      const statError = new Error('stat failed');
      fs.promises.stat.mockRejectedValue(statError);

      await expect(
        fileExtractionService.extractTextFromFile(mockFilePath, 'document.txt')
      ).rejects.toThrow(statError);

      expect(logger.error).toHaveBeenCalledWith('File extraction failed:', statError);
    });

    it('should handle errors during DOCX extraction', async () => {
      const docxError = new Error('mammoth failed');
      mammoth.default.extractRawText.mockRejectedValue(docxError);

      await expect(
        fileExtractionService.extractTextFromFile(mockFilePath, 'corrupt.docx')
      ).rejects.toThrow('Failed to extract text from DOCX file');

      expect(logger.error).toHaveBeenCalledWith('DOCX extraction error:', docxError);
      expect(logger.error).toHaveBeenCalledWith('File extraction failed:', expect.any(Error));
    });

    it('should handle errors during PDF extraction', async () => {
        const pdfError = new Error('pdf-parse failed');
        PDFParse.default.mockRejectedValue(pdfError);
  
        await expect(
          fileExtractionService.extractTextFromFile(mockFilePath, 'corrupt.pdf')
        ).rejects.toThrow('Failed to extract text from PDF file');
  
        expect(logger.error).toHaveBeenCalledWith('PDF extraction error:', pdfError);
        expect(logger.error).toHaveBeenCalledWith('File extraction failed:', expect.any(Error));
    });

    it('should handle errors during XLSX extraction', async () => {
        const xlsxError = new Error('xlsx failed');
        XLSX.read.mockImplementation(() => { throw xlsxError; });
  
        await expect(
          fileExtractionService.extractTextFromFile(mockFilePath, 'corrupt.xlsx')
        ).rejects.toThrow('Failed to extract text from XLSX file. Please ensure the file is not corrupted.');
  
        expect(logger.error).toHaveBeenCalledWith('XLSX extraction error:', xlsxError);
        expect(logger.error).toHaveBeenCalledWith('File extraction failed:', expect.any(Error));
    });

    it('should correctly calculate word and character counts for complex text', async () => {
        const mockText = '  leading and trailing spaces\nand newlines\t with tabs. ';
        const mockBuffer = Buffer.from(mockText);
        fs.default.readFile.mockResolvedValue(mockBuffer);
  
        const result = await fileExtractionService.extractTextFromFile(mockFilePath, 'complex.txt');
  
        expect(result.metadata.characterCount).toBe(mockText.length);
        expect(result.metadata.wordCount).toBe(9);
    });

    it('should handle empty files correctly', async () => {
        const mockText = '';
        const mockBuffer = Buffer.from(mockText);
        fs.default.readFile.mockResolvedValue(mockBuffer);
  
        const result = await fileExtractionService.extractTextFromFile(mockFilePath, 'empty.txt');
  
        expect(result.text).toBe('');
        expect(result.metadata.characterCount).toBe(0);
        expect(result.metadata.wordCount).toBe(0);
    });

    it('should handle files with only whitespace correctly', async () => {
        const mockText = '   \n\t  ';
        const mockBuffer = Buffer.from(mockText);
        fs.default.readFile.mockResolvedValue(mockBuffer);
  
        const result = await fileExtractionService.extractTextFromFile(mockFilePath, 'whitespace.txt');
  
        expect(result.text).toBe(mockText);
        expect(result.metadata.characterCount).toBe(mockText.length);
        expect(result.metadata.wordCount).toBe(0);
    });
  });

  describe('cleanupFile', () => {
    it('should call fs.promises.unlink and log success', async () => {
      fs.promises.unlink.mockResolvedValue(undefined);

      await fileExtractionService.cleanupFile(mockFilePath);

      expect(fs.promises.unlink).toHaveBeenCalledWith(mockFilePath);
      expect(logger.info).toHaveBeenCalledWith('Temporary file cleaned up', { filePath: mockFilePath });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should log a warning if cleanup fails for reasons other than file not found', async () => {
      const unlinkError = new Error('Permission denied');
      unlinkError.code = 'EPERM';
      fs.promises.unlink.mockRejectedValue(unlinkError);

      await fileExtractionService.cleanupFile(mockFilePath);

      expect(fs.promises.unlink).toHaveBeenCalledWith(mockFilePath);
      expect(logger.warn).toHaveBeenCalledWith('Failed to cleanup file:', unlinkError);
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should not log a warning if the file to be cleaned up does not exist', async () => {
      const notFoundError = new Error('File not found');
      notFoundError.code = 'ENOENT';
      fs.promises.unlink.mockRejectedValue(notFoundError);

      await fileExtractionService.cleanupFile(mockFilePath);

      expect(fs.promises.unlink).toHaveBeenCalledWith(mockFilePath);
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});