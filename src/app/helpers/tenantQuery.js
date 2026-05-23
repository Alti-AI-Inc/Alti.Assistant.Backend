import httpStatus from 'http-status';
import ApiError from '../../errors/ApiError.js';
import { logger } from '../../shared/logger.js';

/**
 * Add tenant filter to MongoDB query
 * Ensures all queries are scoped to the user's tenant
 *
 * @param {Object} req - Express request object with tenant context
 * @param {Object} query - MongoDB query object
 * @returns {Object} Query with tenantId filter added
 *
 * @example
 * const query = { userId: '123', status: 'active' };
 * const filteredQuery = withTenantFilter(req, query);
 * // Result: { userId: '123', status: 'active', tenantId: 'tenant123' }
 */
export const withTenantFilter = (req, query = {}) => {
  if (!req) {
    logger.warn('withTenantFilter called without request object');
    return query;
  }

  // Check if currentTenantId exists in JWT payload (even if null for personal mode)
  const tenantId =
    req.user && 'currentTenantId' in req.user
      ? req.user.currentTenantId
      : req.tenantId;

  // If tenantId is null (personal mode), return query without tenant filter
  if (!tenantId) {
    return query;
  }

  // Allow personal/legacy resources (where tenantId is null or undefined)
  // to remain visible even when in a tenant/workspace. This prevents data-loss illusion
  // for legacy users while keeping the backend multi-tenant secure.
  return {
    ...query,
    $or: [
      { tenantId },
      { tenantId: null },
      { tenantId: { $exists: false } }
    ]
  };
};

/**
 * Add tenant context to document data before saving
 * Automatically adds tenantId to new documents
 *
 * @param {Object} req - Express request object with tenant context
 * @param {Object} data - Document data to save
 * @returns {Object} Data with tenantId added
 *
 * @example
 * const conversationData = { title: 'My Chat', userId: '123' };
 * const dataWithTenant = withTenantContext(req, conversationData);
 * // Result: { title: 'My Chat', userId: '123', tenantId: 'tenant123' }
 */
export const withTenantContext = (req, data = {}) => {
  if (!req) {
    logger.warn('withTenantContext called without request object');
    return data;
  }

  // Check if currentTenantId exists in JWT payload (even if null for personal mode)
  const tenantId =
    req.user && 'currentTenantId' in req.user
      ? req.user.currentTenantId
      : req.tenantId;

  // If tenantId is null (personal mode), return data without tenant context
  if (!tenantId) {
    return data;
  }

  return {
    ...data,
    tenantId,
  };
};

/**
 * Add tenant filter to MongoDB aggregation pipeline
 * Adds $match stage at the beginning of pipeline
 *
 * @param {Object} req - Express request object with tenant context
 * @param {Array} pipeline - MongoDB aggregation pipeline
 * @returns {Array} Pipeline with tenant match stage
 *
 * @example
 * const pipeline = [
 *   { $group: { _id: '$userId', count: { $sum: 1 } } }
 * ];
 * const filteredPipeline = withTenantPipeline(req, pipeline);
 * // Result: [
 * //   { $match: { tenantId: 'tenant123' } },
 * //   { $group: { _id: '$userId', count: { $sum: 1 } } }
 * // ]
 */
export const withTenantPipeline = (req, pipeline = []) => {
  if (!req) {
    logger.warn('withTenantPipeline called without request object');
    return pipeline;
  }

  // Check if currentTenantId exists in JWT payload (even if null for personal mode)
  const tenantId =
    req.user && 'currentTenantId' in req.user
      ? req.user.currentTenantId
      : req.tenantId;

  // If tenantId is null (personal mode), return pipeline without tenant filter
  if (!tenantId) {
    return pipeline;
  }

  // Allow personal/legacy resources to be counted in aggregation statistics
  return [
    {
      $match: {
        $or: [
          { tenantId },
          { tenantId: null },
          { tenantId: { $exists: false } }
        ]
      }
    },
    ...pipeline
  ];
};

/**
 * Validate that a document belongs to the user's tenant
 * Throws error if document doesn't belong to tenant
 *
 * @param {Object} req - Express request object with tenant context
 * @param {Object} document - MongoDB document to validate
 * @param {string} documentType - Type of document (for error message)
 * @throws {ApiError} If document doesn't belong to tenant
 *
 * @example
 * const conversation = await Conversation.findById(conversationId);
 * validateTenantOwnership(req, conversation, 'Conversation');
 */
