import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
// Use the enterprise-grade Vertex AI SDK for Node.js
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import DocumentMetadata from './llamaindex.metadata.model.js';
import * as llama from './llamaindex.indexer.js';
// PLATFORM OWNER IMPROVEMENT: Import Tenant model to check status and iterate through tenants.
import Tenant from '../tenant/tenant.model.js';

/**
 * Initializes the Vertex AI client for enterprise-grade features and safety controls.
 * Assumes GCP project ID and location are available in the config.
 */
const vertex_ai = new VertexAI({
  project: config.gcp?.projectId || config.google?.gcp_project_id || process.env.GCP_PROJECT_ID || 'alti-assistant',
  location: config.gcp?.location || config.google?.gcp_location || process.env.GCP_LOCATION || 'us-central1',
});

/**
 * Filters or masks Personally Identifiable Information (PII) from a given text.
 * NOTE: This is a placeholder implementation. For production, integrate a robust PII detection
 * service like the Google Cloud DLP API to prevent sensitive data from being sent to the model.
 * @param {string} text The input text to be sanitized.
 * @returns {string} The sanitized text.
 */
const filterPII = (text) => {
  // Placeholder: Simple regex for emails and phone numbers. NOT comprehensive.
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRegex = /(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
  // Add more PII patterns as needed (e.g., SSNs, addresses).
  return text
    .replace(emailRegex, '[REDACTED_EMAIL]')
    .replace(phoneRegex, '[REDACTED_PHONE]');
};

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

    // Sanitize the content preview to remove PII before sending it to the model.
    const sanitizedPreview = filterPII(fileContentPreview);

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
${sanitizedPreview}`;

    // Use the Vertex AI model with explicit safety settings.
    const model = vertex_ai.getGenerativeModel({
      // PLATFORM OWNER IMPROVEMENT: Model is sourced from global config for easy system-wide updates.
      model: config.gcp_gemini_model || 'gemini-1.5-flash-preview-0514',
      // Configure Google's safety filters to block harmful content.
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    if (!result.response.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Invalid or empty response from Vertex AI model.');
    }
    const text = cleanJSONResponse(result.response.candidates[0].content.parts[0].text);
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
 * @param {object} [options={}] - The options for the enrichment process.
 * @param {boolean} [options.force=false] - If true, re-enriches documents that already have metadata.
 * @returns {Promise<{ success: boolean, message: string, enrichedCount: number }>} A promise that resolves to an object
 *   indicating the success of the operation, a descriptive message, and the count of newly enriched documents.
 * @throws {Error} If there's a critical failure in listing documents or during the enrichment cycle.
 */
const enrichAllUserDocuments = async (userId, options = { force: false }) => {
  try {
    // List indexed documents from current LlamaIndex corpus
    const docs = await llama.listDocuments(userId);
    if (!docs || docs.length === 0) {
      return { success: true, message: 'No documents in corpus to enrich.', enrichedCount: 0 };
    }

    let enrichedCount = 0;
    for (const doc of docs) {
      const docId = doc.id || doc.docId || doc.id_;
      let shouldEnrich = false;

      // PLATFORM OWNER IMPROVEMENT: Allow forcing re-enrichment of existing documents.
      if (options.force) {
        shouldEnrich = true;
      } else {
        const existing = await DocumentMetadata.findOne({ userId, docId }).lean();
        if (!existing) {
          shouldEnrich = true;
        }
      }

      if (shouldEnrich) {
        await enrichDocument(null, doc.fileName || doc.name || 'unnamed_doc', docId, userId);
        enrichedCount++;
      }
    }

    return {
      success: true,
      message: `Enrichment cycle completed. Analyzed ${docs.length} files. Enriched ${enrichedCount} files.`,
      enrichedCount,
    };
  } catch (err) {
    logger.error(`MetadataAgent enrichAllUserDocuments failed for user ${userId}:`, err);
    throw err;
  }
};

/**
 * =============================================================================
 * PLATFORM OWNER / SUPER ADMIN FEATURES
 * =============================================================================
 */

/**
 * Triggers a metadata enrichment cycle for all active tenants on the platform.
 * This is a resource-intensive operation and should be run by a Platform Owner during off-peak hours.
 *
 * @param {object} [options={}] - The options for the enrichment process.
 * @param {boolean} [options.force=false] - If true, re-enriches documents that already have metadata.
 * @returns {Promise<object>} A summary of the global enrichment task.
 */
const enrichAllPlatformDocuments = async (options = { force: false }) => {
  logger.info(
    `PLATFORM_OWNER_TASK: Starting global document enrichment cycle. Force re-enrichment: ${options.force}`
  );
  const startTime = Date.now();
  let totalTenantsProcessed = 0;
  let totalDocumentsEnriched = 0;
  const failedTenants = [];

  try {
    // Fetch all active tenants to process. This ensures suspended tenants are skipped.
    const activeTenants = await Tenant.find({ status: 'active' }).select('_id name').lean();
    logger.info(`PLATFORM_OWNER_TASK: Found ${activeTenants.length} active tenants to process.`);

    for (const tenant of activeTenants) {
      try {
        logger.info(`PLATFORM_OWNER_TASK: Processing tenant ${tenant.name} (${tenant._id})`);
        const result = await enrichAllUserDocuments(tenant._id.toString(), options);
        totalDocumentsEnriched += result.enrichedCount;
        totalTenantsProcessed++;
      } catch (err) {
        logger.error(
          `PLATFORM_OWNER_TASK: Failed to process tenant ${tenant.name} (${tenant._id}). Error: ${err.message}`
        );
        failedTenants.push({ id: tenant._id, name: tenant.name, error: err.message });
      }
    }

    const duration = (Date.now() - startTime) / 1000; // in seconds
    const summary = {
      success: failedTenants.length === 0,
      message: 'Global enrichment cycle completed.',
      durationSeconds: duration,
      tenantsProcessed: totalTenantsProcessed,
      tenantsFailed: failedTenants.length,
      totalDocumentsEnriched,
      failedTenants,
    };

    logger.info('PLATFORM_OWNER_TASK: Global enrichment summary:', summary);
    return summary;
  } catch (err) {
    logger.error('PLATFORM_OWNER_TASK: A critical error occurred during the global enrichment cycle.', err);
    throw new Error('Global enrichment cycle failed critically.');
  }
};

/**
 * Retrieves platform-wide statistics on document metadata enrichment for global oversight.
 *
 * @returns {Promise<object>} An object containing global and per-tenant statistics.
 */
const getPlatformEnrichmentStatistics = async () => {
  try {
    const totalEnriched = await DocumentMetadata.countDocuments();

    // Aggregation pipeline to count enriched documents per tenant (userId) and join with tenant info.
    const perTenantCounts = await DocumentMetadata.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      {
        $lookup: {
          from: 'tenants', // Assumes the tenant collection is named 'tenants'
          localField: '_id',
          foreignField: '_id',
          as: 'tenantInfo',
        },
      },
      { $unwind: { path: '$tenantInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          tenantId: '$_id',
          tenantName: { $ifNull: ['$tenantInfo.name', 'Unknown/Deleted Tenant'] },
          enrichedDocumentCount: '$count',
        },
      },
    ]);

    return {
      totalEnrichedDocuments: totalEnriched,
      tenantBreakdown: perTenantCounts,
    };
  } catch (err) {
    logger.error('PLATFORM_OWNER_TASK: Failed to retrieve platform enrichment statistics.', err);
    throw new Error('Could not retrieve platform statistics.');
  }
};

/**
 * Retrieves metadata enrichment statistics for a specific tenant, comparing against their live corpus.
 *
 * @param {string} userId The unique identifier for the user/tenant.
 * @returns {Promise<object>} An object containing the statistics for the specified tenant.
 */
const getTenantEnrichmentStatistics = async (userId) => {
  try {
    if (!userId) {
      throw new Error('User ID (tenant ID) is required.');
    }
    const enrichedCount = await DocumentMetadata.countDocuments({ userId });
    const totalDocsInCorpus = (await llama.listDocuments(userId)).length;

    return {
      userId,
      totalDocumentsInCorpus,
      enrichedDocumentCount: enrichedCount,
      unenrichedDocumentCount: totalDocsInCorpus - enrichedCount,
    };
  } catch (err) {
    logger.error(`PLATFORM_OWNER_TASK: Failed to retrieve enrichment statistics for user ${userId}.`, err);
    throw new Error(`Could not retrieve statistics for user ${userId}.`);
  }
};

/**
 * Exports tenant-scoped services for regular application use.
 */
export const metadataAgentService = {
  enrichDocument,
  enrichAllUserDocuments,
};

/**
 * Exports platform-scoped services for Super Admin / Platform Owner use.
 */
export const platformOwnerMetadataService = {
  enrichAllPlatformDocuments,
  getPlatformEnrichmentStatistics,
  getTenantEnrichmentStatistics,
};