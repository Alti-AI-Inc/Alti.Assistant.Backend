import { execSync } from 'child_process';
import os from 'os';
import fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import path from 'path';
import { loadBundleFromDir, zipBundle } from './okf/bundle.js';
import { generateOKFContent, generateIndexContent, generateLogContent } from './okf/generator.js';
import { KnowledgeBundle, KnowledgeConcept } from './knowledge_catalog.model.js';
import { rag } from '../knowledge/knowledge.service.js';
import { STORAGE_CONFIG } from '../knowledge/knowledge.constant.js';
import { Storage } from '@google-cloud/storage';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';

// Initialize GCS storage
const storage = new Storage({
  projectId: config.google?.gcp_project_id,
  keyFilename: 'insoai_gcp.json',
});

/**
 * Import an OKF bundle from a local directory path.
 *
 * @param {string} dirPath - Path of the directory containing the OKF bundle
 * @param {string} ownerId - ID of the owner
 * @param {string} ownerType - Type of owner
 * @param {string} tenantId - Tenant ID
 * @param {object} options - Custom options (bundleId, title, description, sourceType, etc.)
 * @returns {Promise<object>} - The created/updated bundle document
 */
export async function importBundleFromDir(dirPath, ownerId, ownerType, tenantId, options = {}) {
  logger.info(`[KnowledgeCatalog] Importing bundle from dir: ${dirPath}`);
  
  // 1. Load and parse the bundle from directory
  const bundleData = await loadBundleFromDir(dirPath);
  if (bundleData.errors.length > 0) {
    logger.warn(`[KnowledgeCatalog] Ingested bundle has errors: ${JSON.stringify(bundleData.errors)}`);
  }

  const bundleId = options.bundleId || bundleData.name || `bundle-${Date.now()}`;
  
  // 2. Create or update the bundle document in MongoDB
  let bundleDoc = await KnowledgeBundle.findOne({ tenantId, bundleId });
  if (!bundleDoc) {
    bundleDoc = new KnowledgeBundle({
      bundleId,
      title: options.title || bundleId,
      description: options.description || 'Imported Knowledge Catalog Bundle',
      ownerId,
      ownerType,
      tenantId,
      sourceType: options.sourceType || 'MANUAL',
      sourceRef: options.sourceRef,
      isActive: true,
    });
  } else {
    bundleDoc.title = options.title || bundleDoc.title;
    bundleDoc.description = options.description || bundleDoc.description;
    bundleDoc.isActive = true;
  }
  await bundleDoc.save();

  // 3. Delete old concepts for this bundle before inserting the new ones
  await KnowledgeConcept.deleteMany({ tenantId, bundleId });

  // 4. Save and index each concept
  for (const [conceptId, concept] of Object.entries(bundleData.concepts)) {
    const conceptDoc = new KnowledgeConcept({
      bundleId,
      conceptId,
      type: concept.frontmatter.type || 'general',
      title: concept.frontmatter.title || conceptId,
      description: concept.frontmatter.description || '',
      resource: concept.frontmatter.resource || '',
      tags: concept.frontmatter.tags || [],
      frontmatter: concept.frontmatter,
      body: concept.body || '',
      links: concept.links || [],
      tenantId,
      isActive: true,
    });
    
    // Register concept in DB
    await conceptDoc.save();

    // 5. Index concept content in pgvector RAG System (skipping system/reserved indices & logs)
    if (!concept.isIndex && !concept.isLog) {
      try {
        await rag.initialize();
        const docBuffer = Buffer.from(concept.body || '');
        const ragResult = await rag.addDocumentFromBuffer(
          docBuffer,
          `${conceptId}.md`,
          'md',
          {
            ownerType,
            ownerId,
            bundleId,
            conceptId,
            tenantId: tenantId.toString(),
          }
        );
        conceptDoc.frontmatter.ragDocumentId = ragResult.documentId;
        conceptDoc.markModified('frontmatter');
        await conceptDoc.save();
      } catch (ragErr) {
        logger.error(`[KnowledgeCatalog] Failed to index concept ${conceptId} in RAG: ${ragErr.message}`);
      }
    }
  }

  // 6. Zip and upload bundle to GCS
  try {
    const tempZipPath = path.join(os.tmpdir(), `bundle-${bundleId}-${Date.now()}.zip`);
    await zipBundle(dirPath, tempZipPath);

    const bucketName = STORAGE_CONFIG.GCS_BUCKET;
    const gcsPath = `catalog/tenants/${tenantId}/bundles/${bundleId}.zip`;
    
    logger.info(`[KnowledgeCatalog] Uploading bundle zip to GCS: ${gcsPath}`);
    await storage.bucket(bucketName).upload(tempZipPath, {
      destination: gcsPath,
      metadata: {
        contentType: 'application/zip',
      },
    });

    bundleDoc.gcsPath = gcsPath;
    bundleDoc.gcsUrl = `https://storage.googleapis.com/${bucketName}/${gcsPath}`;
    await bundleDoc.save();

    // Clean up temp zip file
    await fs.unlink(tempZipPath).catch(() => {});
  } catch (gcsErr) {
    logger.error(`[KnowledgeCatalog] GCS bundle upload failed: ${gcsErr.message}`);
  }

  return bundleDoc;
}

