/**
 * @fileoverview Mongoose model for persisted deep-research reports.
 * Stores the final refined synthesis, all intermediate artifacts (leads,
 * breadth results, debate), source citations, and pipeline execution metadata.
 */

import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  url: { type: String, default: '' },
  snippet: { type: String, default: '' },
  relevance: { type: Number, default: 0 },
}, { _id: false });

const leadSchema = new mongoose.Schema({
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  confidence: { type: Number, default: 0 },
  sources: [sourceSchema],
}, { _id: false });

const researchSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    tenantId: { type: String, default: null, index: true },
    topic: { type: String, required: true },
    researchPlan: { type: mongoose.Schema.Types.Mixed, default: null },
    breadthResults: [mongoose.Schema.Types.Mixed],
    leads: [leadSchema],
    deepDiveResults: [mongoose.Schema.Types.Mixed],
    synthesis: { type: String, default: '' },
    debate: { type: String, default: '' },
    refinedSynthesis: { type: String, default: '' },
    report: { type: String, default: '' },
    sources: [sourceSchema],
    pdfPath: { type: String, default: '' },

    // Pipeline execution metadata
    metadata: {
      model: { type: String, default: 'gemini-3.1-pro' },
      agent: { type: String, default: 'research' },
      nodesExecuted: { type: Number, default: 0 },
      duration: { type: Number, default: 0 },
      totalSources: { type: Number, default: 0 },
      depth: { type: String, default: 'thorough' },
      nodeTimings: { type: mongoose.Schema.Types.Mixed, default: {} },
    },

    status: {
      type: String,
      enum: ['initializing', 'breadth_search', 'identifying_leads', 'deep_dive',
             'synthesizing', 'debating', 'refining', 'saving', 'generating_pdf',
             'completed', 'failed'],
      default: 'initializing',
    },
    error: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: 'research_reports',
  }
);

// Index for efficient user + status queries
researchSchema.index({ userId: 1, createdAt: -1 });
researchSchema.index({ status: 1 });

const Research = mongoose.model('Research', researchSchema);

export default Research;
