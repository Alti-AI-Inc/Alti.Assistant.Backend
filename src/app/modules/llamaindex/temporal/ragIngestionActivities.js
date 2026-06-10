import { extractTextAndBuildDocuments, saveManifest, loadManifest, nodeToMetadata, Settings } from '../llamaindex.indexer.js';
import { TitleExtractor, KeywordExtractor, IngestionPipeline, MarkdownNodeParser, SentenceWindowNodeParser } from 'llamaindex';
import fsPromises from 'node:fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import { logger } from '../../../../shared/logger.js';
import config from '../../../../../config/index.js';

// Cache in-memory active node structures to bridge workflow states durably
const activityTransitiveState = new Map();

/**
 * Helper to resolve a safe, non-traversable persistence directory for a user
 */
function getSafePersistDir(userId) {
  const baseDir = path.resolve('storage/ragsystem');
  const persistDir = path.resolve(baseDir, String(userId));
  if (!persistDir.startsWith(baseDir)) {
    throw new Error('Security violation: Path traversal detected');
  }
  return persistDir;
}

/**
 * Resilient Temporal Activity validating and loading document buffer
 */
export async function downloadAndLoadFileActivity(filePath, originalName, docId) {
  logger.info(`[Temporal Activity] Loading document: ${originalName} (ID: ${docId})`);
  try {
    // OPTIMIZATION: Replaced sync existsSync with an async fsPromises.stat call.
    // The function's try/catch block will handle the error if the file does not exist,
    // preventing event loop blocking and simplifying the code.
    const stats = await fsPromises.stat(filePath);
    return {
      success: true,
      sizeBytes: stats.size,
      filePath,
      originalName
    };
  } catch (error) {
    logger.error(`[Temporal Activity] downloadAndLoadFileActivity failed: ${error.message}`);
    throw error;
  }
}

/**
 * Resilient Temporal Activity running high-fidelity HTML-to-Markdown conversions for technical structured data
 */
export async function parseToMarkdownActivity(filePath, originalName, docId) {
  logger.info(`[Temporal Activity] High-fidelity parsing document: ${originalName}`);
  try {
    const documents = await extractTextAndBuildDocuments(filePath, originalName, docId);
    if (!documents || documents.length === 0) {
      throw new Error('Parsing produced no document instances.');
    }
    
    // Store parsed documents transiently in the active coordinator state
    activityTransitiveState.set(`${docId}_documents`, documents);
    
    return {
      success: true,
      documentCount: documents.length,
      isMarkdown: documents.some(d => d.metadata?.useMarkdownParser)
    };
  } catch (error) {
    logger.error(`[Temporal Activity] parseToMarkdownActivity failed: ${error.message}`);
    throw error;
  }
}

/**
 * Resilient Temporal Activity chunking document, enriching it with Gemini metadata, and generating text-embedding-004 vectors
 */
