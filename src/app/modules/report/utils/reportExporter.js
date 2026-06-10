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
 * Helper to sanitize a filename.
 * - Prevents directory traversal.
 * - Disallows path separators to enforce storage within a user-specific directory.
 * - Ensures the name doesn't contain invalid characters like newlines.
 * @param {string} fileName The user-provided file name.
 * @returns {string} The sanitized file name.
 * @throws {Error} If the file name is invalid.
 */
const sanitizeFileName = (fileName) => {
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('Invalid file name provided.');
  }

  // Disallow path separators to ensure the file stays within its designated user directory.
  if (/[/\\]/.test(fileName)) {
    throw new Error('File name cannot contain path separators (e.g., / or \\).');
  }

  // Prevent directory traversal (defense-in-depth).
  if (fileName.includes('..')) {
    throw new Error(`Invalid characters in file name: '..'. Directory traversal is not allowed.`);
  }

  // Check for other invalid characters (e.g., newlines).
  if (/[\r\n]/.test(fileName)) {
    throw new Error(`Invalid characters (newlines) in file name: '${fileName}'.`);
  }

  if (fileName === '') {
    throw new Error('File name cannot be empty.');
  }

  return fileName;
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
  let escapedValue = value;
  if (['=', '+', '-', '@'].some(char => value.startsWith(char))) {
    escapedValue = `'${value}`;
  }
  // Escape values with commas, quotes, or newlines for standard CSV formatting.
  // Double quotes inside the value are escaped by doubling them.
  // The entire value is then enclosed in double quotes.
  if (escapedValue.includes(',') || escapedValue.includes('"') || escapedValue.includes('\n') || escapedValue.includes('\r')) {
    return `"${escapedValue.replace(/"/g, '""')}"`;
  }
  return escapedValue;
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
    logger.error(`Failed to generate signed URL for ${gcsObjectName}`, { error });
    throw new Error(`Could not generate signed URL: ${error.message}`);
  }
};

/**
 * A helper function to create a Promise-wrapped GCS stream for uploading generated content.
 * This standardizes the streaming logic for all report generators.
 * @param {string} gcsObjectName - The full, sanitized path to the object in GCS.
 * @param {string} contentType - The MIME type of the content.
 * @param {(stream: import('stream').Writable) => void} contentWriter - A callback function that writes content to the provided GCS stream.
 * @returns {Promise<string>} A promise that resolves with the signed URL for the uploaded file.
 */
const streamToGCS = (gcsObjectName, contentType, contentWriter) => {
  const file = storage.bucket(GCS_REPORT_BUCKET).file(gcsObjectName);
  return new Promise((resolve, reject) => {
    const gcsStream = file.createWriteStream({
      resumable: false,
      contentType,
    });

    gcsStream.on('finish', async () => {
      try {
        logger.info(`Report uploaded to GCS: gs://${GCS_REPORT_BUCKET}/${gcsObjectName}`);
        const url = await getSignedUrl(gcsObjectName);
        resolve(url);
      } catch (urlError) {
        reject(urlError);
      }
    });

    gcsStream.on('error', (error) => {
      logger.error(`Error streaming report to GCS for ${gcsObjectName}:`, { error });
      reject(error);
    });

    try {
      contentWriter(gcsStream);
    } catch (writeError) {
      // Ensure any synchronous error in the writer function is caught and rejects the promise.
      gcsStream.destroy(writeError); // This will trigger the 'error' event on the stream.
    }
  });
};

/**
 * Generates a PDF report and streams it directly to a GCS bucket.
 * @param {BaseReportData} reportData - The data to populate the PDF report.
 * @param {string} gcsObjectName - The full, sanitized path in the GCS bucket for the generated PDF.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated PDF file.
 */
