import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { logger } from '../../../../shared/logger.js';

/**
 * Promisified version of Node.js `fs.readFile` for asynchronous file reading.
 * @type {function(path: fs.PathLike | number, options?: { encoding?: null | undefined, flag?: string | undefined } | null): Promise<Buffer>}
 * @type {function(path: fs.PathLike | number, options: { encoding: BufferEncoding, flag?: string | undefined } | BufferEncoding): Promise<string>}
 */
const readFile = promisify(fs.readFile);

/**
 * Parses a text-based file (e.g., .txt, .md, .html) and returns its content and basic metadata.
 *
 * @param {string} filePath - The absolute path to the text file.
 * @returns {Promise<{ content: string, metadata: { type: 'text', size: number } }>} A promise that resolves to an object
 *   containing the file's content as a string and metadata.
 * @throws {Error} If the file cannot be read or parsed.
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
 * Parses a PDF file. This is a placeholder function and requires the `pdf-parse` package
 * to be installed and integrated for full functionality.
 *
 * @param {string} filePath - The absolute path to the PDF file.
 * @returns {Promise<{ content: string, metadata: { type: 'pdf', pages: number } }>} A promise that resolves to an object
 *   containing a placeholder content string and metadata.
 * @throws {Error} If the file cannot be read or parsing fails (even in placeholder mode).
 * @note This function currently returns placeholder content. Install `pdf-parse` package
 *   and uncomment the relevant lines for actual PDF content extraction.
 */
