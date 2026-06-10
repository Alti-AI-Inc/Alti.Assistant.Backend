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

// BUG FIX: Removed the global 'activityTransitiveState' map. Using a global variable to pass state
// between Temporal activities is an anti-pattern. Activities can run on different workers and do not
// share memory. State must be passed explicitly by returning data from one activity and passing it
// as an argument to the next in the workflow definition. The signatures of the activities below
// have been updated to reflect this correct, durable pattern. The calling workflow MUST be updated.

// #region Platform Owner / Super Admin Features

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

  async getTenantStatus(tenantId) {
    const tenant = this._tenants.get(tenantId);
    return tenant ? tenant.status : 'unknown'; // Default to 'unknown' for non-existent tenants
  },

  async getTenantConfig(tenantId) {
    const tenant = this._tenants.get(tenantId);
    return tenant ? tenant.config : {};
  },

  // HIERARCHY GAP FIX: Get user-specific configuration from the mock service.
  async getUserConfig(tenantId, userId) {
    const tenantUsers = this._users.get(tenantId);
    if (!tenantUsers) return null;
    return tenantUsers.get(userId) || null;
  },

  // Platform Owner Feature: Allows a super admin to suspend a tenant.
  async suspendTenant(tenantId) {
    if (this._tenants.has(tenantId)) {
      this._tenants.get(tenantId).status = 'suspended';
      logger.info({ severity: 'INFO', message: `Tenant ${tenantId} has been suspended by Platform Owner.`, tenantId, audit: true, component: 'TenantManagementService' });
      return true;
    }
    return false;
  },

  // Platform Owner Feature: Allows a super admin to unsuspend a tenant.
  async unsuspendTenant(tenantId) {
    if (this._tenants.has(tenantId)) {
      this._tenants.get(tenantId).status = 'active';
      logger.info({ severity: 'INFO', message: `Tenant ${tenantId} has been unsuspended by Platform Owner.`, tenantId, audit: true, component: 'TenantManagementService' });
      return true;
    }
    return false;
  }
};

// HIERARCHY GAP FIX: Enhanced Hierarchical Configuration Resolver
// Merges platform-wide defaults, tenant-specific settings, and user-specific overrides.
// This ensures that limits are applied based on the invoker's role and identity.
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
 * Ensures strict data siloing and prevents path traversal attacks.
 * @param {string} tenantId - The unique identifier for the tenant.
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
 * Resilient Temporal Activity validating and loading document buffer.
 * Enforces tenant status and file size limits based on user and tenant hierarchy.
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
 * Resilient Temporal Activity running high-fidelity HTML-to-Markdown conversions for technical structured data
 * BUG FIX: This activity now returns the parsed documents directly. The calling workflow must pass this
 * result to the next activity in the chain.
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
 * Resilient Temporal Activity chunking document, enriching it with Gemini metadata, and generating text-embedding-004 vectors
 * BUG FIX: This activity now accepts 'documents' as an argument and returns the generated 'nodes'.
 * The calling workflow must be updated to pass the arguments and handle the return value.
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
 * Resilient Temporal Activity committing vector nodes and aligning local document manifest registers.
 * Enforces tenant storage quotas based on user and tenant hierarchy.
 * BUG FIX: This activity now accepts 'nodes' as an argument.
 */
export async function commitToVectorStoreActivity(nodes, originalName, docId, tenantId, invoker) {
  const activityName = 'commitToVectorStoreActivity';
  logger.info({ severity: 'INFO', message: 'Writing index and committing vector storage', activity: activityName, tenantId, docId, invoker });
  try {
    // BUG FIX: Use 'nodes' passed as an argument.
    if (!nodes) {
      throw new Error('Input vector nodes not provided.');
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
        logger.warn({ severity: 'WARNING', message: 'Could not read or parse existing vector store, will create new one.', error: err.message, activity: activityName, tenantId, vectorStorePath });
      }
    }

    // RECOMMENDATION: Replace this file-based vector store with a dedicated database solution (e.g., PostgreSQL with pgvector, Chroma, Weaviate)
    // to avoid performance bottlenecks associated with reading/writing large JSON files on every ingestion.

    // Upsert strategy: Clean out any previous nodes matching the same source filename
    const baseNodes = currentNodes.filter(n => n?.metadata?.fileName !== originalName);
    const finalNodes = [...baseNodes, ...nodes.map(nodeToMetadata)];

    // Platform Owner Feature: Enforce storage quota with override capability using hierarchical config.
    const isPlatformOwner = invoker?.role === 'platform_owner';
    const resolvedConfig = await getResolvedConfig(tenantId, invoker);
    const newStoreContent = JSON.stringify(finalNodes, null, 2);
    const newStoreSizeMb = Buffer.byteLength(newStoreContent, 'utf8') / (1024 * 1024);

    if (newStoreSizeMb > resolvedConfig.storageQuotaMb) {
      if (isPlatformOwner) {
        logger.warn({ severity: 'WARNING', message: 'Platform Owner overriding storage quota for tenant.', activity: activityName, tenantId, newStoreSizeMb, limitMb: resolvedConfig.storageQuotaMb, audit: true });
      } else {
        throw new Error(`Commit failed: Adding this document would exceed the storage quota of ${resolvedConfig.storageQuotaMb}MB for tenant '${tenantId}'. Current usage: ${newStoreSizeMb.toFixed(2)}MB.`);
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
    logger.error({ severity: 'ERROR', message: 'commitToVectorStoreActivity failed', error: error.message, stack: error.stack, activity: activityName, tenantId, docId });
    throw error;
  }
}

/**
 * Saga Compensating Rollback Activity to safely purge corrupt vector segments and revert state registers
 */
export async function cleanupFailedIngestionActivity(originalName, docId, tenantId, invoker) {
  const activityName = 'cleanupFailedIngestionActivity';
  logger.warn({ severity: 'WARNING', message: 'Reverting RAG vectors and purging records', activity: activityName, saga: true, tenantId, docId, invoker });
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
        logger.info({ severity: 'INFO', message: 'Successfully purged transaction records from vector store.', activity: activityName, saga: true, tenantId, docId });
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        logger.info({ severity: 'INFO', message: 'Vector store file does not exist, no cleanup needed.', activity: activityName, saga: true, tenantId });
      } else {
        logger.warn({ severity: 'WARNING', message: 'Could not revert vector store database records.', error: err.message, activity: activityName, saga: true, tenantId });
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

    // BUG FIX: No in-memory state to clean up. This is now handled by the workflow engine's state management.

    return {
      success: true,
      docId,
      reverted: true
    };
  } catch (error) {
    logger.error({ severity: 'ERROR', message: 'Compensating transaction failed', error: error.message, stack: error.stack, activity: activityName, saga: true, tenantId, docId });
    throw error;
  }
}