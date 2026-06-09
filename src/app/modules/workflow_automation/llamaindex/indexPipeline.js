/**
 * @file This module defines an event-driven ingestion workflow for processing documents
 * and building LlamaIndex-based vector, summary, and keyword indexes.
 * It orchestrates a multi-step process from file loading and parsing to
 * metadata enrichment, manifest management, and final index creation,
 * including cache invalidation.
 * @module workflow_automation/llamaindex/indexPipeline
 */

import { createWorkflow } from '@llamaindex/workflow-core';
import {
  IngestionStartEvent,
  DocumentLoadedEvent,
  NodesGeneratedEvent,
  IndexBuiltEvent,
  IngestionCompleteEvent
} from './events.js';
import {
  VectorStoreIndex,
  storageContextFromDefaults,
  SummaryIndex,
  KeywordTableIndex
} from 'llamaindex';
import {
  ensureUserLocalDirSynced,
  extractTextAndBuildDocuments,
  loadManifest,
  saveManifest,
  generateDocumentProfile,
  generateCorpusProfile,
  userIndexCache,
  semanticCache,
  runIngestionPipeline
} from '../../llamaindex/llamaindex.indexer.js';
import { logger } from '../../../../shared/logger.js';
import path from 'path';
import crypto from 'node:crypto';
import fsPromises from 'node:fs/promises';
import { existsSync } from 'node:fs';

/**
 * The core event-driven ingestion workflow instance.
 * This workflow orchestrates the entire document processing and indexing pipeline
 * by reacting to specific events and emitting new ones to trigger subsequent steps.
 * @type {Workflow}
 */
const ingestionWorkflow = createWorkflow();

/**
 * Step 1: File Loading & Document Parsing.
 * This handler initiates the document ingestion process by parsing the raw file
 * content into a structured document format. It ensures the user's local
 * storage directory is synchronized and generates a unique document ID.
 *
 * @event IngestionStartEvent - Triggered when a new ingestion process begins.
 * @fires DocumentLoadedEvent - Emitted upon successful parsing of the document.
 *
 * @param {WorkflowContext} context - The workflow context for sending events.
 * @param {Object} event - The event object containing data for this step.
 * @param {Object} event.data - The data payload of the IngestionStartEvent.
 * @param {string} event.data.filePath - The local path to the file to be ingested.
 * @param {string} event.data.originalName - The original name of the file.
 * @param {string} event.data.userId - The ID of the user initiating the ingestion.
 */
ingestionWorkflow.handle([IngestionStartEvent], async (context, event) => {
  const { filePath, originalName, userId } = event.data;
  logger.info(`[Event Ingestion] Step 1: Starting file parsing for user: ${userId}, file: ${originalName || filePath}`);
  
  // Ensure user local storage syncs up
  await ensureUserLocalDirSynced(userId);
  
  const docId = crypto.randomUUID();
  
  // Extract document pages/content using formats parser
  const documents = await extractTextAndBuildDocuments(filePath, originalName, docId);
  logger.info(`[Event Ingestion] Loaded ${documents.length} pages/documents for file: ${originalName}`);

  context.sendEvent(DocumentLoadedEvent.with({
    filePath,
    originalName,
    userId,
    docId,
    documents
  }));
});

/**
 * Step 2: Content Profiling & Metadata Enrichment.
 * This handler takes the parsed documents and generates a semantic profile
 * using an LLM, enriching the document metadata. It also ensures the
 * persistence directory for the user exists.
 *
 * @event DocumentLoadedEvent - Triggered after documents have been successfully loaded and parsed.
 * @fires NodesGeneratedEvent - Emitted after document profiling and metadata enrichment are complete.
 *
 * @param {WorkflowContext} context - The workflow context for sending events.
 * @param {Object} event - The event object containing data for this step.
 * @param {Object} event.data - The data payload of the DocumentLoadedEvent.
 * @param {string} event.data.filePath - The local path to the ingested file.
 * @param {string} event.data.originalName - The original name of the ingested file.
 * @param {string} event.data.userId - The ID of the user.
 * @param {string} event.data.docId - The unique identifier for the document.
 * @param {Document[]} event.data.documents - An array of LlamaIndex Document objects.
 */
