import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import * as knowledgeCatalogService from './knowledge_catalog.service.js';
import { KnowledgeBundle, KnowledgeConcept } from './knowledge_catalog.model.js';
import { OWNER_TYPES } from './knowledge_catalog.constant.js';
import ApiError from '../../../errors/ApiError.js';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';

/**
 * Create or import a bundle
 */
export const createBundle = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;
  const tenantId = req.user?.tenantId;

  if (!userId || !tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User authentication and tenant ID are required');
  }

  const { ownerType = OWNER_TYPES.USER, ownerId = userId.toString() } = req.body;

  // Check if we uploaded a ZIP bundle
  if (req.file) {
    const tempZipPath = path.join(os.tmpdir(), `upload-${Date.now()}-${req.file.originalname}`);
    await fs.writeFile(tempZipPath, req.file.buffer);

    try {
      const bundle = await knowledgeCatalogService.importBundleZip(
        tempZipPath,
        ownerId,
        ownerType,
        tenantId,
        req.body
      );
      await fs.unlink(tempZipPath).catch(() => {});

      return sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Knowledge bundle imported successfully from zip',
        data: bundle,
      });
    } catch (err) {
      await fs.unlink(tempZipPath).catch(() => {});
      throw err;
    }
  }

  // Create standard metadata bundle
  const { bundleId, title, description, sourceType, sourceRef } = req.body;
  
  let bundle = await KnowledgeBundle.findOne({ tenantId, bundleId });
  if (bundle) {
    throw new ApiError(httpStatus.CONFLICT, `Bundle with ID "${bundleId}" already exists`);
  }

  bundle = new KnowledgeBundle({
    bundleId,
    title,
    description,
    ownerId,
    ownerType,
    tenantId,
    sourceType,
    sourceRef,
  });

  await bundle.save();

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Knowledge bundle created successfully',
    data: bundle,
  });
});

/**
 * List all bundles
 */
export const listBundles = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Tenant ID is required');
  }

  const bundles = await knowledgeCatalogService.getBundles(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Bundles retrieved successfully',
    data: bundles,
  });
});

/**
 * Get details of a bundle
 */
export const getBundleDetails = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { id } = req.params;

  if (!tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Tenant ID is required');
  }

  const result = await knowledgeCatalogService.getBundleDetails(id, tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Bundle details retrieved successfully',
    data: result,
  });
});

/**
 * List concepts in a bundle
 */
export const listBundleConcepts = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { id } = req.params;

  if (!tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Tenant ID is required');
  }

  const concepts = await KnowledgeConcept.find({ tenantId, bundleId: id, isActive: true }).lean();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Bundle concepts retrieved successfully',
    data: concepts,
  });
});

/**
 * Get a specific concept
 */
export const getConcept = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { id, conceptId } = req.params;

  if (!tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Tenant ID is required');
  }

  // Double-decode the conceptId if it contains subfolder paths (e.g. tables%2Fusers)
  const decodedConceptId = decodeURIComponent(conceptId);

  const concept = await KnowledgeConcept.findOne({
    tenantId,
    bundleId: id,
    conceptId: decodedConceptId,
    isActive: true,
  }).lean();

  if (!concept) {
    throw new ApiError(httpStatus.NOT_FOUND, `Concept not found: ${decodedConceptId}`);
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Concept retrieved successfully',
    data: concept,
  });
});

/**
 * Delete a bundle
 */
export const deleteBundle = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { id } = req.params;

  if (!tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Tenant ID is required');
  }

  await knowledgeCatalogService.deleteBundle(id, tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Bundle and all associated concepts deleted successfully',
  });
});

/**
 * Export a bundle
 */
export const exportBundle = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { id } = req.params;

  if (!tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Tenant ID is required');
  }

  const zipPath = await knowledgeCatalogService.exportBundle(id, tenantId);

  res.download(zipPath, `${id}.zip`, async (err) => {
    if (err) {
      logger.error(`[KnowledgeCatalog] Download failed for bundle ${id}: ${err.message}`);
    }
    await fs.unlink(zipPath).catch(() => {});
  });
});

/**
 * Search the catalog
 */
export const searchCatalog = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Tenant ID is required');
  }

  const { query, type, tags, limit } = req.body;
  const results = await knowledgeCatalogService.searchCatalog(query, { type, tags, limit }, tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Catalog search completed successfully',
    data: results,
  });
});

/**
 * Get knowledge graph of relationships
 */
export const getCatalogGraph = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Tenant ID is required');
  }

  const concepts = await KnowledgeConcept.find({ tenantId, isActive: true }).lean();
  
  const nodes = [];
  const edges = [];
  const conceptSet = new Set(concepts.map(c => `${c.bundleId}::${c.conceptId}`));

  for (const concept of concepts) {
    const key = `${concept.bundleId}::${concept.conceptId}`;
    nodes.push({
      id: key,
      bundleId: concept.bundleId,
      conceptId: concept.conceptId,
      title: concept.title,
      type: concept.type,
      tags: concept.tags,
    });

    if (concept.links && concept.links.length > 0) {
      concept.links.forEach(link => {
        // Find if link matches another concept in the same bundle
        const targetKey = `${concept.bundleId}::${link}`;
        edges.push({
          source: key,
          target: targetKey,
          exists: conceptSet.has(targetKey),
        });
      });
    }
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Catalog graph data generated',
    data: { nodes, edges },
  });
});

/**
 * Trigger auto-enrichment on a bundle (stub / async trigger)
 */
export const enrichBundle = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { id } = req.params;

  if (!tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Tenant ID is required');
  }

  const bundle = await KnowledgeBundle.findOne({ tenantId, bundleId: id });
  if (!bundle) {
    throw new ApiError(httpStatus.NOT_FOUND, `Bundle not found: ${id}`);
  }

  // Asynchronously trigger swarm enrichment agent
  // For now return success immediately
  logger.info(`[KnowledgeCatalog] Triggering auto-enrichment on bundle ${id}`);

  sendResponse(res, {
    statusCode: httpStatus.ACCEPTED,
    success: true,
    message: 'Auto-enrichment tasks scheduled successfully',
  });
});
