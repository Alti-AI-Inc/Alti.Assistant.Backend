import { logger } from '../../../../shared/logger.js';

/**
 * @file This module provides a collection of utility functions for report generation,
 * including content processing, data extraction, validation, and metadata generation.
 * @module reportHelpers
 */

/**
 * Generates a concise report title from the provided content.
 * It attempts to use the first meaningful sentence or the beginning of the content.
 *
 * @param {string} content - The full text content of the report.
 * @returns {string} A generated title for the report, or 'Untitled Report' if content is empty.
 */
export const generateTitleFromContent = (content) => {
  if (!content) return 'Untitled Report';

  // Take first meaningful sentence or first 60 characters
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.length > 60) {
    return firstLine.substring(0, 57) + '...';
  }
  return firstLine || 'Untitled Report';
};

/**
 * Extracts structured data (headers and rows) from CSV content.
 * Each row is converted into an object where keys are the CSV headers.
 *
 * @param {string} csvContent - The raw CSV content as a string.
 * @returns {{headers: string[], data: object[]}} An object containing an array of headers and an array of data rows.
 * Each data row is an object with header names as keys. Returns empty arrays if content is invalid or empty.
 */
export const extractCSVData = (csvContent) => {
  // BUGFIX: The original naive 'split(',')' parser failed on CSVs with quoted fields containing commas.
  // Replaced with a more robust parser that correctly handles basic CSV quoting rules.
  try {
    if (!csvContent) return { headers: [], data: [] };

    // Normalize line endings and filter out empty lines
    const lines = csvContent.replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim());
    if (lines.length === 0) return { headers: [], data: [] };

    /**
     * Parses a single line of a CSV string, respecting quoted fields.
     * @param {string} line - The CSV line to parse.
     * @returns {string[]} An array of values from the line.
     */
    const parseLine = (line) => {
      const values = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          // Handle escaped quotes ("") by looking ahead
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++; // Skip the second quote of the pair
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    };

    const headers = parseLine(lines[0]);
    const data = lines.slice(1).map((line) => {
      const values = parseLine(line);
      const row = {};
      headers.forEach((header, index) => {
        // Ensure we don't assign undefined if a row has fewer columns than the header
        row[header] = values[index] || '';
      });
      return row;
    });

    return { headers, data };
  } catch (error) {
    logger.error('Error extracting CSV data:', error);
    return { headers: [], data: [] };
  }
};

/**
 * Formats an array of file objects into a human-readable string suitable for AI prompts.
 * Each file is described with its name, type, and character count.
 *
 * @param {Array<Object>} files - An array of file objects.
 * @param {string} files[].filename - The name of the file.
 * @param {Object} [files[].metadata] - Optional metadata for the file.
 * @param {string} [files[].metadata.type] - The type/format of the file (e.g., 'pdf', 'csv').
 * @param {string} [files[].content] - The content of the file (used to determine length).
 * @returns {string} A concatenated string describing each file, or an empty string if no files are provided.
 */
export const formatFileInfo = (files) => {
  if (!files || files.length === 0) return '';

  return files
    .map((file, index) => {
      return `File ${index + 1}: ${file.filename} (${file.metadata?.type || 'unknown'} format, ${file.content?.length || 0} characters)`;
    })
    .join('\n');
};

/**
 * Cleans and normalizes text content by standardizing line endings,
 * replacing tabs with spaces, and limiting consecutive newlines.
 *
 * @param {string} content - The raw text content to normalize.
 * @returns {string} The normalized and cleaned text content. Returns an empty string if input is null or undefined.
 */
export const normalizeContent = (content) => {
  if (!content) return '';

  return content
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\t/g, '    ') // Replace tabs with spaces
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim();
};

/**
 * Estimates the reading time for a given text content in minutes.
 * Assumes an average reading speed of 200 words per minute.
 *
 * @param {string} content - The text content for which to estimate reading time.
 * @returns {number} The estimated reading time in minutes, rounded up to the nearest whole number. Returns 0 if content is empty.
 */
export const estimateReadingTime = (content) => {
  if (!content) return 0;

  const wordsPerMinute = 200;
  const words = content.split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
};

/**
 * Generates summary statistics for an array of data objects, typically extracted from CSV or similar sources.
 * Provides row count, column count, column names, and basic statistics (min, max, mean, median, count)
 * for numeric columns.
 *
 * @param {Array<Object>} data - An array of data objects, where each object represents a row
 * and its properties are column names.
 * @returns {Object|null} An object containing overall statistics and per-column numeric statistics,
 * or `null` if the input data is not an array or is empty.
 * @property {number} rowCount - The number of rows in the data.
 * @property {number} columnCount - The number of columns in the data.
 * @property {string[]} columns - An array of column names.
 * @property {Object.<string, Object>} [columnName] - For each numeric column, an object containing:
 * @property {number} [columnName.min] - The minimum value in the column.
 * @property {number} [columnName.max] - The maximum value in the column.
 * @property {number} [columnName.mean] - The average value in the column.
 * @property {number} [columnName.median] - The median value in the column.
 * @property {number} [columnName.count] - The count of numeric values in the column.
 */
