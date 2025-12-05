import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { logger } from '../../../../shared/logger.js';

const readFile = promisify(fs.readFile);

/**
 * Parse text file
 */
export const parseTextFile = async (filePath) => {
  try {
    const content = await readFile(filePath, 'utf-8');
    return {
      content,
      metadata: {
        type: 'text',
        size: content.length,
      },
    };
  } catch (error) {
    logger.error('Error parsing text file:', error);
    throw new Error(`Failed to parse text file: ${error.message}`);
  }
};

/**
 * Parse PDF file
 * Note: This is a placeholder. You'll need to install pdf-parse package
 */
export const parsePDFFile = async (filePath) => {
  try {
    // Placeholder - requires pdf-parse package
    // const pdfParse = require('pdf-parse');
    // const dataBuffer = await readFile(filePath);
    // const data = await pdfParse(dataBuffer);

    // For now, return a placeholder
    logger.warn('PDF parsing not fully implemented. Install pdf-parse package.');
    return {
      content: 'PDF content extraction requires pdf-parse package',
      metadata: {
        type: 'pdf',
        pages: 0,
      },
    };
  } catch (error) {
    logger.error('Error parsing PDF file:', error);
    throw new Error(`Failed to parse PDF file: ${error.message}`);
  }
};

/**
 * Parse CSV file
 */
export const parseCSVFile = async (filePath) => {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      return {
        content: '',
        data: [],
        headers: [],
        metadata: { type: 'csv', rows: 0, columns: 0 },
      };
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const data = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim());
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });

    return {
      content,
      data,
      headers,
      metadata: {
        type: 'csv',
        rows: data.length,
        columns: headers.length,
      },
    };
  } catch (error) {
    logger.error('Error parsing CSV file:', error);
    throw new Error(`Failed to parse CSV file: ${error.message}`);
  }
};

/**
 * Parse JSON file
 */
export const parseJSONFile = async (filePath) => {
  try {
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    return {
      content,
      data,
      metadata: {
        type: 'json',
        keys: Object.keys(data),
      },
    };
  } catch (error) {
    logger.error('Error parsing JSON file:', error);
    throw new Error(`Failed to parse JSON file: ${error.message}`);
  }
};

/**
 * Parse XLSX file
 * Note: Requires xlsx package
 */
export const parseXLSXFile = async (filePath) => {
  try {
    // Placeholder - requires xlsx package
    // const XLSX = require('xlsx');
    // const workbook = XLSX.readFile(filePath);

    logger.warn('XLSX parsing not fully implemented. Install xlsx package.');
    return {
      content: 'XLSX content extraction requires xlsx package',
      metadata: {
        type: 'xlsx',
        sheets: 0,
      },
    };
  } catch (error) {
    logger.error('Error parsing XLSX file:', error);
    throw new Error(`Failed to parse XLSX file: ${error.message}`);
  }
};

/**
 * Parse DOCX file
 * Note: Requires mammoth package
 */
export const parseDOCXFile = async (filePath) => {
  try {
    // Placeholder - requires mammoth package
    // const mammoth = require('mammoth');
    // const result = await mammoth.extractRawText({ path: filePath });

    logger.warn('DOCX parsing not fully implemented. Install mammoth package.');
    return {
      content: 'DOCX content extraction requires mammoth package',
      metadata: {
        type: 'docx',
      },
    };
  } catch (error) {
    logger.error('Error parsing DOCX file:', error);
    throw new Error(`Failed to parse DOCX file: ${error.message}`);
  }
};

/**
 * Main file parser dispatcher
 */
export const parseFile = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase().substring(1);

  const parsers = {
    txt: parseTextFile,
    md: parseTextFile,
    html: parseTextFile,
    pdf: parsePDFFile,
    csv: parseCSVFile,
    json: parseJSONFile,
    xlsx: parseXLSXFile,
    xls: parseXLSXFile,
    docx: parseDOCXFile,
    doc: parseDOCXFile,
  };

  const parser = parsers[ext];

  if (!parser) {
    throw new Error(`Unsupported file format: ${ext}`);
  }

  return await parser(filePath);
};

/**
 * Validate file size and format
 */
export const validateFile = (file, maxSize, allowedFormats) => {
  const ext = path.extname(file.originalname).toLowerCase().substring(1);

  if (!allowedFormats.includes(ext)) {
    throw new Error(`File format .${ext} is not supported. Allowed formats: ${allowedFormats.join(', ')}`);
  }

  if (file.size > maxSize) {
    throw new Error(`File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum ${(maxSize / 1024 / 1024).toFixed(2)}MB`);
  }

  return true;
};

/**
 * Extract text content from multiple files
 */
export const extractContentFromFiles = async (files) => {
  const results = [];

  for (const file of files) {
    try {
      const parsed = await parseFile(file.path);
      results.push({
        filename: file.originalname,
        content: parsed.content,
        data: parsed.data,
        metadata: parsed.metadata,
      });
    } catch (error) {
      logger.error(`Error processing file ${file.originalname}:`, error);
      results.push({
        filename: file.originalname,
        error: error.message,
      });
    }
  }

  return results;
};
