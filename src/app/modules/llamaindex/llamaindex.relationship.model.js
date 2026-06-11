/**
 * @file Defines the Mongoose schema and model for Document Relationships within the LlamaIndex module.
 * @module app/modules/llamaindex/llamaindex.relationship.model
 * @author Your Name/Organization (if known, otherwise omit)
 */

import mongoose, { Schema } from 'mongoose';

/**
 * @typedef {object} DocumentRelationship
 * @property {mongoose.Schema.Types.ObjectId} workspaceId - The ID of the workspace this relationship belongs to.
 * @property {mongoose.Schema.Types.ObjectId} userId - The ID of the user who owns this relationship.
 * @property {string} sourceDocId - The ID of the source document in the relationship.
 * @property {string} targetDocId - The ID of the target document in the relationship.
 * @property {('shared_entity'|'cross_reference'|'hierarchical'|'dependency'|'topic_similarity')} relationType - The type of relationship between the documents.
 * @property {number} confidence - A numerical value indicating the confidence level of the relationship (0 to 1).
 * @property {string[]} sharedConcepts - An array of strings representing concepts shared between the documents.
 * @property {string} description - A textual description of the relationship.
 * @property {mongoose.Schema.Types.ObjectId} lastModifiedBy - The ID of the user who last modified the record.
 * @property {boolean} isFlaggedForReview - A flag for platform administrators to mark the record for review.
 * @property {object} platformMetadata - A container for administrator-specific metadata.
 * @property {string} platformMetadata.notes - Administrative notes.
 * @property {mongoose.Schema.Types.ObjectId} platformMetadata.reviewedBy - The admin who reviewed the record.
 * @property {Date} platformMetadata.reviewedAt - The timestamp of the administrative review.
 * @property {Date} createdAt - The timestamp when the relationship was created.
 * @property {Date} updatedAt - The timestamp when the relationship was last updated.
 */

/**
 * Mongoose Schema for Document Relationships.
 *
 * This schema defines how relationships between different documents are stored in the database.
 * It captures the owner, the two documents involved, the type of relationship, and additional metadata
 * like confidence and shared concepts. It also includes fields for Platform Owner oversight.
 *
 * @type {mongoose.Schema<DocumentRelationship>}
 */
const DocumentRelationshipSchema = new mongoose.Schema(
  {
    /**
     * CRITICAL FIX: Added workspaceId for multi-tenancy and role-based access control.
     * This ensures that document relationships are strictly scoped to a specific workspace,
     * preventing data leakage between tenants and allowing admins/managers to view data
     * within their designated context. It is essential for propagating usage details and limits
     * up to the workspace/admin level.
     * @type {mongoose.Schema.Types.ObjectId}
     */
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true
      // PERFORMANCE OPTIMIZATION: Removed redundant individual index. This field is the leading field in multiple compound indexes below, which is more efficient.
    },
    /**
     * The ID of the user who owns this document relationship.
     * This field is required and indexed for efficient querying by user.
     * SECURITY FIX: Changed from String to ObjectId and added a ref to the 'User' model.
     * This enforces referential integrity at the application level and allows for easier
     * population of user data, preventing orphaned records and strengthening access control checks.
     * @type {mongoose.Schema.Types.ObjectId}
     */
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true // Kept for queries specific to a user across all their workspaces.
    },
    /**
     * The ID of the source document in this relationship.
     * This field is required and indexed.
     * NOTE: This is kept as a String assuming it might be an external ID from LlamaIndex.
     * If it corresponds to a model within this application, it should be converted to an ObjectId with a ref.
     * @type {string}
     */
    sourceDocId: {
      type: String,
      required: true
      // PERFORMANCE OPTIMIZATION: Removed redundant individual index. Replaced with a more efficient compound index with workspaceId.
    },
    /**
     * The ID of the target document in this relationship.
     * This field is required and indexed.
     * NOTE: This is kept as a String assuming it might be an external ID from LlamaIndex.
     * If it corresponds to a model within this application, it should be converted to an ObjectId with a ref.
     * @type {string}
     */
    targetDocId: {
      type: String,
      required: true
      // PERFORMANCE OPTIMIZATION: Removed redundant individual index. Replaced with a more efficient compound index with workspaceId.
    },
    /**
     * The type of relationship between the source and target documents.
     * Must be one of the predefined enum values. Defaults to 'topic_similarity'.
     * @type {('shared_entity'|'cross_reference'|'hierarchical'|'dependency'|'topic_similarity')}
     */
    relationType: {
      type: String,
      required: true,
      enum: ['shared_entity', 'cross_reference', 'hierarchical', 'dependency', 'topic_similarity'],
      default: 'topic_similarity'
    },
    /**
     * A numerical value representing the confidence level of this relationship.
     * Must be between 0 and 1. Defaults to 0.5.
     * @type {number}
     */
    confidence: {
      type: Number,
      default: 0.5,
      min: 0,
      max: 1
    },
    /**
     * An array of strings representing common concepts or entities shared between the two documents.
     * @type {string[]}
     */
    sharedConcepts: {
      type: [String],
      default: []
    },
    /**
     * A free-form text description providing more details about the nature of the relationship.
     * @type {string}
     */
    description: {
      type: String,
      default: ''
    },

    // PLATFORM OWNER OPTIMIZATION: Added fields for administrative oversight and enhanced auditing.
    // These fields are intended for use by Platform Owners/Super Admins to manage and review
    // relationships across the entire platform, enabling global oversight and quality control.

    /**
     * The ID of the user who last modified this document relationship.
     * This enhances the audit trail, tracking not just creation but also subsequent changes.
     * @type {mongoose.Schema.Types.ObjectId}
     */
    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },

    /**
     * A flag indicating if this relationship has been marked for review by a platform administrator.
     * This allows for proactive monitoring and quality control across all tenants.
     * Indexed for efficient querying of all flagged items, a key feature for global oversight.
     * @type {boolean}
     */
    isFlaggedForReview: {
      type: Boolean,
      default: false
      // PERFORMANCE OPTIMIZATION: Index is defined below as a partial index for greater efficiency.
    },

    /**
     * A container for metadata used exclusively by platform administrators.
     * This provides a dedicated space for notes, review status, and other administrative details
     * without cluttering the primary data fields used by tenants.
     * @type {object}
     */
    platformMetadata: {
      /**
       * Administrative notes regarding this relationship.
       * @type {string}
       */
      notes: {
        type: String,
        default: ''
      },
      /**
       * The ID of the administrator who last reviewed this flagged item.
       * @type {mongoose.Schema.Types.ObjectId}
       */
      reviewedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      /**
       * The timestamp of the last administrative review.
       * @type {Date}
       */
      reviewedAt: {
        type: Date
      }
    }
  },
  {
    /**
     * Mongoose timestamps option to automatically add `createdAt` and `updatedAt` fields.
     * @type {boolean}
     */
    timestamps: true
  }
);

