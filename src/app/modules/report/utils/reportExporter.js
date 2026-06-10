import PDFDocument from 'pdfkit';
import { Storage } from '@google-cloud/storage';
import { logger } from '../../../../shared/logger.js';
import { EXPORT_CONFIG } from '../report.constant.js';

// Initialize the Google Cloud Storage client.
const storage = new Storage();

// Get the GCS bucket name from configuration or environment variables.
const GCS_REPORT_BUCKET = EXPORT_CONFIG.gcsBucketName || process.env.GCS_REPORT_BUCKET;

// A GCS bucket must be configured for this module to function.
if (!GCS_REPORT_BUCKET) {
  const errorMessage = 'GCS bucket for reports is not configured. Set EXPORT_CONFIG.gcsBucketName or GCS_REPORT_BUCKET environment variable.';
  logger.error(errorMessage);
  throw new Error(errorMessage);
}

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
 * Helper to sanitize GCS object names.
 * - Prevents directory traversal-like patterns.
 * - Removes leading slashes.
 * - Replaces multiple slashes with a single one.
 * - Ensures the name doesn't contain invalid characters like newlines.
 * @param {string} userObjectName The user-provided object name.
 * @returns {string} The sanitized GCS object name.
 * @throws {Error} If the object name is invalid.
 */
const sanitizeGCSObjectName = (userObjectName) => {
  if (!userObjectName || typeof userObjectName !== 'string') {
    throw new Error('Invalid GCS object name provided.');
  }

  // Normalize and clean the path
  let sanitized = userObjectName.replace(/\\/g, '/'); // Convert backslashes to forward slashes
  sanitized = sanitized.replace(/\/{2,}/g, '/'); // Replace multiple slashes
  if (sanitized.startsWith('/')) {
    sanitized = sanitized.substring(1); // Remove leading slash
  }

  // Prevent directory traversal
  if (sanitized.includes('..')) {
    throw new Error(`Invalid characters in GCS object name: '..'. Directory traversal is not allowed.`);
  }

  // Check for other invalid characters (e.g., newlines)
  if (/[\r\n]/.test(sanitized)) {
    throw new Error(`Invalid characters (newlines) in GCS object name: '${sanitized}'.`);
  }

  if (sanitized === '' || sanitized.endsWith('/')) {
    throw new Error('GCS object name cannot be empty or end with a slash.');
  }

  return sanitized;
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
 * Generates a signed URL for a GCS object, allowing temporary read access.
 * @param {string} gcsObjectName The name of the object in the GCS bucket.
 * @returns {Promise<string>} A promise that resolves with the signed URL.
 */
const getSignedUrl = async (gcsObjectName) => {
  const options = {
    version: 'v4',
    action: 'read',
    expires: Date.now() + (EXPORT_CONFIG.signedUrlExpiresMinutes || 15) * 60 * 1000, // 15 minute default expiration
  };
  try {
    const [url] = await storage
      .bucket(GCS_REPORT_BUCKET)
      .file(gcsObjectName)
      .getSignedUrl(options);
    return url;
  } catch (error) {
    logger.error(`Failed to generate signed URL for ${gcsObjectName}`, error);
    throw new Error(`Could not generate signed URL: ${error.message}`);
  }
};

/**
 * Generates a PDF report and streams it directly to a GCS bucket.
 * The report can include a title page, table of contents, and multiple content sections.
 * @param {BaseReportData} reportData - The data to populate the PDF report.
 * @param {string} gcsObjectName - The desired object name in the GCS bucket for the generated PDF.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated PDF file.
 * @throws {Error} If there's an error during GCS object name sanitization or PDF generation/upload.
 */
export const generatePDFReport = async (reportData, gcsObjectName) => {
  const sanitizedObjectName = sanitizeGCSObjectName(gcsObjectName);
  const file = storage.bucket(GCS_REPORT_BUCKET).file(sanitizedObjectName);

  try {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margins: EXPORT_CONFIG.PDF.margins,
        size: 'A4',
      });

      // Create a write stream directly to the GCS object.
      const gcsStream = file.createWriteStream({
        resumable: false, // Use a simple upload for in-memory generated files.
        contentType: 'application/pdf',
      });

      // Pipe the PDF document output to the GCS stream.
      doc.pipe(gcsStream);

      // Title Page
      if (reportData.includeTitlePage && reportData.title) {
        doc.fontSize(24).font('Helvetica-Bold').text(reportData.title, { align: 'center' });
        doc.moveDown(2);
        if (reportData.subtitle) {
          doc.fontSize(16).text(reportData.subtitle, { align: 'center' });
          doc.moveDown(1);
        }
        doc.fontSize(12).text(new Date().toLocaleDateString(), { align: 'center' });
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
          doc.fontSize(16).font('Helvetica-Bold').text(section.title || `Section ${index + 1}`);
          doc.moveDown(0.5);
          doc.fontSize(EXPORT_CONFIG.PDF.fontSize).font('Helvetica').text(section.content || '', {
            align: 'justify',
            lineGap: EXPORT_CONFIG.PDF.lineHeight,
          });
          doc.moveDown(2);
          if (index < reportData.sections.length - 1) {
            doc.addPage();
          }
        });
      } else if (reportData.content) {
        doc.fontSize(EXPORT_CONFIG.PDF.fontSize).font('Helvetica').text(reportData.content, {
          align: 'justify',
          lineGap: EXPORT_CONFIG.PDF.lineHeight,
        });
      }

      doc.end();

      gcsStream.on('finish', async () => {
        try {
          logger.info(`PDF report uploaded to GCS: gs://${GCS_REPORT_BUCKET}/${sanitizedObjectName}`);
          const url = await getSignedUrl(sanitizedObjectName);
          resolve(url);
        } catch (urlError) {
          reject(urlError);
        }
      });

      gcsStream.on('error', (error) => {
        logger.error(`Error streaming PDF to GCS for ${sanitizedObjectName}:`, error);
        reject(error);
      });
    });
  } catch (error) {
    logger.error(`Error in generatePDFReport for GCS object ${sanitizedObjectName}:`, error);
    throw new Error(`Failed to generate PDF and upload to GCS: ${error.message}`);
  }
};

