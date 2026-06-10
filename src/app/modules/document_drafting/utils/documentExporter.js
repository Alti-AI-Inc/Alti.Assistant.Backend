import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { logger } from '../../../../shared/logger.js';
import { OUTPUT_FORMATS } from '../document.constant.js';
import { Document, Packer, Paragraph, TextRun } from 'docx';

/**
 * Exports the given content to a PDF file.
 * This function generates a PDF document with optional title, date, and document type metadata.
 * The generated PDF is saved to a dynamically created 'output/documents' directory.
 *
 * @async
 * @param {string} content - The main text content to be written to the PDF.
 * @param {object} [metadata={}] - Optional metadata for the document.
 * @param {string} [metadata.title] - An optional title for the PDF document, displayed at the top.
 * @param {boolean} [metadata.includeDate] - If true, the current date will be added to the PDF.
 * @param {string} [metadata.documentType] - An optional type for the document, displayed in the PDF.
 * @returns {Promise<object>} A promise that resolves with an object containing details of the generated file.
 * @returns {string} .filePath - The absolute path to the generated PDF file.
 * @returns {string} .fileName - The name of the generated PDF file.
 * @returns {string} .format - The format of the exported document (e.g., 'PDF').
 * @returns {number} .size - The size of the generated PDF file in bytes.
 * @throws {Error} If there is an error during PDF creation or file writing.
 */
const exportToPDF = (content, metadata = {}) => {
  // This function returns a Promise to correctly handle the stream-based nature of PDF generation.
  return new Promise((resolve, reject) => {
    // Use an async IIFE (Immediately Invoked Function Expression) to allow `await` inside the Promise constructor.
    (async () => {
      try {
        const outputDir = path.join(process.cwd(), 'output', 'documents');

        // OPTIMIZATION: Use asynchronous file system operations to avoid blocking the event loop.
        await fs.promises.mkdir(outputDir, { recursive: true });

        const fileName = `document_${Date.now()}.pdf`;
        const filePath = path.join(outputDir, fileName);

        const doc = new PDFDocument({
          size: 'A4',
          margins: {
            top: 72,
            bottom: 72,
            left: 72,
            right: 72,
          },
        });

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Add title if provided
        if (metadata.title) {
          doc.fontSize(20).font('Helvetica-Bold').text(metadata.title, {
            align: 'center',
          });
          doc.moveDown(1);
        }

        // Add date if requested
        if (metadata.includeDate) {
          const date = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          doc.fontSize(10).font('Helvetica').text(date, {
            align: 'right',
          });
          doc.moveDown(1);
        }

        // Add document metadata
        if (metadata.documentType) {
          doc
            .fontSize(10)
            .font('Helvetica-Oblique')
            .text(`Type: ${metadata.documentType}`, {
              align: 'right',
            });
          doc.moveDown(0.5);
        }

        doc.moveDown(1);

        // Add main content
        doc.fontSize(11).font('Helvetica').text(content, {
          align: 'left',
          lineGap: 4,
        });

        // Finalize PDF
        doc.end();

        stream.on('finish', async () => {
          try {
            logger.info(`PDF document created successfully: ${filePath}`);
            // OPTIMIZATION: Use asynchronous stat to get file size without blocking the event loop.
            const stats = await fs.promises.stat(filePath);
            resolve({
              filePath,
              fileName,
              format: OUTPUT_FORMATS.PDF,
              size: stats.size,
            });
          } catch (statError) {
            logger.error('Error getting stats for PDF file:', statError);
            reject(statError);
          }
        });

        stream.on('error', (error) => {
          logger.error('Error writing PDF:', error);
          reject(error);
        });
      } catch (error) {
        logger.error('Error creating PDF document:', error);
        reject(error);
      }
    })();
  });
};