export async function chunkAndEmbedActivity(filePath, originalName, docId, userId) {
  logger.info(`[Temporal Activity] Segmenting and generating vector embeddings for: ${originalName} (User: ${userId})`);
  try {
    const documents = activityTransitiveState.get(`${docId}_documents`);
    if (!documents) {
      throw new Error('Transitive document states not found. Ensure activities are run sequentially.');
    }

    const hasMarkdown = documents.some(d => d.metadata?.useMarkdownParser);
    const transformations = [];

    // 1. Structure-aware Node Parser
    if (hasMarkdown) {
      transformations.push(new MarkdownNodeParser());
      logger.info('[Temporal Ingest Pipeline] Using MarkdownNodeParser for structure-aware advanced ingestion.');
    } else {
      transformations.push(new SentenceWindowNodeParser({
        windowSize: 3,
        windowMetadataKey: '_window',
        originalTextMetadataKey: '_original_text',
      }));
      logger.info('[Temporal Ingest Pipeline] Using SentenceWindowNodeParser.');
    }

    // 2. High-performance LLM-driven metadata extraction
    try {
      transformations.push(new TitleExtractor({ llm: Settings.llm, nodes: 3 }));
      transformations.push(new KeywordExtractor({ llm: Settings.llm, keywords: 5 }));
      logger.info('[Temporal Ingest Pipeline] Metadata TitleExtractor and KeywordExtractor active.');
    } catch (metaErr) {
      logger.warn(`[Temporal Ingest Pipeline] Metadata extractors configuration warning: ${metaErr.message}`);
    }

    // 3. Vector Embedding generation via text-embedding-004
    transformations.push(Settings.embedModel);

    const pipeline = new IngestionPipeline({ transformations });
    const nodes = await pipeline.run({ documents });

    // Store generated nodes in transitive state
    activityTransitiveState.set(`${docId}_nodes`, nodes);

    return {
      success: true,
      nodeCount: nodes.length
    };
  } catch (error) {
    logger.error(`[Temporal Activity] chunkAndEmbedActivity failed: ${error.message}`);
    throw error;
  }
}

/**
 * Resilient Temporal Activity committing vector nodes and aligning local document manifest registers
 */
export async function commitToVectorStoreActivity(filePath, originalName, docId, userId) {
  logger.info(`[Temporal Activity] Writing index and committing vector storage to Disk for document ID: ${docId}`);
  try {
    const nodes = activityTransitiveState.get(`${docId}_nodes`);
    if (!nodes) {
      throw new Error('Transitive vector nodes state not found.');
    }

    const persistDir = getSafePersistDir(userId);
    await fsPromises.mkdir(persistDir, { recursive: true });

    const vectorStorePath = path.join(persistDir, 'vector_store.json');
    let currentNodes = [];
    
    // OPTIMIZATION: Replaced sync existsSync with a try-catch around the async readFile.
    // This avoids blocking the event loop and simplifies the logic for handling a non-existent file.
    try {
      const fileContent = await fsPromises.readFile(vectorStorePath, 'utf-8');
      const parsed = JSON.parse(fileContent);
      if (Array.isArray(parsed)) {
        currentNodes = parsed;
      }
    } catch (err) {
      // If the file doesn't exist (ENOENT) or is invalid JSON, we start with an empty array, which is the desired behavior.
      if (err.code !== 'ENOENT') {
        logger.warn(`[Temporal Activity] Could not read or parse existing vector store at ${vectorStorePath}: ${err.message}`);
      }
    }

    // PERFORMANCE_WARNING: The following operations (reading a potentially large JSON file, filtering it in memory,
    // and writing it back) are a major performance bottleneck and will not scale.
    // As the vector store grows, this read-modify-write cycle will consume significant memory and CPU,
    // leading to slow ingestion times. The .filter() and .map() operations are synchronous and will block
    // the event loop for the duration of their execution on a large array.
    // RECOMMENDATION: Replace this file-based vector store with a dedicated database solution like
    // a vector database (e.g., Chroma, Weaviate, Pinecone) or a traditional database with vector support (e.g., PostgreSQL with pgvector).
    // This would allow for efficient indexed queries and atomic upsert operations without loading the entire dataset into memory.

    // Upsert strategy: Clean out any previous nodes matching the same source filename
    const baseNodes = currentNodes.filter(n => n?.metadata?.fileName !== originalName);
    const finalNodes = [...baseNodes, ...nodes.map(nodeToMetadata)];

    // Commit back to local storage
    await fsPromises.writeFile(vectorStorePath, JSON.stringify(finalNodes, null, 2), 'utf-8');

    // Update the knowledge bank manifest
    const manifest = await loadManifest(persistDir) || {};
    if (!manifest.documents || !Array.isArray(manifest.documents)) {
      manifest.documents = [];
    }
    const existingDocIdx = manifest.documents.findIndex(d => d && (d.docId === docId || d.fileName === originalName));

    const docRecord = {
      docId,
      fileName: originalName,
      fileSize: nodes.reduce((sum, n) => sum + (n.text?.length || 0), 0),
      isProcessed: true,
      processingStatus: 'completed',
      processedAt: new Date().toISOString(),
      chunkCount: nodes.length,
      profile: {
        summary: 'Resiliently indexed via Temporal.',
        topics: ['Temporal', 'LlamaIndex', 'RAG']
      }
    };

    if (existingDocIdx > -1) {
      manifest.documents[existingDocIdx] = docRecord;
    } else {
      manifest.documents.push(docRecord);
    }

    await saveManifest(persistDir, manifest);
    logger.info(`[Temporal Activity] Ingestion committed successfully. Manifest registered.`);

    // Clear active memory structures
    activityTransitiveState.delete(`${docId}_documents`);
    activityTransitiveState.delete(`${docId}_nodes`);

    return {
      success: true,
      vectorStorePath,
      docId
    };
  } catch (error) {
    logger.error(`[Temporal Activity] commitToVectorStoreActivity failed: ${error.message}`);
    throw error;
  }
}

