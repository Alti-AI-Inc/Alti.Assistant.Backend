import mongoose from 'mongoose';
import { logger } from './logger.js';
import ApiError from '../errors/ApiError.js';
import httpStatus from 'http-status';

/**
 * Global Mongoose Tenant Isolation Guardrail Plugin
 * 
 * Actively audits and enforces query scoping to prevent developer oversight 
 * and safeguard against cross-tenant data leaks.
 * 
 * Usage:
 * mongoose.plugin(tenantGuardrail);
 */
export const tenantGuardrail = (schema) => {
  // If the model does not have a tenantId field, skip checks
  if (!schema.paths.tenantId) {
    return;
  }

  const enforceTenantFilter = function (next) {
    const query = this.getQuery();
    const options = this.getOptions() || {};

    // Bypass conditions:
    // 1. Explicitly bypass-flagged in options: query.setOptions({ bypassTenantGuardrail: true })
    // 2. Querying by specific _id list with no tenant context in specific system jobs (e.g. migration, seeding)
    if (options.bypassTenantGuardrail === true) {
      return next();
    }

    // Ensure the query has some filter for tenantId:
    // Either { tenantId: ... } or { tenantId: { $in: [...] } } or { tenantId: null }
    const hasTenantFilter = 'tenantId' in query || 
                            (query.$or && query.$or.some(q => 'tenantId' in q)) ||
                            (query.$and && query.$and.some(q => 'tenantId' in q));

    if (!hasTenantFilter) {
      const modelName = this.model?.modelName || 'UnknownModel';
      const queryStr = JSON.stringify(query);
      
      logger.warn(
        `[TENANT_GUARDRAIL_WARNING] Unguarded database query detected on multi-tenant model: ${modelName}. ` +
        `Query: ${queryStr}. Fallback boundary applied.`
      );

      // In production, rather than crashing the process, apply a fallback boundary
      // of { tenantId: null } to guarantee maximum isolation without raw crashes.
      this.where({ tenantId: null });
    }

    next();
  };

  // Register query pre-hooks
  schema.pre('find', enforceTenantFilter);
  schema.pre('findOne', enforceTenantFilter);
  schema.pre('findOneAndUpdate', enforceTenantFilter);
  schema.pre('findOneAndDelete', enforceTenantFilter);
  schema.pre('findOneAndReplace', enforceTenantFilter);
  schema.pre('updateMany', enforceTenantFilter);
  schema.pre('updateOne', enforceTenantFilter);
  schema.pre('deleteMany', enforceTenantFilter);
  schema.pre('deleteOne', enforceTenantFilter);
  schema.pre('countDocuments', enforceTenantFilter);
};

export default tenantGuardrail;
