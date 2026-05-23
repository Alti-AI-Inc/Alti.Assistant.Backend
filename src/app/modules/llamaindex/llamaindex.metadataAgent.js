import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import DocumentMetadata from './llamaindex.metadata.model.js';
import * as llama from './llamaindex.indexer.js';

const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Clean Markdown backticks from LLM response.
 */
const cleanJSONResponse = (text) => {
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
  }
  return clean;
};

/**
 * Enriches a single document using Google Gemini semantic parsing.
 */
const enrichDocument = async (filePath, fileName, docId, userId) => {
  try {
    logger.info(`MetadataAgent: enriching "${fileName}" (ID: ${docId}) for user ${userId}`);

    let fileContentPreview = '';
    if (filePath && existsSync(filePath)) {
      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase();

      // Read a prefix snippet to analyze (cap at 20KB for token optimization)
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

    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
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
 * Scans a user's entire corpus index and enriches any documents missing metadata.
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

export const metadataAgentService = {
  enrichDocument,
  enrichAllUserDocuments,
};
