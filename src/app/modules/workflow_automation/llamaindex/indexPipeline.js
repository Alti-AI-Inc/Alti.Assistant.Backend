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
// OPTIMIZATION: Removed sync file system call 'existsSync' to avoid blocking the event loop.
// import { existsSync } from 'node:fs';

/**
 * Resolves and validates the user context, enforcing tenant boundaries and role permissions.
 * This function is a critical security checkpoint. It ensures that all operations are
 * performed within the correct tenant and with appropriate permissions.
 * @param {Object} userContext - The user context object, which MUST be provided by an authenticated endpoint.
 * @param {string} userContext.userId - The user's unique identifier.
 * @param {string} userContext.tenantId - The tenant/workspace identifier.
 * @param {string} userContext.role - The user's role (e.g., 'admin', 'user').
 * @param {Object} userContext.limits - An object containing usage limits derived from the tenant's subscription plan.
 * @returns {Object} The validated and sanitized user context.
 * @throws {Error} If the context is invalid, incomplete, or fails validation.
 */
function validateAndResolveContext(userContext) {
  // IMPROVEMENT: Enforce that a full context object is passed. Passing only a user ID string
  // is insecure in a multi-tenant environment as it prevents proper validation of tenant,
  // role, and subscription-based limits. The calling service (e.g., API endpoint) is
  // responsible for building this context from the authenticated user's session.
  if (!userContext || typeof userContext !== 'object') {
    throw new Error('A full user context object is required for ingestion.');
  }

  const context = {
    userId: userContext.userId || userContext.id,
    tenantId: userContext.tenantId,
    role: userContext.role,
    managerId: userContext.managerId || null,
    limits: userContext.limits || {}
  };

  // Sanitize IDs to prevent path traversal and other injection attacks.
  context.userId = String(context.userId || '').replace(/[^a-zA-Z0-9-_]/g, '');
  context.tenantId = String(context.tenantId || '').replace(/[^a-zA-Z0-9-_]/g, '');
  if (context.managerId) {
    context.managerId = String(context.managerId).replace(/[^a-zA-Z0-9-_]/g, '');
  }

  // Ensure mandatory fields for security and data isolation are present.
  if (!context.userId || !context.tenantId) {
    throw new Error('Invalid context: User ID and Tenant ID are required.');
  }

  // Validate role against a predefined list to enforce permissions.
  const validRoles = ['super_admin', 'admin', 'manager', 'user'];
  if (!context.role || !validRoles.includes(context.role)) {
    throw new Error(`Unauthorized or missing role: ${context.role}`);
  }

  return context;
}

/**
 * Propagates usage details, checks subscription limits, and sends notifications up the hierarchy.
 * This function enforces business rules defined by the user's subscription plan.
 * @param {Object} userCtx - The validated user context, including limits.
 * @param {Object} usageDetails - Details of the current ingestion (e.g., charCount).
 * @param {Object} manifest - The user's current document manifest for checking cumulative limits.
 * @throws {Error} If any subscription limit is exceeded.
 */