export const generateDataStats = (data) => {
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const stats = {
    rowCount: data.length,
    columnCount: Object.keys(data[0] || {}).length,
    columns: Object.keys(data[0] || {}),
  };

  // Calculate numeric column statistics
  stats.columns.forEach((col) => {
    const values = data
      .map((row) => row[col])
      .filter((v) => v && !isNaN(v))
      .map(Number);

    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / values.length;
      const sorted = [...values].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const median =
        sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];

      stats[col] = { min, max, mean, median, count: values.length };
    }
  });

  return stats;
};

/**
 * Validates a set of report parameters against predefined rules and acceptable values.
 * Checks for presence of content/files, valid output format, report type, and tone.
 *
 * @param {Object} params - An object containing report generation parameters.
 * @param {string} [params.content] - The main content of the report.
 * @param {Array<Object>} [params.files] - An array of file objects associated with the report.
 * @param {string} [params.outputFormat] - The desired output format for the report (e.g., 'pdf', 'docx').
 * @param {string} [params.reportType] - The type of report (e.g., 'executive_summary', 'analytical').
 * @param {string} [params.tone] - The desired tone for the report (e.g., 'professional', 'casual').
 * @returns {{isValid: boolean, errors: string[]}} An object indicating validity and an array of error messages.
 */
export const validateReportParams = (params) => {
  const errors = [];

  // BUGFIX: The original check (!params.content && !params.files) was insufficient.
  // It failed to consider cases where 'files' was an empty array, which should also be invalid if no content is provided.
  if (!params.content && (!params.files || params.files.length === 0)) {
    errors.push('Either content or files must be provided');
  }

  if (
    params.outputFormat &&
    ![
      'pdf',
      'docx',
      'doc',
      'csv',
      'xlsx',
      'txt',
      'md',
      'html',
      'json',
    ].includes(params.outputFormat.toLowerCase())
  ) {
    errors.push('Invalid output format');
  }

  if (
    params.reportType &&
    ![
      'executive_summary',
      'analytical',
      'financial',
      'technical',
      'research',
      'business',
      'comparison',
      'custom',
    ].includes(params.reportType)
  ) {
    errors.push('Invalid report type');
  }

  if (
    params.tone &&
    ![
      'professional',
      'formal',
      'technical',
      'casual',
      'academic',
      'persuasive',
    ].includes(params.tone)
  ) {
    errors.push('Invalid tone');
  }

  return { isValid: errors.length === 0, errors };
};

/**
 * Generates a standard set of metadata for a report based on provided parameters.
 * Includes generation timestamp, generator info, report type, output format, tone,
 * word count, and estimated reading time.
 *
 * @param {Object} params - An object containing report generation parameters.
 * @param {string} [params.reportType='custom'] - The type of report.
 * @param {string} [params.outputFormat='pdf'] - The desired output format.
 * @param {string} [params.tone='professional'] - The desired tone.
 * @param {string} [params.content] - The main content of the report, used for word count and reading time.
 * @returns {Object} An object containing the generated report metadata.
 * @property {string} generatedAt - ISO string timestamp of when the metadata was generated.
 * @property {string} generator - Name of the report generation module.
 * @property {string} version - Version of the report generation module.
 * @property {string} reportType - The type of report.
 * @property {string} outputFormat - The output format of the report.
 * @property {string} tone - The tone of the report.
 * @property {number} wordCount - The estimated word count of the report content.
 * @property {number} estimatedReadingTime - The estimated reading time in minutes.
 */
export const generateReportMetadata = (params) => {
  return {
    generatedAt: new Date().toISOString(),
    generator: 'Alti Report Generation Module',
    version: '1.0.0',
    reportType: params.reportType || 'custom',
    outputFormat: params.outputFormat || 'pdf',
    tone: params.tone || 'professional',
    wordCount: params.content ? params.content.split(/\s+/).length : 0,
    estimatedReadingTime: estimateReadingTime(params.content || ''),
  };
};

/**
 * Splits a long text content into an array of sections, ensuring each section
 * does not exceed a specified maximum length. It attempts to split by paragraphs.
 *
 * @param {string} content - The full text content to be split.
 * @param {number} [maxSectionLength=5000] - The maximum character length for each section.
 * @returns {Array<Object>} An array of section objects, each with a `title` and `content`.
 * Returns a single section if content is short enough or an empty array if content is null/empty.
 * @property {string} title - The title of the section (e.g., "Section 1").
 * @property {string} content - The text content of the section.
 */
