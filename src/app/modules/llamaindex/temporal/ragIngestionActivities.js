import { extractTextAndBuildDocuments, saveManifest, loadManifest, nodeToMetadata, Settings } from '../llamaindex.indexer.js';
import { TitleExtractor, KeywordExtractor, IngestionPipeline, MarkdownNodeParser, SentenceWindowNodeParser } from 'llamaindex';
import fsPromises from 'node:fs/promises';
import path from 'path';
import crypto from 'node:crypto';
import { logger } from '../../../../shared/logger.js';
import config from '../../../../../config/index.js';

// This file has been enhanced with Platform Owner features for global oversight,
// tenant management, and system-wide configuration. Key features include:
// - A (mock) Tenant Management Service to control tenant status (active/suspended).
// - A hierarchical configuration system for setting platform-wide and tenant-specific limits.
// - Platform Owner role-based overrides for tenant suspension and resource limits.
// - Structured JSON logging for improved global monitoring, auditing, and analytics.
// - Enhanced security in path generation to ensure strict tenant data isolation.

/**
 * In-memory cache to store and pass complex data structures (like parsed documents or generated nodes)
 * between sequential Temporal activities within a single workflow execution. This avoids the need for
 * serializing and passing large data payloads through the Temporal server, improving performance.
 * The keys are typically namespaced by a unique document ID (`docId`).
 * @type {Map<string, any>}
 */
const activityTransitiveState = new Map();

// #region Platform Owner / Super Admin Features

/**
 * @description Platform Owner Feature: Centralized Tenant Management Service (Mock).
 * In a real-world application, this would connect to a database or a dedicated microservice.
 * It provides a simulated interface for managing tenant status (active/suspended) and
 * retrieving tenant-specific configuration overrides.
 * @property {Map<string, {status: string, config: object}>} _tenants - Simulates a database of tenants.
 */
const tenantManagementService = {
  // Simulates a database of tenant statuses and configurations.
  _tenants: new Map([
    ['tenant-123', { status: 'active', config: { maxDocSizeMb: 25, storageQuotaMb: 500 } }],
    ['tenant-456', { status: 'suspended', config: { maxDocSizeMb: 10, storageQuotaMb: 100 } }],
    ['tenant-789', { status: 'active', config: {} }], // Uses platform defaults
  ]),

  /**
   * Retrieves the current status of a tenant.
   * @param {string} tenantId - The unique identifier for the tenant.
   * @returns {Promise<'active'|'suspended'|'unknown'>} The tenant's status.
   */
  async getTenantStatus(tenantId) {
    const tenant = this._tenants.get(tenantId);
    return tenant ? tenant.status : 'unknown'; // Default to 'unknown' for non-existent tenants
  },

  /**
   * Retrieves the configuration overrides for a specific tenant.
   * @param {string} tenantId - The unique identifier for the tenant.
   * @returns {Promise<object>} The tenant-specific configuration object. Returns an empty object if none exists.
   */
  async getTenantConfig(tenantId) {
    const tenant = this._tenants.get(tenantId);
    return tenant ? tenant.config : {};
  },

  /**
   * @description Platform Owner Feature: Allows a super admin to suspend a tenant, preventing further operations.
   * @permission `platform_owner` (Implicitly, as this is an internal service function)
   * @param {string} tenantId - The ID of the tenant to suspend.
   * @returns {Promise<boolean>} True if the tenant was found and suspended, otherwise false.
   */
  async suspendTenant(tenantId) {
    if (this._tenants.has(tenantId)) {
      this._tenants.get(tenantId).status = 'suspended';
      logger.info({ message: `Tenant ${tenantId} has been suspended by Platform Owner.`, tenantId, audit: true, component: 'TenantManagementService' });
      return true;
    }
    return false;
  },

  /**
   * @description Platform Owner Feature: Allows a super admin to unsuspend a tenant, re-enabling operations.
   * @permission `platform_owner` (Implicitly, as this is an internal service function)
   * @param {string} tenantId - The ID of the tenant to unsuspend.
   * @returns {Promise<boolean>} True if the tenant was found and unsuspended, otherwise false.
   */
  async unsuspendTenant(tenantId) {
    if (this._tenants.has(tenantId)) {
      this._tenants.get(tenantId).status = 'active';
      logger.info({ message: `Tenant ${tenantId} has been unsuspended by Platform Owner.`, tenantId, audit: true, component: 'TenantManagementService' });
      return true;
    }
    return false;
  }
};