ingestionWorkflow.handle([DocumentLoadedEvent], async (context, event) => {
  const { filePath, originalName, userId, docId, documents } = event.data;
  logger.info(`[Event Ingestion] Step 2: Generating semantic profiles & metadata for docId: ${docId}`);

  const persistDir = path.resolve(`storage/ragsystem/${userId}`);
  
  try {
    await fsPromises.mkdir(persistDir, { recursive: true });
  } catch (err) {
    logger.error(`[Event Ingestion] Failed to create directories at ${persistDir}: ${err.message}`);
  }

  // Load existing manifest
  const manifest = await loadManifest(persistDir);

  // Generate per-document summary profile
  const fullText = documents.map(d => d.getText()).join('\n\n');
  logger.info('[Event Ingestion] Compiling document profile summary with Gemini LLM...');
  
  const profile = await generateDocumentProfile(fullText);
  logger.info(`[Event Ingestion] Document profile compiled successfully.`);

  // Write profile record to storage
  const profilePath = path.join(persistDir, `profile_${docId}.json`);
  try {
    await fsPromises.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
  } catch (err) {
    logger.error(`[Event Ingestion] Failed to write profile ${docId} to disk: ${err.message}`);
  }

  // Inject profile metadata into all documents
  for (const doc of documents) {
    doc.metadata = {
      ...doc.metadata,
      docSummary: profile.summary,
      docTopics: profile.topics.join(', ')
    };
  }

  context.sendEvent(NodesGeneratedEvent.with({
    filePath,
    originalName,
    userId,
    docId,
    documents,
    manifest,
    profile,
    persistDir,
    fullText
  }));
});

/**
 * Step 3: Manifest Management & Legacy Syncing.
 * This handler updates the user's document manifest with the newly ingested
 * document's details and generates a composite corpus profile if multiple
 * documents exist. It also handles legacy profile saving.
 *
 * @event NodesGeneratedEvent - Triggered after document profiling and metadata enrichment.
 * @fires IndexBuiltEvent - Emitted after manifest updates and corpus profiling are complete.
 *
 * @param {WorkflowContext} context - The workflow context for sending events.
 * @param {Object} event - The event object containing data for this step.
 * @param {Object} event.data - The data payload of the NodesGeneratedEvent.
 * @param {string} event.data.filePath - The local path to the ingested file.
 * @param {string} event.data.originalName - The original name of the ingested file.
 * @param {string} event.data.userId - The ID of the user.
 * @param {string} event.data.docId - The unique identifier for the document.
 * @param {Document[]} event.data.documents - An array of LlamaIndex Document objects.
 * @param {Object} event.data.manifest - The current document manifest.
 * @param {Object} event.data.profile - The generated profile for the current document.
 * @param {string} event.data.persistDir - The directory where data is persisted for the user.
 * @param {string} event.data.fullText - The full concatenated text of the document.
 */
ingestionWorkflow.handle([NodesGeneratedEvent], async (context, event) => {
  const { filePath, originalName, userId, docId, documents, manifest, profile, persistDir, fullText } = event.data;
  logger.info(`[Event Ingestion] Step 3: Integrating manifest updates and building corpus profile`);

  // Add document entry to manifest list
  const docEntry = {
    docId,
    fileName: originalName || path.basename(filePath),
    fileType: path.extname(originalName || filePath).toLowerCase().replace('.', ''),
    pageCount: documents.length,
    charCount: fullText.length,
    profile,
    indexedAt: new Date().toISOString()
  };
  manifest.documents.push(docEntry);

  // Generate composite corpus profile if multi-document RAG setup
  if (manifest.documents.length > 1) {
    logger.info('[Event Ingestion] Generating composite corpus profile across all documents...');
    manifest.corpusProfile = await generateCorpusProfile(manifest);
  } else {
    manifest.corpusProfile = profile;
  }

  // Save the manifest file
  await saveManifest(persistDir, manifest);

  // Legacy compatibility profile save
  const legacyProfilePath = path.join(persistDir, 'document_profile.json');
  try {
    await fsPromises.writeFile(legacyProfilePath, JSON.stringify(manifest.corpusProfile, null, 2), 'utf-8');
  } catch (err) {
    logger.error(`[Event Ingestion] Legacy profile sync failed: ${err.message}`);
  }

  context.sendEvent(IndexBuiltEvent.with({
    userId,
    docId,
    documents,
    persistDir,
    manifest
  }));
});

