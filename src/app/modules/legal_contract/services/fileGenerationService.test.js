import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../../../shared/logger.js';
import { Document, Packer, Paragraph, TextRun } from 'docx';

// Import the functions to be tested
import {
  generateTextFile,
  generateDocxFile,
  generateContractFile,
  cleanupContractFile,
} from '../services/fileGenerationService';

// Mock external dependencies
vi.mock('fs/promises');
vi.mock('path');
vi.mock('../../../../shared/logger.js');
vi.mock('docx', () => {
  const mockParagraph = vi.fn().mockImplementation((options) => ({ type: 'Paragraph', options }));
  const mockTextRun = vi.fn().mockImplementation((options) => ({ type: 'TextRun', options }));
  const mockDocument = vi.fn().mockImplementation((options) => ({ type: 'Document', options }));
  const mockPacker = {
    toBuffer: vi.fn().mockImplementation(() => Buffer.from('mock docx buffer')),
  };
  return {
    Document: mockDocument,
    Packer: mockPacker,
    Paragraph: mockParagraph,
    TextRun: mockTextRun,
  };
});

// Mock process.cwd() for consistent path generation
const MOCK_CWD = '/mock/project/root';
const MOCK_OUTPUT_DIR = `${MOCK_CWD}/output/contracts`; // Using string concatenation for consistency with path.join mock

