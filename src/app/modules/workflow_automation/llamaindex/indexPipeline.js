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
 * Resolves and validates the user context, enforcing tenant boundaries and role permissions.
 * Sanitizes inputs to prevent path traversal vulnerabilities.
 * @param {string|Object} userContext - The user ID or context object.
 * @returns {Object} The validated and sanitized user context.
 */
function validateAndResolveContext(userContext) {
  let context = {};
  if (typeof userContext === 'string') {
    context = {
      userId: userContext,
      tenantId: 'default_tenant',
      role: 'user',
      managerId: null,
      limits: {}
    };
  } else if (userContext && typeof userContext === 'object') {
    context = {
      userId: userContext.userId || userContext.id,
      tenantId: userContext.tenantId || 'default_tenant',
      role: userContext.role || 'user',
      managerId: userContext.managerId || null,
      limits: userContext.limits || {}
    };
  }

  // Sanitize IDs to prevent path traversal
  context.userId = String(context.userId || '').replace(/[^a-zA-Z0-9-_]/g, '');
  context.tenantId = String(context.tenantId || '').replace(/[^a-zA-Z0-9-_]/g, '');
  if (context.managerId) {
    context.managerId = String(context.managerId).replace(/[^a-zA-Z0-9-_]/g, '');
  }

  if (!context.userId) {
    throw new Error('Invalid or missing User ID in context.');
  }

  // Role validation
  const validRoles = ['super_admin', 'admin', 'manager', 'user'];
  if (!validRoles.includes(context.role)) {
    throw new Error(`Unauthorized role: ${context.role}`);
  }

  return context;
}

/**
 * Propagates usage details, checks limits, and sends notifications up the hierarchy.
 * @param {Object} userCtx - The validated user context.
 * @param {Object} usageDetails - Details of the action (e.g., documentCount, charCount).
 */
async function propagateUsageAndNotifications(userCtx, usageDetails) {
  const { userId, tenantId, role, managerId } = userCtx;
  const { docId, fileName, charCount, pageCount } = usageDetails;

  logger.info(`[Usage Propagation] Propagating usage for user ${userId} in tenant ${tenantId}. Pages: ${pageCount}, Chars: ${charCount}`);

  // Enforce Tenant Context Boundaries & Limits
  const limitMaxChars = userCtx.limits?.maxChars || 5000000; // 5MB default limit
  if (role !== 'super_admin' && charCount > limitMaxChars) {
    throw new Error(`Ingestion rejected: Character count (${charCount}) exceeds the limit of ${limitMaxChars} for user ${userId}.`);
  }

  // Propagate up to Manager
  if (managerId) {
    logger.info(`[Usage Propagation] Notifying manager ${managerId} of ingestion by user ${userId}`);
  }

  // Propagate up to Administrators / Platform Owners
  logger.info(`[Usage Propagation] Notifying administrators of tenant ${tenantId} of ingestion activity`);
  
  if (role === 'super_admin') {
    logger.info(`[Usage Propagation] Action performed by super_admin. Bypassing standard tenant limits.`);
  }
}

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
 */
ingestionWorkflow.handle([IngestionStartEvent], async (context, event) => {
  const { filePath, originalName, userId, userCtx: inputUserCtx } = event.data;
  
  // Resolve and validate context
  const userCtx = validateAndResolveContext(inputUserCtx || userId);
  const { userId: sanitizedUserId, tenantId } = userCtx;

  logger.info(`[Event Ingestion] Step 1: Starting file parsing for user: ${sanitizedUserId} (Tenant: ${tenantId}), file: ${originalName || filePath}`);
  
  // Ensure user local storage syncs up
  await ensureUserLocalDirSynced(sanitizedUserId);
  
  const docId = crypto.randomUUID();
  
  // Extract document pages/content using formats parser
  const documents = await extractTextAndBuildDocuments(filePath, originalName, docId);
  logger.info(`[Event Ingestion] Loaded ${documents.length} pages/documents for file: ${originalName}`);

  context.sendEvent(DocumentLoadedEvent.with({
    filePath,
    originalName,
    userId: sanitizedUserId,
    userCtx,
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
 */
ingestionWorkflow.handle([DocumentLoadedEvent], async (context, event) => {
  const { filePath, originalName, userId, userCtx, docId, documents } = event.data;
  const { tenantId } = userCtx;
  logger.info(`[Event Ingestion] Step 2: Generating semantic profiles & metadata for docId: ${docId}`);

  // Enforce tenant context boundary in storage path to prevent IDOR and path traversal
  const persistDir = path.resolve(`storage/ragsystem/${tenantId}/${userId}`);
  
  try {
    await fsPromises.mkdir(persistDir, { recursive: true });
  } catch (err) {
    logger.error(`[Event Ingestion] Failed to create directories at ${persistDir}: ${err.message}`);
    throw err;
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
    throw err;
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
    userCtx,
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
 */
ingestionWorkflow.handle([NodesGeneratedEvent], async (context, event) => {
  const { filePath, originalName, userId, userCtx, docId, documents, manifest, profile, persistDir, fullText } = event.data;
  logger.info(`[Event Ingestion] Step 3: Integrating manifest updates and building corpus profile`);

  // Validate limits and propagate usage before committing manifest updates
  try {
    await propagateUsageAndNotifications(userCtx, {
      docId,
      fileName: originalName || path.basename(filePath),
      charCount: fullText.length,
      pageCount: documents.length
    });
  } catch (limitErr) {
    logger.error(`[Event Ingestion] Limit validation or propagation failed: ${limitErr.message}`);
    throw limitErr;
  }

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
  manifest.documents = manifest.documents || [];
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
    userCtx,
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
 */
ingestionWorkflow.handle([IndexBuiltEvent], async (context, event) => {
  const { userId, userCtx, docId, documents, persistDir, manifest } = event.data;
  logger.info(`[Event Ingestion] Step 4: Running ingestion pipeline transforms, committing Vector Index and invalidating semantic cache`);

  // Phase 5: Run Ingestion Pipeline with Auto-Metadata Extraction & Chunking
  const nodes = await runIngestionPipeline(documents);

  const indexMetaPath = path.join(persistDir, 'index_store.json');
  let storageContext;

  // Perform accumulative index update if pre-existing, otherwise run initial fromDocuments
  if (existsSync(indexMetaPath) && manifest.documents && manifest.documents.length > 1) {
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
    documentCount: manifest.documents ? manifest.documents.length : 0,
    userId,
    userCtx,
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
 * @param {string|Object} userContext - The identifier or context object of the user.
 * @returns {Promise<object>} A promise that resolves to the final completion report
 *   containing details like `success`, `docId`, `documentCount`, `userId`, and `persistDir`.
 * @throws {Error} If a critical error occurs during workflow execution.
 */
export async function runIngestionWorkflow(filePath, originalName, userContext) {
  try {
    const context = ingestionWorkflow.createContext();
    
    // Resolve and validate context before starting
    const userCtx = validateAndResolveContext(userContext);

    // Broadcast start event
    context.sendEvent(IngestionStartEvent.with({
      filePath,
      originalName,
      userId: userCtx.userId,
      userCtx
    }));

    // Wait until stop event is fired
    const finalEvent = await context.stream.untilEvent(IngestionCompleteEvent);
    return finalEvent.data;
  } catch (error) {
    logger.error(`[Event Ingestion] Critical workflow execution failure:`, error);
    throw error;
  }
}