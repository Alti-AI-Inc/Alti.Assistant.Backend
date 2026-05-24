import mongoose from 'mongoose';

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
      index: true,
    },
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workflow',
      index: true,
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
      index: true,
    },
    checkpointId: {
      type: String, // The exact interrupted checkpoint ID to resume from
      required: true,
    },
    decisionTime: Date,
  },
  {
    timestamps: true,
  }
);

const WorkflowApproval =
  mongoose.models.WorkflowApproval ||
  mongoose.model('WorkflowApproval', WorkflowApprovalSchema);

export default WorkflowApproval;