/**
 * @description Platform Owner Feature: Hierarchical Configuration Resolver.
 * Merges platform-wide default settings with tenant-specific overrides to produce the
 * final, effective configuration for a given tenant. This enables granular control over resource limits.
 * @param {string} tenantId - The unique identifier for the tenant.
 * @returns {Promise<{maxDocSizeMb: number, storageQuotaMb: number}>} The resolved configuration object.
 */
async function getResolvedConfig(tenantId) {
  const platformDefaults = {
    maxDocSizeMb: config.platform?.limits?.maxDocSizeMb ?? 10, // Default 10MB
    storageQuotaMb: config.platform?.limits?.storageQuotaMb ?? 250, // Default 250MB
  };
  const tenantSpecifics = await tenantManagementService.getTenantConfig(tenantId);
  return { ...platformDefaults, ...tenantSpecifics };
}

/**
 * @description Platform Owner Feature: Centralized and secure tenant data path resolution.
 * Ensures strict data siloing by generating a sanitized, absolute path for a tenant's storage directory.
 * This prevents path traversal attacks and enforces multi-tenant data isolation.
 * @param {string} tenantId - The unique identifier for the tenant.
 * @returns {string} The resolved, secure path to the tenant's storage directory.
 * @throws {Error} If tenantId is missing, invalid, or a path traversal is detected.
 */
function getSafePersistDir(tenantId) {
  if (!tenantId) {
    throw new Error('Security violation: tenantId is required for data operations.');
  }
  const baseDir = path.resolve(config.platform?.storageBasePath ?? 'storage/ragsystem');
  // Sanitize tenantId to prevent directory traversal characters (e.g., '..', '/')
  const sanitizedTenantId = String(tenantId).replace(/[\\/.]/g, '');
  if (!sanitizedTenantId) {
      throw new Error('Security violation: Invalid tenantId provided.');
  }
  const persistDir = path.resolve(baseDir, sanitizedTenantId);

  // Final security check to ensure the resolved path is within the intended base directory.
  if (!persistDir.startsWith(baseDir)) {
    throw new Error('Security violation: Path traversal detected');
  }
  return persistDir;
}

// #endregion

/**
 * @description Resilient Temporal Activity for validating and loading a document buffer.
 * This is the first step in the ingestion pipeline. It performs critical pre-checks, including
 * tenant status (e.g., active, suspended) and file size limits, before proceeding.
 * @permission Requires a valid `tenantId`. A user with the `platform_owner` role can bypass tenant suspension and file size limits.
 * @param {string} filePath - The local path to the uploaded file to be processed.
 * @param {string} originalName - The original filename of the document.
 * @param {string} docId - A unique identifier for this specific document ingestion task.
 * @param {string} tenantId - The identifier for the tenant who owns the document.
 * @param {object} invoker - An object containing information about the user invoking the workflow.
 * @param {'platform_owner'|'user'} invoker.role - The role of the invoker, used for permission checks.
 * @returns {Promise<{success: boolean, sizeBytes: number, filePath: string, originalName: string}>} An object indicating success and returning key file metadata.
 * @throws {Error} If the tenant is suspended, not recognized, or if the file exceeds size limits (and the invoker is not a `platform_owner`).
 */
