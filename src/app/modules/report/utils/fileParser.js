import { readFile, stat } from 'fs/promises';
import path from 'path';
import { logger } from '../../../../shared/logger.js';
import pdf from 'pdf-parse';
import { parse as csvParseSync } from 'csv-parse/sync';
import mammoth from 'mammoth';
import xlsx from 'xlsx';

/**
 * Parses a text-based file (e.g., .txt, .md, .html) and returns its content and metadata.
 *
 * @param {string} filePath - The absolute path to the text file.
 * @returns {Promise<{ content: string, metadata: { type: 'text', size: number } }>} A promise that resolves to an object
 *   containing the file's content as a string and metadata.
 * @throws {Error} If the file cannot be read or parsed.
 */
export const parseTextFile = async (filePath) => {
  try {
    const content = await readFile(filePath, 'utf-8');
    const fileStats = await stat(filePath);
    return {
      content,
      metadata: {
        type: 'text',
        size: fileStats.size, // Use accurate byte size for consistency with validation.
      },
    };
  } catch (error) {
    logger.error(`Error parsing text file at ${filePath}:`, error);
    throw new Error(`Failed to parse text file: ${error.message}`);
  }
};

/**
 * Parses a PDF file using the `pdf-parse` library to extract text content.
 *
 * @param {string} filePath - The absolute path to the PDF file.
 * @returns {Promise<{ content: string, metadata: { type: 'pdf', pages: number, info: object } }>} A promise that resolves to an object
 *   containing the extracted text content and metadata.
 * @throws {Error} If the file cannot be read or parsing fails.
 */
export const parsePDFFile = async (filePath) => {
  try {
    const dataBuffer = await readFile(filePath);
    const data = await pdf(dataBuffer);

    return {
      content: data.text,
      metadata: {
        type: 'pdf',
        pages: data.numpages,
        info: data.info, // Includes PDF metadata like Title, Author, etc.
      },
    };
  } catch (error) {
    logger.error(`Error parsing PDF file at ${filePath}:`, error);
    throw new Error(`Failed to parse PDF file: ${error.message}`);
  }
};

/**
 * Parses a CSV (Comma Separated Values) file robustly using `csv-parse`.
 * It extracts content, headers, and data as an array of objects.
 *
 * @param {string} filePath - The absolute path to the CSV file.
 * @returns {Promise<{ content: string, data: Array<object>, headers: Array<string>, metadata: { type: 'csv', rows: number, columns: number } }>}
 *   A promise that resolves to an object containing the raw content, parsed data, headers, and metadata.
 * @throws {Error} If the file cannot be read or is not a valid CSV.
 */
export const parseCSVFile = async (filePath) => {
  try {
    const content = await readFile(filePath, 'utf-8');
    if (!content.trim()) {
      return {
        content: '',
        data: [],
        headers: [],
        metadata: { type: 'csv', rows: 0, columns: 0 },
      };
    }

    // Use a robust CSV parser to handle edge cases like quotes and commas in values.
    const data = csvParseSync(content, {
      columns: true, // Treat the first line as headers.
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true, // Be more lenient with rows that have a different number of columns.
    });

    const headers = data.length > 0 ? Object.keys(data[0]) : [];

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
    logger.error(`Error parsing CSV file at ${filePath}:`, error);
    throw new Error(
      `Failed to parse CSV file. Ensure it is a valid CSV format. Details: ${error.message}`
    );
  }
};

/**
 * Parses a JSON file, extracting its content and the parsed JavaScript object/array.
 *
 * @param {string} filePath - The absolute path to the JSON file.
 * @returns {Promise<{ content: string, data: object|Array<any>, metadata: { type: 'json', size: number, keys: Array<string> } }>}
 *   A promise that resolves to an object containing the raw content, parsed data, and metadata.
 * @throws {Error} If the file cannot be read or if the content is not valid JSON.
 */
export const parseJSONFile = async (filePath) => {
  try {
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    const fileStats = await stat(filePath);

    return {
      content,
      data,
      metadata: {
        type: 'json',
        size: fileStats.size,
        // Handle both object and array-based root JSON structures.
        keys: Array.isArray(data) ? ['(array)'] : Object.keys(data),
      },
    };
  } catch (error) {
    logger.error(`Error parsing JSON file at ${filePath}:`, error);
    throw new Error(`Failed to parse JSON file: ${error.message}`);
  }
};

/**
 * Parses an XLSX (Excel) file using the `xlsx` package. It extracts data from the first sheet.
 *
 * @param {string} filePath - The absolute path to the XLSX file.
 * @returns {Promise<{ content: string, data: Array<Array<any>>, metadata: { type: 'xlsx', sheets: string[], processedSheet: string, dimensions: string } }>}
 *   A promise that resolves to an object containing a text representation, structured data, and metadata.
 * @throws {Error} If the file cannot be read or parsing fails.
 */
