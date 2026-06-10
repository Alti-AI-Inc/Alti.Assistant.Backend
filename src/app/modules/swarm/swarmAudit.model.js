/**
 * @file SwarmAudit Mongoose Model
 * @module modules/swarm/swarmAudit.model
 * @description Defines the Mongoose schema and model for auditing Swarm tool executions.
 * This model tracks the usage, attempts, and outcomes of various tools within the Swarm system.
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
 * @property {string} userId - The ID of the user who initiated the tool execution.
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
    /**
     * The ID of the user who initiated the tool execution.
     * @type {string}
     * @required
     * @index
     */
    userId: {
      type: String,
      required: true,
      index: true,
    },
    /**
     * The name of the tool that was executed.
     * @type {string}
     * @required
     * @index
     */
    toolName: {
      type: String,
      required: true,
      index: true,
    },
    /**
     * The type of tool being audited.
     * - 'dynamic-skill': A skill dynamically generated or loaded.
     * - 'standard-tool': A pre-defined, standard tool.
     * - 'reflection-self-healing': An internal reflection or self-healing mechanism.
     * @type {'dynamic-skill' | 'standard-tool' | 'reflection-self-healing'}
     * @default 'dynamic-skill'
     * @index
     */
    type: {
      type: String,
      enum: ['dynamic-skill', 'standard-tool', 'reflection-self-healing'],
      default: 'dynamic-skill',
      index: true, // Added index for performance, as 'type' is likely used in queries.
    },
    /**
     * An array of detailed records for each execution attempt.
     * @type {Array<SwarmAuditAttempt>}
     */
    attempts: [
      {
        /**
         * The sequential number of the attempt within a single audit record.
         * @type {number}
         */
        attempt: Number,
        /**
         * The date and time when this specific attempt occurred.
         * @type {Date}
         * @default Date.now
         */
        timestamp: { type: Date, default: Date.now },
        /**
         * The name of the package that was missing, if applicable, leading to an installation attempt.
         * @type {string}
         */
        missingPackage: String,
        /**
         * Indicates whether the package installation (if attempted) was successful.
         * @type {boolean}
         */
        installSuccess: Boolean,
        /**
         * The standard output from the tool execution or installation attempt.
         * @type {string}
         */
        stdout: String,
        /**
         * The standard error output from the tool execution or installation attempt.
         * @type {string}
         */
        stderr: String,
        /**
         * The duration of this specific attempt in milliseconds.
         * @type {number}
         */
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
     * @index
     */
    status: {
      type: String,
      enum: ['success', 'failed', 'security-blocked', 'resource-aborted'],
      required: true,
      index: true, // Added index for performance, as 'status' is likely used in queries.
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