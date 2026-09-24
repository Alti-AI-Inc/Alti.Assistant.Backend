import mongoose from 'mongoose';

/**
 * ToolUsage — lightweight per-user tool metering.
 * Records which tools are called, how often, and how long they take.
 * Enables Stripe metered billing and admin analytics dashboards.
 */
const toolUsageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tool: { type: String, required: true, index: true },
  durationMs: { type: Number, default: 0 },
  success: { type: Boolean, default: true },
  metadata: { type: mongoose.Schema.Types.Mixed },
}, {
  timestamps: true,
  collection: 'tool_usage',
});

// Compound index for usage queries: user + month + tool
toolUsageSchema.index({ userId: 1, createdAt: -1 });
toolUsageSchema.index({ tool: 1, createdAt: -1 });

const ToolUsage = mongoose.model('ToolUsage', toolUsageSchema);

/**
 * Record a tool execution. Fire-and-forget — never blocks the request.
 */
export async function recordToolUsage(userId, toolName, durationMs = 0, success = true, metadata = null) {
  try {
    await ToolUsage.create({
      userId,
      tool: toolName,
      durationMs,
      success,
      ...(metadata && { metadata }),
    });
  } catch (err) {
    // Never fail a request because of metering
    console.warn(`[ToolUsage] Failed to record: ${err.message}`);
  }
}

/**
 * Get tool usage summary for a user in the current billing period.
 */
export async function getUserToolUsage(userId, sinceDate) {
  const since = sinceDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const results = await ToolUsage.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), createdAt: { $gte: since } } },
    { $group: { _id: '$tool', count: { $sum: 1 }, avgDurationMs: { $avg: '$durationMs' }, errors: { $sum: { $cond: ['$success', 0, 1] } } } },
    { $sort: { count: -1 } },
  ]);
  return results.map(r => ({ tool: r._id, count: r.count, avgDurationMs: Math.round(r.avgDurationMs), errors: r.errors }));
}

export default ToolUsage;