export async function downloadAndLoadFileActivity(filePath, originalName, docId, tenantId, invoker) {
  const activityName = 'downloadAndLoadFileActivity';
  logger.info({ message: 'Starting document load and validation', activity: activityName, tenantId, docId, originalName, filePath });

  try {
    // Platform Owner Feature: Enforce tenant status and limits with override capability.
    const isPlatformOwner = invoker?.role === 'platform_owner';

    // 1. Check tenant status (e.g., suspended)
    const tenantStatus = await tenantManagementService.getTenantStatus(tenantId);
    if (tenantStatus === 'suspended') {
      if (isPlatformOwner) {
        logger.warn({ message: 'Platform Owner overriding suspension for tenant.', activity: activityName, tenantId, docId, audit: true });
      } else {
        throw new Error(`Operation forbidden: Tenant '${tenantId}' is suspended.`);
      }
    }
    if (tenantStatus === 'unknown') {
        // Policy: Fail for unknown tenants to prevent unauthorized resource usage.
        throw new Error(`Operation forbidden: Tenant '${tenantId}' is not recognized.`);
    }

    // 2. Check and enforce file size limits
    const resolvedConfig = await getResolvedConfig(tenantId);
    const stats = await fsPromises.stat(filePath);
    const fileSizeMb = stats.size / (1024 * 1024);

    if (fileSizeMb > resolvedConfig.maxDocSizeMb) {
      if (isPlatformOwner) {
        logger.warn({ message: 'Platform Owner overriding file size limit for document.', activity: activityName, tenantId, docId, fileSizeMb, limitMb: resolvedConfig.maxDocSizeMb, audit: true });
      } else {
        throw new Error(`File size (${fileSizeMb.toFixed(2)}MB) exceeds the limit of ${resolvedConfig.maxDocSizeMb}MB for tenant '${tenantId}'.`);
      }
    }

    return {
      success: true,
      sizeBytes: stats.size,
      filePath,
      originalName
    };
  } catch (error) {
    logger.error({ message: 'downloadAndLoadFileActivity failed', error: error.message, stack: error.stack, activity: activityName, tenantId, docId });
    throw error;
  }
}

/**
 * @description Resilient Temporal Activity that performs high-fidelity parsing of source files (e.g., HTML) into clean Markdown.
 * The parsed documents are stored in an in-memory cache (`activityTransitiveState`) for the next activity in the workflow.
 * @param {string} filePath - The local path to the file to be parsed.
 * @param {string} originalName - The original filename of the document.
 * @param {string} docId - A unique identifier for this ingestion task.
 * @param {string} tenantId - The identifier for the tenant.
 * @returns {Promise<{success: boolean, documentCount: number, isMarkdown: boolean}>} An object confirming success and providing metadata about the parsed content.
 * @throws {Error} If parsing fails or produces no documents.
 */
export async function parseToMarkdownActivity(filePath, originalName, docId, tenantId) {
  const activityName = 'parseToMarkdownActivity';
  logger.info({ message: 'High-fidelity parsing document', activity: activityName, tenantId, docId, originalName });
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
    logger.error({ message: 'parseToMarkdownActivity failed', error: error.message, stack: error.stack, activity: activityName, tenantId, docId });
    throw error;
  }
}

/**
 * @description Resilient Temporal Activity that chunks the parsed document, enriches it with LLM-generated metadata (title, keywords),
 * and generates vector embeddings using Google's `text-embedding-004` model. The resulting nodes are stored in the
 * in-memory cache (`activityTransitiveState`) for the final commit activity.
 * @param {string} filePath - The local path to the file (used for context, data is loaded from cache).
 * @param {string} originalName - The original filename of the document.
 * @param {string} docId - A unique identifier for this ingestion task.
 * @param {string} tenantId - The identifier for the tenant.
 * @returns {Promise<{success: boolean, nodeCount: number}>} An object confirming success and reporting the number of nodes generated.
 * @throws {Error} If the preceding activity's document state is not found in the cache or if the pipeline fails.
 */