/**
 * Exports the given content to a DOCX (Word) file.
 * This function uses the 'docx' library to create a Word document with optional title, date, and document type metadata.
 * The generated DOCX is saved to a dynamically created 'output/documents' directory.
 *
 * @async
 * @param {string} content - The main text content to be written to the DOCX.
 * @param {object} [metadata={}] - Optional metadata for the document.
 * @param {string} [metadata.title] - An optional title for the DOCX document.
 * @param {boolean} [metadata.includeDate] - If true, the current date will be added to the DOCX.
 * @param {string} [metadata.documentType] - An optional type for the document, displayed in the DOCX.
 * @returns {Promise<object>} A promise that resolves with an object containing details of the generated file.
 * @returns {string} .filePath - The absolute path to the generated DOCX file.
 * @returns {string} .fileName - The name of the generated DOCX file.
 * @returns {string} .format - The format of the exported document (e.g., 'DOCX').
 * @returns {number} .size - The size of the generated DOCX file in bytes.
 * @throws {Error} If there is an error during DOCX creation or file writing.
 */
const exportToDocx = async (content, metadata = {}) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'documents');

    // OPTIMIZATION: Use asynchronous file system operations to avoid blocking the event loop.
    await fs.promises.mkdir(outputDir, { recursive: true });

    const fileName = `document_${Date.now()}.docx`;
    const filePath = path.join(outputDir, fileName);

    const children = [];

    // Title paragraph
    if (metadata.title) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: metadata.title,
              bold: true,
              size: 32, // 16pt
            }),
          ],
          spacing: { after: 300 },
        })
      );
    }

    // Date & type metadata paragraph
    const metaRuns = [];
    if (metadata.includeDate) {
      const date = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      metaRuns.push(new TextRun({ text: `Date: ${date}`, italics: true }));
    }
    if (metadata.documentType) {
      if (metaRuns.length > 0) {
        metaRuns.push(new TextRun({ text: '  |  ', italics: true }));
      }
      metaRuns.push(new TextRun({ text: `Type: ${metadata.documentType}`, italics: true }));
    }

    if (metaRuns.length > 0) {
      children.push(
        new Paragraph({
          children: metaRuns,
          spacing: { after: 400 },
        })
      );
    }

    // Add main content paragraphs
    const contentLines = content.split('\n');
    for (const line of contentLines) {
      if (line.trim() === '') {
        children.push(
          new Paragraph({
            children: [new TextRun('')],
            spacing: { after: 150 },
          })
        );
      } else {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line,
                size: 22, // 11pt
              }),
            ],
            spacing: { after: 150 },
          })
        );
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    // OPTIMIZATION: Use asynchronous file write to avoid blocking the event loop.
    await fs.promises.writeFile(filePath, buffer);

    logger.info(`DOCX document created successfully: ${filePath}`);

    // OPTIMIZATION: Use asynchronous stat to get file size without blocking the event loop.
    const stats = await fs.promises.stat(filePath);

    return {
      filePath,
      fileName,
      format: OUTPUT_FORMATS.DOCX,
      size: stats.size,
    };
  } catch (error) {
    logger.error('Error in exportToDocx:', error);
    throw error;
  }
};

/**
 * Exports the given content to a plain text (TXT) file.
 * This function creates a simple text file, optionally including a title, date, and document type.
 * The generated TXT is saved to a dynamically created 'output/documents' directory.
 *
 * @async
 * @param {string} content - The main text content to be written to the TXT file.
 * @param {object} [metadata={}] - Optional metadata for the document.
 * @param {string} [metadata.title] - An optional title for the TXT document.
 * @param {boolean} [metadata.includeDate] - If true, the current date will be added to the TXT.
 * @param {string} [metadata.documentType] - An optional type for the document, displayed in the TXT.
 * @returns {Promise<object>} A promise that resolves with an object containing details of the generated file.
 * @returns {string} .filePath - The absolute path to the generated TXT file.
 * @returns {string} .fileName - The name of the generated TXT file.
 * @returns {string} .format - The format of the exported document (e.g., 'TXT').
 * @returns {number} .size - The size of the generated TXT file in bytes.
 * @throws {Error} If there is an error during TXT file writing.
 */
