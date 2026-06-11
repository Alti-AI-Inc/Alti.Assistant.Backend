import mongoose from 'mongoose';

// =================================================================
// GCP DATABASE RESILIENCY CONFIGURATION
// =================================================================
// NOTE: This connection logic is typically placed in a central application
// entry point (e.g., server.js, app.js) or a dedicated database module
// (e.g., config/db.js), not in a model file. It is included here to
// demonstrate a resilient configuration for a GCP environment.

const dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017/altidatabase';

const connectionOptions = {
  // --- Connection Pooling ---
  // The maximum number of sockets the MongoDB driver will keep open for this connection.
  // A pool size of 10 is a good starting point for many applications.
  // This helps manage concurrent database operations efficiently.
  maxPoolSize: 10,

  // --- Timeout Settings for GCP ---
  // How long the driver will wait for a server to respond before throwing an error.
  // A higher value like 30s is safer in cloud environments where network latency can vary.
  serverSelectionTimeoutMS: 30000,

  // How long a socket can be idle before being closed by the driver.
  // Set to a value like 45s to be less than the typical 60s idle timeout of
  // GCP network components (like NATs or Load Balancers), preventing them
  // from silently dropping connections.
  socketTimeoutMS: 45000,

  // --- KeepAlive Settings for GCP ---
  // This is critical for long-running applications on GCP. It enables TCP KeepAlive
  // packets to be sent, preventing network infrastructure from considering the
  // connection idle and terminating it. This is especially important when using
  // services like the Cloud SQL Auth Proxy or VPC peering.
  keepAlive: true,
  // The number of milliseconds to wait before initiating keepAlive on the socket.
  // A 30s delay is a common and effective setting.
  keepAliveInitialDelay: 30000,
};

// In Mongoose 5 and later, the driver handles automatic reconnection by default.
// There is no need for deprecated options like `autoReconnect: true`.
// We connect to the database using the URI and the resilient options.
mongoose.connect(dbUri, connectionOptions)
  .then(() => console.log('MongoDB connection established successfully.'))
  .catch(err => {
    console.error('Initial MongoDB connection error:', err);
    // It's good practice to exit the process if the initial connection fails,
    // especially in containerized environments, to allow orchestration tools
    // (like Kubernetes) to restart the service.
    process.exit(1);
  });

// Optional: Add listeners to log connection events for monitoring.
mongoose.connection.on('connected', () => {
  console.log('Mongoose re-established connection to MongoDB.');
});

mongoose.connection.on('disconnected', () => {
  console.warn('Mongoose connection to MongoDB was lost.');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});


// =================================================================
// Original Model Definition
// =================================================================

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