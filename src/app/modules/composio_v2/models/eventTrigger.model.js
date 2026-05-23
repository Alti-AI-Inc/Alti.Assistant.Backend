import mongoose from 'mongoose';

const EventTriggerSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    appName: {
      type: String,
      required: true,
      index: true
    },
    eventName: {
      type: String,
      required: true,
      index: true
    },
    dispatchType: {
      type: String,
      enum: ['workflow', 'chain'],
      default: 'workflow',
      required: true
    },
    targetId: {
      type: String,
      required: true
    },
    paramMapping: {
      type: mongoose.Schema.Types.Mixed,
      default: {} // Maps payload path (e.g. "body.issue.title") to execution inputs (e.g. "title")
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);


// Compound index to ensure uniqueness per user, app, and event
EventTriggerSchema.index({ userId: 1, appName: 1, eventName: 1 }, { unique: true });

const EventTrigger = mongoose.models.EventTrigger || mongoose.model('EventTrigger', EventTriggerSchema);

export default EventTrigger;