/**
 * Generates a DOCX report and uploads it to a GCS bucket.
 * Currently, this is a placeholder implementation that uploads content as a plain text file.
 * @param {BaseReportData} reportData - The data to populate the DOCX report.
 * @param {string} gcsObjectName - The desired object name in the GCS bucket for the generated DOCX.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated DOCX file.
 * @throws {Error} If there's an error during GCS object name sanitization or file upload.
 */
export const generateDOCXReport = async (reportData, gcsObjectName) => {
  const sanitizedObjectName = sanitizeGCSObjectName(gcsObjectName);
  const file = storage.bucket(GCS_REPORT_BUCKET).file(sanitizedObjectName);

  try {
    logger.warn('DOCX generation is a placeholder (text format). Install `docx` package for full functionality.');

    let content = '';
    if (reportData.title) content += `${reportData.title}\n\n`;
    if (reportData.sections) {
      reportData.sections.forEach((section) => {
        content += `${section.title}\n\n`;
        content += `${section.content}\n\n`;
      });
    } else if (reportData.content) {
      content += reportData.content;
    }

    await file.save(content, { contentType: 'text/plain' });
    logger.info(`DOCX report (text format) uploaded to GCS: gs://${GCS_REPORT_BUCKET}/${sanitizedObjectName}`);
    return await getSignedUrl(sanitizedObjectName);
  } catch (error) {
    logger.error(`Error in generateDOCXReport for GCS object ${sanitizedObjectName}:`, error);
    throw new Error(`Failed to generate DOCX and upload to GCS: ${error.message}`);
  }
};

/**
 * Generates a CSV report and uploads it to a GCS bucket.
 * Applies CSV injection prevention and standard CSV escaping.
 * @param {BaseReportData} reportData - The data to populate the CSV report.
 * @param {string} gcsObjectName - The desired object name in the GCS bucket for the generated CSV.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated CSV file.
 * @throws {Error} If there's an error during GCS object name sanitization or file upload.
 */
export const generateCSVReport = async (reportData, gcsObjectName) => {
  const sanitizedObjectName = sanitizeGCSObjectName(gcsObjectName);
  const file = storage.bucket(GCS_REPORT_BUCKET).file(sanitizedObjectName);

  try {
    let csvContent = '';
    if (reportData.data && Array.isArray(reportData.data) && reportData.data.length > 0) {
      const headers = Object.keys(reportData.data[0]);
      csvContent += headers.map(escapeCSV).join(',') + '\n';
      reportData.data.forEach((row) => {
        const values = headers.map((header) => {
          const value = row[header];
          return escapeCSV(String(value === null || value === undefined ? '' : value));
        });
        csvContent += values.join(',') + '\n';
      });
    } else if (reportData.content) {
      csvContent = reportData.content;
    }

    await file.save(csvContent, { contentType: 'text/csv' });
    logger.info(`CSV report uploaded to GCS: gs://${GCS_REPORT_BUCKET}/${sanitizedObjectName}`);
    return await getSignedUrl(sanitizedObjectName);
  } catch (error) {
    logger.error(`Error in generateCSVReport for GCS object ${sanitizedObjectName}:`, error);
    throw new Error(`Failed to generate CSV and upload to GCS: ${error.message}`);
  }
};

