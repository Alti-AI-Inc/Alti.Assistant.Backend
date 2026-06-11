import { extractTextAndBuildDocuments, saveManifest, loadManifest, nodeToMetadata, Settings } from '../llamaindex.indexer.js';
import { TitleExtractor, KeywordExtractor, IngestionPipeline, MarkdownNodeParser, SentenceWindowNodeParser } from 'llamaindex';
import fsPromises from 'node:fs/promises';
import fs from 'node:fs';
import readline from 'node:readline';
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

// BUG FIX: Removed the global 'activityTransitiveState' map. Using a global variable to pass state
// between Temporal activities is an anti-pattern. Activities can run on different workers and do not
// share memory. State must be passed explicitly by returning data from one activity and passing it
// as an argument to the next in the workflow definition. The signatures of the activities below
// have been updated to reflect this correct, durable pattern. The calling workflow MUST be updated.

// #region Platform Owner / Super Admin Features

/**
 * @typedef {object} InvokerContext
 * @property {string} userId - The unique identifier of the user initiating the action.
 * @property {'platform_owner' | 'admin' | 'manager' | 'user'} role - The role of the user, used for permission checks.
 */

/**
 * @typedef {object} TenantConfig
 * @property {number} [maxDocSizeMb] - The maximum allowed document size in megabytes for this tenant.
 * @property {number} [storageQuotaMb] - The total storage quota in megabytes for this tenant.
 */

/**
 * @typedef {object} UserConfig
 * @property {string} role - The role of the user within the tenant.
 * @property {object} limits - User-specific resource limits.
 * @property {number} [limits.storageQuotaMb] - User's portion of the tenant storage quota.
 * @property {number} [limits.maxDocSizeMb] - User's specific file size limit.
 */

// Platform Owner Feature: Centralized Tenant Management Service (Mock)
// In a real system, this would connect to a database or a dedicated microservice.
// It provides tenant status (active/suspended) and configuration overrides.
const tenantManagementService = {
  // Simulates a database of tenant statuses and configurations.
  _tenants: new Map([
    ['tenant-123', { status: 'active', config: { maxDocSizeMb: 25, storageQuotaMb: 500 } }],
    ['tenant-456', { status: 'suspended', config: { maxDocSizeMb: 10, storageQuotaMb: 100 } }],
    ['tenant-789', { status: 'active', config: {} }], // Uses platform defaults
  ]),

  // HIERARCHY GAP FIX: Mock user data within tenants for role-based access control and limits.
  // This simulates a user directory with role and limit information, enabling hierarchical validation.
  _users: new Map([
    ['tenant-123', new Map([
        ['user-admin-A', { role: 'admin', limits: { storageQuotaMb: 450 } }], // Admin has a large portion of the tenant quota
        ['user-manager-B', { role: 'manager', limits: { storageQuotaMb: 100, maxDocSizeMb: 15 } }],
        ['user-regular-C', { role: 'user', limits: { storageQuotaMb: 20, maxDocSizeMb: 5 } }],
    ])],
    ['tenant-789', new Map([
        ['user-admin-D', { role: 'admin', limits: {} }] // Uses tenant/platform defaults
    ])]
  ]),

  /**
   * Retrieves the current status of a tenant.
   * @param {string} tenantId - The ID of the tenant.
   * @returns {Promise<'active' | 'suspended' | 'unknown'>} The tenant's status.
   */
  async getTenantStatus(tenantId) {
    const tenant = this._tenants.get(tenantId);
    return tenant ? tenant.status : 'unknown'; // Default to 'unknown' for non-existent tenants
  },

  /**
   * Retrieves the configuration for a specific tenant.
   * @param {string} tenantId - The ID of the tenant.
   * @returns {Promise<TenantConfig>} The tenant's configuration object.
   */
  async getTenantConfig(tenantId) {
    const tenant = this._tenants.get(tenantId);
    return tenant ? tenant.config : {};
  },

  /**
   * Retrieves the configuration for a specific user within a tenant.
   * @param {string} tenantId - The ID of the tenant.
   * @param {string} userId - The ID of the user.
   * @returns {Promise<UserConfig|null>} The user's configuration or null if not found.
   */
  async getUserConfig(tenantId, userId) {
    const tenantUsers = this._users.get(tenantId);
    if (!tenantUsers) return null;
    return tenantUsers.get(userId) || null;
  },

  /**
   * Suspends a tenant. This is a Platform Owner privileged action.
   * @param {string} tenantId - The ID of the tenant to suspend.
   * @returns {Promise<boolean>} True if the tenant was successfully suspended, false otherwise.
   */
  async suspendTenant(tenantId) {
    if (this._tenants.has(tenantId)) {
      this._tenants.get(tenantId).status = 'suspended';
      logger.info({ severity: 'INFO', message: `Tenant ${tenantId} has been suspended by Platform Owner.`, tenantId, audit: true, component: 'TenantManagementService' });
      return true;
    }
    return false;
  },

  /**
   * Unsuspends a tenant, making it active again. This is a Platform Owner privileged action.
   * @param {string} tenantId - The ID of the tenant to unsuspend.
   * @returns {Promise<boolean>} True if the tenant was successfully unsuspended, false otherwise.
   */
  async unsuspendTenant(tenantId) {
    if (this._tenants.has(tenantId)) {
      this._tenants.get(tenantId).status = 'active';
      logger.info({ severity: 'INFO', message: `Tenant ${tenantId} has been unsuspended by Platform Owner.`, tenantId, audit: true, component: 'TenantManagementService' });
      return true;
    }
    return false;
  }
};