export async function chunkAndEmbedActivity(filePath, originalName, docId, tenantId) {
  const activityName = 'chunkAndEmbedActivity';
  logger.info({ message: 'Segmenting and generating vector embeddings', activity: activityName, tenantId, docId, originalName });
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
      logger.info({ message: 'Using MarkdownNodeParser for structure-aware ingestion.', component: 'IngestionPipeline', tenantId, docId });
    } else {
      transformations.push(new SentenceWindowNodeParser({
        windowSize: 3,
        windowMetadataKey: '_window',
        originalTextMetadataKey: '_original_text',
      }));
      logger.info({ message: 'Using SentenceWindowNodeParser.', component: 'IngestionPipeline', tenantId, docId });
    }

    // 2. High-performance LLM-driven metadata extraction
    try {
      transformations.push(new TitleExtractor({ llm: Settings.llm, nodes: 3 }));
      transformations.push(new KeywordExtractor({ llm: Settings.llm, keywords: 5 }));
      logger.info({ message: 'Metadata TitleExtractor and KeywordExtractor active.', component: 'IngestionPipeline', tenantId, docId });
    } catch (metaErr) {
      logger.warn({ message: 'Metadata extractors configuration warning', error: metaErr.message, component: 'IngestionPipeline', tenantId, docId });
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
    logger.error({ message: 'chunkAndEmbedActivity failed', error: error.message, stack: error.stack, activity: activityName, tenantId, docId });
    throw error;
  }
}

/**
 * @description Resilient Temporal Activity that commits the generated vector nodes to the tenant's vector store
 * and updates the local document manifest. This activity also enforces tenant-level storage quotas.
 * @permission Requires a valid `tenantId`. A user with the `platform_owner` role can bypass storage quota limits.
 * @param {string} filePath - The local path to the file (used for context).
 * @param {string} originalName - The original filename of the document.
 * @param {string} docId - A unique identifier for this ingestion task.
 * @param {string} tenantId - The identifier for the tenant.
 * @param {object} invoker - An object containing information about the user invoking the workflow.
 * @param {'platform_owner'|'user'} invoker.role - The role of the invoker, used for permission checks.
 * @returns {Promise<{success: boolean, vectorStorePath: string, docId: string}>} An object confirming success and providing the path to the updated vector store.
 * @throws {Error} If the preceding activity's node state is not found, if the commit exceeds storage quotas (and the invoker is not a `platform_owner`), or if there's a file system error.
 */
export async function commitToVectorStoreActivity(filePath, originalName, docId, tenantId, invoker) {
  const activityName = 'commitToVectorStoreActivity';
  logger.info({ message: 'Writing index and committing vector storage', activity: activityName, tenantId, docId });
  try {
    const nodes = activityTransitiveState.get(`${docId}_nodes`);
    if (!nodes) {
      throw new Error('Transitive vector nodes state not found.');
    }

    const persistDir = getSafePersistDir(tenantId);
    await fsPromises.mkdir(persistDir, { recursive: true });

    const vectorStorePath = path.join(persistDir, 'vector_store.json');
    let currentNodes = [];
    
    try {
      const fileContent = await fsPromises.readFile(vectorStorePath, 'utf-8');
      const parsed = JSON.parse(fileContent);
      if (Array.isArray(parsed)) {
        currentNodes = parsed;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn({ message: 'Could not read or parse existing vector store, will create new one.', error: err.message, activity: activityName, tenantId, vectorStorePath });
      }
    }

    // RECOMMENDATION: Replace this file-based vector store with a dedicated database solution (e.g., PostgreSQL with pgvector, Chroma, Weaviate)
    // to avoid performance bottlenecks associated with reading/writing large JSON files on every ingestion.

    // Upsert strategy: Clean out any previous nodes matching the same source filename
    const baseNodes = currentNodes.filter(n => n?.metadata?.fileName !== originalName);
    const finalNodes = [...baseNodes, ...nodes.map(nodeToMetadata)];

    // Platform Owner Feature: Enforce storage quota with override capability.
    const isPlatformOwner = invoker?.role === 'platform_owner';
    const resolvedConfig = await getResolvedConfig(tenantId);
    const newStoreContent = JSON.stringify(finalNodes, null, 2);
    const newStoreSizeMb = Buffer.byteLength(newStoreContent, 'utf8') / (1024 * 1024);

    if (newStoreSizeMb > resolvedConfig.storageQuotaMb) {
      if (isPlatformOwner) {
        logger.warn({ message: 'Platform Owner overriding storage quota for tenant.', activity: activityName, tenantId, newStoreSizeMb, limitMb: resolvedConfig.storageQuotaMb, audit: true });
      } else {
        throw new Error(`Commit failed: Adding this document would exceed the storage quota of ${resolvedConfig.storageQuotaMb}MB for tenant '${tenantId}'.`);
      }
    }

    // Commit back to local storage
    await fsPromises.writeFile(vectorStorePath, newStoreContent, 'utf-8');

    // Update the knowledge bank manifest
    const manifest = await loadManifest(persistDir) || {};
    manifest.documents = manifest.documents?.filter(d => d && (d.docId !== docId && d.fileName !== originalName)) || [];

    manifest.documents.push({
      docId,
      fileName: originalName,
      fileSize: nodes.reduce((sum, n) => sum + (n.text?.length || 0), 0),
      isProcessed: true,
      processingStatus: 'completed',
      processedAt: new Date().toISOString(),
      chunkCount: nodes.length,
    });

    await saveManifest(persistDir, manifest);
    logger.info({ message: 'Ingestion committed successfully. Manifest registered.', activity: activityName, tenantId, docId, nodeCount: nodes.length });

    // Clear active memory structures
    activityTransitiveState.delete(`${docId}_documents`);
    activityTransitiveState.delete(`${docId}_nodes`);

    return {
      success: true,
      vectorStorePath,
      docId
    };
  } catch (error) {
    logger.error({ message: 'commitToVectorStoreActivity failed', error: error.message, stack: error.stack, activity: activityName, tenantId, docId });
    throw error;
  }
}

