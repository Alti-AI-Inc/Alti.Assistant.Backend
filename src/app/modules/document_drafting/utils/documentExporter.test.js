import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../../../shared/logger.js';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { OUTPUT_FORMATS } from '../document.constant.js';

// Import the function to be tested
import { exportDocument } from '../utils/documentExporter.js';

// Mock dependencies
vi.mock('fs');
vi.mock('path');
vi.mock('../../../../shared/logger.js');
vi.mock('pdfkit');
vi.mock('docx'); // Mocks Document, Packer, Paragraph, TextRun

// Helper for stream mocking
// Need to import EventEmitter explicitly for Vitest/ESM context
import { EventEmitter } from 'events';
class MockWriteStream extends EventEmitter {
  constructor() {
    super();
    this.write = vi.fn();
    this.end = vi.fn();
  }
}

describe('documentExporter', () => {
  const mockContent = 'This is some test content.\nWith multiple lines.';
  const mockMetadata = {
    title: 'Test Document Title',
    includeDate: true,
    documentType: 'Report',
  };
  const mockOutputDir = '/mock/output/documents';
  const mockTimestamp = 1678886400000; // A fixed timestamp for consistent filenames
  const mockDateString = 'March 15, 2023';
  const mockFileSize = 1234;

  let mockPdfDocInstance;
  let mockWriteStreamInstance;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Date.now() for consistent filenames
    vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue(mockDateString);

    // Mock process.cwd()
    vi.spyOn(process, 'cwd').mockReturnValue('/mock/project');

    // Mock path.join
    path.join.mockImplementation((...args) => args.join('/'));

    // Mock fs
    fs.existsSync.mockReturnValue(true); // Assume directory exists by default
    fs.mkdirSync.mockReturnValue(undefined);
    fs.writeFileSync.mockReturnValue(undefined);
    fs.statSync.mockReturnValue({ size: mockFileSize });

    // Mock logger
    logger.info.mockReturnValue(undefined);
    logger.error.mockReturnValue(undefined);

    // Mock PDFDocument
    mockPdfDocInstance = {
      pipe: vi.fn().mockReturnThis(),
      fontSize: vi.fn().mockReturnThis(),
      font: vi.fn().mockReturnThis(),
      text: vi.fn().mockReturnThis(),
      moveDown: vi.fn().mockReturnThis(),
      end: vi.fn(),
    };
    PDFDocument.mockImplementation(() => mockPdfDocInstance);

    // Mock fs.createWriteStream
    mockWriteStreamInstance = new MockWriteStream();
    fs.createWriteStream.mockReturnValue(mockWriteStreamInstance);

    // Mock docx
    // Mock the constructors to return objects that can be inspected
    Document.mockImplementation((options) => ({ type: 'Document', options }));
    Paragraph.mockImplementation((options) => ({ type: 'Paragraph', options }));
    TextRun.mockImplementation((options) => ({ type: 'TextRun', options }));
    Packer.toBuffer.mockResolvedValue(Buffer.from('mock docx buffer'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exportDocument', () => {
    it('should throw an error for unsupported format', async () => {
      const unsupportedFormat = 'UNSUPPORTED';
      await expect(exportDocument(mockContent, unsupportedFormat)).rejects.toThrow(
        `Unsupported format: ${unsupportedFormat}`
      );
      expect(logger.error).toHaveBeenCalledWith('Error exporting document:', expect.any(Error));
    });

    it('should create output directory if it does not exist for any format', async () => {
      fs.existsSync.mockReturnValue(false);
      const promise = exportDocument(mockContent, OUTPUT_FORMATS.PDF);
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockOutputDir, { recursive: true });
      mockWriteStreamInstance.emit('finish'); // Resolve the PDF promise
      await promise;
    });

    describe('PDF format', () => {
      it('should create a PDF document with basic content', async () => {
        const result = await exportDocument(mockContent, OUTPUT_FORMATS.PDF);

        expect(fs.existsSync).toHaveBeenCalledWith(mockOutputDir);
        expect(path.join).toHaveBeenCalledWith('/mock/project', 'output', 'documents');
        expect(path.join).toHaveBeenCalledWith(mockOutputDir, `document_${mockTimestamp}.pdf`);
        expect(fs.createWriteStream).toHaveBeenCalledWith(`${mockOutputDir}/document_${mockTimestamp}.pdf`);

        expect(PDFDocument).toHaveBeenCalledWith({
          size: 'A4',
          margins: { top: 72, bottom: 72, left: 72, right: 72 },
        });
        expect(mockPdfDocInstance.pipe).toHaveBeenCalledWith(mockWriteStreamInstance);
        expect(mockPdfDocInstance.fontSize).toHaveBeenCalledWith(11);
        expect(mockPdfDocInstance.font).toHaveBeenCalledWith('Helvetica');
        expect(mockPdfDocInstance.text).toHaveBeenCalledWith(mockContent, {
          align: 'left',
          lineGap: 4,
        });
        expect(mockPdfDocInstance.end).toHaveBeenCalled();

        // Simulate stream finish
        mockWriteStreamInstance.emit('finish');
        await vi.waitFor(() => expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('PDF document created successfully')));

        expect(result).toEqual({
          filePath: `${mockOutputDir}/document_${mockTimestamp}.pdf`,
          fileName: `document_${mockTimestamp}.pdf`,
          format: OUTPUT_FORMATS.PDF,
          size: mockFileSize,
        });
      });

      it('should create a PDF document with all metadata', async () => {
        await exportDocument(mockContent, OUTPUT_FORMATS.PDF, mockMetadata);

        expect(mockPdfDocInstance.fontSize).toHaveBeenCalledWith(20);
        expect(mockPdfDocInstance.font).toHaveBeenCalledWith('Helvetica-Bold');
        expect(mockPdfDocInstance.text).toHaveBeenCalledWith(mockMetadata.title, { align: 'center' });
        expect(mockPdfDocInstance.moveDown).toHaveBeenCalledWith(1); // After title

        expect(mockPdfDocInstance.fontSize).toHaveBeenCalledWith(10);
        expect(mockPdfDocInstance.font).toHaveBeenCalledWith('Helvetica');
        expect(mockPdfDocInstance.text).toHaveBeenCalledWith(mockDateString, { align: 'right' });
        expect(mockPdfDocInstance.moveDown).toHaveBeenCalledWith(1); // After date

        expect(mockPdfDocInstance.font).toHaveBeenCalledWith('Helvetica-Oblique');
        expect(mockPdfDocInstance.text).toHaveBeenCalledWith(`Type: ${mockMetadata.documentType}`, { align: 'right' });
        expect(mockPdfDocInstance.moveDown).toHaveBeenCalledWith(0.5); // After type

        expect(mockPdfDocInstance.moveDown).toHaveBeenCalledWith(1); // Before content

        // Simulate stream finish
        mockWriteStreamInstance.emit('finish');
        await vi.waitFor(() => expect(logger.info).toHaveBeenCalled());
      });

      it('should handle stream error during PDF creation', async () => {
        const error = new Error('Stream write error');
        const promise = exportDocument(mockContent, OUTPUT_FORMATS.PDF);

        // Simulate stream error
        mockWriteStreamInstance.emit('error', error);

        await expect(promise).rejects.toThrow(error);
        expect(logger.error).toHaveBeenCalledWith('Error writing PDF:', error);
      });

      it('should handle PDFDocument constructor error', async () => {
        const error = new Error('PDF init error');
        PDFDocument.mockImplementation(() => {
          throw error;
        });

        await expect(exportDocument(mockContent, OUTPUT_FORMATS.PDF)).rejects.toThrow(error);
        expect(logger.error).toHaveBeenCalledWith('Error creating PDF document:', error);
      });

      it('should handle general error in exportToPDF', async () => {
        // Simulate an error before PDFDocument is even called, e.g., path.join fails
        path.join.mockImplementationOnce(() => {
          throw new Error('Path error');
        });

        await expect(exportDocument(mockContent, OUTPUT_FORMATS.PDF)).rejects.toThrow('Path error');
        expect(logger.error).toHaveBeenCalledWith('Error in exportToPDF:', expect.any(Error));
      });
    });

    describe('DOCX format', () => {
      it('should create a DOCX document with basic content', async () => {
        const result = await exportDocument(mockContent, OUTPUT_FORMATS.DOCX);

        expect(fs.existsSync).toHaveBeenCalledWith(mockOutputDir);
        expect(path.join).toHaveBeenCalledWith(mockOutputDir, `document_${mockTimestamp}.docx`);

        expect(Document).toHaveBeenCalledWith(expect.any(Object));
        expect(Packer.toBuffer).toHaveBeenCalledWith(expect.any(Object));
        expect(fs.writeFileSync).toHaveBeenCalledWith(
          `${mockOutputDir}/document_${mockTimestamp}.docx`,
          Buffer.from('mock docx buffer')
        );
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('DOCX document created successfully'));

        expect(result).toEqual({
          filePath: `${mockOutputDir}/document_${mockTimestamp}.docx`,
          fileName: `document_${mockTimestamp}.docx`,
          format: OUTPUT_FORMATS.DOCX,
          size: mockFileSize,
        });

        // Verify paragraphs for content
        const docArgs = Document.mock.calls[0][0];
        expect(docArgs.sections[0].children).toHaveLength(2); // Two lines of content
        expect(docArgs.sections[0].children[0].options.children[0].options.text).toBe('This is some test content.');
        expect(docArgs.sections[0].children[1].options.children[0].options.text).toBe('With multiple lines.');
      });

      it('should create a DOCX document with all metadata', async () => {
        await exportDocument(mockContent, OUTPUT_FORMATS.DOCX, mockMetadata);

        const docArgs = Document.mock.calls[0][0];
        const children = docArgs.sections[0].children;

        expect(children).toHaveLength(4); // Title, Meta, Content Line 1, Content Line 2

        // Title
        expect(children[0].type).toBe('Paragraph');
        expect(children[0].options.children[0].options.text).toBe(mockMetadata.title);
        expect(children[0].options.children[0].options.bold).toBe(true);
        expect(children[0].options.children[0].options.size).toBe(32);

        // Metadata
        expect(children[1].type).toBe('Paragraph');
        expect(children[1].options.children).toHaveLength(3); // Date, separator, Type
        expect(children[1].options.children[0].options.text).toBe(`Date: ${mockDateString}`);
        expect(children[1].options.children[1].options.text).toBe('  |  ');
        expect(children[1].options.children[2].options.text).toBe(`Type: ${mockMetadata.documentType}`);
      });

      it('should handle DOCX creation error', async () => {
        const error = new Error('DOCX buffer error');
        Packer.toBuffer.mockRejectedValue(error);

        await expect(exportDocument(mockContent, OUTPUT_FORMATS.DOCX)).rejects.toThrow(error);
        expect(logger.error).toHaveBeenCalledWith('Error in exportToDocx:', error);
      });

      it('should handle DOCX write file error', async () => {
        const error = new Error('File write error');
        fs.writeFileSync.mockImplementation(() => {
          throw error;
        });

        await expect(exportDocument(mockContent, OUTPUT_FORMATS.DOCX)).rejects.toThrow(error);
        expect(logger.error).toHaveBeenCalledWith('Error in exportToDocx:', error);
      });

      it('should handle DOC alias for DOCX format', async () => {
        const result = await exportDocument(mockContent, OUTPUT_FORMATS.DOC, mockMetadata);
        expect(result.format).toBe(OUTPUT_FORMATS.DOCX); // DOCX is returned for DOC
        expect(Packer.toBuffer).toHaveBeenCalled();
      });
    });

    describe('TXT format', () => {
      it('should create a TXT document with basic content', async () => {
        const result = await exportDocument(mockContent, OUTPUT_FORMATS.TXT);

        expect(fs.existsSync).toHaveBeenCalledWith(mockOutputDir);
        expect(path.join).toHaveBeenCalledWith(mockOutputDir, `document_${mockTimestamp}.txt`);
        expect(fs.writeFileSync).toHaveBeenCalledWith(
          `${mockOutputDir}/document_${mockTimestamp}.txt`,
          mockContent,
          'utf8'
        );
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('TXT document created successfully'));

        expect(result).toEqual({
          filePath: `${mockOutputDir}/document_${mockTimestamp}.txt`,
          fileName: `document_${mockTimestamp}.txt`,
          format: OUTPUT_FORMATS.TXT,
          size: mockFileSize,
        });
      });

      it('should create a TXT document with all metadata', async () => {
        await exportDocument(mockContent, OUTPUT_FORMATS.TXT, mockMetadata);

        const expectedContent =
          `${mockMetadata.title}\n` +
          '===================\n\n' +
          `Date: ${mockDateString}\n\n` +
          `Document Type: ${mockMetadata.documentType}\n\n` +
          mockContent;

        expect(fs.writeFileSync).toHaveBeenCalledWith(
          expect.any(String),
          expectedContent,
          'utf8'
        );
      });

      it('should handle TXT write file error', async () => {
        const error = new Error('File write error');
        fs.writeFileSync.mockImplementation(() => {
          throw error;
        });

        await expect(exportDocument(mockContent, OUTPUT_FORMATS.TXT)).rejects.toThrow(error);
        expect(logger.error).toHaveBeenCalledWith('Error in exportToTxt:', error);
      });
    });

    describe('HTML format', () => {
      it('should create an HTML document with basic content', async () => {
        const result = await exportDocument(mockContent, OUTPUT_FORMATS.HTML);

        expect(fs.existsSync).toHaveBeenCalledWith(mockOutputDir);
        expect(path.join).toHaveBeenCalledWith(mockOutputDir, `document_${mockTimestamp}.html`);

        const writtenContent = fs.writeFileSync.mock.calls[0][1];
        expect(writtenContent).toContain(`<!DOCTYPE html>`);
        expect(writtenContent).toContain(`<title>Document</title>`);
        expect(writtenContent).toContain(`<div class="content">\n        ${mockContent.replace(/\n/g, '<br>')}\n    </div>`);
        expect(writtenContent).not.toContain(`<h1>`); // No title
        expect(writtenContent).not.toContain(`Date:`); // No date
        expect(writtenContent).not.toContain(`Type:`); // No type

        expect(fs.writeFileSync).toHaveBeenCalledWith(
          `${mockOutputDir}/document_${mockTimestamp}.html`,
          writtenContent,
          'utf8'
        );
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('HTML document created successfully'));

        expect(result).toEqual({
          filePath: `${mockOutputDir}/document_${mockTimestamp}.html`,
          fileName: `document_${mockTimestamp}.html`,
          format: OUTPUT_FORMATS.HTML,
          size: mockFileSize,
        });
      });

      it('should create an HTML document with all metadata', async () => {
        await exportDocument(mockContent, OUTPUT_FORMATS.HTML, mockMetadata);

        const writtenContent = fs.writeFileSync.mock.calls[0][1];
        expect(writtenContent).toContain(`<title>${mockMetadata.title}</title>`);
        expect(writtenContent).toContain(`<h1>${mockMetadata.title}</h1>`);
        expect(writtenContent).toContain(`<p>Date: ${mockDateString}</p>`);
        expect(writtenContent).toContain(`<p>Type: ${mockMetadata.documentType}</p>`);

        expect(fs.writeFileSync).toHaveBeenCalledWith(
          expect.any(String),
          writtenContent,
          'utf8'
        );
      });

      it('should handle HTML write file error', async () => {
        const error = new Error('File write error');
        fs.writeFileSync.mockImplementation(() => {
          throw error;
        });

        await expect(exportDocument(mockContent, OUTPUT_FORMATS.HTML)).rejects.toThrow(error);
        expect(logger.error).toHaveBeenCalledWith('Error in exportToHtml:', error);
      });
    });

    describe('Markdown format', () => {
      it('should create a Markdown document with basic content', async () => {
        const result = await exportDocument(mockContent, OUTPUT_FORMATS.MD);

        expect(fs.existsSync).toHaveBeenCalledWith(mockOutputDir);
        expect(path.join).toHaveBeenCalledWith(mockOutputDir, `document_${mockTimestamp}.md`);
        expect(fs.writeFileSync).toHaveBeenCalledWith(
          `${mockOutputDir}/document_${mockTimestamp}.md`,
          mockContent, // No metadata, so just content
          'utf8'
        );
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Markdown document created successfully'));

        expect(result).toEqual({
          filePath: `${mockOutputDir}/document_${mockTimestamp}.md`,
          fileName: `document_${mockTimestamp}.md`,
          format: OUTPUT_FORMATS.MD,
          size: mockFileSize,
        });
      });

      it('should create a Markdown document with all metadata', async () => {
        await exportDocument(mockContent, OUTPUT_FORMATS.MD, mockMetadata);

        const expectedMarkdownContent =
          `# ${mockMetadata.title}\n\n` +
          '---\n' +
          `**Date:** ${mockDateString}\n\n` +
          `**Type:** ${mockMetadata.documentType}\n\n` +
          '---\n\n' +
          mockContent;

        expect(fs.writeFileSync).toHaveBeenCalledWith(
          expect.any(String),
          expectedMarkdownContent,
          'utf8'
        );
      });

      it('should handle Markdown write file error', async () => {
        const error = new Error('File write error');
        fs.writeFileSync.mockImplementation(() => {
          throw error;
        });

        await expect(exportDocument(mockContent, OUTPUT_FORMATS.MD)).rejects.toThrow(error);
        expect(logger.error).toHaveBeenCalledWith('Error in exportToMarkdown:', error);
      });
    });
  });
});