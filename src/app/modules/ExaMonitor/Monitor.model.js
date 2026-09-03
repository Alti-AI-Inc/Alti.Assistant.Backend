import { Schema, model } from 'mongoose';
import { MONITOR_STATUS, MONITOR_TRIGGER_TYPE } from './monitor.constant.js';

/**
 * Nested under `search` in the create/update request — kept as a
 * subdocument since it always moves as a unit with its parent monitor.
 */
const searchConfigSchema = new Schema(
  {
    query: { type: String, required: true, trim: true },
    numResults: { type: Number, min: 1, max: 100 },
    // Contents options (text/highlights/summary/extras/maxAgeHours/...)
    // left schemaless — this module stores Exa's config, it does not
    // reimplement it, same rationale as ExaSearch.requestParams.
    contents: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const triggerSchema = new Schema(
  {
    type: { type: String, enum: MONITOR_TRIGGER_TYPE, required: true },
    period: { type: String, required: true }, // e.g. "1h", "6h", "1d", "7d"
  },
  { _id: false }
);

const webhookSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    events: { type: [String], default: undefined }, // undefined = all events
  },
  { _id: false }
);

const monitorSchema = new Schema(
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
    // Exa's own monitor id ("mon_abc123") — globally unique on Exa's
    // side, so the uniqueness constraint here is global too, not
    // scoped to space.
    exaMonitorId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: { type: String, trim: true },
    // Mirrors Exa's status. 'disabled' is set by Exa's system only
    // (e.g. after repeated auth failures) — this module just reflects
    // whatever the last known state was, it never sets 'disabled' itself.
    status: {
      type: String,
      enum: MONITOR_STATUS,
      default: 'active',
      index: true,
    },
    search: {
      type: searchConfigSchema,
      required: true,
    },
    // null = manual-only monitor, no schedule
    trigger: {
      type: triggerSchema,
      default: null,
    },
    // JSON Schema controlling structured output (type: 'text' | 'object')
    outputSchema: {
      type: Schema.Types.Mixed,
      default: null,
    },
    // Arbitrary caller-defined key/values (e.g. Slack routing ids),
    // echoed back by Exa in webhook deliveries.
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
    webhook: {
      type: webhookSchema,
      required: true,
    },
    // The one-time webhook signing secret. `select: false` keeps it out
    // of normal find()/JSON responses; only pulled in explicitly by the
    // webhook-signature-verification code path.
    webhookSecret: {
      type: String,
      select: false,
    },
    nextRunAt: { type: Date, default: null },
    // Exa's own timestamps on the monitor object, distinct from our
    // local createdAt/updatedAt (which track when *we* last synced it).
    exaCreatedAt: { type: Date },
    exaUpdatedAt: { type: Date },
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

monitorSchema.index({ space: 1, status: 1 });
monitorSchema.index({ space: 1, createdAt: -1 });

monitorSchema.pre('save', function (next) {
  this.lastSyncedAt = new Date();
  next();
});

export const Monitor = model('exa-monitor', monitorSchema);