export const parseXLSXFile = async (filePath) => {
  try {
    // The 'xlsx' library can read the file path directly, which is memory efficient.
    const workbook = xlsx.readFile(filePath);
    const sheetNames = workbook.SheetNames;

    if (sheetNames.length === 0) {
      throw new Error('XLSX file contains no sheets.');
    }

    // For simplicity, process the first sheet.
    const firstSheetName = sheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert sheet to an array of arrays for a structured data representation.
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    // Generate a simple text representation (tab-separated) for the content property.
    const content = data.map((row) => row.join('\t')).join('\n');

    return {
      content,
      data,
      metadata: {
        type: 'xlsx',
        sheets: sheetNames,
        processedSheet: firstSheetName,
        dimensions: worksheet['!ref'], // e.g., "A1:D10"
      },
    };
  } catch (error) {
    logger.error(`Error parsing XLSX file at ${filePath}:`, error);
    throw new Error(`Failed to parse XLSX file: ${error.message}`);
  }
};

/**
 * Parses a DOCX (Microsoft Word) file using the `mammoth` package to extract raw text.
 *
 * @param {string} filePath - The absolute path to the DOCX file.
 * @returns {Promise<{ content: string, metadata: { type: 'docx', size: number } }>} A promise that resolves to an object
 *   containing the extracted text content and metadata.
 * @throws {Error} If the file cannot be read or parsing fails.
 */
export const parseDOCXFile = async (filePath) => {
  try {
    const { value } = await mammoth.extractRawText({ path: filePath });
    const fileStats = await stat(filePath);

    return {
      content: value,
      metadata: {
        type: 'docx',
        size: fileStats.size,
      },
    };
  } catch (error) {
    logger.error(`Error parsing DOCX file at ${filePath}:`, error);
    throw new Error(`Failed to parse DOCX file: ${error.message}`);
  }
};

/**
 * Dispatches file parsing to the appropriate handler based on the file's extension.
 *
 * @param {string} filePath - The absolute path to the file to be parsed.
 * @returns {Promise<object>} A promise that resolves to the parsed content and metadata.
 * @throws {Error} If the file format is not supported or if an error occurs during parsing.
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
    doc: parseDOCXFile, // Note: .doc is a different format, but mammoth has limited support. Treat as docx for now.
  };

  const parser = parsers[ext];

  if (!parser) {
    logger.warn(`Unsupported file format attempt: ${ext} for file ${filePath}`);
    throw new Error(`Unsupported file format: .${ext}`);
  }

  return await parser(filePath);
};

/**
 * Validates a file's format and size against specified criteria.
 *
 * @param {object} file - The file object to validate (e.g., from multer).
 * @param {string} file.originalname - The original name of the file, including its extension.
 * @param {number} file.size - The size of the file in bytes.
 * @param {number} maxSize - The maximum allowed file size in bytes.
 * @param {Array<string>} allowedFormats - An array of allowed file extensions (e.g., ['txt', 'pdf']).
 * @returns {boolean} Returns `true` if the file is valid.
 * @throws {Error} If validation fails.
 */
export const validateFile = (file, maxSize, allowedFormats) => {
  const ext = path.extname(file.originalname).toLowerCase().substring(1);

  if (!allowedFormats.includes(ext)) {
    throw new Error(
      `File format .${ext} is not supported. Allowed formats: ${allowedFormats.join(
        ', '
      )}`
    );
  }

  if (file.size > maxSize) {
    throw new Error(
      `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum ${(
        maxSize /
        1024 /
        1024
      ).toFixed(2)}MB`
    );
  }

  return true;
};

/**
 * Processes an array of file objects, extracting content from each using `parseFile`.
 * It handles errors gracefully for individual files, logging them and returning an
 * error message in the result for that specific file.
 *
 * @param {Array<object>} files - An array of file objects from middleware like multer.
 * @param {string} files[].path - The absolute path to the file on the server's file system.
 * @param {string} files[].originalname - The original name of the file as uploaded.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of results.
 *   Each result object contains `filename` and either the parsed data or an `error` message.
 */
export const extractContentFromFiles = async (files) => {
  // Process files in parallel for efficiency.
  const promises = files.map(async (file) => {
    try {
      const parsed = await parseFile(file.path);
      return {
        filename: file.originalname,
        content: parsed.content,
        data: parsed.data,
        metadata: parsed.metadata,
      };
    } catch (error) {
      logger.error(`Error processing file ${file.originalname}:`, error);
      return {
        filename: file.originalname,
        error: error.message,
      };
    }
  });

  return Promise.all(promises);
};