/**
 * Resolves the effective configuration by merging settings from platform defaults,
 * tenant-specific configurations, and user-specific overrides. This creates a
 * hierarchical configuration system.
 * @param {string} tenantId - The ID of the tenant for which to resolve the config.
 * @param {InvokerContext} invoker - The context of the user performing the action.
 * @returns {Promise<{maxDocSizeMb: number, storageQuotaMb: number}>} The resolved configuration object.
 */
async function getResolvedConfig(tenantId, invoker) {
  const platformDefaults = {
    maxDocSizeMb: config.platform?.limits?.maxDocSizeMb ?? 10,
    storageQuotaMb: config.platform?.limits?.storageQuotaMb ?? 250,
  };
  const tenantConfig = await tenantManagementService.getTenantConfig(tenantId);
  
  // Start with platform defaults, layer tenant settings on top.
  let resolved = { ...platformDefaults, ...tenantConfig };

  // Layer user-specific settings on top, if an invoker context is provided.
  if (invoker?.userId) {
    const user = await tenantManagementService.getUserConfig(tenantId, invoker.userId);
    if (user?.limits) {
      // Merge user limits, but ensure they don't exceed hard tenant limits
      const userLimits = user.limits;
      resolved = { ...resolved, ...userLimits };
    }
  }
  
  // Security Constraint: A user's effective quota cannot exceed the tenant's quota,
  // unless they are a platform owner. The tenant quota acts as the ultimate ceiling.
  if (invoker?.role !== 'platform_owner') {
    if (tenantConfig.storageQuotaMb && resolved.storageQuotaMb > tenantConfig.storageQuotaMb) {
        logger.warn({ severity: 'WARNING', message: `User quota for ${invoker.userId} capped by tenant limit.`, tenantId, userQuota: resolved.storageQuotaMb, tenantQuota: tenantConfig.storageQuotaMb });
        resolved.storageQuotaMb = tenantConfig.storageQuotaMb;
    }
    if (tenantConfig.maxDocSizeMb && resolved.maxDocSizeMb > tenantConfig.maxDocSizeMb) {
        logger.warn({ severity: 'WARNING', message: `User file size limit for ${invoker.userId} capped by tenant limit.`, tenantId, userLimit: resolved.maxDocSizeMb, tenantLimit: tenantConfig.maxDocSizeMb });
        resolved.maxDocSizeMb = tenantConfig.maxDocSizeMb;
    }
  }

  return resolved;
}


/**
 * Platform Owner Feature: Centralized and secure tenant data path resolution.
 * Ensures strict data siloing by creating a sanitized, tenant-specific directory path.
 * This prevents path traversal attacks and enforces multi-tenancy at the file system level.
 * @param {string} tenantId - The unique identifier for the tenant.
 * @throws {Error} If tenantId is missing, invalid, or a path traversal is detected.
 * @returns {string} The resolved, secure path to the tenant's storage directory.
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
 * A Temporal Activity to validate and load a document from a file path.
 * It enforces multi-tenant policies such as tenant status (active/suspended) and
 * hierarchical file size limits (platform -> tenant -> user).
 *
 * @permission A `platform_owner` role in the `invoker` context can override tenant suspension and file size limits.
 * @param {string} filePath - The local path to the uploaded file to be processed.
 * @param {string} originalName - The original filename of the document.
 * @param {string} docId - A unique identifier for the document.
 * @param {string} tenantId - The identifier of the tenant owning this document.
 * @param {InvokerContext} invoker - The context of the user initiating the ingestion.
 * @throws {Error} If the tenant is suspended, not recognized, or if the file exceeds the configured size limit for the invoker.
 * @returns {Promise<{success: boolean, sizeBytes: number, filePath: string, originalName: string}>} An object indicating success and returning key file metadata.
 */