async function propagateUsageAndNotifications(userCtx, usageDetails, manifest) {
  const { userId, tenantId, role, managerId } = userCtx;
  const { charCount } = usageDetails;

  logger.info(`[Usage Propagation] Validating limits for user ${userId} in tenant ${tenantId}.`);

  // Super admins bypass all tenant-level subscription limits.
  if (role === 'super_admin') {
    logger.info(`[Usage Propagation] Action performed by super_admin. Bypassing standard tenant limits.`);
    return;
  }

  // OPTIMIZATION: Implement comprehensive, multi-faceted limit checks based on subscription plan.
  const limits = userCtx.limits || {};
  const existingDocs = manifest.documents || [];

  // 1. Per-file size/character limit.
  const limitMaxCharsPerFile = limits.maxCharsPerFile || 5000000; // 5MB default
  if (charCount > limitMaxCharsPerFile) {
    throw new Error(`Ingestion rejected: File character count (${charCount}) exceeds the per-file limit of ${limitMaxCharsPerFile}.`);
  }

  // 2. Total document count limit.
  const limitMaxDocs = limits.maxDocs || 100; // Default 100 documents
  if (existingDocs.length >= limitMaxDocs) {
    throw new Error(`Ingestion rejected: Document count limit (${limitMaxDocs}) has been reached.`);
  }

  // 3. Total character count limit across all documents.
  const limitMaxTotalChars = limits.maxTotalChars || 25000000; // 25MB default
  const currentTotalChars = existingDocs.reduce((sum, doc) => sum + (doc.charCount || 0), 0);
  if (currentTotalChars + charCount > limitMaxTotalChars) {
    throw new Error(`Ingestion rejected: This document would cause the total character count to exceed the limit of ${limitMaxTotalChars}.`);
  }

  // Placeholder for future notification logic (e.g., email, webhook).
  if (managerId) {
    logger.info(`[Usage Propagation] Notifying manager ${managerId} of ingestion by user ${userId}`);
  }
  logger.info(`[Usage Propagation] Notifying administrators of tenant ${tenantId} of ingestion activity`);
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
  // The userCtx is pre-validated by the runIngestionWorkflow entry function.
  const { filePath, originalName, userCtx } = event.data;
  const { userId, tenantId } = userCtx;

  logger.info(`[Event Ingestion] Step 1: Starting file parsing for user: ${userId} (Tenant: ${tenantId}), file: ${originalName || filePath}`);

  // Ensure user local storage syncs up
  await ensureUserLocalDirSynced(userId);

  const docId = crypto.randomUUID();

  // Extract document pages/content using formats parser
  const documents = await extractTextAndBuildDocuments(filePath, originalName, docId);
  logger.info(`[Event Ingestion] Loaded ${documents.length} pages/documents for file: ${originalName}`);

  context.sendEvent(DocumentLoadedEvent.with({
    filePath,
    originalName,
    userId, // Propagate for convenience in subsequent steps
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

  // Enforce tenant context boundary in storage path to prevent IDOR and path traversal.
  // Data is segregated by tenant, then by user.
  const persistDir = path.resolve(`storage/ragsystem/${tenantId}/${userId}`);

  try {
    await fsPromises.mkdir(persistDir, { recursive: true });
  } catch (err) {
    logger.error(`[Event Ingestion] Failed to create directories at ${persistDir}: ${err.message}`);
    throw err;
  }

  // Load existing manifest to check against limits in the next step.
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
 * Step 3: Limit Enforcement & Manifest Management.
 * This handler validates the ingestion against the user's subscription limits *before*
 * committing any changes. It then updates the user's document manifest with the
 * new document's details and generates a composite corpus profile.
 *
 * @event NodesGeneratedEvent - Triggered after document profiling and metadata enrichment.
 * @fires IndexBuiltEvent - Emitted after manifest updates and corpus profiling are complete.
 */
ingestionWorkflow.handle([NodesGeneratedEvent], async (context, event) => {
  const { filePath, originalName, userId, userCtx, docId, documents, manifest, profile, persistDir, fullText } = event.data;
  logger.info(`[Event Ingestion] Step 3: Enforcing subscription limits and updating manifest`);

  // Validate limits and propagate usage before committing manifest updates.
  // This is a critical checkpoint to prevent overuse of resources.
  try {
    await propagateUsageAndNotifications(userCtx, {
      docId,
      fileName: originalName || path.basename(filePath),
      charCount: fullText.length,
      pageCount: documents.length
    }, manifest); // IMPROVEMENT: Pass the manifest to check cumulative limits.
  } catch (limitErr) {
    logger.error(`[Event Ingestion] Limit validation failed for user ${userId}: ${limitErr.message}`);
    // Propagate the specific limit error to the client.
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

  // OPTIMIZATION: Use async file access to check for index existence without blocking the event loop.
  const indexExists = await fsPromises.access(indexMetaPath, fsPromises.constants.F_OK).then(() => true).catch(() => false);

  // Perform accumulative index update if pre-existing, otherwise run initial fromDocuments
  if (indexExists && manifest.documents && manifest.documents.length > 1) {
    logger.info('[Event Ingestion] Accumulative mode: inserting nodes into existing vector store...');
    storageContext = await storageContextFromDefaults({ persistDir });
    const existingIndex = await VectorStoreIndex.init({ storageContext });

    // OPTIMIZATION: Replaced N+1 style single-node insertion loop with a single batch insert call.
    // This significantly reduces I/O overhead and is more efficient for vector store operations.
    await existingIndex.insertNodes(nodes);

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
 * @param {Object} userContext - The full, validated context object of the user,
 *   typically derived from an authenticated API session. It must include userId,
 *   tenantId, role, and subscription limits.
 * @returns {Promise<object>} A promise that resolves to the final completion report
 *   containing details like `success`, `docId`, `documentCount`, `userId`, and `persistDir`.
 * @throws {Error} If a critical error occurs during workflow execution, such as a limit violation.
 */
export async function runIngestionWorkflow(filePath, originalName, userContext) {
  try {
    // IMPROVEMENT: Validate context at the entry point for a fail-fast approach.
    // This prevents any part of the workflow from running with an invalid context.
    const userCtx = validateAndResolveContext(userContext);

    const context = ingestionWorkflow.createContext();

    // Broadcast start event with the now-validated context.
    context.sendEvent(IngestionStartEvent.with({
      filePath,
      originalName,
      userCtx // Pass the entire validated context object.
    }));

    // Wait until stop event is fired
    const finalEvent = await context.stream.untilEvent(IngestionCompleteEvent);
    return finalEvent.data;
  } catch (error) {
    logger.error(`[Event Ingestion] Critical workflow execution failure for user '${userContext?.userId}': ${error.message}`);
    // Re-throw the error so the calling API can handle it, e.g., by sending a 402 or 429 status code.
    throw error;
  }
}