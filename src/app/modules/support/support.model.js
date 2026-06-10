import mongoose from 'mongoose';

const supportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required for audit and ownership tracking'],
    },
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Workspace/Tenant context is required to maintain data isolation boundaries'],
    },
    email: {
      type: String,
      required: [true, 'Contact email is required'],
      trim: true,
      lowercase: true,
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: [true, 'Message body is required'],
    },
    status: {
      type: String,
      enum: ['open', 'pending', 'closed'],
      default: 'open',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Typically a manager, admin, or super_admin
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// Ensure query performance and strict tenant isolation
supportSchema.index({ workspace: 1, createdAt: -1 });
supportSchema.index({ user: 1 });

const Support = mongoose.model('Support', supportSchema);

export default Support;