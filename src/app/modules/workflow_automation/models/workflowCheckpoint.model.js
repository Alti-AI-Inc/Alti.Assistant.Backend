import mongoose from 'mongoose';

const WorkflowCheckpointSchema = new mongoose.Schema(
  {
    threadId: {
      type: String,
      required: true,
      index: true,
    },
    checkpointId: {
      type: String,
      required: true,
      index: true,
    },
    checkpointStr: {
      type: String,
      required: true,
    },
    metadataStr: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index to prevent duplicate thread_id + checkpoint_id combos
WorkflowCheckpointSchema.index({ threadId: 1, checkpointId: -1 }, { unique: true });

const WorkflowCheckpoint =
  mongoose.models.WorkflowCheckpoint ||
  mongoose.model('WorkflowCheckpoint', WorkflowCheckpointSchema);

export default WorkflowCheckpoint;
