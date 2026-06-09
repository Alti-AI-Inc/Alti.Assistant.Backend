import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import mammoth from 'mammoth';
import PDFParse from 'pdf-parse'; // Corrected import: pdf-parse is typically a default export function.
import { logger } from '../../../../shared/logger.js';
import {
  SUPPORTED_DOCUMENT_FORMATS,
  ERROR_MESSAGES,
} from '../translation.constant.js';

const readFile = promisify(fs.readFile);

/**
 * File Extraction Service
 * Extracts text content from various document formats
 */
class FileExtractionService {
  /**
   * Extract text from uploaded file
   * @param {string} filePath - Path to uploaded file
   * @param {string} originalName - Original filename
   * @returns {Promise<Object>} - Extracted text and metadata
   */
  async extractTextFromFile(filePath, originalName) {
    try {
      const extension = path.extname(originalName).toLowerCase();

      if (!SUPPORTED_DOCUMENT_FORMATS.includes(extension)) {
        throw new Error(ERROR_MESSAGES.UNSUPPORTED_FORMAT);
      }

      logger.info('Extracting text from file', {
        filePath,
        originalName,
        extension,
      });

      let extractedText;
      let metadata = {
        fileName: originalName,
        fileExtension: extension,
        fileSize: 0,
      };

      // Get file size
      const stats = await fs.promises.stat(filePath);
      metadata.fileSize = stats.size;

      switch (extension) {
        case '.txt':
        case '.md':
        case '.html':
        case '.json':
        case '.csv':
          extractedText = await this._extractPlainText(filePath);
          break;

        case '.docx':
          extractedText = await this._extractFromDocx(filePath);
          break;

        case '.pdf':
          extractedText = await this._extractFromPdf(filePath);
          break;

        case '.xlsx':
          extractedText = await this._extractFromXlsx(filePath);
          break;

        default:
          throw new Error(ERROR_MESSAGES.UNSUPPORTED_FORMAT);
      }

      metadata.characterCount = extractedText.length;
      metadata.wordCount = extractedText.split(/\s+/).filter(Boolean).length;

      logger.info('Text extraction completed', {
        fileName: originalName,
        characterCount: metadata.characterCount,
        wordCount: metadata.wordCount,
      });

      return {
        success: true,
        text: extractedText,
        metadata,
      };
    } catch (error) {
      logger.error('File extraction failed:', error);
      throw error;
    }
  }

  /**
   * Extract plain text from text-based files
   */
  async _extractPlainText(filePath) {
    const buffer = await readFile(filePath);
    return buffer.toString('utf-8');
  }

  /**
   * Extract text from DOCX files
   */
  async _extractFromDocx(filePath) {
    try {
      const buffer = await readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      logger.error('DOCX extraction error:', error);
      throw new Error('Failed to extract text from DOCX file');
    }
  }

  /**
   * Extract text from PDF files
   */
  async _extractFromPdf(filePath) {
    try {
      const buffer = await readFile(filePath);
      // Corrected usage for pdf-parse: it's a function that takes the buffer directly,
      // and returns an object with a 'text' property.
      const data = await PDFParse(buffer);
      return data.text;
    } catch (error) {
      logger.error('PDF extraction error:', error);
      throw new Error('Failed to extract text from PDF file');
    }
  }

  /**
   * Extract text from XLSX files
   */
  async _extractFromXlsx(filePath) {
    try {
      // Dynamically import xlsx package. This assumes 'xlsx' is a dependency.
      const XLSX = await import('xlsx');
      const workbook = XLSX.readFile(filePath);
      let text = '';

      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        // Using sheet_to_csv to extract text, which is a reasonable approach for general text extraction from spreadsheets.
        text += XLSX.utils.sheet_to_csv(worksheet) + '\n\n';
      });

      return text;
    } catch (error) {
      logger.error('XLSX extraction error:', error);
      throw new Error(
        'Failed to extract text from XLSX file. Please ensure the file is not corrupted.'
      );
    }
  }

  /**
   * Clean up temporary file
   */
  async cleanupFile(filePath) {
    try {
      // Using fs.existsSync is synchronous but acceptable for a cleanup utility
      // where race conditions are less critical and simplicity is preferred.
      // For critical paths, an async check or direct unlink with error handling for ENOENT is better.
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        logger.info('Temporary file cleaned up', { filePath });
      }
    } catch (error) {
      logger.warn('Failed to cleanup file:', error);
    }
  }
}

export const fileExtractionService = new FileExtractionService();