/**
 * Step 4: Triple Index Creation & Cache Invalidation.
 * This final handler runs the LlamaIndex ingestion pipeline to transform documents
 * into nodes, creates or updates the vector store index, and compiles secondary
 * memory-based indexes (Summary and Keyword). It also invalidates the user's
 * semantic response cache to reflect the corpus modifications.
 *
 * @event IndexBuiltEvent - Triggered after manifest updates and corpus profiling.
 * @fires IngestionCompleteEvent - Emitted as the final stop event, signaling the completion of the ingestion workflow.
 *
 * @param {WorkflowContext} context - The workflow context for sending events.
 * @param {Object} event - The event object containing data for this step.
 * @param {Object} event.data - The data payload of the IndexBuiltEvent.
 * @param {string} event.data.userId - The ID of the user.
 * @param {string} event.data.docId - The unique identifier for the document.
 * @param {Document[]} event.data.documents - An array of LlamaIndex Document objects.
 * @param {string} event.data.persistDir - The directory where data is persisted for the user.
 * @param {Object} event.data.manifest - The current document manifest.
 * @returns {IngestionCompleteEvent} The final completion report event.
 */
ingestionWorkflow.handle([IndexBuiltEvent], async (context, event) => {
  const { userId, docId, documents, persistDir, manifest } = event.data;
  logger.info(`[Event Ingestion] Step 4: Running ingestion pipeline transforms, committing Vector Index and invalidating semantic cache`);

  // Phase 5: Run Ingestion Pipeline with Auto-Metadata Extraction & Chunking
  const nodes = await runIngestionPipeline(documents);

  const indexMetaPath = path.join(persistDir, 'index_store.json');
  let storageContext;

  // Perform accumulative index update if pre-existing, otherwise run initial fromDocuments
  if (existsSync(indexMetaPath) && manifest.documents.length > 1) {
    logger.info('[Event Ingestion] Accumulative mode: inserting nodes into existing vector store...');
    storageContext = await storageContextFromDefaults({ persistDir });
    const existingIndex = await VectorStoreIndex.init({ storageContext });
    
    for (const node of nodes) {
      await existingIndex.insert(node);
    }
  } else {
    logger.info('[Event Ingestion] Creating fresh vector index for user from transformed nodes...');
    storageContext = await storageContextFromDefaults({ persistDir });
    await VectorStoreIndex.fromDocuments(nodes, { storageContext });
  }

  // Compile secondary memory-based indexes (Summary + Keyword)
  try {
    logger.info('[Event Ingestion] Compiling memory-based secondary indexes...');
    const summaryIdx = await SummaryIndex.fromDocuments(nodes);
    let keywordIdx = null;
    try {
      keywordIdx = await KeywordTableIndex.fromDocuments(nodes);
    } catch (kwErr) {
      logger.warn(`[Event Ingestion] Keyword Index creation skipped (non-fatal): ${kwErr.message}`);
    }

    // Cache them in memory for current active user context
    const existing = userIndexCache.get(userId) || {};
    userIndexCache.set(userId, {
      summaryIndex: summaryIdx || existing.summaryIndex,
      keywordIndex: keywordIdx || existing.keywordIndex,
    });
    logger.info('[Event Ingestion] Secondary memory indexes successfully cached.');
  } catch (err) {
    logger.error(`[Event Ingestion] Secondary index compilation failed (non-fatal): ${err.message}`);
  }

  // Invalidate user semantic response cache to reflect corpus modifications
  semanticCache.invalidateUser(userId);
  logger.info(`[Event Ingestion] Invalidated semantic query cache for user ${userId}. Ingestion finished.`);

  // Return final stop event data
  return IngestionCompleteEvent.with({
    success: true,
    docId,
    documentCount: manifest.documents.length,
    userId,
    persistDir
  });
});

/**
 * Executes the document ingestion workflow asynchronously.
 * This function initiates the workflow by sending an `IngestionStartEvent`
 * and waits for the `IngestionCompleteEvent` to signal the end of the process.
 *
 * @param {string} filePath - The local or relative file path to the document to ingest.
 * @param {string} originalName - The original filename of the document.
 * @param {string} userId - The identifier of the user for whom the document is being ingested.
 * @returns {Promise<object>} A promise that resolves to the final completion report
 *   containing details like `success`, `docId`, `documentCount`, `userId`, and `persistDir`.
 * @throws {Error} If a critical error occurs during workflow execution.
 */
export async function runIngestionWorkflow(filePath, originalName, userId) {
  try {
    const context = ingestionWorkflow.createContext();
    
    // Broadcast start event
    context.sendEvent(IngestionStartEvent.with({
      filePath,
      originalName,
      userId
    }));

    // Wait until stop event is fired
    const finalEvent = await context.stream.untilEvent(IngestionCompleteEvent);
    return finalEvent.data;
  } catch (error) {
    logger.error(`[Event Ingestion] Critical workflow execution failure:`, error);
    throw error;
  }
}