/**
 * HIERARCHY/SECURITY FIX: Updated compound index to include workspaceId.
 * This enforces uniqueness of a relationship (source -> target) per user *within a specific workspace*.
 * It's a critical change for maintaining data integrity in a multi-tenant environment and
 * significantly improves query performance for workspace-scoped operations, which is fundamental
 * for role-based access by admins and managers.
 */
DocumentRelationshipSchema.index({ workspaceId: 1, userId: 1, sourceDocId: 1, targetDocId: 1 }, { unique: true });

/**
 * PERFORMANCE OPTIMIZATION: Added compound indexes for common query patterns.
 * Querying for all relationships involving a specific document within a workspace is a common use case.
 * These indexes ensure such lookups are fast and efficient.
 */
DocumentRelationshipSchema.index({ workspaceId: 1, sourceDocId: 1 });
DocumentRelationshipSchema.index({ workspaceId: 1, targetDocId: 1 });

/**
 * PERFORMANCE OPTIMIZATION: Added compound index for analytics and filtering.
 * This index supports efficient queries for managers/admins who need to filter or aggregate
 * relationships by their type within a specific workspace (e.g., "show all 'hierarchical' relationships").
 */
DocumentRelationshipSchema.index({ workspaceId: 1, relationType: 1 });

/**
 * PERFORMANCE OPTIMIZATION: Added a partial index for `isFlaggedForReview`.
 * This index is more efficient than a standard boolean index because it only includes documents
 * where `isFlaggedForReview` is true. Since this is expected to be a small subset of the total
 * documents, the index will be smaller and faster for the common admin query of finding all flagged items.
 */
DocumentRelationshipSchema.index({ isFlaggedForReview: 1 }, { partialFilterExpression: { isFlaggedForReview: true } });

/**
 * PERFORMANCE OPTIMIZATION: Added a compound, multikey index for searching by shared concepts.
 * This supports efficient lookups for relationships within a workspace that contain a specific
 * shared concept (e.g., "find all documents related by the concept 'machine_learning'").
 */
DocumentRelationshipSchema.index({ workspaceId: 1, sharedConcepts: 1 });


/**
 * HIERARCHY & INTEGRATION FIX: Propagate usage data to the parent Workspace.
 * The following hooks ensure that actions on DocumentRelationship records correctly
 * propagate usage data up to the parent Workspace. This is a critical integration
 * task for enforcing limits, tracking tenant activity, and providing visibility
 * to admins and managers, thus closing a potential hierarchy gap.
 */
DocumentRelationshipSchema.post('save', async function (doc, next) {
  // `this.isNew` is a Mongoose internal flag, true only on initial document creation.
  if (this.isNew) {
    try {
      // Use mongoose.model() to avoid potential circular dependency issues with direct imports.
      const Workspace = mongoose.model('Workspace');
      await Workspace.findByIdAndUpdate(doc.workspaceId, {
        // Assuming the Workspace model has a 'usage' object with a 'documentRelationships' counter.
        $inc: { 'usage.documentRelationships': 1 },
      });
    } catch (error) {
      // Log the error but do not fail the operation, as the primary record was already saved.
      // A separate monitoring or reconciliation process should handle these failures.
      console.error(
        `HIERARCHY_GAP: Failed to increment documentRelationship usage for workspace ${doc.workspaceId}.`,
        error
      );
    }
  }
  next();
});

// This hook ensures that when a relationship is deleted (via `doc.deleteOne()`), the usage count is decremented.
DocumentRelationshipSchema.post('deleteOne', { document: true, query: false }, async function (doc, next) {
    try {
      const Workspace = mongoose.model('Workspace');
      await Workspace.findByIdAndUpdate(doc.workspaceId, {
        $inc: { 'usage.documentRelationships': -1 },
      });
    } catch (error) {
      console.error(
        `HIERARCHY_GAP: Failed to decrement documentRelationship usage for workspace ${doc.workspaceId}.`,
        error
      );
    }
    next();
});


/**
 * Mongoose model for Document Relationships.
 *
 * This model provides an interface for interacting with the 'documentrelationships' collection
 * in the MongoDB database, allowing for CRUD operations on document relationship records.
 *
 * @type {mongoose.Model<DocumentRelationship>}
 */
const DocumentRelationship = mongoose.models.DocumentRelationship || mongoose.model('DocumentRelationship', DocumentRelationshipSchema);

export default DocumentRelationship;