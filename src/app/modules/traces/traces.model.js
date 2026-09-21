import { Schema, model } from 'mongoose';
import crypto from 'crypto';

const stepSchema = new Schema({
  stepIndex: Number,
  type: String, // 'llm', 'tool', 'rag', 'condition', 'approval'
  name: String,
  input: Schema.Types.Mixed,
  output: Schema.Types.Mixed,
  model: String,
  tokensUsed: {
    prompt: Number,
    completion: Number,
    total: Number,
  },
  latencyMs: Number,
  toolCalls: [{
    tool: String,
    args: Schema.Types.Mixed,
    result: Schema.Types.Mixed,
    durationMs: Number,
  }],
  status: {
    type: String,
    enum: ['completed', 'failed', 'skipped'],
  },
  error: String,
});

const traceSchema = new Schema({
  runId: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomUUID(),
  },
  type: {
    type: String,
    enum: ['agent', 'workflow'],
    required: true,
  },
  sourceId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  sourceName: String,
  triggerId: Schema.Types.ObjectId,
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['running', 'completed', 'failed', 'cancelled', 'awaiting_approval'],
    default: 'running',
  },
  input: Schema.Types.Mixed,
  output: Schema.Types.Mixed,
  startedAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: Date,
  durationMs: Number,
  steps: [stepSchema],
  totalTokens: {
    prompt: Number,
    completion: Number,
    total: Number,
  },
  estimatedCost: Number,
  feedback: {
    rating: Number,
    comment: String,
    createdAt: Date,
  },
  tags: [String],
}, {
  timestamps: true,
});

traceSchema.index({ userId: 1, startedAt: -1 });
traceSchema.index({ sourceId: 1, startedAt: -1 });
traceSchema.index({ status: 1 });

const Trace = model('Trace', traceSchema);
export default Trace;