export async function downloadAndLoadFileActivity(filePath, originalName, docId, tenantId, invoker) {
  const activityName = 'downloadAndLoadFileActivity';
  logger.info({ severity: 'INFO', message: 'Starting document load and validation', activity: activityName, tenantId, docId, originalName, invoker });

  try {
    // Platform Owner Feature: Enforce tenant status and limits with override capability.
    const isPlatformOwner = invoker?.role === 'platform_owner';

    // 1. Check tenant status (e.g., suspended)
    const tenantStatus = await tenantManagementService.getTenantStatus(tenantId);
    if (tenantStatus === 'suspended') {
      if (isPlatformOwner) {
        logger.warn({ severity: 'WARNING', message: 'Platform Owner overriding suspension for tenant.', activity: activityName, tenantId, docId, audit: true });
      } else {
        throw new Error(`Operation forbidden: Tenant '${tenantId}' is suspended.`);
      }
    }
    if (tenantStatus === 'unknown') {
        // Policy: Fail for unknown tenants to prevent unauthorized resource usage.
        throw new Error(`Operation forbidden: Tenant '${tenantId}' is not recognized.`);
    }

    // 2. Check and enforce file size limits using hierarchical configuration
    const resolvedConfig = await getResolvedConfig(tenantId, invoker);
    const stats = await fsPromises.stat(filePath);
    const fileSizeMb = stats.size / (1024 * 1024);

    if (fileSizeMb > resolvedConfig.maxDocSizeMb) {
      if (isPlatformOwner) {
        logger.warn({ severity: 'WARNING', message: 'Platform Owner overriding file size limit for document.', activity: activityName, tenantId, docId, fileSizeMb, limitMb: resolvedConfig.maxDocSizeMb, audit: true });
      } else {
        throw new Error(`File size (${fileSizeMb.toFixed(2)}MB) exceeds the limit of ${resolvedConfig.maxDocSizeMb}MB for user '${invoker.userId}' in tenant '${tenantId}'.`);
      }
    }

    return {
      success: true,
      sizeBytes: stats.size,
      filePath,
      originalName
    };
  } catch (error) {
    logger.error({ severity: 'ERROR', message: 'downloadAndLoadFileActivity failed', error: error.message, stack: error.stack, activity: activityName, tenantId, docId });
    throw error;
  }
}

/**
 * A Temporal Activity that parses a file into structured `Document` objects.
 * It specializes in high-fidelity conversion of HTML to Markdown to preserve semantic structure.
 *
 * @param {string} filePath - The local path to the file to be parsed.
 * @param {string} originalName - The original filename of the document.
 * @param {string} docId - A unique identifier for the document.
 * @param {string} tenantId - The identifier of the tenant owning this document.
 * @param {InvokerContext} invoker - The context of the user initiating the ingestion.
 * @throws {Error} If parsing fails or produces no documents.
 * @returns {Promise<{success: boolean, documents: import('llamaindex').Document[], documentCount: number, isMarkdown: boolean}>} An object containing the parsed documents.
 */
export async function parseToMarkdownActivity(filePath, originalName, docId, tenantId, invoker) {
  const activityName = 'parseToMarkdownActivity';
  logger.info({ severity: 'INFO', message: 'High-fidelity parsing document', activity: activityName, tenantId, docId, originalName, invoker });
  try {
    const documents = await extractTextAndBuildDocuments(filePath, originalName, docId);
    if (!documents || documents.length === 0) {
      throw new Error('Parsing produced no document instances.');
    }
    
    // BUG FIX: Return documents to be passed to the next activity. Do not use shared memory.
    return {
      success: true,
      documents, // Return value for the workflow
      documentCount: documents.length,
      isMarkdown: documents.some(d => d.metadata?.useMarkdownParser)
    };
  } catch (error) {
    logger.error({ severity: 'ERROR', message: 'parseToMarkdownActivity failed', error: error.message, stack: error.stack, activity: activityName, tenantId, docId });
    throw error;
  }
}

