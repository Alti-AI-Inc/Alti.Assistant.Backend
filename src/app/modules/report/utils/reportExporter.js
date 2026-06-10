import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { logger } from '../../../../shared/logger.js';
import { EXPORT_CONFIG } from '../report.constant.js';

/**
 * Promisified version of `fs.writeFile` for asynchronous file writing.
 * @constant
 * @type {function(string, string | Buffer, (Object | string)): Promise<void>}
 */
const writeFile = promisify(fs.writeFile);

/**
 * Promisified version of `fs.mkdir` for asynchronous directory creation.
 * @constant
 * @type {function(string, (Object | number)): Promise<void>}
 */
const mkdir = promisify(fs.mkdir);

/**
 * @typedef {object} ReportSection
 * @property {string} title - The title of the section.
 * @property {string} content - The main content of the section.
 */

/**
 * @typedef {object} BaseReportData
 * @property {string} [title] - The main title of the report.
 * @property {string} [subtitle] - The subtitle of the report.
 * @property {string} [content] - General content for reports that don't use sections (e.g., TXT, MD, HTML, simple PDF).
 * @property {ReportSection[]} [sections] - An array of sections for structured reports (e.g., PDF, DOCX, HTML).
 * @property {boolean} [includeTitlePage=false] - Whether to include a title page (primarily for PDF).
 * @property {boolean} [includeTableOfContents=false] - Whether to include a table of contents (primarily for PDF).
 * @property {Array<Object<string, any>>} [data] - Array of objects for tabular data (primarily for CSV/XLSX).
 */

/**
 * Define a default base directory where reports are allowed to be written.
 * This should ideally come from a configuration or environment variable.
 * For this example, we'll use a 'reports' directory relative to the current working directory.
 * @constant
 * @type {string}
 */
const DEFAULT_BASE_REPORT_DIR = path.resolve('./reports');

/**
 * The base directory where reports are allowed to be written.
 * Derived from `EXPORT_CONFIG.basePath` if available, otherwise falls back to `DEFAULT_BASE_REPORT_DIR`.
 * Ensures all generated reports are stored within a controlled directory to prevent arbitrary file writes.
 * @constant
 * @type {string}
 */
const BASE_REPORT_DIR = EXPORT_CONFIG.basePath ? path.resolve(EXPORT_CONFIG.basePath) : DEFAULT_BASE_REPORT_DIR;

/**
 * Helper to sanitize file paths and prevent directory traversal.
 * Ensures the output path is within the designated base report directory
 * and that the filename itself does not contain invalid characters.
 * @param {string} userOutputPath The user-provided output path.
 * @returns {string} The sanitized and resolved output path.
 * @throws {Error} If directory traversal is detected or filename contains invalid characters.
 */
const sanitizeOutputPath = (userOutputPath) => {
  const resolvedUserPath = path.resolve(userOutputPath);

  // Ensure the resolved output path is within the designated base report directory.
  // This prevents writing files to arbitrary locations on the server.
  if (!resolvedUserPath.startsWith(BASE_REPORT_DIR + path.sep) && resolvedUserPath !== BASE_REPORT_DIR) {
    throw new Error(`Output path '${userOutputPath}' is outside the allowed report directory: '${BASE_REPORT_DIR}'.`);
  }

  // Further sanitize the filename part to remove any potentially malicious characters.
  // This is a basic sanitization; a more comprehensive one might be needed depending on requirements.
  const filename = path.basename(resolvedUserPath);
  // Common invalid characters for filenames across different OS.
  // Note: Windows has more restrictions than Unix-like systems.
  if (/[<>:"/\\|?*\x00-\x1F]/.test(filename)) {
    throw new Error(`Invalid characters in filename: '${filename}'.`);
  }

  return resolvedUserPath;
};

/**
 * Helper to escape HTML entities to prevent Cross-Site Scripting (XSS).
 * @param {string | any} str The string to escape. If not a string, it's returned as is.
 * @returns {string | any} The HTML-escaped string, or the original value if not a string.
 */
const escapeHTML = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, (match) => {
    switch (match) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return match;
    }
  });
};

/**
 * Helper to escape CSV values to prevent CSV injection attacks.
 * Prepends a single quote to values starting with formula-triggering characters.
 * Also handles standard CSV escaping for commas, quotes, newlines.
 * @param {string | any} value The string value to escape. If not a string, it's returned as is.
 * @returns {string | any} The CSV-escaped string, or the original value if not a string.
 */
