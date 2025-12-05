import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { logger } from '../../../../shared/logger.js';
import { EXPORT_CONFIG } from '../report.constant.js';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

/**
 * Ensure output directory exists
 */
const ensureOutputDir = async (dirPath) => {
  try {
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
  try {
    await ensureOutputDir(path.dirname(outputPath));

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margins: EXPORT_CONFIG.PDF.margins,
        size: 'A4',
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Title Page
      if (reportData.includeTitlePage && reportData.title) {
        doc
          .fontSize(24)
          .font('Helvetica-Bold')
          .text(reportData.title, { align: 'center' });
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
        logger.info(`PDF report generated: ${outputPath}`);
        resolve(outputPath);
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
  try {
    await ensureOutputDir(path.dirname(outputPath));

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
      reportData.sections.forEach(section => {
        content += `${section.title}\n\n`;
        content += `${section.content}\n\n`;
      });
    } else if (reportData.content) {
      content += reportData.content;
    }

    await writeFile(outputPath, content, 'utf-8');
    logger.info(`DOCX report generated (text format): ${outputPath}`);
    return outputPath;
  } catch (error) {
    logger.error('Error in generateDOCXReport:', error);
    throw new Error(`Failed to generate DOCX: ${error.message}`);
  }
};

/**
 * Generate CSV report
 */
export const generateCSVReport = async (reportData, outputPath) => {
  try {
    await ensureOutputDir(path.dirname(outputPath));

    let csvContent = '';

    if (reportData.data && Array.isArray(reportData.data)) {
      // If data is provided as array of objects
      if (reportData.data.length > 0) {
        const headers = Object.keys(reportData.data[0]);
        csvContent += headers.join(',') + '\n';

        reportData.data.forEach(row => {
          const values = headers.map(header => {
            const value = row[header] || '';
            // Escape values with commas or quotes
            return typeof value === 'string' && (value.includes(',') || value.includes('"'))
              ? `"${value.replace(/"/g, '""')}"`
              : value;
          });
          csvContent += values.join(',') + '\n';
        });
      }
    } else if (reportData.content) {
      // Convert content to CSV format
      csvContent = reportData.content;
    }

    await writeFile(outputPath, csvContent, 'utf-8');
    logger.info(`CSV report generated: ${outputPath}`);
    return outputPath;
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
  try {
    await ensureOutputDir(path.dirname(outputPath));

    // Placeholder - requires xlsx package
    // const XLSX = require('xlsx');

    logger.warn('XLSX generation requires xlsx package for full functionality');

    // Fallback to CSV for now
    const csvPath = outputPath.replace('.xlsx', '.csv');
    return await generateCSVReport(reportData, csvPath);
  } catch (error) {
    logger.error('Error in generateXLSXReport:', error);
    throw new Error(`Failed to generate XLSX: ${error.message}`);
  }
};

/**
 * Generate TXT report
 */
export const generateTXTReport = async (reportData, outputPath) => {
  try {
    await ensureOutputDir(path.dirname(outputPath));

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

    await writeFile(outputPath, content, 'utf-8');
    logger.info(`TXT report generated: ${outputPath}`);
    return outputPath;
  } catch (error) {
    logger.error('Error in generateTXTReport:', error);
    throw new Error(`Failed to generate TXT: ${error.message}`);
  }
};

/**
 * Generate Markdown report
 */
export const generateMDReport = async (reportData, outputPath) => {
  try {
    await ensureOutputDir(path.dirname(outputPath));

    let content = '';

    if (reportData.title) {
      content += `# ${reportData.title}\n\n`;
    }

    if (reportData.subtitle) {
      content += `## ${reportData.subtitle}\n\n`;
    }

    if (reportData.sections) {
      reportData.sections.forEach(section => {
        content += `## ${section.title}\n\n`;
        content += `${section.content}\n\n`;
      });
    } else if (reportData.content) {
      content += reportData.content;
    }

    await writeFile(outputPath, content, 'utf-8');
    logger.info(`Markdown report generated: ${outputPath}`);
    return outputPath;
  } catch (error) {
    logger.error('Error in generateMDReport:', error);
    throw new Error(`Failed to generate Markdown: ${error.message}`);
  }
};

/**
 * Generate HTML report
 */
export const generateHTMLReport = async (reportData, outputPath) => {
  try {
    await ensureOutputDir(path.dirname(outputPath));

    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportData.title || 'Report'}</title>
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
      html += `  <h1>${reportData.title}</h1>\n`;
    }

    if (reportData.subtitle) {
      html += `  <p class="subtitle"><strong>${reportData.subtitle}</strong></p>\n`;
    }

    html += `  <p class="date">${new Date().toLocaleDateString()}</p>\n\n`;

    if (reportData.sections) {
      reportData.sections.forEach(section => {
        html += `  <div class="section">\n`;
        html += `    <h2>${section.title}</h2>\n`;
        html += `    <p>${section.content.replace(/\n/g, '<br>')}</p>\n`;
        html += `  </div>\n`;
      });
    } else if (reportData.content) {
      html += `  <div class="section">\n`;
      html += `    <p>${reportData.content.replace(/\n/g, '<br>')}</p>\n`;
      html += `  </div>\n`;
    }

    html += `
</body>
</html>
`;

    await writeFile(outputPath, html, 'utf-8');
    logger.info(`HTML report generated: ${outputPath}`);
    return outputPath;
  } catch (error) {
    logger.error('Error in generateHTMLReport:', error);
    throw new Error(`Failed to generate HTML: ${error.message}`);
  }
};

/**
 * Generate JSON report
 */
export const generateJSONReport = async (reportData, outputPath) => {
  try {
    await ensureOutputDir(path.dirname(outputPath));

    const jsonContent = JSON.stringify(reportData, null, 2);
    await writeFile(outputPath, jsonContent, 'utf-8');
    logger.info(`JSON report generated: ${outputPath}`);
    return outputPath;
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
    doc: generateDOCXReport,
    csv: generateCSVReport,
    xlsx: generateXLSXReport,
    xls: generateXLSXReport,
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
