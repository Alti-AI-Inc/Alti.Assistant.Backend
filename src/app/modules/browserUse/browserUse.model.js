import mongoose from 'mongoose';

const stepSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    step: { type: Number },
    evaluation_previous_goal: { type: String },
    next_goal: { type: String },
    url: { type: String },
  },
  { _id: false }
);

const responseSchema = new mongoose.Schema(
  {
    taskId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['created', 'running', 'finished', 'stopped', 'paused', 'failed'],
      default: 'created',
    },
    prompt: { type: String, required: true },
    output: { type: String, default: null },
    structured_output: { type: mongoose.Schema.Types.Mixed },
    live_url: { type: String, default: null },
    error_message: { type: String },
    finished_at: { type: Date, default: null },
    steps: {
      type: [stepSchema],
      default: [],
    },
  },
  { timestamps: true }
);

const browserSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
    },
    responses: [responseSchema],
  },
  { timestamps: true }
);

// Indexes for multi-tenant production efficiency
browserSessionSchema.index({ tenantId: 1, user: 1, createdAt: -1 });
browserSessionSchema.index({ tenantId: 1, createdAt: -1 });
browserSessionSchema.index({ user: 1, createdAt: -1 }); // Legacy fallback

const BrowserSession = mongoose.model(
  'BrowserSession',
  browserSessionSchema,
  'browser-use'
);

export default BrowserSession;