/**
 * A Temporal Activity that processes `Document` objects through an ingestion pipeline.
 * The pipeline chunks the documents, enriches them with LLM-extracted metadata (titles, keywords),
 * and generates vector embeddings for each chunk using Google's text-embedding-004 model.
 *
 * @param {import('llamaindex').Document[]} documents - An array of `Document` objects from the previous parsing activity.
 * @param {string} originalName - The original filename of the document.
 * @param {string} docId - A unique identifier for the document.
 * @param {string} tenantId - The identifier of the tenant owning this document.
 * @param {InvokerContext} invoker - The context of the user initiating the ingestion.
 * @throws {Error} If the input documents are missing or if the ingestion pipeline fails.
 * @returns {Promise<{success: boolean, nodes: import('llamaindex').BaseNode[], nodeCount: number}>} An object containing the generated vector nodes.
 */
export async function chunkAndEmbedActivity(documents, originalName, docId, tenantId, invoker) {
  const activityName = 'chunkAndEmbedActivity';
  logger.info({ severity: 'INFO', message: 'Segmenting and generating vector embeddings', activity: activityName, tenantId, docId, originalName, invoker });
  try {
    // BUG FIX: Use 'documents' passed as an argument instead of from a shared global state.
    if (!documents) {
      throw new Error('Input documents not provided. Ensure activities are run sequentially and return values are passed.');
    }

    const hasMarkdown = documents.some(d => d.metadata?.useMarkdownParser);
    const transformations = [];

    // 1. Structure-aware Node Parser
    if (hasMarkdown) {
      transformations.push(new MarkdownNodeParser());
      logger.info({ severity: 'INFO', message: 'Using MarkdownNodeParser for structure-aware ingestion.', component: 'IngestionPipeline', tenantId, docId });
    } else {
      transformations.push(new SentenceWindowNodeParser({
        windowSize: 3,
        windowMetadataKey: '_window',
        originalTextMetadataKey: '_original_text',
      }));
      logger.info({ severity: 'INFO', message: 'Using SentenceWindowNodeParser.', component: 'IngestionPipeline', tenantId, docId });
    }

    // 2. High-performance LLM-driven metadata extraction
    try {
      transformations.push(new TitleExtractor({ llm: Settings.llm, nodes: 3 }));
      transformations.push(new KeywordExtractor({ llm: Settings.llm, keywords: 5 }));
      logger.info({ severity: 'INFO', message: 'Metadata TitleExtractor and KeywordExtractor active.', component: 'IngestionPipeline', tenantId, docId });
    } catch (metaErr) {
      logger.warn({ severity: 'WARNING', message: 'Metadata extractors configuration warning', error: metaErr.message, component: 'IngestionPipeline', tenantId, docId });
    }

    // 3. Vector Embedding generation via text-embedding-004
    transformations.push(Settings.embedModel);

    const pipeline = new IngestionPipeline({ transformations });
    const nodes = await pipeline.run({ documents });

    // BUG FIX: Return nodes to be passed to the next activity.
    return {
      success: true,
      nodes, // Return value for the workflow
      nodeCount: nodes.length
    };
  } catch (error) {
    logger.error({ severity: 'ERROR', message: 'chunkAndEmbedActivity failed', error: error.message, stack: error.stack, activity: activityName, tenantId, docId });
    throw error;
  }
}

/**
 * A Temporal Activity that commits generated vector nodes to a tenant-specific vector store.
 * It performs an atomic update of the vector store file and the document manifest.
 * This activity also enforces the tenant's storage quota.
 *
 * @permission A `platform_owner` role in the `invoker` context can override the storage quota limit.
 * @param {import('llamaindex').BaseNode[]} nodes - An array of vector nodes from the previous embedding activity.
 * @param {string} originalName - The original filename of the document.
 * @param {string} docId - A unique identifier for the document.
 * @param {string} tenantId - The identifier of the tenant owning this document.
 * @param {InvokerContext} invoker - The context of the user initiating the ingestion.
 * @throws {Error} If input nodes are missing, if the commit exceeds the storage quota, or if file operations fail.
 * @returns {Promise<{success: boolean, vectorStorePath: string, docId: string}>} An object indicating success and providing the path to the updated vector store.
 */
