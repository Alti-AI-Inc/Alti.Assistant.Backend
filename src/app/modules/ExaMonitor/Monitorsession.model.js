import { Schema, model } from 'mongoose';

/**
 * A monitor-session groups one or more `exa-monitor` (Monitor) records
 * together. A Space links to sessions, not to monitors directly —
 * traversal is space -> monitor-session -> exa-monitor.
 */
const monitorSessionSchema = new Schema(
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
    // Optional caller-facing label for the session.
    name: { type: String, trim: true },
    monitors: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Monitor' }],
      default: [],
    },
  },
  { timestamps: true }
);

monitorSessionSchema.index({ space: 1, createdAt: -1 });

export const MonitorSession = model('monitor-session', monitorSessionSchema);