describe('fileGenerationService', () => {
  let dateNowSpy;
  let toISOStringSpy;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Set up mock for path.join
    path.join.mockImplementation((...args) => args.join('/')); // Simple join for testing
    // Mock process.cwd()
    vi.spyOn(process, 'cwd').mockReturnValue(MOCK_CWD);

    // Default successful mock implementations for fs
    fs.mkdir.mockResolvedValue(undefined);
    fs.writeFile.mockResolvedValue(undefined);
    fs.unlink.mockResolvedValue(undefined);

    // Default mock implementations for logger
    logger.info.mockImplementation(() => {});
    logger.error.mockImplementation(() => {});

    // Mock Date.now() and Date.prototype.toISOString for predictable timestamps
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1678886400000); // Fixed timestamp
    toISOStringSpy = vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2023-03-15T00:00:00.000Z');
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Restore process.cwd(), Date.now(), and Date.prototype.toISOString
  });

  describe('generateTextFile', () => {
    const mockContent = 'This is a test contract content.';
    const mockFileName = 'test_contract.txt';
    const expectedFilePath = `${MOCK_OUTPUT_DIR}/${mockFileName}`;
    const defaultFilePath = `${MOCK_OUTPUT_DIR}/contract.txt`;

    it('should generate a text file successfully with default file name', async () => {
      const result = await generateTextFile(mockContent);

      expect(fs.mkdir).toHaveBeenCalledWith(MOCK_OUTPUT_DIR, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        defaultFilePath,
        mockContent,
        'utf8'
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Text file generated: ${defaultFilePath}`
      );
      expect(result).toEqual({
        success: true,
        filePath: defaultFilePath,
        fileName: 'contract.txt',
        fileType: 'txt',
      });
    });

    it('should generate a text file successfully with a custom file name', async () => {
      const result = await generateTextFile(mockContent, mockFileName);

      expect(fs.mkdir).toHaveBeenCalledWith(MOCK_OUTPUT_DIR, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(expectedFilePath, mockContent, 'utf8');
      expect(logger.info).toHaveBeenCalledWith(`Text file generated: ${expectedFilePath}`);
      expect(result).toEqual({
        success: true,
        filePath: expectedFilePath,
        fileName: mockFileName,
        fileType: 'txt',
      });
    });

    it('should handle errors during directory creation', async () => {
      const mockError = new Error('Failed to create directory');
      fs.mkdir.mockRejectedValue(mockError);

      await expect(generateTextFile(mockContent, mockFileName)).rejects.toThrow(mockError);
      expect(fs.mkdir).toHaveBeenCalledWith(MOCK_OUTPUT_DIR, { recursive: true });
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Error generating text file:', mockError);
    });

    it('should handle errors during file writing', async () => {
      const mockError = new Error('Failed to write file');
      fs.writeFile.mockRejectedValue(mockError);

      await expect(generateTextFile(mockContent, mockFileName)).rejects.toThrow(mockError);
      expect(fs.mkdir).toHaveBeenCalledWith(MOCK_OUTPUT_DIR, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(expectedFilePath, mockContent, 'utf8');
      expect(logger.error).toHaveBeenCalledWith('Error generating text file:', mockError);
    });
  });

  describe('generateDocxFile', () => {
    const mockContent = `
# Main Heading
## Sub Heading
This is a normal paragraph.
**This is bold text.**

Another paragraph.
`;
    const mockFileName = 'test_contract.docx';
    const expectedFilePath = `${MOCK_OUTPUT_DIR}/${mockFileName}`;
    const defaultFilePath = `${MOCK_OUTPUT_DIR}/contract.docx`;

    it('should generate a DOCX file successfully with default file name', async () => {
      const result = await generateDocxFile(mockContent);

      expect(fs.mkdir).toHaveBeenCalledWith(MOCK_OUTPUT_DIR, { recursive: true });
      expect(Packer.toBuffer).toHaveBeenCalledTimes(1);
      expect(fs.writeFile).toHaveBeenCalledWith(
        defaultFilePath,
        Buffer.from('mock docx buffer')
      );
      expect(logger.info).toHaveBeenCalledWith(
        `DOCX file generated successfully: ${defaultFilePath}`
      );
      expect(result).toEqual({
        success: true,
        filePath: defaultFilePath,
        fileName: 'contract.docx',
        fileType: 'docx',
      });

      // Verify docx structure creation
      expect(Document).toHaveBeenCalledTimes(1);
      const docArgs = Document.mock.calls[0][0];
      expect(docArgs.sections).toHaveLength(1);
      expect(docArgs.sections[0].children).toHaveLength(7); // 6 lines + 1 empty line in content

      // Verify Paragraph and TextRun calls for content parsing
      const children = docArgs.sections[0].children;

      // # Main Heading
      expect(children[0].options.children[0].options).toEqual({ text: 'Main Heading', bold: true, size: 28 });
      expect(children[0].options.spacing).toEqual({ before: 300, after: 150 });

      // ## Sub Heading
      expect(children[1].options.children[0].options).toEqual({ text: 'Sub Heading', bold: true, size: 24 });
      expect(children[1].options.spacing).toEqual({ before: 200, after: 100 });

      // This is a normal paragraph.
      expect(children[2].options.children[0].options).toEqual({ text: 'This is a normal paragraph.', bold: false, size: 20 });
      expect(children[2].options.spacing).toEqual({ after: 100 });

      // **This is bold text.**
      expect(children[3].options.children[0].options).toEqual({ text: 'This is bold text.', bold: true, size: 20 });
      expect(children[3].options.spacing).toEqual({ after: 100 });

      // Empty line
      expect(children[4].options.children[0].options).toEqual({ text: '' });
      expect(children[4].options.spacing).toEqual({ after: 100 });

      // Another paragraph.
      expect(children[5].options.children[0].options).toEqual({ text: 'Another paragraph.', bold: false, size: 20 });
      expect(children[5].options.spacing).toEqual({ after: 100 });
    });

    it('should generate a DOCX file successfully with a custom file name', async () => {
      const result = await generateDocxFile(mockContent, mockFileName);

      expect(fs.mkdir).toHaveBeenCalledWith(MOCK_OUTPUT_DIR, { recursive: true });
      expect(Packer.toBuffer).toHaveBeenCalledTimes(1);
      expect(fs.writeFile).toHaveBeenCalledWith(expectedFilePath, Buffer.from('mock docx buffer'));
      expect(logger.info).toHaveBeenCalledWith(`DOCX file generated successfully: ${expectedFilePath}`);
      expect(result).toEqual({
        success: true,
        filePath: expectedFilePath,
        fileName: mockFileName,
        fileType: 'docx',
      });
    });

    it('should handle errors during directory creation', async () => {
      const mockError = new Error('Failed to create directory');
      fs.mkdir.mockRejectedValue(mockError);

      await expect(generateDocxFile(mockContent, mockFileName)).rejects.toThrow(mockError);
      expect(fs.mkdir).toHaveBeenCalledWith(MOCK_OUTPUT_DIR, { recursive: true });
      expect(Packer.toBuffer).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Error generating DOCX file:', mockError);
    });

    it('should handle errors during DOCX buffer generation', async () => {
      const mockError = new Error('Failed to generate buffer');
      Packer.toBuffer.mockRejectedValue(mockError);

      await expect(generateDocxFile(mockContent, mockFileName)).rejects.toThrow(mockError);
      expect(fs.mkdir).toHaveBeenCalledWith(MOCK_OUTPUT_DIR, { recursive: true });
      expect(Packer.toBuffer).toHaveBeenCalledTimes(1);
      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Error generating DOCX file:', mockError);
    });

    it('should handle errors during file writing', async () => {
      const mockError = new Error('Failed to write file');
      fs.writeFile.mockRejectedValue(mockError);

      await expect(generateDocxFile(mockContent, mockFileName)).rejects.toThrow(mockError);
      expect(fs.mkdir).toHaveBeenCalledWith(MOCK_OUTPUT_DIR, { recursive: true });
      expect(Packer.toBuffer).toHaveBeenCalledTimes(1);
      expect(fs.writeFile).toHaveBeenCalledWith(expectedFilePath, Buffer.from('mock docx buffer'));
      expect(logger.error).toHaveBeenCalledWith('Error generating DOCX file:', mockError);
    });
  });

  describe('generateContractFile', () => {
    const mockContent = 'Some contract content.';
    const mockMetadata = { contractType: 'NDA', userId: 'user123' };
    const mockTimestamp = 1678886400000; // A fixed timestamp for predictable file names
    const mockGeneratedAt = '2023-03-15T00:00:00.000Z';

    beforeEach(() => {
      dateNowSpy.mockReturnValue(mockTimestamp);
      toISOStringSpy.mockReturnValue(mockGeneratedAt);
    });

    it('should generate a DOCX file when format is "docx"', async () => {
      const generateDocxFileSpy = vi.spyOn(await import('../services/fileGenerationService'), 'generateDocxFile');
      generateDocxFileSpy.mockResolvedValue({
        success: true,
        filePath: `${MOCK_OUTPUT_DIR}/NDA_${mockTimestamp}.docx`,
        fileName: `NDA_${mockTimestamp}.docx`,
        fileType: 'docx',
      });

      const result = await generateContractFile(mockContent, 'docx', mockMetadata);

      expect(generateDocxFileSpy).toHaveBeenCalledWith(
        mockContent,
        `NDA_${mockTimestamp}.docx`
      );
      expect(result).toEqual({
        success: true,
        filePath: `${MOCK_OUTPUT_DIR}/NDA_${mockTimestamp}.docx`,
        fileName: `NDA_${mockTimestamp}.docx`,
        fileType: 'docx',
        metadata: {
          contractType: 'NDA',
          userId: 'user123',
          generatedAt: mockGeneratedAt,
        },
      });
    });

    it('should generate a DOCX file when format is "doc"', async () => {
      const generateDocxFileSpy = vi.spyOn(await import('../services/fileGenerationService'), 'generateDocxFile');
      generateDocxFileSpy.mockResolvedValue({
        success: true,
        filePath: `${MOCK_OUTPUT_DIR}/NDA_${mockTimestamp}.doc`,
        fileName: `NDA_${mockTimestamp}.doc`,
        fileType: 'doc',
      });

      const result = await generateContractFile(mockContent, 'doc', mockMetadata);

      expect(generateDocxFileSpy).toHaveBeenCalledWith(
        mockContent,
        `NDA_${mockTimestamp}.doc`
      );
      expect(result).toEqual({
        success: true,
        filePath: `${MOCK_OUTPUT_DIR}/NDA_${mockTimestamp}.doc`,
        fileName: `NDA_${mockTimestamp}.doc`,
        fileType: 'doc',
        metadata: {
          contractType: 'NDA',
          userId: 'user123',
          generatedAt: mockGeneratedAt,
        },
      });
    });

    it('should generate a TXT file for other formats (e.g., "txt")', async () => {
      const generateTextFileSpy = vi.spyOn(await import('../services/fileGenerationService'), 'generateTextFile');
      generateTextFileSpy.mockResolvedValue({
        success: true,
        filePath: `${MOCK_OUTPUT_DIR}/NDA_${mockTimestamp}.txt`,
        fileName: `NDA_${mockTimestamp}.txt`,
        fileType: 'txt',
      });

      const result = await generateContractFile(mockContent, 'txt', mockMetadata);

      expect(generateTextFileSpy).toHaveBeenCalledWith(
        mockContent,
        `NDA_${mockTimestamp}.txt`
      );
      expect(result).toEqual({
        success: true,
        filePath: `${MOCK_OUTPUT_DIR}/NDA_${mockTimestamp}.txt`,
        fileName: `NDA_${mockTimestamp}.txt`,
        fileType: 'txt',
        metadata: {
          contractType: 'NDA',
          userId: 'user123',
          generatedAt: mockGeneratedAt,
        },
      });
    });

    it('should use default contractType and userId if not provided in metadata', async () => {
      const generateTextFileSpy = vi.spyOn(await import('../services/fileGenerationService'), 'generateTextFile');
      generateTextFileSpy.mockResolvedValue({
        success: true,
        filePath: `${MOCK_OUTPUT_DIR}/contract_${mockTimestamp}.txt`,
        fileName: `contract_${mockTimestamp}.txt`,
        fileType: 'txt',
      });

      const result = await generateContractFile(mockContent, 'txt', {});

      expect(generateTextFileSpy).toHaveBeenCalledWith(
        mockContent,
        `contract_${mockTimestamp}.txt`
      );
      expect(result).toEqual({
        success: true,
        filePath: `${MOCK_OUTPUT_DIR}/contract_${mockTimestamp}.txt`,
        fileName: `contract_${mockTimestamp}.txt`,
        fileType: 'txt',
        metadata: {
          contractType: 'contract',
          userId: 'anonymous',
          generatedAt: mockGeneratedAt,
        },
      });
    });

    it('should handle errors from delegated file generation functions', async () => {
      const mockError = new Error('Delegated generation failed');
      const generateDocxFileSpy = vi.spyOn(await import('../services/fileGenerationService'), 'generateDocxFile');
      generateDocxFileSpy.mockRejectedValue(mockError);

      await expect(generateContractFile(mockContent, 'docx', mockMetadata)).rejects.toThrow(mockError);
      expect(logger.error).toHaveBeenCalledWith('Error generating contract file:', mockError);
    });
  });

  describe('cleanupContractFile', () => {
    const mockFilePath = `${MOCK_OUTPUT_DIR}/temp_file.txt`;

    it('should delete the file successfully', async () => {
      const result = await cleanupContractFile(mockFilePath);

      expect(fs.unlink).toHaveBeenCalledWith(mockFilePath);
      expect(logger.info).toHaveBeenCalledWith(`Cleaned up file: ${mockFilePath}`);
      expect(result).toEqual({ success: true });
    });

    it('should handle errors during file deletion', async () => {
      const mockError = new Error('File not found');
      fs.unlink.mockRejectedValue(mockError);

      const result = await cleanupContractFile(mockFilePath);

      expect(fs.unlink).toHaveBeenCalledWith(mockFilePath);
      expect(logger.error).toHaveBeenCalledWith('Error cleaning up file:', mockError);
      expect(result).toEqual({ success: false, error: mockError.message });
    });
  });
});