/**
 * Import bundle from a Zip file path.
 *
 * @param {string} zipFilePath - Path to the zip file
 * @param {string} ownerId - ID of owner
 * @param {string} ownerType - Type of owner
 * @param {string} tenantId - Tenant ID
 * @param {object} options - Import options
 * @returns {Promise<object>} - Ingested bundle document
 */
export async function importBundleZip(zipFilePath, ownerId, ownerType, tenantId, options = {}) {
  const tempDir = path.join(os.tmpdir(), `extracted-bundle-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    if (process.platform === 'win32') {
      execSync(`powershell -Command "Expand-Archive -Path '${zipFilePath}' -DestinationPath '${tempDir}' -Force"`);
    } else {
      execSync(`unzip -o "${zipFilePath}" -d "${tempDir}"`);
    }

    const result = await importBundleFromDir(tempDir, ownerId, ownerType, tenantId, options);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    return result;
  } catch (err) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw new ApiError(httpStatus.BAD_REQUEST, `Failed to unpack and ingest OKF bundle zip: ${err.message}`);
  }
}

/**
 * Get all bundles.
 */
export async function getBundles(tenantId) {
  return KnowledgeBundle.find({ tenantId, isActive: true }).lean();
}

/**
 * Get details of a bundle including its concepts.
 */
export async function getBundleDetails(bundleId, tenantId) {
  const bundle = await KnowledgeBundle.findOne({ tenantId, bundleId, isActive: true }).lean();
  if (!bundle) {
    throw new ApiError(httpStatus.NOT_FOUND, `Bundle not found: ${bundleId}`);
  }
  const concepts = await KnowledgeConcept.find({ tenantId, bundleId, isActive: true }).lean();
  return {
    bundle,
    concepts,
  };
}

/**
 * Delete a bundle.
 */
export async function deleteBundle(bundleId, tenantId) {
  const bundle = await KnowledgeBundle.findOne({ tenantId, bundleId });
  if (!bundle) {
    throw new ApiError(httpStatus.NOT_FOUND, `Bundle not found: ${bundleId}`);
  }

  // Get concepts to delete their RAG system references
  const concepts = await KnowledgeConcept.find({ tenantId, bundleId });
  for (const concept of concepts) {
    if (concept.frontmatter?.ragDocumentId) {
      try {
        await rag.initialize();
        await rag.deleteDocument(concept.frontmatter.ragDocumentId);
      } catch (ragErr) {
        logger.error(`[KnowledgeCatalog] Failed to delete RAG doc ${concept.frontmatter.ragDocumentId}: ${ragErr.message}`);
      }
    }
  }

  // Delete GCS bundle file
  if (bundle.gcsPath) {
    try {
      const bucketName = STORAGE_CONFIG.GCS_BUCKET;
      await storage.bucket(bucketName).file(bundle.gcsPath).delete();
    } catch (gcsErr) {
      logger.warn(`[KnowledgeCatalog] Failed to delete GCS path ${bundle.gcsPath}: ${gcsErr.message}`);
    }
  }

  await KnowledgeConcept.deleteMany({ tenantId, bundleId });
  await bundle.deleteOne();
  
  return { success: true };
}

/**
 * Export a bundle to a zip file on disk (returns path to zip).
 */
export async function exportBundle(bundleId, tenantId) {
  const bundle = await KnowledgeBundle.findOne({ tenantId, bundleId });
  if (!bundle) {
    throw new ApiError(httpStatus.NOT_FOUND, `Bundle not found: ${bundleId}`);
  }

  const concepts = await KnowledgeConcept.find({ tenantId, bundleId });
  
  const tempExportDir = path.join(os.tmpdir(), `export-${bundleId}-${Date.now()}`);
  await fs.mkdir(tempExportDir, { recursive: true });

  try {
    // Recreate file hierarchy
    for (const concept of concepts) {
      const filePath = path.join(tempExportDir, `${concept.conceptId}.md`);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      
      const content = generateOKFContent(concept.frontmatter, concept.body);
      await fs.writeFile(filePath, content, 'utf8');
    }

    // Auto-generate directory indexes
    const buildIndexes = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const items = [];

      for (const entry of entries) {
        if (entry.name === 'index.md' || entry.name === 'log.md') continue;
        const relativePath = path.relative(tempExportDir, path.join(dir, entry.name)).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          await buildIndexes(path.join(dir, entry.name));
          items.push({
            id: `${entry.name}/index.md`,
            title: entry.name,
            type: 'index',
          });
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const conceptId = relativePath.replace(/\.md$/, '');
          const matchedConcept = concepts.find(c => c.conceptId === conceptId);
          items.push({
            id: entry.name,
            title: matchedConcept?.title || entry.name,
            type: matchedConcept?.type || 'concept',
          });
        }
      }

      // Generate index.md for this folder
      const dirTitle = path.basename(dir) === path.basename(tempExportDir) ? bundle.title : path.basename(dir);
      const indexContent = generateIndexContent(dirTitle, `Concepts within ${dirTitle}`, items);
      await fs.writeFile(path.join(dir, 'index.md'), indexContent, 'utf8');
    };

    await buildIndexes(tempExportDir);

    // Auto-generate log.md
    const logContent = generateLogContent(`${bundle.title} Log`, [
      {
        timestamp: new Date().toISOString(),
        event: 'Bundle Exported',
        user: bundle.ownerId,
        details: `Exported ${concepts.length} concepts.`,
      }
    ]);
    await fs.writeFile(path.join(tempExportDir, 'log.md'), logContent, 'utf8');

    // Zip bundle
    const exportZipPath = path.join(os.tmpdir(), `export-${bundleId}-${Date.now()}.zip`);
    await zipBundle(tempExportDir, exportZipPath);

    // Clean up temp directory
    await fs.rm(tempExportDir, { recursive: true, force: true }).catch(() => {});

    return exportZipPath;
  } catch (err) {
    await fs.rm(tempExportDir, { recursive: true, force: true }).catch(() => {});
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to export bundle zip: ${err.message}`);
  }
}

/**
 * Semantic search over the knowledge catalog.
 */
export async function searchCatalog(query, filter = {}, tenantId) {
  await rag.initialize();
  
  const searchResults = await rag.search(query, {
    filter: {
      tenantId: tenantId.toString(),
      ...(filter.type && { type: filter.type }),
    },
    topK: filter.limit || 10,
  });

  const hydratedResults = [];
  for (const result of searchResults) {
    // Find matching concept by title, description or matching documentId
    const concept = await KnowledgeConcept.findOne({
      tenantId,
      $or: [
        { 'frontmatter.ragDocumentId': result.documentId },
        { title: result.title },
      ]
    }).lean();

    if (concept) {
      hydratedResults.push({
        ...result,
        concept,
      });
    } else {
      hydratedResults.push(result);
    }
  }

  return hydratedResults;
}

export default {
  importBundleFromDir,
  importBundleZip,
  getBundles,
  getBundleDetails,
  deleteBundle,
  exportBundle,
  searchCatalog,
};
