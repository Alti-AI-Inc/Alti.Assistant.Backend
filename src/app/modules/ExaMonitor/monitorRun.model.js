import { Schema, model } from 'mongoose';
import {
  MONITOR_RUN_FAIL_REASON,
  MONITOR_RUN_STATUS,
} from './monitorRun.constant.js';

const citationSchema = new Schema(
  { url: { type: String, required: true }, title: { type: String } },
  { _id: false }
);

const groundingItemSchema = new Schema(
  {
    field: { type: String, required: true }, // e.g. "content", "results[0].title"
    citations: { type: [citationSchema], default: [] },
    confidence: { type: String, enum: ['low', 'medium', 'high'] },
  },
  { _id: false }
);

const outputSchema = new Schema(
  {
    // Array of Exa search result objects (title, url, publishedDate, ...) —
    // left schemaless per-item, mirroring ExaSearch's approach for
    // arbitrary Exa response fields.
    results: { type: [Schema.Types.Mixed], default: undefined },
    // Structured or plain-text synthesized output, shaped by the
    // parent monitor's outputSchema.
    content: { type: Schema.Types.Mixed },
    grounding: { type: [groundingItemSchema], default: undefined },
  },
  { _id: false }
);

const monitorRunSchema = new Schema(
  {
    // Denormalized alongside `monitor` (rather than requiring a join)
    // so every isolation check and query can filter on `space` directly,
    // same pattern as ExaSearch/ExaContent.
    space: {
      type: Schema.Types.ObjectId,
      ref: 'Space',
      required: true,
      index: true,
    },
    monitor: {
      type: Schema.Types.ObjectId,
      ref: 'Monitor',
      required: true,
      index: true,
    },
    // Exa's own run id ("run_xyz789")
    exaRunId: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: MONITOR_RUN_STATUS,
      default: 'pending',
      index: true,
    },
    output: {
      type: outputSchema,
      default: null,
    },
    failReason: {
      type: String,
      enum: MONITOR_RUN_FAIL_REASON,
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    failedAt: { type: Date },
    cancelledAt: { type: Date },
    durationMs: { type: Number },
    exaCreatedAt: { type: Date },
    exaUpdatedAt: { type: Date },
  },
  { timestamps: true }
);

monitorRunSchema.index({ space: 1, createdAt: -1 });
monitorRunSchema.index({ monitor: 1, createdAt: -1 });
// A given run id should only ever appear once per monitor — this also
// makes webhook ingestion idempotent (upsert on this pair).
monitorRunSchema.index({ monitor: 1, exaRunId: 1 }, { unique: true });

export const MonitorRun = model('MonitorRun', monitorRunSchema);
