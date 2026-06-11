/**
 * @file SwarmAudit Mongoose Model
 * @module modules/swarm/swarmAudit.model
 * @description Defines the Mongoose schema and model for auditing Swarm tool executions.
 * This model tracks the usage, attempts, and outcomes of various tools within the Swarm system.
 * It includes critical fields for multi-tenancy to ensure data isolation and proper hierarchical usage tracking.
 */

import mongoose from 'mongoose';

/**
 * @typedef {object} SwarmAuditAttempt
 * @property {number} attempt - The sequential number of the attempt within a single audit record.
 * @property {Date} timestamp - The date and time when this specific attempt occurred. Defaults to the current time.
 * @property {string} [missingPackage] - The name of the package that was missing, if applicable.
 * @property {boolean} [installSuccess] - Indicates whether the package installation (if attempted) was successful.
 * @property {string} [stdout] - The standard output from the tool execution or installation attempt.
 * @property {string} [stderr] - The standard error output from the tool execution or installation attempt.
 * @property {number} [durationMs] - The duration of this specific attempt in milliseconds.
 */

/**
 * @typedef {object} SwarmAudit
 * @property {mongoose.Schema.Types.ObjectId} organizationId - The ID of the organization (platform tenant).
 * @property {mongoose.Schema.Types.ObjectId} workspaceId - The ID of the workspace (admin/owner tenant).
 * @property {mongoose.Schema.Types.ObjectId} userId - The ID of the user who initiated the tool execution.
 * @property {mongoose.Schema.Types.ObjectId} [conversationId] - The ID of the conversation session this audit belongs to.
 * @property {string} toolName - The name of the tool that was executed.
 * @property {'dynamic-skill' | 'standard-tool' | 'reflection-self-healing'} type - The type of tool being audited.
 * @property {SwarmAuditAttempt[]} attempts - An array of detailed records for each execution attempt.
 * @property {'success' | 'failed' | 'security-blocked' | 'resource-aborted'} status - The final status of the tool execution.
 * @property {string} [finalResult] - The final result or output from the successful tool execution.
 * @property {string} [errorMessage] - A detailed error message if the tool execution failed.
 * @property {Date} createdAt - The timestamp when the audit record was created.
 * @property {Date} updatedAt - The timestamp when the audit record was last updated.
 */

/**
 * Mongoose Schema for Swarm Audit records.
 *
 * This schema defines the structure for storing audit logs related to Swarm tool executions.
 * It captures details such as the user, tool used, execution attempts, status, and results.
 *
 * @type {mongoose.Schema<SwarmAudit>}
 */