export const splitContentIntoSections = (content, maxSectionLength = 5000) => {
  if (!content) {
    return [];
  }
  if (content.length <= maxSectionLength) {
    return [{ title: 'Content', content }];
  }

  // BUGFIX: The original logic could create sections larger than maxSectionLength if a single paragraph was too long.
  // This revised logic correctly handles and splits oversized paragraphs to respect the length constraint.
  const sections = [];
  const paragraphs = content.split(/\n\n+/);
  let currentSectionContent = '';
  let sectionIndex = 1;

  for (const paragraph of paragraphs) {
    // If adding the next paragraph would exceed the limit, push the current section.
    if (currentSectionContent.length > 0 && currentSectionContent.length + paragraph.length + 2 > maxSectionLength) {
      sections.push({ title: `Section ${sectionIndex++}`, content: currentSectionContent.trim() });
      currentSectionContent = '';
    }

    // If a single paragraph is larger than the max length, it needs to be split.
    if (paragraph.length > maxSectionLength) {
      // If there's anything in currentSectionContent, push it first to keep it separate.
      if (currentSectionContent.length > 0) {
        sections.push({ title: `Section ${sectionIndex++}`, content: currentSectionContent.trim() });
        currentSectionContent = '';
      }

      // Split the oversized paragraph itself.
      let remainingParagraph = paragraph;
      while (remainingParagraph.length > maxSectionLength) {
        // Find a good split point (end of sentence) or hard split.
        let splitAt = remainingParagraph.lastIndexOf('.', maxSectionLength);
        if (splitAt <= 0) { // If no period found or it's at the start, hard split.
          splitAt = maxSectionLength;
        } else {
          splitAt += 1; // Include the punctuation.
        }
        const chunk = remainingParagraph.substring(0, splitAt);
        sections.push({ title: `Section ${sectionIndex++}`, content: chunk.trim() });
        remainingParagraph = remainingParagraph.substring(splitAt).trim();
      }
      // The remainder of the paragraph becomes the start of the next section.
      currentSectionContent = remainingParagraph;
    } else {
      // Otherwise, append the paragraph to the current section.
      currentSectionContent += (currentSectionContent.length > 0 ? '\n\n' : '') + paragraph;
    }
  }

  // Add the last remaining section if it has content.
  if (currentSectionContent.length > 0) {
    sections.push({ title: `Section ${sectionIndex}`, content: currentSectionContent.trim() });
  }

  return sections;
};

/**
 * Formats a Date object into a human-readable string (e.g., "Month Day, Year").
 * Uses 'en-US' locale for consistent formatting.
 *
 * @param {Date} [date=new Date()] - The Date object to format. Defaults to the current date if not provided.
 * @returns {string} The formatted date string.
 */
export const formatReportDate = (date = new Date()) => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Sanitizes a string to create a file-system safe filename.
 * Replaces invalid characters with underscores and converts to lowercase.
 *
 * @param {string} filename - The original filename string.
 * @returns {string} The sanitized filename.
 */
export const sanitizeFilename = (filename) => {
  if (!filename) return '';
  return filename
    .replace(/[^a-z0-9_\-.]/gi, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
};

/**
 * Calculates a confidence score for AI-generated content based on the completeness
 * and richness of the provided parameters. The score ranges from 0.5 to 1.0.
 *
 * @param {Object} params - An object containing various parameters related to the AI generation.
 * @param {string} [params.content] - The generated content itself.
 * @param {string} [params.title] - The title of the generated content.
 * @param {string} [params.reportType] - The type of report generated.
 * @param {Array<Object>} [params.sections] - An array of sections if the content was split.
 * @param {string} [params.customInstructions] - Any custom instructions provided for generation.
 * @returns {number} A confidence score between 0.5 and 1.0, where higher means more complete input.
 */
export const calculateConfidenceScore = (params) => {
  let score = 0.5; // Base score

  // Increase score based on available parameters
  if (params.content && params.content.length > 500) score += 0.1;
  if (params.title) score += 0.1;
  if (params.reportType) score += 0.1;
  if (params.sections && params.sections.length > 0) score += 0.1;
  if (params.customInstructions) score += 0.1;

  return Math.min(score, 1.0);
};

export default {
  generateTitleFromContent,
  extractCSVData,
  formatFileInfo,
  normalizeContent,
  estimateReadingTime,
  generateDataStats,
  validateReportParams,
  generateReportMetadata,
  splitContentIntoSections,
  formatReportDate,
  sanitizeFilename,
  calculateConfidenceScore,
};