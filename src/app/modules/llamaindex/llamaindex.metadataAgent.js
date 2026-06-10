import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import DocumentMetadata from './llamaindex.metadata.model.js';
import * as llama from './llamaindex.indexer.js';

/**
 * Initializes the Google Generative AI client with the API key from the configuration.
 * @type {GoogleGenerativeAI}
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Cleans markdown backticks and optional language specifiers from a given text string.
 * This is typically used to parse JSON responses from LLMs that might wrap their output in markdown code blocks.
 *
 * @param {string} text The input string, potentially containing markdown code block formatting.
 * @returns {string} The cleaned string, with leading/trailing markdown backticks removed.
 */
const cleanJSONResponse = (text) => {
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
  }
  return clean;
};

/**
 * Enriches a single document's metadata by analyzing its content (or a preview) using Google Gemini.
 * It extracts a summary, topics, entities, complexity, audience, and temporal context,
 * then stores this information in the database.
 *
 * @param {string | null} filePath The local file path to the document. Can be `null` if the document is remote or its content is not directly accessible.
 * @param {string} fileName The name of the document.
 * @param {string} docId The unique identifier for the document within the LlamaIndex corpus.
 * @param {string} userId The unique identifier for the user who owns the document.
 * @returns {Promise<DocumentMetadata>} A promise that resolves to the created or updated `DocumentMetadata` record.
 * @throws {Error} If the enrichment process fails critically, though it attempts graceful fallback.
 */
const enrichDocument = async (filePath, fileName, docId, userId) => {
  try {
    logger.info(`MetadataAgent: enriching "${fileName}" (ID: ${docId}) for user ${userId}`);

    let fileContentPreview = '';
    if (filePath && existsSync(filePath)) {
      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();

      // Read a prefix snippet to analyze (cap at 15KB for token optimization)
      if (ext === '.json' || ext === '.txt' || ext === '.md' || ext === '.csv') {
        const fullContent = await fs.readFile(filePath, 'utf-8');
        fileContentPreview = fullContent.substring(0, 15000);
      } else {
        fileContentPreview = `Document file name: ${fileName}. Size: ${stats.size} bytes. Binary format.`;
      }
    } else {
      fileContentPreview = `Document file name: ${fileName}. Online/remote asset.`;
    }

    const systemPrompt = `You are a high-fidelity document profiler. Your job is to analyze the following document snippet and generate a highly accurate, structured JSON summary matching this schema:
{
  "summary": "A concise, single-paragraph summary of the document purpose and findings.",
  "topics": ["ontological", "domain", "tags"],
  "entities": ["key organizations, products, or concepts"],
  "complexity": "Elementary" | "Intermediate" | "Advanced" | "Highly Technical",
  "audience": "Description of the target reader",
  "temporalContext": "Time references, date markers, or 'Timeless'"
}

Ensure your response is raw JSON only, with no markdown formatting or comments.

Document Preview:
${fileContentPreview}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const text = cleanJSONResponse(result.response.text());
    const parsed = JSON.parse(text);

    // Save to database
    const metadataRecord = await DocumentMetadata.findOneAndUpdate(
      { userId, docId },
      {
        fileName,
        summary: parsed.summary || 'Summary not generated.',
        topics: parsed.topics || [],
        entities: parsed.entities || [],
        complexity: parsed.complexity || 'Intermediate',
        audience: parsed.audience || 'General',
        temporalContext: parsed.temporalContext || 'Timeless',
      },
      { new: true, upsert: true }
    );

    logger.info(`MetadataAgent: successfully enriched document profile in MongoDB for "${fileName}"`);
    return metadataRecord;
  } catch (err) {
    logger.error(`MetadataAgent error enriching "${fileName}":`, err);
    // Graceful fallback to avoid stopping the ingestion flow
    const fallback = await DocumentMetadata.findOneAndUpdate(
      { userId, docId },
      {
        fileName,
        summary: `Auto-generated profile for ${fileName}. Extraction encountered an error: ${err.message}`,
        topics: ['general'],
        entities: [fileName],
        complexity: 'Intermediate',
        audience: 'General',
        temporalContext: 'Timeless',
      },
      { new: true, upsert: true }
    );
    return fallback;
  }
};

/**
 * Scans a user's entire LlamaIndex corpus and enriches any documents that are missing metadata profiles
 * in the application's database. It processes documents asynchronously but sequentially to manage API rate limits.
 *
 * @param {string} userId The unique identifier for the user whose documents are to be enriched.
 * @returns {Promise<{ success: boolean, message: string, enrichedCount: number }>} A promise that resolves to an object
 *   indicating the success of the operation, a descriptive message, and the count of newly enriched documents.
 * @throws {Error} If there's a critical failure in listing documents or during the enrichment cycle.
 */
const enrichAllUserDocuments = async (userId) => {
  try {
    // List indexed documents from current LlamaIndex corpus
    const docs = await llama.listDocuments(userId);
    if (!docs || docs.length === 0) {
      return { success: true, message: 'No documents in corpus to enrich.', enrichedCount: 0 };
    }

    let enrichedCount = 0;
    for (const doc of docs) {
      const docId = doc.id || doc.docId || doc.id_;
      const existing = await DocumentMetadata.findOne({ userId, docId });

      if (!existing) {
        // Enforce asynchronous enrichment
        await enrichDocument(null, doc.fileName || doc.name || 'unnamed_doc', docId, userId);
        enrichedCount++;
      }
    }

    return {
      success: true,
      message: `Enrichment cycle completed. Analyzed ${docs.length} files. Enriched ${enrichedCount} new files.`,
      enrichedCount,
    };
  } catch (err) {
    logger.error(`MetadataAgent enrichAllUserDocuments failed:`, err);
    throw err;
  }
};

/**
 * @typedef {Object} MetadataAgentService
 * @property {function(string | null, string, string, string): Promise<DocumentMetadata>} enrichDocument - Function to enrich a single document's metadata.
 * @property {function(string): Promise<{ success: boolean, message: string, enrichedCount: number }>} enrichAllUserDocuments - Function to enrich all documents for a given user that are missing metadata.
 */

/**
 * Exports the core services of the metadata agent.
 * @type {MetadataAgentService}
 */
export const metadataAgentService = {
  enrichDocument,
  enrichAllUserDocuments,
};