export async function commitToVectorStoreActivity(nodes, originalName, docId, tenantId, invoker) {
  const activityName = 'commitToVectorStoreActivity';
  logger.info({ severity: 'INFO', message: 'Writing index and committing vector storage', activity: activityName, tenantId, docId, invoker });
  
  const persistDir = getSafePersistDir(tenantId);
  // OPTIMIZATION: Using a temporary file for the new vector store to ensure atomic writes and safe error recovery.
  const tempVectorStorePath = path.join(persistDir, `vector_store_${crypto.randomUUID()}.tmp`);

  try {
    // BUG FIX: Use 'nodes' passed as an argument.
    if (!nodes) {
      throw new Error('Input vector nodes not provided.');
    }

    await fsPromises.mkdir(persistDir, { recursive: true });

    // OPTIMIZATION: Switched from a single large JSON array to JSON Lines (JSONL) format.
    // This avoids reading the entire vector store into memory, which caused significant
    // CPU and memory pressure, blocking the event loop on large datasets.
    // The new approach streams the existing file, filters out old nodes, and appends
    // new nodes in a memory-efficient, non-blocking way.
    const vectorStorePath = path.join(persistDir, 'vector_store.jsonl');
    const writeStream = fs.createWriteStream(tempVectorStorePath, { encoding: 'utf-8' });

    let totalBytesWritten = 0;

    // First, write the new nodes for the current document to the temp file.
    const newNodesAsMeta = nodes.map(nodeToMetadata);
    for (const nodeMeta of newNodesAsMeta) {
        const line = JSON.stringify(nodeMeta) + '\n';
        writeStream.write(line);
        totalBytesWritten += Buffer.byteLength(line, 'utf8');
    }

    // Second, stream the existing vector store (if it exists) and write all nodes
    // that DON'T belong to the current document to the temp file.
    try {
        await fsPromises.access(vectorStorePath, fs.constants.R_OK); // Check if file exists and is readable
        const readStream = fs.createReadStream(vectorStorePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });

        for await (const line of rl) {
            if (line.trim() === '') continue;
            try {
                const node = JSON.parse(line);
                if (node?.metadata?.fileName !== originalName) {
                    const lineToWrite = line + '\n';
                    writeStream.write(lineToWrite);
                    totalBytesWritten += Buffer.byteLength(lineToWrite, 'utf8');
                }
            } catch (parseError) {
                logger.warn({ severity: 'WARNING', message: 'Skipping corrupt line in vector store during rewrite.', line, error: parseError.message, activity: activityName, tenantId });
            }
        }
    } catch (err) {
        // If the file doesn't exist (ENOENT), it's not an error. We are creating it.
        if (err.code !== 'ENOENT') throw err;
    }

    // Finish writing to the temp file
    writeStream.end();
    await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });

    // Platform Owner Feature: Enforce storage quota with override capability.
    const isPlatformOwner = invoker?.role === 'platform_owner';
    const resolvedConfig = await getResolvedConfig(tenantId, invoker);
    const newStoreSizeMb = totalBytesWritten / (1024 * 1024);

    if (newStoreSizeMb > resolvedConfig.storageQuotaMb) {
      if (isPlatformOwner) {
        logger.warn({ severity: 'WARNING', message: 'Platform Owner overriding storage quota for tenant.', activity: activityName, tenantId, newStoreSizeMb, limitMb: resolvedConfig.storageQuotaMb, audit: true });
      } else {
        throw new Error(`Commit failed: Adding this document would exceed the storage quota of ${resolvedConfig.storageQuotaMb}MB for tenant '${tenantId}'. Current usage: ${newStoreSizeMb.toFixed(2)}MB.`);
      }
    }

    // Atomically replace the old vector store with the new one.
    await fsPromises.rename(tempVectorStorePath, vectorStorePath);

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
      // HIERARCHY GAP FIX: Track which user ingested the document for auditing and usage propagation.
      ingestedBy: invoker?.userId || 'unknown',
    });

    await saveManifest(persistDir, manifest);
    logger.info({ severity: 'INFO', message: 'Ingestion committed successfully. Manifest registered.', activity: activityName, tenantId, docId, nodeCount: nodes.length });

    return {
      success: true,
      vectorStorePath,
      docId
    };
  } catch (error) {
    // Ensure temp file is cleaned up on any failure.
    await fsPromises.unlink(tempVectorStorePath).catch(e => {
        if (e.code !== 'ENOENT') {
            logger.error({ severity: 'ERROR', message: 'Failed to clean up temporary vector store file after an error.', error: e.message, tempFile: tempVectorStorePath });
        }
    });
    logger.error({ severity: 'ERROR', message: 'commitToVectorStoreActivity failed', error: error.message, stack: error.stack, activity: activityName, tenantId, docId });
    throw error;
  }
}

