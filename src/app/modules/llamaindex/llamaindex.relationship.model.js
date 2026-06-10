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
 * @property {Date} createdAt - The timestamp when the relationship was created.
 * @property {Date} updatedAt - The timestamp when the relationship was last updated.
 */

/**
 * Mongoose Schema for Document Relationships.
 *
 * This schema defines how relationships between different documents are stored in the database.
 * It captures the owner, the two documents involved, the type of relationship, and additional metadata
 * like confidence and shared concepts.
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
      required: true,
      index: true
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
      index: true
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
      required: true,
      index: true
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
      required: true,
      index: true
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
 * Mongoose model for Document Relationships.
 *
 * This model provides an interface for interacting with the 'documentrelationships' collection
 * in the MongoDB database, allowing for CRUD operations on document relationship records.
 *
 * @type {mongoose.Model<DocumentRelationship>}
 */
const DocumentRelationship = mongoose.models.DocumentRelationship || mongoose.model('DocumentRelationship', DocumentRelationshipSchema);

export default DocumentRelationship;