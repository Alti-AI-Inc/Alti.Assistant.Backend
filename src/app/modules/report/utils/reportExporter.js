import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { logger } from '../../../../shared/logger.js';
import { EXPORT_CONFIG } from '../report.constant.js';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// Define a default base directory where reports are allowed to be written.
// This should ideally come from a configuration or environment variable.
// For this example, we'll use a 'reports' directory relative to the current working directory,
// or a path specified in EXPORT_CONFIG if available.
const DEFAULT_BASE_REPORT_DIR = path.resolve('./reports');
const BASE_REPORT_DIR = EXPORT_CONFIG.basePath ? path.resolve(EXPORT_CONFIG.basePath) : DEFAULT_BASE_REPORT_DIR;

/**
 * Helper to sanitize file paths and prevent directory traversal.
 * Ensures the output path is within the designated base report directory
 * and that the filename itself does not contain invalid characters.
 * @param {string} userOutputPath The user-provided output path.
 * @returns {string} The sanitized and resolved output path.
 * @throws {Error} If directory traversal is detected or filename is invalid.
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
 * @param {string} str The string to escape.
 * @returns {string} The HTML-escaped string.
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
 * @param {string} value The string value to escape.
 * @returns {string} The CSV-escaped string.
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
 * Ensure output directory exists
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
 * Generate PDF report
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
 * Generate DOCX report
 * Note: Requires docx package for full implementation
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
 * Generate CSV report
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
 * Generate XLSX report
 * Note: Requires xlsx package for full implementation
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
 * Generate TXT report
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
 * Generate Markdown report
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
 * Generate HTML report
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
 * Generate JSON report
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
 * Main export function - dispatches to appropriate generator
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