const exportToTxt = async (content, metadata = {}) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'documents');

    // OPTIMIZATION: Use asynchronous file system operations to avoid blocking the event loop.
    await fs.promises.mkdir(outputDir, { recursive: true });

    const fileName = `document_${Date.now()}.txt`;
    const filePath = path.join(outputDir, fileName);

    let documentContent = '';

    if (metadata.title) {
      documentContent += `${metadata.title}\n`;
      documentContent += '='.repeat(metadata.title.length) + '\n\n';
    }

    if (metadata.includeDate) {
      const date = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      documentContent += `Date: ${date}\n\n`;
    }

    if (metadata.documentType) {
      documentContent += `Document Type: ${metadata.documentType}\n\n`;
    }

    documentContent += content;

    // OPTIMIZATION: Use asynchronous file write to avoid blocking the event loop.
    await fs.promises.writeFile(filePath, documentContent, 'utf8');

    logger.info(`TXT document created successfully: ${filePath}`);

    // OPTIMIZATION: Use asynchronous stat to get file size without blocking the event loop.
    const stats = await fs.promises.stat(filePath);

    return {
      filePath,
      fileName,
      format: OUTPUT_FORMATS.TXT,
      size: stats.size,
    };
  } catch (error) {
    logger.error('Error in exportToTxt:', error);
    throw error;
  }
};

/**
 * Exports the given content to an HTML file.
 * This function wraps the content in a basic HTML structure, applying simple styling and including
 * optional title, date, and document type metadata.
 * The generated HTML is saved to a dynamically created 'output/documents' directory.
 *
 * @async
 * @param {string} content - The main text content to be written to the HTML file. Line breaks will be converted to `<br>`.
 * @param {object} [metadata={}] - Optional metadata for the document.
 * @param {string} [metadata.title] - An optional title for the HTML document, used in the `<title>` tag and as an `<h1>`.
 * @param {boolean} [metadata.includeDate] - If true, the current date will be added to the HTML.
 * @param {string} [metadata.documentType] - An optional type for the document, displayed in the HTML.
 * @returns {Promise<object>} A promise that resolves with an object containing details of the generated file.
 * @returns {string} .filePath - The absolute path to the generated HTML file.
 * @returns {string} .fileName - The name of the generated HTML file.
 * @returns {string} .format - The format of the exported document (e.g., 'HTML').
 * @returns {number} .size - The size of the generated HTML file in bytes.
 * @throws {Error} If there is an error during HTML file writing.
 */
const exportToHtml = async (content, metadata = {}) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'documents');

    // OPTIMIZATION: Use asynchronous file system operations to avoid blocking the event loop.
    await fs.promises.mkdir(outputDir, { recursive: true });

    const fileName = `document_${Date.now()}.html`;
    const filePath = path.join(outputDir, fileName);

    // Format content with line breaks
    const formattedContent = content.replace(/\n/g, '<br>');

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metadata.title || 'Document'}</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        h1 {
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        .meta {
            color: #7f8c8d;
            font-size: 0.9em;
            margin-bottom: 20px;
        }
        .content {
            text-align: justify;
        }
    </style>
</head>
<body>
    ${metadata.title ? `<h1>${metadata.title}</h1>` : ''}
    <div class="meta">
        ${metadata.includeDate ? `<p>Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
        ${metadata.documentType ? `<p>Type: ${metadata.documentType}</p>` : ''}
    </div>
    <div class="content">
        ${formattedContent}
    </div>
</body>
</html>`;

    // OPTIMIZATION: Use asynchronous file write to avoid blocking the event loop.
    await fs.promises.writeFile(filePath, htmlContent, 'utf8');

    logger.info(`HTML document created successfully: ${filePath}`);

    // OPTIMIZATION: Use asynchronous stat to get file size without blocking the event loop.
    const stats = await fs.promises.stat(filePath);

    return {
      filePath,
      fileName,
      format: OUTPUT_FORMATS.HTML,
      size: stats.size,
    };
  } catch (error) {
    logger.error('Error in exportToHtml:', error);
    throw error;
  }
};

