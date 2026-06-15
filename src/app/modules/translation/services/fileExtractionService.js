import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import PDFParse from 'pdf-parse';
import { logger } from '../../../../shared/logger.js';
import {
  SUPPORTED_DOCUMENT_FORMATS,
  ERROR_MESSAGES,
} from '../translation.constant.js';
// BUG & INTEGRATION-FIX: Import services required for validation and limit checks.
// This ensures that file processing respects user/workspace boundaries and subscription plans.
import { workspaceService } from '../../workspace/services/workspaceService.js'; // Assuming this service exists to fetch plan limits
import { usageService } from '../../usage/usage.service.js'; // Assuming this service exists to check usage against quotas

/**
 * File Extraction Service
 * Extracts text content from various document formats, enforcing security and usage limits.
 */
class FileExtractionService {
  /**
   * Extract text from uploaded file after performing security and limit checks.
   * @param {string} filePath - Path to uploaded file
   * @param {string} originalName - Original filename
   * @param {object} userContext - Context of the user making the request (e.g., { userId, workspaceId, role })
   * @returns {Promise<Object>} - Extracted text and metadata
   */
  async extractTextFromFile(filePath, originalName, userContext) {
    // INTEGRATION-FIX: Validate that user context is provided to enforce tenant boundaries and limits.
    if (!userContext || !userContext.workspaceId) {
      // This is a developer error, indicates a problem in the calling service/controller.
      throw new Error('User context with workspaceId is required for file extraction.');
    }

    try {
      // INTEGRATION-FIX: Fetch workspace-specific limits before processing the file.
      const limits = await workspaceService.getWorkspaceLimits(userContext.workspaceId);

      // INTEGRATION-FIX: Perform pre-extraction checks for file size against plan limits.
      const stats = await fs.promises.stat(filePath);
      if (stats.size > limits.maxUploadSizeBytes) {
        // NOTE: A custom error class would be better for specific HTTP status codes in the controller.
        throw new Error(`File size (${stats.size} bytes) exceeds the allowed limit (${limits.maxUploadSizeBytes} bytes) for your plan.`);
      }

      // SECURITY-FIX & OPTIMIZATION: Read file into buffer once for type checking and content extraction.
      // This prevents re-reading the file and allows for magic number verification.
      const buffer = await fs.promises.readFile(filePath);

      const extension = path.extname(originalName).toLowerCase();

      // SECURITY-FIX: Verify the file's actual type using magic numbers, not just the user-provided extension.
      // This prevents processing malicious files disguised with a safe extension (e.g., an executable named 'report.docx').
      const { fileTypeFromBuffer } = await import('file-type');
      const typeInfo = await fileTypeFromBuffer(buffer);

      const isPotentiallyMaliciousMismatch = typeInfo && `.${typeInfo.ext}` !== extension;
      // Some text-based files might not have a detectable magic number, so we check if it's a known text format.
      const isUnverifiableNonText = !typeInfo && !['.txt', '.md', '.html', '.json', '.csv'].includes(extension);

      if (isPotentiallyMaliciousMismatch || isUnverifiableNonText) {
          logger.warn('File type mismatch or unverifiable type detected', {
              filePath,
              originalName,
              extension,
              detectedExt: typeInfo ? typeInfo.ext : 'unknown',
              detectedMime: typeInfo ? typeInfo.mime : 'unknown',
              workspaceId: userContext.workspaceId,
          });
          // Use a more specific error message constant if available.
          throw new Error(ERROR_MESSAGES.FILE_TYPE_MISMATCH || 'File type does not match its content. Upload aborted for security reasons.');
      }

      if (!SUPPORTED_DOCUMENT_FORMATS.includes(extension)) {
        throw new Error(ERROR_MESSAGES.UNSUPPORTED_FORMAT);
      }

      logger.info('Extracting text from file', {
        filePath,
        originalName,
        extension,
        workspaceId: userContext.workspaceId,
      });

      let extractedText;
      let metadata = {
        fileName: originalName,
        fileExtension: extension,
        fileSize: stats.size,
      };

      switch (extension) {
        case '.txt':
        case '.md':
        case '.html':
        case '.json':
        case '.csv':
          // REFACTOR: Pass buffer to extraction method to avoid re-reading file.
          extractedText = await this._extractPlainText(buffer);
          break;

        case '.docx':
          extractedText = await this._extractFromDocx(buffer);
          break;

        case '.pdf':
          extractedText = await this._extractFromPdf(buffer);
          break;

        case '.xlsx':
          extractedText = await this._extractFromXlsx(buffer);
          break;

        default:
          // This case should theoretically not be reached due to the check above, but it's good for defense-in-depth.
          throw new Error(ERROR_MESSAGES.UNSUPPORTED_FORMAT);
      }

      metadata.characterCount = extractedText.length;
      
      // INTEGRATION-FIX: Check extracted character count against workspace limits before returning.
      // This prevents users from translating documents larger than their plan allows.
      await usageService.checkDocumentCharacterLimit(userContext, metadata.characterCount);

      const wordMatches = extractedText.match(/\S+/g);
      metadata.wordCount = wordMatches ? wordMatches.length : 0;

      logger.info('Text extraction completed successfully', {
        fileName: originalName,
        characterCount: metadata.characterCount,
        wordCount: metadata.wordCount,
        workspaceId: userContext.workspaceId,
      });

      return {
        success: true,
        text: extractedText,
        metadata,
      };
    } catch (error) {
      // BUG-FIX: Add context to error logs for better debugging and traceability.
      logger.error('File extraction failed', {
        error: error.message,
        filePath,
        originalName,
        userContext,
        stack: error.stack
      });
      // Re-throw the original error to be handled by the calling service/controller.
      throw error;
    }
  }

  /**
   * REFACTOR: Accepts buffer instead of filePath for efficiency.
   */
  async _extractPlainText(buffer) {
    return buffer.toString('utf-8');
  }

  /**
   * REFACTOR: Accepts buffer instead of filePath for efficiency and security.
   */
  async _extractFromDocx(buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      logger.error('DOCX extraction error:', { message: error.message, stack: error.stack });
      throw new Error('Failed to extract text from DOCX file. The file may be corrupt or password-protected.');
    }
  }

  /**
   * REFACTOR: Accepts buffer instead of filePath for efficiency and security.
   */
  async _extractFromPdf(buffer) {
    try {
      const data = await PDFParse(buffer);
      return data.text;
    } catch (error) {
      logger.error('PDF extraction error:', { message: error.message, stack: error.stack });
      throw new Error('Failed to extract text from PDF file. The file may be corrupt, password-protected, or an image-based PDF.');
    }
  }

  /**
   * REFACTOR: Accepts buffer instead of filePath for efficiency and security.
   */
  async _extractFromXlsx(buffer) {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let text = '';

      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        text += XLSX.utils.sheet_to_csv(worksheet) + '\n\n';
      });

      return text.trim();
    } catch (error) {
      logger.error('XLSX extraction error:', { message: error.message, stack: error.stack });
      throw new Error(
        'Failed to extract text from XLSX file. Please ensure the file is not corrupted or password-protected.'
      );
    }
  }

  /**
   * Clean up temporary file
   */
  async cleanupFile(filePath) {
    try {
      await fs.promises.unlink(filePath);
      logger.info('Temporary file cleaned up', { filePath });
    } catch (error) {
      // Gracefully handle cases where the file doesn't exist (e.g., already cleaned up).
      if (error.code !== 'ENOENT') {
        logger.warn('Failed to cleanup temporary file', { filePath, error: error.message });
      }
    }
  }
}

export const fileExtractionService = new FileExtractionService();