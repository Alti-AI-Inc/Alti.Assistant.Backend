import mongoose from 'mongoose';

/**
 * @typedef {object} EventTriggerParamMapping
 * @property {string} [payloadPath] - The path within the incoming event payload (e.g., "body.issue.title").
 * @property {string} [executionInputName] - The name of the input parameter for the target workflow/chain (e.g., "title").
 */

/**
 * @typedef {object} EventTriggerSchema
 * @property {string} userId - The ID of the user who created this event trigger.
 * @property {string} workspaceId - The ID of the workspace this event trigger belongs to.
 * @property {string} appName - The name of the application associated with this event trigger (e.g., "github", "slack").
 * @property {string} eventName - The specific event name from the application (e.g., "issue.opened", "message.created").
 * @property {'workflow'|'chain'} dispatchType - The type of target to dispatch to, either 'workflow' or 'chain'.
 * @property {string} targetId - The ID of the workflow or chain to be executed when the event triggers.
 * @property {EventTriggerParamMapping} paramMapping - A mapping object that defines how to extract data from the incoming event payload and map it to inputs for the target workflow/chain.
 * @property {boolean} isActive - Indicates whether this event trigger is currently active and should process incoming events.
 * @property {Date} createdAt - The timestamp when the event trigger was created.
 * @property {Date} updatedAt - The timestamp when the event trigger was last updated.
 */

/**
 * Mongoose Schema for an Event Trigger.
 * Defines the structure for storing event triggers, which link specific application events
 * to workflows or chains for execution within a workspace.
 *
 * @type {mongoose.Schema<EventTriggerSchema>}
 */
const EventTriggerSchema = new mongoose.Schema(
  {
    /**
     * The ID of the user who created this event trigger.
     * @type {string}
     * @required
     */
    userId: {
      type: String,
      required: true
    },
    /**
     * The ID of the workspace this event trigger belongs to.
     * This is crucial for team management, workspace-level metrics, and plan limits.
     * @type {string}
     * @required
     * @index
     */
    workspaceId: {
      type: String,
      required: true,
      index: true
    },
    /**
     * The name of the application associated with this event trigger (e.g., "github", "slack").
     * @type {string}
     * @required
     * @index
     */
    appName: {
      type: String,
      required: true,
      index: true
    },
    /**
     * The specific event name from the application (e.g., "issue.opened", "message.created").
     * @type {string}
     * @required
     * @index
     */
    eventName: {
      type: String,
      required: true,
      index: true
    },
    /**
     * The type of target to dispatch to, either 'workflow' or 'chain'.
     * @type {'workflow'|'chain'}
     * @default 'workflow'
     * @required
     */
    dispatchType: {
      type: String,
      enum: ['workflow', 'chain'],
      default: 'workflow',
      required: true
    },
    /**
     * The ID of the workflow or chain to be executed when the event triggers.
     * @type {string}
     * @required
     */
    targetId: {
      type: String,
      required: true
    },
    /**
     * A mapping object that defines how to extract data from the incoming event payload
     * and map it to inputs for the target workflow/chain.
     * Keys are payload paths (e.g., "body.issue.title"), values are execution input names (e.g., "title").
     * @type {mongoose.Schema.Types.Mixed}
     * @default {}
     */
    paramMapping: {
      type: mongoose.Schema.Types.Mixed,
      default: {} // Maps payload path (e.g. "body.issue.title") to execution inputs (e.g. "title")
    },
    /**
     * Indicates whether this event trigger is currently active and should process incoming events.
     * @type {boolean}
     * @default true
     */
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    /**
     * Mongoose timestamps option to automatically add `createdAt` and `updatedAt` fields.
     */
    timestamps: true
  }
);

// Compound index to ensure uniqueness per workspace, app, and event.
// This prevents duplicate triggers for the same event within a single workspace,
// which is essential for correct team-level behavior.
EventTriggerSchema.index({ workspaceId: 1, appName: 1, eventName: 1 }, { unique: true });

/**
 * Mongoose Model for EventTrigger.
 * Represents a stored event trigger in the database.
 *
 * @type {mongoose.Model<EventTriggerSchema>}
 */
const EventTrigger = mongoose.models.EventTrigger || mongoose.model('EventTrigger', EventTriggerSchema);

export default EventTrigger;