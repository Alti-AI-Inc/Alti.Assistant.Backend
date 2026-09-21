import mongoose from 'mongoose';

const { Schema } = mongoose;

const stepSchema = new Schema({
  order: { type: Number },
  type: { type: String, enum: ['agent', 'condition', 'loop', 'delay', 'approval', 'transform'] },
  agentId: { type: Schema.Types.ObjectId, ref: 'Agent' },
  config: { type: Schema.Types.Mixed },
  onSuccess: { type: String },
  onFailure: { type: String, enum: ['retry', 'skip', 'abort', 'next'], default: 'abort' },
  maxRetries: { type: Number, default: 3 },
  label: { type: String }
}, { _id: false });

const workflowSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String },
  steps: [stepSchema],
  triggers: [{ type: Schema.Types.ObjectId, ref: 'Trigger' }],
  status: { type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  teamId: { type: String },
  lastRunAt: { type: Date },
  runCount: { type: Number, default: 0 },
  metadata: {
    avgDurationMs: { type: Number },
    successRate: { type: Number }
  }
}, { timestamps: true });

workflowSchema.index({ createdBy: 1, status: 1 });

const workflowRunSchema = new Schema({
  workflowId: { type: Schema.Types.ObjectId, ref: 'Workflow' },
  runId: { type: String, unique: true },
  status: { type: String, enum: ['running', 'completed', 'failed', 'cancelled', 'awaiting_approval'] },
  input: { type: Schema.Types.Mixed },
  output: { type: Schema.Types.Mixed },
  currentStep: { type: Number },
  stepResults: [{
    stepIndex: Number,
    status: String,
    input: Schema.Types.Mixed,
    output: Schema.Types.Mixed,
    durationMs: Number,
    error: String
  }],
  startedAt: { type: Date },
  completedAt: { type: Date },
  userId: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export const WorkflowRun = mongoose.model('WorkflowRun', workflowRunSchema);
export default mongoose.model('Workflow', workflowSchema);
