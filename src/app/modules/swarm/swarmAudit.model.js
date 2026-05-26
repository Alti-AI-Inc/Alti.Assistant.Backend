import mongoose from 'mongoose';

const SwarmAuditSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    toolName: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['dynamic-skill', 'standard-tool', 'reflection-self-healing'],
      default: 'dynamic-skill',
    },
    attempts: [
      {
        attempt: Number,
        timestamp: { type: Date, default: Date.now },
        missingPackage: String,
        installSuccess: Boolean,
        stdout: String,
        stderr: String,
        durationMs: Number,
      },
    ],
    status: {
      type: String,
      enum: ['success', 'failed', 'security-blocked', 'resource-aborted'],
      required: true,
    },
    finalResult: {
      type: String,
    },
    errorMessage: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const SwarmAudit = mongoose.models.SwarmAudit || mongoose.model('SwarmAudit', SwarmAuditSchema);

export default SwarmAudit;
