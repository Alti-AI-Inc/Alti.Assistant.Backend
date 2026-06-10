import mongoose from 'mongoose';

/**
 * @typedef {object} BillingAuditLogSchemaDefinition
 * @property {mongoose.Schema.Types.ObjectId} tenantId - The ID of the tenant associated with the billing action. References the 'Tenant' model.
 * @property {mongoose.Schema.Types.ObjectId} userId - The ID of the user who initiated or is affected by the billing action. References the 'User' model.
 * @property {string} action - The specific billing action performed.
 *   Must be one of: 'upgrade', 'cancel', 'seat_add', 'seat_remove', 'billing_portal',
 *   'webhook_failed', 'dispute_created', 'dispute_closed', 'outage_detected'.
 * @property {mongoose.Schema.Types.Mixed} previousState - The state of the billing entity (e.g., subscription, plan) before the action. Can be any data type.
 * @property {mongoose.Schema.Types.Mixed} newState - The state of the billing entity (e.g., subscription, plan) after the action. Can be any data type.
 * @property {string} ipAddress - The IP address from which the action was initiated, if applicable.
 * @property {Date} createdAt - The timestamp when the audit log entry was created.
 * @property {Date} updatedAt - The timestamp when the audit log entry was last updated.
 */

/**
 * Mongoose schema for the Billing Audit Log.
 *
 * This schema defines the structure for logging various billing-related actions
 * within the system, tracking changes, and associating them with tenants and users.
 * It includes fields for the action type, previous and new states, and timestamps.
 *
 * @type {mongoose.Schema<BillingAuditLogSchemaDefinition>}
 */
const BillingAuditLogSchema = new mongoose.Schema(
  {
    /**
     * The ID of the tenant associated with this billing audit log entry.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref Tenant
     * @index true
     */
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    /**
     * The ID of the user associated with this billing audit log entry.
     * This could be the user who performed the action or the user whose subscription was affected.
     * @type {mongoose.Schema.Types.ObjectId}
     * @ref User
     * @index true
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    /**
     * The specific action that was performed.
     * @type {string}
     * @required true
     * @enum {('upgrade'|'cancel'|'seat_add'|'seat_remove'|'billing_portal'|'webhook_failed'|'dispute_created'|'dispute_closed'|'outage_detected')}
     */
    action: {
      type: String,
      required: true,
      enum: [
        'upgrade',
        'cancel',
        'seat_add',
        'seat_remove',
        'billing_portal',
        'webhook_failed',
        'dispute_created',
        'dispute_closed',
        'outage_detected',
      ],
    },
    /**
     * A mixed-type field to store the state of the relevant entity (e.g., subscription, plan)
     * before the action was performed.
     * @type {mongoose.Schema.Types.Mixed}
     * @default null
     */
    previousState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    /**
     * A mixed-type field to store the state of the relevant entity (e.g., subscription, plan)
     * after the action was performed.
     * @type {mongoose.Schema.Types.Mixed}
     * @default null
     */
    newState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    /**
     * The IP address from which the action was initiated, if available.
     * @type {string}
     * @default null
     */
    ipAddress: {
      type: String,
      default: null,
    },
  },
  {
    /**
     * Mongoose timestamps option.
     * If set to true, Mongoose automatically adds `createdAt` and `updatedAt` fields
     * to the schema, managing their values.
     */
    timestamps: true,
  }
);

/**
 * Mongoose model for the BillingAuditLog.
 *
 * This model provides an interface to the 'billingauditlogs' collection in the database,
 * allowing for CRUD operations on billing audit log entries.
 *
 * @type {mongoose.Model<BillingAuditLogSchemaDefinition>}
 */
const BillingAuditLog = mongoose.model('BillingAuditLog', BillingAuditLogSchema);

export default BillingAuditLog;