/**
 * Generates an XLSX report and uploads it to a GCS bucket.
 * Currently, this is a placeholder that falls back to generating a CSV report.
 * @param {BaseReportData} reportData - The data to populate the XLSX report.
 * @param {string} gcsObjectName - The desired object name in the GCS bucket for the generated XLSX.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated file.
 * @throws {Error} If there's an error during the fallback CSV generation.
 */
export const generateXLSXReport = async (reportData, gcsObjectName) => {
  const sanitizedObjectName = sanitizeGCSObjectName(gcsObjectName);
  try {
    logger.warn('XLSX generation requires `xlsx` package. Falling back to CSV.');
    const csvObjectName = sanitizedObjectName.replace(/\.xlsx$/i, '.csv');
    const sanitizedCsvObjectName = sanitizeGCSObjectName(csvObjectName);
    return await generateCSVReport(reportData, sanitizedCsvObjectName);
  } catch (error) {
    logger.error(`Error in generateXLSXReport for GCS object ${sanitizedObjectName}:`, error);
    throw new Error(`Failed to generate XLSX (fallback to CSV) and upload to GCS: ${error.message}`);
  }
};

/**
 * Generates a plain text (TXT) report and uploads it to a GCS bucket.
 * @param {BaseReportData} reportData - The data to populate the TXT report.
 * @param {string} gcsObjectName - The desired object name in the GCS bucket for the generated TXT.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated TXT file.
 * @throws {Error} If there's an error during GCS object name sanitization or file upload.
 */
export const generateTXTReport = async (reportData, gcsObjectName) => {
  const sanitizedObjectName = sanitizeGCSObjectName(gcsObjectName);
  const file = storage.bucket(GCS_REPORT_BUCKET).file(sanitizedObjectName);

  try {
    let content = '';
    if (reportData.title) content += `${reportData.title}\n${'='.repeat(reportData.title.length)}\n\n`;
    if (reportData.sections) {
      reportData.sections.forEach((section) => {
        content += `${section.title}\n${'-'.repeat(section.title.length)}\n\n`;
        content += `${section.content}\n\n`;
      });
    } else if (reportData.content) {
      content += reportData.content;
    }

    await file.save(content, { contentType: 'text/plain' });
    logger.info(`TXT report uploaded to GCS: gs://${GCS_REPORT_BUCKET}/${sanitizedObjectName}`);
    return await getSignedUrl(sanitizedObjectName);
  } catch (error) {
    logger.error(`Error in generateTXTReport for GCS object ${sanitizedObjectName}:`, error);
    throw new Error(`Failed to generate TXT and upload to GCS: ${error.message}`);
  }
};

/**
 * Generates a Markdown (MD) report and uploads it to a GCS bucket.
 * @param {BaseReportData} reportData - The data to populate the Markdown report.
 * @param {string} gcsObjectName - The desired object name in the GCS bucket for the generated MD file.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated Markdown file.
 * @throws {Error} If there's an error during GCS object name sanitization or file upload.
 */
export const generateMDReport = async (reportData, gcsObjectName) => {
  const sanitizedObjectName = sanitizeGCSObjectName(gcsObjectName);
  const file = storage.bucket(GCS_REPORT_BUCKET).file(sanitizedObjectName);

  try {
    let content = '';
    if (reportData.title) content += `# ${reportData.title}\n\n`;
    if (reportData.subtitle) content += `## ${reportData.subtitle}\n\n`;
    if (reportData.sections) {
      reportData.sections.forEach((section) => {
        content += `## ${section.title}\n\n`;
        content += `${section.content}\n\n`;
      });
    } else if (reportData.content) {
      content += reportData.content;
    }

    await file.save(content, { contentType: 'text/markdown' });
    logger.info(`Markdown report uploaded to GCS: gs://${GCS_REPORT_BUCKET}/${sanitizedObjectName}`);
    return await getSignedUrl(sanitizedObjectName);
  } catch (error) {
    logger.error(`Error in generateMDReport for GCS object ${sanitizedObjectName}:`, error);
    throw new Error(`Failed to generate Markdown and upload to GCS: ${error.message}`);
  }
};