/**
 * Saga Compensating Rollback Activity to safely purge corrupt vector segments and revert state registers
 */
export async function cleanupFailedIngestionActivity(filePath, originalName, docId, userId) {
  logger.warn(`[Temporal Saga Compensating Activity] Reverting RAG vectors and purging records for document ID: ${docId}`);
  try {
    const persistDir = getSafePersistDir(userId);
    const vectorStorePath = path.join(persistDir, 'vector_store.json');

    // Revert nodes from vector store JSON
    // OPTIMIZATION: Replaced sync existsSync with a try-catch around the async readFile.
    // This avoids blocking the event loop and handles file-not-found cases gracefully.
    try {
      const fileContent = await fsPromises.readFile(vectorStorePath, 'utf-8');
      const currentNodes = JSON.parse(fileContent);

      // PERFORMANCE_WARNING: This read-modify-write pattern on a potentially large JSON file is a performance bottleneck.
      // See the recommendation in `commitToVectorStoreActivity`. This operation will become increasingly slow as the store grows.
      if (Array.isArray(currentNodes)) {
        const cleanedNodes = currentNodes.filter(n => n?.metadata?.fileName !== originalName && n?.metadata?.docId !== docId);
        await fsPromises.writeFile(vectorStorePath, JSON.stringify(cleanedNodes, null, 2), 'utf-8');
        logger.info('[Temporal Saga] Successfully purged transaction records from vector store.');
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        // File doesn't exist, so there's nothing to clean up. This is not an error.
        logger.info('[Temporal Saga] Vector store file does not exist, no cleanup needed.');
      } else {
        // Log other errors, e.g., JSON parsing errors.
        logger.warn(`[Temporal Saga] Could not revert vector store database records: ${err.message}`);
      }
    }

    // Revert document manifests
    const manifest = await loadManifest(persistDir);
    if (manifest && Array.isArray(manifest.documents)) {
      const existingDocIdx = manifest.documents.findIndex(d => d && (d.docId === docId || d.fileName === originalName));
      if (existingDocIdx > -1) {
        manifest.documents[existingDocIdx].processingStatus = 'failed';
        manifest.documents[existingDocIdx].isProcessed = false;
        manifest.documents[existingDocIdx].processingError = 'Temporal execution crashed, transaction rolled back.';
        await saveManifest(persistDir, manifest);
        logger.info('[Temporal Saga] Reverted document index manifest registers to failed state.');
      }
    }

    // Purge transitional memory cache
    activityTransitiveState.delete(`${docId}_documents`);
    activityTransitiveState.delete(`${docId}_nodes`);

    return {
      success: true,
      docId,
      reverted: true
    };
  } catch (error) {
    logger.error(`[Temporal Saga] Compensating transaction failed: ${error.message}`);
    throw error;
  }
}