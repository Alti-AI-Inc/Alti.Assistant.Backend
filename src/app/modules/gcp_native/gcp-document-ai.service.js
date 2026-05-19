import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

// Instantiate the Document AI Client
// The client will automatically authenticate using GOOGLE_APPLICATION_CREDENTIALS env variable
const client = new DocumentProcessorServiceClient();

/**
 * Processes a document (PDF, Image, etc.) using Google Cloud Document AI.
 * Extracts raw text, table structures, and structural/layout elements.
 * 
 * @param {Buffer} fileBuffer - The file raw buffer
 * @param {string} mimeType - The mime type of the document (e.g., 'application/pdf', 'image/png')
 * @param {string} processorId - The Google Cloud Document AI Processor ID
 * @param {string} location - Google Cloud Location (e.g., 'us', 'eu')
 */
const processDocument = async (fileBuffer, mimeType, processorId, location = 'us') => {
  const gcpProjectId = config.gcp_project_id || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  
  if (!gcpProjectId) {
    throw new Error('GCP Project ID is not configured. Please set GOOGLE_CLOUD_PROJECT in your environment.');
  }
  
  const targetProcessorId = processorId || config.gcp_document_ai_processor_id || process.env.GCP_DOCUMENT_AI_PROCESSOR_ID;
  if (!targetProcessorId) {
    throw new Error('Document AI Processor ID is not provided or configured in environment variables.');
  }

  // The fully qualified processor name
  const name = `projects/${gcpProjectId}/locations/${location}/processors/${targetProcessorId}`;
  
  logger.info(`Sending document of type "${mimeType}" to GCP Document AI processor: ${name}`);

  try {
    const request = {
      name,
      rawDocument: {
        content: fileBuffer.toString('base64'),
        mimeType,
      },
    };

    // Recognizes text and entities in the document
    const [result] = await client.processDocument(request);
    const { document } = result;

    if (!document) {
      throw new Error('GCP Document AI returned an empty response.');
    }

    // 1. Extract Full Text
    const fullText = document.text || '';

    // 2. Extract Structural Pages & Paragraphs
    const paragraphs = [];
    if (document.pages) {
      for (const page of document.pages) {
        if (page.paragraphs) {
          for (const paragraph of page.paragraphs) {
            const paragraphText = getTextFromLayout(paragraph.layout, fullText);
            paragraphs.push(paragraphText);
          }
        }
      }
    }

    // 3. Extract Tables Natively
    const tables = [];
    if (document.pages) {
      for (const page of document.pages) {
        if (page.tables) {
          for (const table of page.tables) {
            const rows = [];
            
            // Parse Header Rows
            const headers = [];
            if (table.headerRows) {
              for (const row of table.headerRows) {
                const headerCells = [];
                for (const cell of row.cells) {
                  headerCells.push(getTextFromLayout(cell.layout, fullText).trim());
                }
                headers.push(headerCells);
              }
            }

            // Parse Body Rows
            if (table.bodyRows) {
              for (const row of table.bodyRows) {
                const bodyCells = [];
                for (const cell of row.cells) {
                  bodyCells.push(getTextFromLayout(cell.layout, fullText).trim());
                }
                rows.push(bodyCells);
              }
            }

            tables.push({
              headers,
              rows,
            });
          }
        }
      }
    }

    // 4. Extract Form Key-Values
    const keyValues = [];
    if (document.pages) {
      for (const page of document.pages) {
        if (page.formFields) {
          for (const field of page.formFields) {
            const fieldName = getTextFromLayout(field.fieldName?.layout, fullText).trim();
            const fieldValue = getTextFromLayout(field.fieldValue?.layout, fullText).trim();
            if (fieldName) {
              keyValues.push({
                key: fieldName.replace(/:$/, ''),
                value: fieldValue || ''
              });
            }
          }
        }
      }
    }

    return {
      success: true,
      text: fullText,
      paragraphs,
      tables,
      keyValues,
      metadata: {
        pageCount: document.pages?.length || 0,
        mimeType: document.mimeType,
      }
    };
  } catch (err) {
    logger.error('GCP Document AI Processing Error:', err);
    throw new Error(`GCP Document AI execution failed: ${err.message}`);
  }
};

/**
 * Helper to retrieve text from a document layout segment text anchor.
 */
function getTextFromLayout(layout, text) {
  if (!layout || !layout.textAnchor || !layout.textAnchor.textSegments) {
    return '';
  }
  
  let result = '';
  for (const segment of layout.textAnchor.textSegments) {
    const startIndex = segment.startIndex ? parseInt(segment.startIndex) : 0;
    const endIndex = segment.endIndex ? parseInt(segment.endIndex) : 0;
    result += text.substring(startIndex, endIndex);
  }
  return result;
}

export const GcpDocumentAiService = {
  processDocument,
};