/**
 * Generates an HTML report and uploads it to a GCS bucket.
 * Applies HTML escaping to prevent XSS vulnerabilities.
 * @param {BaseReportData} reportData - The data to populate the HTML report.
 * @param {string} gcsObjectName - The desired object name in the GCS bucket for the generated HTML file.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated HTML file.
 * @throws {Error} If there's an error during GCS object name sanitization or file upload.
 */
export const generateHTMLReport = async (reportData, gcsObjectName) => {
  const sanitizedObjectName = sanitizeGCSObjectName(gcsObjectName);
  const file = storage.bucket(GCS_REPORT_BUCKET).file(sanitizedObjectName);

  try {
    let html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHTML(reportData.title || 'Report')}</title><style>body{font-family:Arial,sans-serif;line-height:1.6;max-width:800px;margin:0 auto;padding:20px;color:#333}h1{color:#2c3e50;border-bottom:3px solid #3498db;padding-bottom:10px}h2{color:#34495e;margin-top:30px;border-bottom:1px solid #bdc3c7;padding-bottom:5px}.section{margin:20px 0}.date{color:#7f8c8d;font-style:italic}</style></head><body>`;
    if (reportData.title) html += `<h1>${escapeHTML(reportData.title)}</h1>\n`;
    if (reportData.subtitle) html += `<p class="subtitle"><strong>${escapeHTML(reportData.subtitle)}</strong></p>\n`;
    html += `<p class="date">${new Date().toLocaleDateString()}</p>\n\n`;
    if (reportData.sections) {
      reportData.sections.forEach((section) => {
        html += `<div class="section"><h2>${escapeHTML(section.title)}</h2><p>${escapeHTML(section.content || '').replace(/\n/g, '<br>')}</p></div>\n`;
      });
    } else if (reportData.content) {
      html += `<div class="section"><p>${escapeHTML(reportData.content || '').replace(/\n/g, '<br>')}</p></div>\n`;
    }
    html += `</body></html>`;

    await file.save(html, { contentType: 'text/html' });
    logger.info(`HTML report uploaded to GCS: gs://${GCS_REPORT_BUCKET}/${sanitizedObjectName}`);
    return await getSignedUrl(sanitizedObjectName);
  } catch (error) {
    logger.error(`Error in generateHTMLReport for GCS object ${sanitizedObjectName}:`, error);
    throw new Error(`Failed to generate HTML and upload to GCS: ${error.message}`);
  }
};

/**
 * Generates a JSON report and uploads it to a GCS bucket.
 * @param {BaseReportData} reportData - The data to populate the JSON report.
 * @param {string} gcsObjectName - The desired object name in the GCS bucket for the generated JSON file.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated JSON file.
 * @throws {Error} If there's an error during GCS object name sanitization or file upload.
 */
export const generateJSONReport = async (reportData, gcsObjectName) => {
  const sanitizedObjectName = sanitizeGCSObjectName(gcsObjectName);
  const file = storage.bucket(GCS_REPORT_BUCKET).file(sanitizedObjectName);

  try {
    const jsonContent = JSON.stringify(reportData, null, 2);
    await file.save(jsonContent, { contentType: 'application/json' });
    logger.info(`JSON report uploaded to GCS: gs://${GCS_REPORT_BUCKET}/${sanitizedObjectName}`);
    return await getSignedUrl(sanitizedObjectName);
  } catch (error) {
    logger.error(`Error in generateJSONReport for GCS object ${sanitizedObjectName}:`, error);
    throw new Error(`Failed to generate JSON and upload to GCS: ${error.message}`);
  }
};

/**
 * Main export function that dispatches report generation to the appropriate handler.
 * The generated report is uploaded to GCS, and a signed URL is returned.
 * @param {BaseReportData} reportData - The data to be included in the report.
 * @param {string} format - The desired output format (e.g., 'pdf', 'docx', 'csv', 'xlsx', 'txt', 'md', 'html', 'json').
 * @param {string} gcsObjectName - The desired GCS object name for the generated report (e.g., 'reports/user-123/report.pdf').
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated report.
 * @throws {Error} If the specified export format is unsupported or if any underlying generator fails.
 */
export const exportReport = async (reportData, format, gcsObjectName) => {
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

  return await generator(reportData, gcsObjectName);
};