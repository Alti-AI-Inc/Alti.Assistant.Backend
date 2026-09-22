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

// Queue for the Desktop/Electron/Rust App to poll and execute locally
const EdgeCommandSchema = new mongoose.Schema(
  {
    commandId: { type: String, required: true, unique: true, index: true },
    machineId: { type: String, required: true, index: true }, // The ID of the desktop app or VM
    command: { type: String, required: true }, // e.g., 'bash', 'screenshot', 'composio_proxy'
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['queued', 'processing', 'completed', 'failed'], default: 'queued' },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

export const OpenClawAgent = mongoose.model('OpenClawAgent', OpenClawAgentSchema);
export const OpenClawMemory = mongoose.model('OpenClawMemory', OpenClawMemorySchema);
export const OpenClawTask = mongoose.model('OpenClawTask', OpenClawTaskSchema);
export const EdgeCommand = mongoose.model('EdgeCommand', EdgeCommandSchema);
