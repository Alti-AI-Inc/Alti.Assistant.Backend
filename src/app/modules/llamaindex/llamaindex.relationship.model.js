/**
 * @file Defines the Mongoose schema and model for Document Relationships within the LlamaIndex module.
 * @module app/modules/llamaindex/llamaindex.relationship.model
 * @author Your Name/Organization (if known, otherwise omit)
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} DocumentRelationship
 * @property {string} userId - The ID of the user who owns this relationship.
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
     * The ID of the user who owns this document relationship.
     * This field is required and indexed for efficient querying by user.
     * @type {string}
     */
    userId: {
      type: String,
      required: true,
      index: true
    },
    /**
     * The ID of the source document in this relationship.
     * This field is required and indexed.
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
 * Compound index to ensure uniqueness of relationships and speed up queries.
 * This index allows for efficient lookup of relationships from a specific source document
 * to a specific target document for a given user, and prevents duplicate relationships.
 */
DocumentRelationshipSchema.index({ userId: 1, sourceDocId: 1, targetDocId: 1 }, { unique: true });

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