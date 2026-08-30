import { Schema, model } from 'mongoose';
import { EXA_SEARCH_STATUS, EXA_SEARCH_TYPE } from './exaSearch.contant.js';

/**
 * One item inside Exa's `results` array.
 * Kept as a subdocument (no own _id, no own collection) because result
 * items are never queried or updated independently of their parent
 * search record — they only ever move as a unit.
 */
const resultItemSchema = new Schema(
  {
    exaId: { type: String }, // Exa's own result id, if provided
    title: { type: String, trim: true },
    url: { type: String, required: true, trim: true },
    author: { type: String, trim: true },
    publishedDate: { type: Date },
    score: { type: Number },
    text: { type: String }, // full/partial page text Exa returns
    summary: { type: String },
    highlights: { type: [String], default: undefined },
    highlightScores: { type: [Number], default: undefined },
    image: { type: String },
    favicon: { type: String },
  },
  { _id: false }
);

const exaSearchSchema = new Schema(
  {
    space: {
      type: Schema.Types.ObjectId,
      ref: 'Space',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    searchSession: {
      type: Schema.Types.ObjectId,
      ref: 'SearchSession',
      required: true,
      index: true,
    },
    query: {
      type: String,
      required: [true, 'Search query is required'],
      trim: true,
      maxlength: [1000, 'Query cannot exceed 1000 characters'],
    },
    searchType: {
      type: String,
      enum: EXA_SEARCH_TYPE,
      default: 'auto',
    },
    category: {
      type: String,
      trim: true,
    },
    // Raw parameters sent to Exa (numResults, includeDomains,
    // excludeDomains, startPublishedDate, useAutoprompt, etc.).
    // Left schemaless deliberately — Exa's request shape evolves and
    // this module does not implement the request itself.
    requestParams: {
      type: Schema.Types.Mixed,
      default: {},
    },
    results: {
      type: [resultItemSchema],
      default: [],
    },
    resultCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    autopromptString: { type: String },
    resolvedSearchType: { type: String },
    // Exa's own request id — useful for support/debugging and for
    // de-duplicating retried writes from the caller.
    requestId: {
      type: String,
      index: true,
      sparse: true,
    },
    costDollars: {
      type: Schema.Types.Mixed,
    },
    status: {
      type: String,
      enum: EXA_SEARCH_STATUS,
      default: 'completed',
      index: true,
    },
    errorMessage: { type: String },
    isFavorite: {
      type: Boolean,
      default: false,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

exaSearchSchema.index({ space: 1, createdAt: -1 });
exaSearchSchema.index({ searchSession: 1, createdAt: -1 });
exaSearchSchema.index({ space: 1, user: 1 });
exaSearchSchema.index({ query: 'text', tags: 'text' });

exaSearchSchema.pre('save', function (next) {
  this.resultCount = this.results?.length ?? 0;
  next();
});

export const ExaSearch = model('Exa-Search', exaSearchSchema);
