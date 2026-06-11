import mongoose from 'mongoose';

/**
 * @typedef {object} EventTriggerSchema
 * @property {string} [name] - A user-defined name for the trigger for easy identification on dashboards.
 * @property {string} createdBy - The ID of the user who created this event trigger.
 * @property {string} workspaceId - The ID of the workspace this event trigger belongs to.
 * @property {string} appName - The name of the application associated with this event trigger (e.g., "github", "slack").
 * @property {string} eventName - The specific event name from the application (e.g., "issue.opened", "message.created").
 * @property {'workflow'|'chain'} dispatchType - The type of target to dispatch to, either 'workflow' or 'chain'.
 * @property {string} targetId - The ID of the workflow or chain to be executed when the event triggers.
 * @property {Object.<string, string>} paramMapping - A map where keys are JSON paths to data in the event payload (e.g., "body.issue.title") and values are the corresponding input names for the target workflow/chain (e.g., "title").
 * @property {boolean} isActive - Indicates whether this event trigger is currently active. Used for plan limit calculations.
 * @property {Date} [lastExecutionAt] - The timestamp of the last time the trigger was executed. Useful for workspace metrics.
 * @property {'success'|'failure'} [lastExecutionStatus] - The status of the last execution. Essential for monitoring on the manager dashboard.
 * @property {Date} createdAt - The timestamp when the event trigger was created.
 * @property {Date} updatedAt - The timestamp when the event trigger was last updated.
 */

/**
 * Mongoose Schema for an Event Trigger.
 * Defines the structure for storing event triggers, which link specific application events
 * to workflows or chains for execution within a workspace. This model is optimized for
 * manager dashboard features like team management, workspace metrics, and plan limit enforcement.
 *
 * @type {mongoose.Schema<EventTriggerSchema>}
 */
const EventTriggerSchema = new mongoose.Schema(
  {
    /**
     * A user-defined name for the trigger for easy identification.
     * ENHANCEMENT: Added for improved usability in manager dashboards.
     * @type {string}
     */
    name: {
      type: String,
      trim: true,
    },
    /**
     * The ID of the user who created this event trigger.
     * Renamed from 'userId' to 'createdBy' for better semantic clarity in a team context,
     * indicating creation attribution rather than ownership, as triggers belong to the workspace.
     * @type {string}
     * @required
     */
    createdBy: {
      type: String,
      required: true,
      index: true
    },
    /**
     * The ID of the workspace this event trigger belongs to.
     * This is crucial for team management, workspace-level metrics, and plan limits.
     * NOTE: A single-field index is not needed here as it's the leading field
     * in the compound indexes defined below, which is more efficient.
     * @type {string}
     * @required
     */
    workspaceId: {
      type: String,
      required: true
    },
    /**
     * The name of the application associated with this event trigger (e.g., "github", "slack").
     * @type {string}
     * @required
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
      required: true,
      index: true
    },
    /**
     * A map defining how to extract data from the event payload and map it to target inputs.
     * Keys are payload paths (e.g., "body.issue.title"), values are execution input names (e.g., "title").
     * @type {mongoose.Schema.Types.Mixed}
     * @default {}
     */
    paramMapping: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    /**
     * Indicates whether this event trigger is currently active and should process incoming events.
     * This is a key field for enforcing plan limits (e.g., max active triggers).
     * @type {boolean}
     * @default true
     */
    isActive: {
      type: Boolean,
      default: true
    },
    /**
     * Timestamp of the last execution.
     * ENHANCEMENT: Added for workspace metrics and monitoring dashboards.
     * @type {Date}
     */
    lastExecutionAt: {
      type: Date,
    },
    /**
     * Status of the last execution.
     * ENHANCEMENT: Added for workspace metrics and identifying failing triggers on dashboards.
     * @type {'success'|'failure'}
     */
    lastExecutionStatus: {
      type: String,
      enum: ['success', 'failure'],
    }
  },
  {
    /**
     * Mongoose timestamps option to automatically add `createdAt` and `updatedAt` fields.
     */
    timestamps: true
  }
);

// Compound index to ensure a unique trigger for a given app and event within a workspace.
// This is critical for data integrity and is the primary lookup for event processing.
EventTriggerSchema.index({ workspaceId: 1, appName: 1, eventName: 1 }, { unique: true });

// OPTIMIZATION: Added compound index to efficiently query and count active triggers per workspace.
// This is essential for enforcing plan limits and for dashboard metrics (e.g., "X of Y active triggers").
EventTriggerSchema.index({ workspaceId: 1, isActive: 1 });

// OPTIMIZATION: Added index to support efficient sorting and filtering by last execution time on manager dashboards.
EventTriggerSchema.index({ workspaceId: 1, lastExecutionAt: -1 });


/**
 * Mongoose Model for EventTrigger.
 * Represents a stored event trigger in the database.
 *
 * @type {mongoose.Model<EventTriggerSchema>}
 */
const EventTrigger = mongoose.models.EventTrigger || mongoose.model('EventTrigger', EventTriggerSchema);

export default EventTrigger;