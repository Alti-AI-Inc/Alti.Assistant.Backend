import mongoose from 'mongoose';

const OpenClawAgentSchema = new mongoose.Schema(
  {
    agentId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    role: { type: String, default: 'Autonomous Assistant' },
    instructions: { type: String, default: '' },
    enabledSkills: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'paused', 'terminated'], default: 'active' },
  },
  { timestamps: true }
);

const OpenClawMemorySchema = new mongoose.Schema(
  {
    agentId: { type: String, required: true, index: true },
    type: { type: String, enum: ['system', 'user', 'agent', 'tool', 'error'], required: true },
    userId: { type: String }, // If triggered by user
    content: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const OpenClawTaskSchema = new mongoose.Schema(
  {
    taskId: { type: String, required: true, unique: true, index: true },
    agentId: { type: String, required: true, index: true },
    status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
    skillId: { type: String, required: true },
    input: { type: mongoose.Schema.Types.Mixed, default: {} },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

export const OpenClawAgent = mongoose.model('OpenClawAgent', OpenClawAgentSchema);
export const OpenClawMemory = mongoose.model('OpenClawMemory', OpenClawMemorySchema);
export const OpenClawTask = mongoose.model('OpenClawTask', OpenClawTaskSchema);
