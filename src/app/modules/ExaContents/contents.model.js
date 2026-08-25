import { Schema, model } from 'mongoose';
import {
  CONTENT_RECORD_STATUS,
  CONTENT_URL_STATUS,
} from './contents.constant.js';

/**
 * Extracted content for a single requested URL.
 * Subdocument, no own _id/collection — a content item only ever moves
 * as part of its parent extraction record, same rationale as
 * search.model.js's resultItemSchema.
 */
const contentResultItemSchema = new Schema(
  {
    id: { type: String, required: true, trim: true }, // the requested URL
    url: { type: String, trim: true }, // resolved url, if Exa redirected
    title: { type: String, trim: true },
    author: { type: String, trim: true },
    publishedDate: { type: Date },
    text: { type: String }, // full page markdown, when `text` was requested
    highlights: { type: [String], default: undefined },
    highlightScores: { type: [Number], default: undefined },
    summary: { type: String }, // LLM-generated summary, when requested
    // Structured extraction result when `summary.schema` was supplied —
    // shape is caller-defined, so left schemaless.
    structuredSummary: { type: Schema.Types.Mixed },
    image: { type: String },
    favicon: { type: String },
  },
  { _id: false }
);

/**
 * Per-URL success/failure, mirrors Exa's `statuses[]` response array.
 */
const statusItemSchema = new Schema(
  {
    id: { type: String, required: true, trim: true }, // the requested URL
    status: { type: String, enum: CONTENT_URL_STATUS, required: true },
    errorTag: { type: String },
    httpStatusCode: { type: Number },
  },
  { _id: false }
);

const exaContentSchema = new Schema(
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
    // Optional link back to the stored search whose result URLs were
    // extracted here. Nullable — contents can also be requested for
    // URLs the user supplied directly, with no prior stored search.
    sourceSearch: {
      type: Schema.Types.ObjectId,
      ref: 'ExaSearch',
      index: true,
    },
    // The `ids` array sent to Exa — the URLs content was requested for.
    requestIds: {
      type: [String],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'At least one url is required',
      },
    },
    // Raw options sent to Exa (text, highlights, summary, maxAgeHours,
    // livecrawlTimeout, subpages, subpageTarget). Left schemaless for
    // the same reason as ExaSearch.requestParams — this module stores
    // Exa's output, it does not implement the request itself.
    requestOptions: {
      type: Schema.Types.Mixed,
      default: {},
    },
    results: {
      type: [contentResultItemSchema],
      default: [],
    },
    statuses: {
      type: [statusItemSchema],
      default: [],
    },
    resultCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    successCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    errorCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: CONTENT_RECORD_STATUS,
      default: 'completed',
      index: true,
    },
    // Set when the whole Exa /contents request failed outright (network
    // error, non-2xx response) before any per-url statuses were returned.
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

exaContentSchema.index({ space: 1, createdAt: -1 });
exaContentSchema.index({ space: 1, sourceSearch: 1 });
exaContentSchema.index({ requestIds: 1 });
exaContentSchema.index({ tags: 'text' });

exaContentSchema.pre('save', function (next) {
  this.resultCount = this.results?.length ?? 0;

  const successCount = this.statuses.filter(
    (s) => s.status === 'success'
  ).length;
  const errorCount = this.statuses.filter((s) => s.status === 'error').length;
  this.successCount = successCount;
  this.errorCount = errorCount;

  if (this.statuses.length > 0) {
    if (errorCount === 0) this.status = 'completed';
    else if (successCount === 0) this.status = 'failed';
    else this.status = 'partial';
  }

  next();
});

export const ExaContent = model('ExaContent', exaContentSchema);