const SwarmAuditSchema = new mongoose.Schema(
  {
    // --- HIERARCHY & CONTEXT FIELDS (CRITICAL FOR SECURITY & INTEGRATION) ---

    /**
     * BUG FIX: Added organizationId to enforce top-level tenant boundaries (super_admin).
     * This is CRITICAL for preventing data leakage between different organizations on the platform
     * and for aggregating usage data at the platform owner level.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Organization
     * @required
     */
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    /**
     * BUG FIX: Added workspaceId to enforce workspace-level tenant boundaries (admin/manager).
     * This prevents users/managers from accessing audit data outside their assigned workspace (potential IDOR).
     * It is essential for tracking usage and enforcing limits at the workspace level.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Workspace
     * @required
     */
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    /**
     * BUG FIX: Changed type from String to ObjectId and added a ref to the User model.
     * This establishes a proper database relation, improving data integrity and query performance via population.
     * It links the audit record to a specific user (user/manager role).
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @required
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /**
     * INTEGRATION: Added optional conversationId to link tool executions to a specific session.
     * This provides better context for debugging and tracing the full sequence of events initiated by a user.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Conversation
     */
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: false,
    },

    // --- AUDIT DETAILS ---

    /**
     * The name of the tool that was executed.
     * @type {string}
     * @required
     */
    toolName: {
      type: String,
      required: true,
    },
    /**
     * The type of tool being audited.
     * - 'dynamic-skill': A skill dynamically generated or loaded.
     * - 'standard-tool': A pre-defined, standard tool.
     * - 'reflection-self-healing': An internal reflection or self-healing mechanism.
     * @type {'dynamic-skill' | 'standard-tool' | 'reflection-self-healing'}
     * @default 'dynamic-skill'
     */
    type: {
      type: String,
      enum: ['dynamic-skill', 'standard-tool', 'reflection-self-healing'],
      default: 'dynamic-skill',
    },
    /**
     * An array of detailed records for each execution attempt.
     * @type {Array<SwarmAuditAttempt>}
     */
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
    /**
     * The final status of the tool execution.
     * - 'success': The tool executed successfully.
     * - 'failed': The tool execution failed due to an error.
     * - 'security-blocked': The tool execution was blocked for security reasons.
     * - 'resource-aborted': The tool execution was aborted due to resource constraints or timeouts.
     * @type {'success' | 'failed' | 'security-blocked' | 'resource-aborted'}
     * @required
     */
    status: {
      type: String,
      enum: ['success', 'failed', 'security-blocked', 'resource-aborted'],
      required: true,
    },
    /**
     * The final result or output from the successful tool execution.
     * Only present if `status` is 'success'.
     * @type {string}
     */
    finalResult: {
      type: String,
    },
    /**
     * A detailed error message if the tool execution failed.
     * Only present if `status` is 'failed', 'security-blocked', or 'resource-aborted'.
     * @type {string}
     */
    errorMessage: {
      type: String,
    },
  },
  {
    /**
     * Mongoose timestamps option.
     * Adds `createdAt` and `updatedAt` fields automatically.
     * @type {boolean}
     */
    timestamps: true,
  }
);

// --- PERFORMANCE OPTIMIZATION: INDEXING STRATEGY ---
// A comprehensive indexing strategy is crucial for the performance of a high-volume audit log collection.
// The following compound indexes are designed to optimize the most common query patterns, such as
// tenancy-based lookups, user history, and analytics/monitoring queries.
// Individual `index: true` flags have been removed from the schema in favor of this explicit, more powerful strategy.

// 1. Primary query index for fetching a user's audit history within a workspace, sorted by most recent.
//    This is the most common lookup. It also efficiently supports queries for a workspace's entire history
//    because `workspaceId` is the first key in the index.
SwarmAuditSchema.index({ workspaceId: 1, userId: 1, createdAt: -1 });

// 2. Index for organization-level queries, allowing platform admins to view audit data across an entire organization,
//    sorted by time. This is critical for super-admin dashboards and platform-wide analytics.
SwarmAuditSchema.index({ organizationId: 1, createdAt: -1 });

// 3. Index for analytics and monitoring, to efficiently find all audits with a specific status (e.g., 'failed')
//    within a workspace. This helps in quickly identifying and debugging issues.
SwarmAuditSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });

// 4. Index for tool-specific analytics, allowing efficient lookup of a specific tool's usage history
//    within a workspace. Useful for understanding which tools are most used or most prone to failure.
SwarmAuditSchema.index({ workspaceId: 1, toolName: 1, createdAt: -1 });

// 5. Index to quickly find all audit entries related to a single conversation session.
//    This is essential for tracing and debugging the full lifecycle of a user interaction.
SwarmAuditSchema.index({ conversationId: 1 });


/**
 * SwarmAudit Mongoose Model.
 *
 * Represents the collection for storing audit logs of Swarm tool executions.
 * Provides an interface to interact with the 'SwarmAudit' collection in MongoDB.
 *
 * @type {mongoose.Model<SwarmAudit>}
 */
const SwarmAudit = mongoose.models.SwarmAudit || mongoose.model('SwarmAudit', SwarmAuditSchema);

export default SwarmAudit;