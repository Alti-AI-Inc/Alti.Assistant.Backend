import mongoose from 'mongoose';
import { OWNER_TYPES, CONCEPT_TYPES, SOURCE_TYPES } from './knowledge_catalog.constant.js';

const KnowledgeBundleSchema = new mongoose.Schema(
  {
    bundleId: {
      type: String,
      required: [true, 'Bundle ID is required'],
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    gcsPath: {
      type: String,
      trim: true,
    },
    gcsUrl: {
      type: String,
      trim: true,
    },
    ownerType: {
      type: String,
      enum: Object.values(OWNER_TYPES),
      default: OWNER_TYPES.USER,
    },
    ownerId: {
      type: String,
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    sourceType: {
      type: String,
      enum: Object.values(SOURCE_TYPES),
      default: SOURCE_TYPES.MANUAL,
    },
    sourceRef: {
      type: mongoose.Schema.Types.ObjectId,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique bundleId per tenant
KnowledgeBundleSchema.index({ tenantId: 1, bundleId: 1 }, { unique: true });

const KnowledgeConceptSchema = new mongoose.Schema(
  {
    bundleId: {
      type: String,
      required: [true, 'Bundle ID is required'],
      trim: true,
    },
    conceptId: {
      type: String,
      required: [true, 'Concept ID is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: Object.values(CONCEPT_TYPES),
      required: [true, 'Concept type is required'],
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    resource: {
      type: String,
      trim: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    frontmatter: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    body: {
      type: String,
      default: '',
    },
    links: {
      type: [String],
      default: [],
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique conceptId per bundle per tenant
KnowledgeConceptSchema.index({ tenantId: 1, bundleId: 1, conceptId: 1 }, { unique: true });
KnowledgeConceptSchema.index({ tags: 1 });
KnowledgeConceptSchema.index({ type: 1 });

export const KnowledgeBundle = mongoose.model('KnowledgeBundle', KnowledgeBundleSchema);
export const KnowledgeConcept = mongoose.model('KnowledgeConcept', KnowledgeConceptSchema);

export default {
  KnowledgeBundle,
  KnowledgeConcept,
};