const escapeCSV = (value) => {
  if (typeof value !== 'string') return value;
  // Prepend with a single quote to neutralize formulas if the value starts with
  // '=', '+', '-', or '@'. This prevents CSV injection attacks.
  if (value.startsWith('=') || value.startsWith('+') || value.startsWith('-') || value.startsWith('@')) {
    value = `'${value}`;
  }
  // Escape values with commas, quotes, or newlines for standard CSV formatting.
  // Double quotes inside the value are escaped by doubling them.
  // The entire value is then enclosed in double quotes.
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

/**
 * Ensures that the specified directory path exists. If it doesn't, it creates it recursively.
 * @param {string} dirPath The directory path to ensure existence of. This path should already be sanitized.
 * @returns {Promise<void>} A promise that resolves when the directory exists or is created.
 * @throws {Error} If an error occurs during directory creation that is not 'EEXIST'.
 */
const ensureOutputDir = async (dirPath) => {
  try {
    // The dirPath should already be sanitized by the caller of this utility.
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
};

/**
 * Generates a PDF report based on the provided data.
 * The report can include a title page, table of contents, and multiple content sections.
 * @param {BaseReportData} reportData - The data to populate the PDF report.
 * @param {string} outputPath - The desired file path for the generated PDF report.
 * @returns {Promise<string>} A promise that resolves with the sanitized output path of the generated PDF file.
 * @throws {Error} If there's an error during path sanitization, directory creation, or PDF generation.
 */
export const generatePDFReport = async (reportData, outputPath) => {
  // Sanitize the output path to prevent directory traversal
  const sanitizedOutputPath = sanitizeOutputPath(outputPath);

  try {
    await ensureOutputDir(path.dirname(sanitizedOutputPath));

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margins: EXPORT_CONFIG.PDF.margins,
        size: 'A4',
      });

      const stream = fs.createWriteStream(sanitizedOutputPath);
      doc.pipe(stream);

      // Title Page
      if (reportData.includeTitlePage && reportData.title) {
        doc
          .fontSize(24)
          .font('Helvetica-Bold')
          .text(reportData.title, { align: 'center' }); // PDFKit handles text rendering, less prone to injection here
        doc.moveDown(2);

        if (reportData.subtitle) {
          doc.fontSize(16).text(reportData.subtitle, { align: 'center' });
          doc.moveDown(1);
        }

        doc
          .fontSize(12)
          .text(new Date().toLocaleDateString(), { align: 'center' });
        doc.addPage();
      }

      // Table of Contents
      if (reportData.includeTableOfContents && reportData.sections) {
        doc.fontSize(18).font('Helvetica-Bold').text('Table of Contents');
        doc.moveDown(1);
        doc.fontSize(12).font('Helvetica');

        reportData.sections.forEach((section, index) => {
          doc.text(`${index + 1}. ${section.title}`);
        });
        doc.addPage();
      }

      // Content Sections
      if (reportData.sections) {
        reportData.sections.forEach((section, index) => {
          // Section Title
          doc
            .fontSize(16)
            .font('Helvetica-Bold')
            .text(section.title || `Section ${index + 1}`);
          doc.moveDown(0.5);

          // Section Content
          doc
            .fontSize(EXPORT_CONFIG.PDF.fontSize)
            .font('Helvetica')
            .text(section.content || '', {
              align: 'justify',
              lineGap: EXPORT_CONFIG.PDF.lineHeight,
            });
          doc.moveDown(2);

          // Add page break if not last section
          if (index < reportData.sections.length - 1) {
            doc.addPage();
          }
        });
      } else if (reportData.content) {
        // Single content block
        doc
          .fontSize(EXPORT_CONFIG.PDF.fontSize)
          .font('Helvetica')
          .text(reportData.content, {
            align: 'justify',
            lineGap: EXPORT_CONFIG.PDF.lineHeight,
          });
      }

      doc.end();

      stream.on('finish', () => {
        logger.info(`PDF report generated: ${sanitizedOutputPath}`);
        resolve(sanitizedOutputPath);
      });

      stream.on('error', (error) => {
        logger.error('Error generating PDF:', error);
        reject(error);
      });
    });
  } catch (error) {
    logger.error('Error in generatePDFReport:', error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
};

/**
 * Generates a DOCX report based on the provided data.
 * Currently, this is a placeholder implementation that exports content as a plain text file
 * due to the `docx` package not being installed.
 * @param {BaseReportData} reportData - The data to populate the DOCX report.
 * @param {string} outputPath - The desired file path for the generated DOCX report.
 * @returns {Promise<string>} A promise that resolves with the sanitized output path of the generated DOCX file.
 * @throws {Error} If there's an error during path sanitization, directory creation, or file writing.
 */
export const generateDOCXReport = async (reportData, outputPath) => {
  // Sanitize the output path to prevent directory traversal
  const sanitizedOutputPath = sanitizeOutputPath(outputPath);

  try {
    await ensureOutputDir(path.dirname(sanitizedOutputPath));

    // Placeholder implementation
    // For full implementation, install docx package:
    // const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

    logger.warn('DOCX generation requires docx package for full functionality');

    // Simple text export as placeholder
    let content = '';

    if (reportData.title) {
      content += `${reportData.title}\n\n`;
    }

    if (reportData.sections) {
      reportData.sections.forEach((section) => {
        content += `${section.title}\n\n`;
        content += `${section.content}\n\n`;
      });
    } else if (reportData.content) {
      content += reportData.content;
    }

    await writeFile(sanitizedOutputPath, content, 'utf-8');
    logger.info(`DOCX report generated (text format): ${sanitizedOutputPath}`);
    return sanitizedOutputPath;
  } catch (error) {
    logger.error('Error in generateDOCXReport:', error);
    throw new Error(`Failed to generate DOCX: ${error.message}`);
  }
};

/**
 * Generates a CSV report based on the provided data.
 * Supports tabular data (array of objects) or a single content string.
 * Applies CSV injection prevention and standard CSV escaping.
 * @param {BaseReportData} reportData - The data to populate the CSV report.
 * @param {string} outputPath - The desired file path for the generated CSV report.
 * @returns {Promise<string>} A promise that resolves with the sanitized output path of the generated CSV file.
 * @throws {Error} If there's an error during path sanitization, directory creation, or file writing.
 */
export const generateCSVReport = async (reportData, outputPath) => {
  // Sanitize the output path to prevent directory traversal
  const sanitizedOutputPath = sanitizeOutputPath(outputPath);

  try {
    await ensureOutputDir(path.dirname(sanitizedOutputPath));

    let csvContent = '';

    if (reportData.data && Array.isArray(reportData.data)) {
      // If data is provided as array of objects
      if (reportData.data.length > 0) {
        const headers = Object.keys(reportData.data[0]);
        csvContent += headers.map(escapeCSV).join(',') + '\n'; // Escape headers too

        reportData.data.forEach((row) => {
          const values = headers.map((header) => {
            const value = row[header];
            // Ensure value is converted to string before escaping, handling null/undefined
            return escapeCSV(String(value === null || value === undefined ? '' : value));
          });
          csvContent += values.join(',') + '\n';
        });
      }
    } else if (reportData.content) {
      // Convert content to CSV format
      // If reportData.content is a single string, assume it's already CSV or plain text
      // and apply basic escaping to the whole block if it contains sensitive chars.
      // For simplicity, if it's a single content block, we'll just write it.
      // A more robust solution might parse and escape lines/cells if content is structured.
      // For now, we'll treat it as raw content, but the path is sanitized.
      csvContent = reportData.content;
    }

    await writeFile(sanitizedOutputPath, csvContent, 'utf-8');
    logger.info(`CSV report generated: ${sanitizedOutputPath}`);
    return sanitizedOutputPath;
  } catch (error) {
    logger.error('Error in generateCSVReport:', error);
    throw new Error(`Failed to generate CSV: ${error.message}`);
  }
};

/**
 * Generates an XLSX report based on the provided data.
 * Currently, this is a placeholder implementation that falls back to generating a CSV report
 * due to the `xlsx` package not being installed.
 * @param {BaseReportData} reportData - The data to populate the XLSX report.
 * @param {string} outputPath - The desired file path for the generated XLSX report.
 * @returns {Promise<string>} A promise that resolves with the sanitized output path of the generated XLSX (or fallback CSV) file.
 * @throws {Error} If there's an error during path sanitization, directory creation, or the fallback CSV generation.
 */
export const generateXLSXReport = async (reportData, outputPath) => {
  // Sanitize the output path to prevent directory traversal
  const sanitizedOutputPath = sanitizeOutputPath(outputPath);

  try {
    await ensureOutputDir(path.dirname(sanitizedOutputPath));

    // Placeholder - requires xlsx package
    // const XLSX = require('xlsx');

    logger.warn('XLSX generation requires xlsx package for full functionality');

    // Fallback to CSV for now
    // Ensure the fallback CSV path is also sanitized and within the allowed directory
    const csvPath = sanitizedOutputPath.replace(/\.xlsx$/i, '.csv');
    // Re-sanitize the derived csvPath to be absolutely sure, though it should be fine if sanitizedOutputPath is.
    const sanitizedCsvPath = sanitizeOutputPath(csvPath);

    return await generateCSVReport(reportData, sanitizedCsvPath);
  } catch (error) {
    logger.error('Error in generateXLSXReport:', error);
    throw new Error(`Failed to generate XLSX: ${error.message}`);
  }
};

/**
 * Generates a plain text (TXT) report based on the provided data.
 * @param {BaseReportData} reportData - The data to populate the TXT report.
 * @param {string} outputPath - The desired file path for the generated TXT report.
 * @returns {Promise<string>} A promise that resolves with the sanitized output path of the generated TXT file.
 * @throws {Error} If there's an error during path sanitization, directory creation, or file writing.
 */
export const generateTXTReport = async (reportData, outputPath) => {
  // Sanitize the output path to prevent directory traversal
  const sanitizedOutputPath = sanitizeOutputPath(outputPath);

  try {
    await ensureOutputDir(path.dirname(sanitizedOutputPath));

    let content = '';

    if (reportData.title) {
      content += `${reportData.title}\n${'='.repeat(reportData.title.length)}\n\n`;
    }

    if (reportData.sections) {
      reportData.sections.forEach((section, index) => {
        content += `${section.title}\n${'-'.repeat(section.title.length)}\n\n`;
        content += `${section.content}\n\n`;
      });
    } else if (reportData.content) {
      content += reportData.content;
    }

    await writeFile(sanitizedOutputPath, content, 'utf-8');
    logger.info(`TXT report generated: ${sanitizedOutputPath}`);
    return sanitizedOutputPath;
  } catch (error) {
    logger.error('Error in generateTXTReport:', error);
    throw new Error(`Failed to generate TXT: ${error.message}`);
  }
};

/**
 * Generates a Markdown (MD) report based on the provided data.
 * @param {BaseReportData} reportData - The data to populate the Markdown report.
 * @param {string} outputPath - The desired file path for the generated Markdown report.
 * @returns {Promise<string>} A promise that resolves with the sanitized output path of the generated Markdown file.
 * @throws {Error} If there's an error during path sanitization, directory creation, or file writing.
 */
export const generateMDReport = async (reportData, outputPath) => {
  // Sanitize the output path to prevent directory traversal
  const sanitizedOutputPath = sanitizeOutputPath(outputPath);

  try {
    await ensureOutputDir(path.dirname(sanitizedOutputPath));

    let content = '';

    if (reportData.title) {
      content += `# ${reportData.title}\n\n`;
    }

    if (reportData.subtitle) {
      content += `## ${reportData.subtitle}\n\n`;
    }

    if (reportData.sections) {
      reportData.sections.forEach((section) => {
        content += `## ${section.title}\n\n`;
        content += `${section.content}\n\n`;
      });
    } else if (reportData.content) {
      content += reportData.content;
    }

    await writeFile(sanitizedOutputPath, content, 'utf-8');
    logger.info(`Markdown report generated: ${sanitizedOutputPath}`);
    return sanitizedOutputPath;
  } catch (error) {
    logger.error('Error in generateMDReport:', error);
    throw new Error(`Failed to generate Markdown: ${error.message}`);
  }
};

/**
 * Generates an HTML report based on the provided data.
 * Applies HTML escaping to prevent XSS vulnerabilities.
 * @param {BaseReportData} reportData - The data to populate the HTML report.
 * @param {string} outputPath - The desired file path for the generated HTML report.
 * @returns {Promise<string>} A promise that resolves with the sanitized output path of the generated HTML file.
 * @throws {Error} If there's an error during path sanitization, directory creation, or file writing.
 */
export const generateHTMLReport = async (reportData, outputPath) => {
  // Sanitize the output path to prevent directory traversal
  const sanitizedOutputPath = sanitizeOutputPath(outputPath);

  try {
    await ensureOutputDir(path.dirname(sanitizedOutputPath));

    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(reportData.title || 'Report')}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
    h2 { color: #34495e; margin-top: 30px; border-bottom: 1px solid #bdc3c7; padding-bottom: 5px; }
    .section { margin: 20px 0; }
    .date { color: #7f8c8d; font-style: italic; }
  </style>
</head>
<body>
`;

    if (reportData.title) {
      html += `  <h1>${escapeHTML(reportData.title)}</h1>\n`;
    }

    if (reportData.subtitle) {
      html += `  <p class="subtitle"><strong>${escapeHTML(reportData.subtitle)}</strong></p>\n`;
    }

    html += `  <p class="date">${new Date().toLocaleDateString()}</p>\n\n`;

    if (reportData.sections) {
      reportData.sections.forEach((section) => {
        html += `  <div class="section">\n`;
        html += `    <h2>${escapeHTML(section.title)}</h2>\n`;
        html += `    <p>${escapeHTML(section.content || '').replace(/\n/g, '<br>')}</p>\n`; // Escape content, then replace newlines
        html += `  </div>\n`;
      });
    } else if (reportData.content) {
      html += `  <div class="section">\n`;
      html += `    <p>${escapeHTML(reportData.content || '').replace(/\n/g, '<br>')}</p>\n`; // Escape content, then replace newlines
      html += `  </div>\n`;
    }

    html += `
</body>
</html>
`;

    await writeFile(sanitizedOutputPath, html, 'utf-8');
    logger.info(`HTML report generated: ${sanitizedOutputPath}`);
    return sanitizedOutputPath;
  } catch (error) {
    logger.error('Error in generateHTMLReport:', error);
    throw new Error(`Failed to generate HTML: ${error.message}`);
  }
};

/**
 * Generates a JSON report based on the provided data.
 * The `reportData` object is directly serialized to JSON format.
 * @param {BaseReportData} reportData - The data to populate the JSON report.
 * @param {string} outputPath - The desired file path for the generated JSON report.
 * @returns {Promise<string>} A promise that resolves with the sanitized output path of the generated JSON file.
 * @throws {Error} If there's an error during path sanitization, directory creation, or file writing.
 */
export const generateJSONReport = async (reportData, outputPath) => {
  // Sanitize the output path to prevent directory traversal
  const sanitizedOutputPath = sanitizeOutputPath(outputPath);

  try {
    await ensureOutputDir(path.dirname(sanitizedOutputPath));

    // JSON.stringify inherently handles escaping for JSON format, so no additional escaping needed for content.
    const jsonContent = JSON.stringify(reportData, null, 2);
    await writeFile(sanitizedOutputPath, jsonContent, 'utf-8');
    logger.info(`JSON report generated: ${sanitizedOutputPath}`);
    return sanitizedOutputPath;
  } catch (error) {
    logger.error('Error in generateJSONReport:', error);
    throw new Error(`Failed to generate JSON: ${error.message}`);
  }
};

/**
 * Main export function that dispatches report generation to the appropriate handler
 * based on the specified format.
 * @param {BaseReportData} reportData - The data to be included in the report.
 * @param {string} format - The desired output format (e.g., 'pdf', 'docx', 'csv', 'xlsx', 'txt', 'md', 'html', 'json').
 * @param {string} outputPath - The desired file path for the generated report.
 * @returns {Promise<string>} A promise that resolves with the sanitized output path of the generated report.
 * @throws {Error} If the specified export format is unsupported or if any underlying generator fails.
 */
export const exportReport = async (reportData, format, outputPath) => {
  const generators = {
    pdf: generatePDFReport,
    docx: generateDOCXReport,
    doc: generateDOCXReport, // Alias for docx
    csv: generateCSVReport,
    xlsx: generateXLSXReport,
    xls: generateXLSXReport, // Alias for xlsx
    txt: generateTXTReport,
    md: generateMDReport,
    html: generateHTMLReport,
    json: generateJSONReport,
  };

  const generator = generators[format.toLowerCase()];

  if (!generator) {
    throw new Error(`Unsupported export format: ${format}`);
  }

  return await generator(reportData, outputPath);
};