export const validateTenantOwnership = (
  req,
  document,
  documentType = 'Resource'
) => {
  if (!req || !req.tenantId) {
    logger.warn('validateTenantOwnership called without tenant context');
    return;
  }

  if (!document) {
    throw new ApiError(httpStatus.NOT_FOUND, `${documentType} not found`);
  }

  // Check if document has tenantId field
  if (!document.tenantId) {
    // If document doesn't have tenantId, it might be a legacy document
    // or a document that doesn't support multi-tenancy
    logger.warn(`${documentType} does not have tenantId field:`, document._id);
    return;
  }

  // Convert to string for comparison
  const documentTenantId = document.tenantId.toString();
  const requestTenantId = req.tenantId.toString();

  if (documentTenantId !== requestTenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `You do not have access to this ${documentType}`
    );
  }
};

/**
 * Apply tenant context to multiple documents in batch
 * Useful for bulk create or update operations
 *
 * @param {Object} req - Express request object with tenant context
 * @param {Array} documents - Array of document objects
 * @returns {Array} Documents with tenantId added to each
 *
 * @example
 * const messages = [
 *   { content: 'Hello', role: 'user' },
 *   { content: 'Hi there', role: 'assistant' }
 * ];
 * const messagesWithTenant = batchWithTenantContext(req, messages);
 */
export const batchWithTenantContext = (req, documents = []) => {
  if (!req || !req.tenantId) {
    logger.warn('batchWithTenantContext called without tenant context');
    return documents;
  }

  return documents.map((doc) => ({
    ...doc,
    tenantId: req.tenantId,
  }));
};

/**
 * Create a safe query that works with or without tenant context
 * If tenant context exists, adds tenantId filter
 * If not, returns query as-is (backward compatibility)
 *
 * @param {Object} req - Express request object (may not have tenant context)
 * @param {Object} query - MongoDB query object
 * @returns {Object} Query with optional tenant filter
 *
 * @example
 * // For multi-tenant aware routes
 * const query = safeWithTenant(req, { userId: '123' });
 *
 * // For backward compatible routes (no tenant required)
 * const legacyQuery = safeWithTenant(null, { userId: '123' });
 */
export const safeWithTenant = (req, query = {}) => {
  if (req && req.tenantId) {
    return withTenantFilter(req, query);
  }
  return query;
};

/**
 * Check if request has tenant context
 * Useful for conditional logic in services
 *
 * @param {Object} req - Express request object
 * @returns {boolean} True if request has tenant context
 *
 * @example
 * if (hasTenantContext(req)) {
 *   query = withTenantFilter(req, query);
 * }
 */
export const hasTenantContext = (req) => {
  return req && req.tenantId && req.tenantId !== null;
};

/**
 * Get tenant ID from request or return null
 * Safe way to extract tenantId without errors
 *
 * @param {Object} req - Express request object
 * @returns {string|null} Tenant ID or null
 *
 * @example
 * const tenantId = getTenantId(req);
 * if (tenantId) {
 *   // Do tenant-specific logic
 * }
 */
export const getTenantId = (req) => {
  return req && req.tenantId ? req.tenantId : null;
};

/**
 * Create tenant-aware sort options
 * Ensures sorting respects tenant boundaries
 *
 * @param {Object} sortOptions - Sort options object
 * @returns {Object} Sort options with tenantId priority
 *
 * @example
 * const sort = withTenantSort({ createdAt: -1 });
 * // Can be used with tenant-aware queries
 */
export const withTenantSort = (sortOptions = {}) => {
  return {
    tenantId: 1, // Group by tenant first
    ...sortOptions,
  };
};

/**
 * Validate tenant access for bulk operations
 * Checks that all documents in array belong to same tenant
 *
 * @param {Object} req - Express request object with tenant context
 * @param {Array} documents - Array of documents to validate
 * @param {string} documentType - Type of documents
 * @throws {ApiError} If any document doesn't belong to tenant
 */
export const validateBulkTenantOwnership = (
  req,
  documents,
  documentType = 'Resources'
) => {
  if (!req || !req.tenantId) {
    logger.warn('validateBulkTenantOwnership called without tenant context');
    return;
  }

  const requestTenantId = req.tenantId.toString();

  documents.forEach((doc, index) => {
    if (!doc.tenantId) {
      logger.warn(
        `${documentType}[${index}] does not have tenantId field:`,
        doc._id
      );
      return;
    }

    const docTenantId = doc.tenantId.toString();
    if (docTenantId !== requestTenantId) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `You do not have access to ${documentType}[${index}]`
      );
    }
  });
};

export default {
  withTenantFilter,
  withTenantContext,
  withTenantPipeline,
  validateTenantOwnership,
  batchWithTenantContext,
  safeWithTenant,
  hasTenantContext,
  getTenantId,
  withTenantSort,
  validateBulkTenantOwnership,
};