/**
 * A Temporal Saga/Compensating Activity designed to roll back a failed ingestion.
 * It safely purges vector segments associated with the failed document from the tenant's
 * vector store and updates the document manifest to reflect the failed state.
 *
 * @param {string} originalName - The original filename of the document to be cleaned up.
 * @param {string} docId - The unique identifier of the document to be cleaned up.
 * @param {string} tenantId - The identifier of the tenant owning this document.
 * @param {InvokerContext} invoker - The context of the user whose ingestion is being reverted.
 * @returns {Promise<{success: boolean, docId: string, reverted: boolean}>} An object indicating the result of the cleanup operation.
 */
export async function cleanupFailedIngestionActivity(originalName, docId, tenantId, invoker) {
  const activityName = 'cleanupFailedIngestionActivity';
  logger.warn({ severity: 'WARNING', message: 'Reverting RAG vectors and purging records', activity: activityName, saga: true, tenantId, docId, invoker });
  
  const persistDir = getSafePersistDir(tenantId);
  // OPTIMIZATION: Using a temporary file for the new vector store to ensure atomic writes and safe error recovery.
  const tempVectorStorePath = path.join(persistDir, `vector_store_cleanup_${crypto.randomUUID()}.tmp`);

  try {
    // OPTIMIZATION: Using streaming and JSONL format to avoid high memory/CPU usage on large vector stores.
    const vectorStorePath = path.join(persistDir, 'vector_store.jsonl');
    
    try {
        await fsPromises.access(vectorStorePath, fs.constants.R_OK); // Check if file exists

        const readStream = fs.createReadStream(vectorStorePath, { encoding: 'utf-8' });
        const writeStream = fs.createWriteStream(tempVectorStorePath, { encoding: 'utf-8' });
        const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });

        let nodesKept = 0;
        for await (const line of rl) {
            if (line.trim() === '') continue;
            try {
                const node = JSON.parse(line);
                // Keep nodes that are NOT from the document being cleaned up
                if (node?.metadata?.fileName !== originalName && node?.metadata?.docId !== docId) {
                    writeStream.write(line + '\n');
                    nodesKept++;
                }
            } catch (parseError) {
                logger.warn({ severity: 'WARNING', message: 'Skipping corrupt line during cleanup.', line, error: parseError.message, activity: activityName, saga: true, tenantId });
                writeStream.write(line + '\n'); // Preserve corrupt lines
            }
        }

        writeStream.end();
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        // Atomically replace the old file with the cleaned one, or remove it if empty.
        if (nodesKept > 0) {
            await fsPromises.rename(tempVectorStorePath, vectorStorePath);
        } else {
            // If the cleaned file is empty, remove both the original and the temp file.
            await fsPromises.unlink(vectorStorePath).catch(e => { if (e.code !== 'ENOENT') throw e; });
            await fsPromises.unlink(tempVectorStorePath).catch(e => { if (e.code !== 'ENOENT') throw e; });
        }
        logger.info({ severity: 'INFO', message: 'Successfully purged transaction records from vector store.', activity: activityName, saga: true, tenantId, docId });

    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.info({ severity: 'INFO', message: 'Vector store file does not exist, no cleanup needed.', activity: activityName, saga: true, tenantId });
        } else {
            // For other errors, log a warning and re-throw to be caught by the outer block.
            logger.warn({ severity: 'WARNING', message: 'Could not revert vector store database records.', error: err.message, activity: activityName, saga: true, tenantId });
            throw err;
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
        logger.info({ severity: 'INFO', message: 'Reverted document index manifest registers to failed state.', activity: activityName, saga: true, tenantId, docId });
      }
    }

    return {
      success: true,
      docId,
      reverted: true
    };
  } catch (error) {
    logger.error({ severity: 'ERROR', message: 'Compensating transaction failed', error: error.message, stack: error.stack, activity: activityName, saga: true, tenantId, docId });
    throw error;
  } finally {
    // Ensure temp file is always cleaned up.
    await fsPromises.unlink(tempVectorStorePath).catch(e => {
        if (e.code !== 'ENOENT') {
            logger.error({ severity: 'ERROR', message: 'Failed to clean up temporary vector store file during cleanup.', error: e.message, tempFile: tempVectorStorePath });
        }
    });
  }
}