export const generatePDFReport = (reportData, gcsObjectName) => {
  return streamToGCS(gcsObjectName, 'application/pdf', (gcsStream) => {
    const doc = new PDFDocument({
      margins: EXPORT_CONFIG.PDF.margins,
      size: 'A4',
    });

    doc.pipe(gcsStream);

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

    if (reportData.includeTableOfContents && reportData.sections) {
      doc.fontSize(18).font('Helvetica-Bold').text('Table of Contents');
      doc.moveDown(1);
      doc.fontSize(12).font('Helvetica');
      reportData.sections.forEach((section, index) => {
        doc.text(`${index + 1}. ${section.title}`);
      });
      doc.addPage();
    }

    if (reportData.sections) {
      reportData.sections.forEach((section, index) => {
        doc.fontSize(16).font('Helvetica-Bold').text(section.title || `Section ${index + 1}`);
        doc.moveDown(0.5);
        doc.fontSize(EXPORT_CONFIG.PDF.fontSize).font('Helvetica').text(section.content || '', {
          align: 'justify',
          lineGap: EXPORT_CONFIG.PDF.lineHeight,
        });
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
  });
};

/**
 * Generates a DOCX report and uploads it to a GCS bucket.
 * @param {BaseReportData} reportData - The data to populate the DOCX report.
 * @param {string} gcsObjectName - The full, sanitized path in the GCS bucket for the generated DOCX.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated DOCX file.
 */
export const generateDOCXReport = (reportData, gcsObjectName) => {
  logger.warn('DOCX generation is a placeholder (text format). Install `docx` package for full functionality.');
  return streamToGCS(gcsObjectName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', (gcsStream) => {
    if (reportData.title) gcsStream.write(`${reportData.title}\n\n`);
    if (reportData.sections) {
      reportData.sections.forEach((section) => {
        gcsStream.write(`${section.title}\n\n`);
        gcsStream.write(`${section.content}\n\n`);
      });
    } else if (reportData.content) {
      gcsStream.write(reportData.content);
    }
    gcsStream.end();
  });
};

/**
 * Generates a CSV report and streams it to a GCS bucket.
 * @param {BaseReportData} reportData - The data to populate the CSV report.
 * @param {string} gcsObjectName - The full, sanitized path in the GCS bucket for the generated CSV.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated CSV file.
 */
export const generateCSVReport = (reportData, gcsObjectName) => {
  return streamToGCS(gcsObjectName, 'text/csv', (gcsStream) => {
    if (reportData.data && Array.isArray(reportData.data) && reportData.data.length > 0) {
      const headers = Object.keys(reportData.data[0]);
      gcsStream.write(headers.map(escapeCSV).join(',') + '\n');
      for (const row of reportData.data) {
        const values = headers.map((header) => {
          const value = row[header];
          return escapeCSV(String(value === null || value === undefined ? '' : value));
        });
        gcsStream.write(values.join(',') + '\n');
      }
    } else if (reportData.content) {
      gcsStream.write(reportData.content);
    }
    gcsStream.end();
  });
};

/**
 * Generates an XLSX report and uploads it to a GCS bucket.
 * @param {BaseReportData} reportData - The data to populate the XLSX report.
 * @param {string} gcsObjectName - The full, sanitized path in the GCS bucket for the generated XLSX.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated file.
 */
export const generateXLSXReport = async (reportData, gcsObjectName) => {
  try {
    logger.warn('XLSX generation requires `xlsx` package. Falling back to CSV.');
    const csvObjectName = gcsObjectName.replace(/\.xlsx?$/i, '.csv');
    return await generateCSVReport(reportData, csvObjectName);
  } catch (error) {
    logger.error(`Error in generateXLSXReport for GCS object ${gcsObjectName}:`, { error });
    throw new Error(`Failed to generate XLSX (fallback to CSV) and upload to GCS: ${error.message}`);
  }
};

/**
 * Generates a plain text (TXT) report and streams it to a GCS bucket.
 * @param {BaseReportData} reportData - The data to populate the TXT report.
 * @param {string} gcsObjectName - The full, sanitized path in the GCS bucket for the generated TXT.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated TXT file.
 */
export const generateTXTReport = (reportData, gcsObjectName) => {
  return streamToGCS(gcsObjectName, 'text/plain', (gcsStream) => {
    if (reportData.title) gcsStream.write(`${reportData.title}\n${'='.repeat(reportData.title.length)}\n\n`);
    if (reportData.sections) {
      reportData.sections.forEach((section) => {
        gcsStream.write(`${section.title}\n${'-'.repeat(section.title.length)}\n\n`);
        gcsStream.write(`${section.content}\n\n`);
      });
    } else if (reportData.content) {
      gcsStream.write(reportData.content);
    }
    gcsStream.end();
  });
};

/**
 * Generates a Markdown (MD) report and streams it to a GCS bucket.
 * @param {BaseReportData} reportData - The data to populate the Markdown report.
 * @param {string} gcsObjectName - The full, sanitized path in the GCS bucket for the generated MD file.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated Markdown file.
 */
export const generateMDReport = (reportData, gcsObjectName) => {
  return streamToGCS(gcsObjectName, 'text/markdown', (gcsStream) => {
    if (reportData.title) gcsStream.write(`# ${reportData.title}\n\n`);
    if (reportData.subtitle) gcsStream.write(`## ${reportData.subtitle}\n\n`);
    if (reportData.sections) {
      reportData.sections.forEach((section) => {
        gcsStream.write(`## ${section.title}\n\n`);
        gcsStream.write(`${section.content}\n\n`);
      });
    } else if (reportData.content) {
      gcsStream.write(reportData.content);
    }
    gcsStream.end();
  });
};

/**
 * Generates an HTML report and streams it to a GCS bucket.
 * @param {BaseReportData} reportData - The data to populate the HTML report.
 * @param {string} gcsObjectName - The full, sanitized path in the GCS bucket for the generated HTML file.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated HTML file.
 */
export const generateHTMLReport = (reportData, gcsObjectName) => {
  return streamToGCS(gcsObjectName, 'text/html', (gcsStream) => {
    gcsStream.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHTML(reportData.title || 'Report')}</title><style>body{font-family:Arial,sans-serif;line-height:1.6;max-width:800px;margin:0 auto;padding:20px;color:#333}h1{color:#2c3e50;border-bottom:3px solid #3498db;padding-bottom:10px}h2{color:#34495e;margin-top:30px;border-bottom:1px solid #bdc3c7;padding-bottom:5px}.section{margin:20px 0}.date{color:#7f8c8d;font-style:italic}</style></head><body>`);
    if (reportData.title) gcsStream.write(`<h1>${escapeHTML(reportData.title)}</h1>\n`);
    if (reportData.subtitle) gcsStream.write(`<p class="subtitle"><strong>${escapeHTML(reportData.subtitle)}</strong></p>\n`);
    gcsStream.write(`<p class="date">${new Date().toLocaleDateString()}</p>\n\n`);
    if (reportData.sections) {
      reportData.sections.forEach((section) => {
        gcsStream.write(`<div class="section"><h2>${escapeHTML(section.title)}</h2><p>${escapeHTML(section.content || '').replace(/\n/g, '<br>')}</p></div>\n`);
      });
    } else if (reportData.content) {
      gcsStream.write(`<div class="section"><p>${escapeHTML(reportData.content || '').replace(/\n/g, '<br>')}</p></div>\n`);
    }
    gcsStream.end(`</body></html>`);
  });
};

/**
 * Generates a JSON report and streams it to a GCS bucket.
 * @param {BaseReportData} reportData - The data to populate the JSON report.
 * @param {string} gcsObjectName - The full, sanitized path in the GCS bucket for the generated JSON file.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated JSON file.
 */
export const generateJSONReport = (reportData, gcsObjectName) => {
  return streamToGCS(gcsObjectName, 'application/json', (gcsStream) => {
    // For JSON, stringifying the whole object and streaming it is simple and effective.
    gcsStream.end(JSON.stringify(reportData, null, 2));
  });
};

/**
 * Main export function that dispatches report generation to the appropriate handler.
 * The generated report is uploaded to a user-specific folder in GCS, and a signed URL is returned.
 * This ensures user data isolation and enforces resource limits.
 * @param {BaseReportData} reportData - The data to be included in the report.
 * @param {string} format - The desired output format (e.g., 'pdf', 'docx', 'csv', 'xlsx', 'txt', 'md', 'html', 'json').
 * @param {string} fileName - The desired file name for the report (e.g., 'monthly-summary.pdf'). Path characters are not allowed.
 * @param {string} userId - The unique identifier for the user requesting the report. Used to isolate user data.
 * @returns {Promise<string>} A promise that resolves with a signed URL for the generated report.
 * @throws {Error} If the report data is too large, the format is unsupported, or any underlying generator fails.
 */
export const exportReport = async (reportData, format, fileName, userId) => {
  // 1. Validate inputs for security and data isolation.
  if (!userId || typeof userId !== 'string') {
    throw new Error('A valid userId must be provided for report generation.');
  }
  // Sanitize userId to ensure it's a safe directory name.
  const sanitizedUserId = userId.replace(/[^a-zA-Z0-9-_]/g, '');
  if (!sanitizedUserId) {
    throw new Error('Provided userId is invalid or contains only disallowed characters.');
  }

  // 2. Enforce user-level limits to prevent abuse and ensure system stability.
  const MAX_REPORT_DATA_SIZE_BYTES = EXPORT_CONFIG.maxReportSizeBytes || 5 * 1024 * 1024; // 5MB default
  if (Buffer.byteLength(JSON.stringify(reportData), 'utf8') > MAX_REPORT_DATA_SIZE_BYTES) {
    const limitMB = Math.round(MAX_REPORT_DATA_SIZE_BYTES / 1024 / 1024);
    throw new Error(`Report data exceeds the maximum allowed size of ${limitMB}MB.`);
  }

  // 3. Sanitize filename and construct a secure, isolated GCS path.
  const sanitizedFileName = sanitizeFileName(fileName);
  const gcsObjectName = `reports/${sanitizedUserId}/${sanitizedFileName}`;

  // 4. Dispatch to the correct generator based on the requested format.
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