/**
 * @description Saga Compensating Rollback Activity to safely purge corrupt or partially ingested vector segments
 * and revert state registers in the event of a workflow failure. This ensures data consistency.
 * @param {string} filePath - The local path to the file (used for context).
 * @param {string} originalName - The original filename of the document to be purged.
 * @param {string} docId - The unique identifier of the failed ingestion task.
 * @param {string} tenantId - The identifier for the tenant whose data needs cleanup.
 * @returns {Promise<{success: boolean, docId: string, reverted: boolean}>} An object confirming the rollback was successful.
 * @throws {Error} If the compensating transaction itself fails.
 */
export async function cleanupFailedIngestionActivity(filePath, originalName, docId, tenantId) {
  const activityName = 'cleanupFailedIngestionActivity';
  logger.warn({ message: 'Reverting RAG vectors and purging records', activity: activityName, saga: true, tenantId, docId });
  try {
    const persistDir = getSafePersistDir(tenantId);
    const vectorStorePath = path.join(persistDir, 'vector_store.json');

    // Revert nodes from vector store JSON
    try {
      const fileContent = await fsPromises.readFile(vectorStorePath, 'utf-8');
      const currentNodes = JSON.parse(fileContent);

      if (Array.isArray(currentNodes)) {
        const cleanedNodes = currentNodes.filter(n => n?.metadata?.fileName !== originalName && n?.metadata?.docId !== docId);
        await fsPromises.writeFile(vectorStorePath, JSON.stringify(cleanedNodes, null, 2), 'utf-8');
        logger.info({ message: 'Successfully purged transaction records from vector store.', activity: activityName, saga: true, tenantId, docId });
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        logger.info({ message: 'Vector store file does not exist, no cleanup needed.', activity: activityName, saga: true, tenantId });
      } else {
        logger.warn({ message: 'Could not revert vector store database records.', error: err.message, activity: activityName, saga: true, tenantId });
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
        logger.info({ message: 'Reverted document index manifest registers to failed state.', activity: activityName, saga: true, tenantId, docId });
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
    logger.error({ message: 'Compensating transaction failed', error: error.message, stack: error.stack, activity: activityName, saga: true, tenantId, docId });
    throw error;
  }
}