export const parsePDFFile = async (filePath) => {
  try {
    // Placeholder - requires pdf-parse package
    // const pdfParse = require('pdf-parse');
    // const dataBuffer = await readFile(filePath);
    // const data = await pdfParse(dataBuffer);

    // For now, return a placeholder
    logger.warn(
      'PDF parsing not fully implemented. Install pdf-parse package.'
    );
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
 * Parses a CSV (Comma Separated Values) file, extracting its content, headers, and data
 * as an array of objects.
 *
 * @param {string} filePath - The absolute path to the CSV file.
 * @returns {Promise<{ content: string, data: Array<object>, headers: Array<string>, metadata: { type: 'csv', rows: number, columns: number } }>}
 *   A promise that resolves to an object containing the raw content, parsed data (array of objects),
 *   headers, and metadata.
 * @throws {Error} If the file cannot be read or parsed.
 */
export const parseCSVFile = async (filePath) => {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    if (lines.length === 0) {
      return {
        content: '',
        data: [],
        headers: [],
        metadata: { type: 'csv', rows: 0, columns: 0 },
      };
    }

    const headers = lines[0].split(',').map((h) => h.trim());
    const data = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
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
 * Parses a JSON (JavaScript Object Notation) file, extracting its content and the parsed JavaScript object/array.
 *
 * @param {string} filePath - The absolute path to the JSON file.
 * @returns {Promise<{ content: string, data: object|Array<any>, metadata: { type: 'json', keys: Array<string> } }>}
 *   A promise that resolves to an object containing the raw content, the parsed JSON data, and metadata.
 * @throws {Error} If the file cannot be read or if the content is not valid JSON.
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
 * Parses an XLSX (Excel Open XML Spreadsheet) file. This is a placeholder function and requires
 * the `xlsx` package to be installed and integrated for full functionality.
 *
 * @param {string} filePath - The absolute path to the XLSX file.
 * @returns {Promise<{ content: string, metadata: { type: 'xlsx', sheets: number } }>} A promise that resolves to an object
 *   containing a placeholder content string and metadata.
 * @throws {Error} If the file cannot be read or parsing fails (even in placeholder mode).
 * @note This function currently returns placeholder content. Install `xlsx` package
 *   and uncomment the relevant lines for actual XLSX content extraction.
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
 * Parses a DOCX (Microsoft Word Document) file. This is a placeholder function and requires
 * the `mammoth` package to be installed and integrated for full functionality.
 *
 * @param {string} filePath - The absolute path to the DOCX file.
 * @returns {Promise<{ content: string, metadata: { type: 'docx' } }>} A promise that resolves to an object
 *   containing a placeholder content string and metadata.
 * @throws {Error} If the file cannot be read or parsing fails (even in placeholder mode).
 * @note This function currently returns placeholder content. Install `mammoth` package
 *   and uncomment the relevant lines for actual DOCX content extraction.
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
 * Dispatches file parsing to the appropriate handler based on the file's extension.
 * It supports various file types including text, PDF, CSV, JSON, XLSX, and DOCX.
 *
 * @param {string} filePath - The absolute path to the file to be parsed.
 * @returns {Promise<object>} A promise that resolves to the parsed content and metadata
 *   from the specific parser function. The structure of the returned object varies
 *   depending on the file type.
 * @throws {Error} If the file format is not supported or if an error occurs during parsing.
 *
 * @property {object} parsers - An internal mapping of file extensions to their respective parsing functions.
 * @property {function(string): Promise<object>} parsers.txt - Handler for .txt, .md, .html files.
 * @property {function(string): Promise<object>} parsers.md - Handler for .txt, .md, .html files.
 * @property {function(string): Promise<object>} parsers.html - Handler for .txt, .md, .html files.
 * @property {function(string): Promise<object>} parsers.pdf - Handler for .pdf files (placeholder).
 * @property {function(string): Promise<object>} parsers.csv - Handler for .csv files.
 * @property {function(string): Promise<object>} parsers.json - Handler for .json files.
 * @property {function(string): Promise<object>} parsers.xlsx - Handler for .xlsx, .xls files (placeholder).
 * @property {function(string): Promise<object>} parsers.xls - Handler for .xlsx, .xls files (placeholder).
 * @property {function(string): Promise<object>} parsers.docx - Handler for .docx, .doc files (placeholder).
 * @property {function(string): Promise<object>} parsers.doc - Handler for .docx, .doc files (placeholder).
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
 * Validates a file's format and size against specified criteria.
 * This function is typically used for uploaded files.
 *
 * @param {object} file - The file object to validate. Expected to have `originalname` and `size` properties.
 * @param {string} file.originalname - The original name of the file, including its extension.
 * @param {number} file.size - The size of the file in bytes.
 * @param {number} maxSize - The maximum allowed file size in bytes.
 * @param {Array<string>} allowedFormats - An array of allowed file extensions (e.g., ['txt', 'pdf', 'csv']).
 * @returns {boolean} Returns `true` if the file passes all validation checks.
 * @throws {Error} If the file format is not supported or if the file size exceeds the maximum limit.
 */
export const validateFile = (file, maxSize, allowedFormats) => {
  const ext = path.extname(file.originalname).toLowerCase().substring(1);

  if (!allowedFormats.includes(ext)) {
    throw new Error(
      `File format .${ext} is not supported. Allowed formats: ${allowedFormats.join(', ')}`
    );
  }

  if (file.size > maxSize) {
    throw new Error(
      `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum ${(maxSize / 1024 / 1024).toFixed(2)}MB`
    );
  }

  return true;
};

/**
 * Processes an array of file objects, attempting to extract content from each using the `parseFile` utility.
 * It handles errors gracefully for individual files, logging them and returning an error message in the result
 * for that specific file, rather than stopping the entire process.
 *
 * @param {Array<object>} files - An array of file objects. Each object is expected to have at least
 *   `path` (absolute path to the file on disk) and `originalname` (the original name of the file).
 * @param {string} files[].path - The absolute path to the file on the server's file system.
 * @param {string} files[].originalname - The original name of the file as uploaded.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of results. Each result object
 *   will contain `filename`, `content`, `data`, and `metadata` if parsing was successful, or `filename`
 *   and an `error` message if parsing failed for that specific file.
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