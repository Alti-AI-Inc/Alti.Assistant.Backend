import mongoose from 'mongoose';

// --- Schema Definition ---

const WorkflowApprovalSchema = new mongoose.Schema(
  {
    approvalId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // This field is the first key in a compound index, so a separate index is redundant.
    },
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workflow',
      // This field is the first key in a compound index, so a separate index is redundant.
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    stepId: {
      type: String,
      required: true,
    },
    action: {
      type: String, // e.g. 'gmail.send_email'
      required: true,
    },
    parameters: {
      type: Object, // The parameters the step would be called with
      default: {},
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true, // Kept for queries filtering only by status (e.g., all pending approvals system-wide).
    },
    checkpointId: {
      type: String, // The exact interrupted checkpoint ID to resume from
      required: true,
    },
    formSchema: {
      type: Object, // Optional dynamic schema for human input forms
      default: null,
    },
    formResponse: {
      type: Object, // User-submitted form responses
      default: null,
    },
    decisionTime: Date,
  },
  {
    timestamps: true,
  }
);

// --- Compound Indexes for Performance ---
// A compound index on {userId, status} is highly effective for the common query
// of fetching all pending (or approved/rejected) approvals for a specific user.
// This index also covers queries that only filter by `userId`.
WorkflowApprovalSchema.index({ userId: 1, status: 1 });

// Similarly, a compound index on {workflowId, status} is effective for fetching
// approvals of a certain status for a specific workflow, a likely admin/manager query.
// This index also covers queries that only filter by `workflowId`.
WorkflowApprovalSchema.index({ workflowId: 1, status: 1 });

const WorkflowApproval =
  mongoose.models.WorkflowApproval ||
  mongoose.model('WorkflowApproval', WorkflowApprovalSchema);

export default WorkflowApproval;