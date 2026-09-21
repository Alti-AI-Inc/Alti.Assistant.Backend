import mongoose from 'mongoose';

const triggerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['cron', 'webhook', 'event', 'manual'],
      required: true,
    },
    cronExpression: {
      type: String, // e.g. '0 9 * * 1-5'
    },
    webhookId: {
      type: String,
      unique: true,
      sparse: true, // auto-generated UUID for webhook URL
    },
    webhookSecret: {
      type: String, // HMAC secret for webhook verification
    },
    eventSource: {
      type: String, // e.g., 'email:received', 'stripe:invoice.paid', 'composio:*'
    },
    eventFilter: {
      type: mongoose.Schema.Types.Mixed, // JSON expression for conditional matching
    },
    targetType: {
      type: String,
      enum: ['agent', 'workflow'],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId, // ref to Agent or Workflow
      required: true,
    },
    inputTemplate: {
      type: String, // Handlebars-style template to transform trigger payload to agent/workflow input
    },
    status: {
      type: String,
      enum: ['active', 'paused'],
      default: 'active',
    },
    lastFiredAt: {
      type: Date,
    },
    fireCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teamId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

triggerSchema.index({ createdBy: 1 });
triggerSchema.index({ type: 1, status: 1 });
triggerSchema.index({ eventSource: 1 });

const Trigger = mongoose.model('Trigger', triggerSchema);

export default Trigger;