/**
 * Exports the given content to a Markdown (MD) file.
 * This function formats the content with Markdown syntax, including optional title, date, and document type metadata.
 * The generated MD file is saved to a dynamically created 'output/documents' directory.
 *
 * @async
 * @param {string} content - The main text content to be written to the Markdown file.
 * @param {object} [metadata={}] - Optional metadata for the document.
 * @param {string} [metadata.title] - An optional title for the Markdown document, formatted as an H1.
 * @param {boolean} [metadata.includeDate] - If true, the current date will be added to the Markdown front matter.
 * @param {string} [metadata.documentType] - An optional type for the document, displayed in the Markdown front matter.
 * @returns {Promise<object>} A promise that resolves with an object containing details of the generated file.
 * @returns {string} .filePath - The absolute path to the generated Markdown file.
 * @returns {string} .fileName - The name of the generated Markdown file.
 * @returns {string} .format - The format of the exported document (e.g., 'MD').
 * @returns {number} .size - The size of the generated Markdown file in bytes.
 * @throws {Error} If there is an error during Markdown file writing.
 */
const exportToMarkdown = async (content, metadata = {}) => {
  try {
    const outputDir = path.join(process.cwd(), 'output', 'documents');

    // OPTIMIZATION: Use asynchronous file system operations to avoid blocking the event loop.
    await fs.promises.mkdir(outputDir, { recursive: true });

    const fileName = `document_${Date.now()}.md`;
    const filePath = path.join(outputDir, fileName);

    let markdownContent = '';

    if (metadata.title) {
      markdownContent += `# ${metadata.title}\n\n`;
    }

    if (metadata.includeDate || metadata.documentType) {
      markdownContent += '---\n';
      if (metadata.includeDate) {
        const date = new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        markdownContent += `**Date:** ${date}\n\n`;
      }
      if (metadata.documentType) {
        markdownContent += `**Type:** ${metadata.documentType}\n\n`;
      }
      markdownContent += '---\n\n';
    }

    markdownContent += content;

    // OPTIMIZATION: Use asynchronous file write to avoid blocking the event loop.
    await fs.promises.writeFile(filePath, markdownContent, 'utf8');

    logger.info(`Markdown document created successfully: ${filePath}`);

    // OPTIMIZATION: Use asynchronous stat to get file size without blocking the event loop.
    const stats = await fs.promises.stat(filePath);

    return {
      filePath,
      fileName,
      format: OUTPUT_FORMATS.MD,
      size: stats.size,
    };
  } catch (error) {
    logger.error('Error in exportToMarkdown:', error);
    throw error;
  }
};

/**
 * Orchestrates the document export process, routing to the appropriate exporter based on the specified format.
 * This is the main entry point for exporting documents to various formats.
 *
 * @async
 * @param {string} content - The main text content of the document to be exported.
 * @param {string} format - The desired output format for the document (e.g., 'PDF', 'DOCX', 'TXT', 'HTML', 'MD').
 *                          Supported formats are defined in `OUTPUT_FORMATS`.
 * @param {object} [metadata={}] - Optional metadata for the document, passed to the specific exporter.
 * @param {string} [metadata.title] - An optional title for the document.
 * @param {boolean} [metadata.includeDate] - If true, the current date will be added to the document.
 * @param {string} [metadata.documentType] - An optional type for the document.
 * @returns {Promise<object>} A promise that resolves with an object containing details of the generated file.
 * @returns {string} .filePath - The absolute path to the generated file.
 * @returns {string} .fileName - The name of the generated file.
 * @returns {string} .format - The format of the exported document.
 * @returns {number} .size - The size of the generated file in bytes.
 * @throws {Error} If an unsupported format is provided or if an error occurs during the export process.
 */
export const exportDocument = async (content, format, metadata = {}) => {
  try {
    logger.info(`Exporting document to ${format} format`);

    switch (format.toLowerCase()) {
      case OUTPUT_FORMATS.PDF:
        return await exportToPDF(content, metadata);
      case OUTPUT_FORMATS.DOCX:
      case OUTPUT_FORMATS.DOC: // Fallback for .doc, though it will generate .docx
        return await exportToDocx(content, metadata);
      case OUTPUT_FORMATS.TXT:
        return await exportToTxt(content, metadata);
      case OUTPUT_FORMATS.HTML:
        return await exportToHtml(content, metadata);
      case OUTPUT_FORMATS.MD:
        return await exportToMarkdown(content, metadata);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  } catch (error) {
    logger.error('Error exporting document:', error);
    throw error;
  }
};