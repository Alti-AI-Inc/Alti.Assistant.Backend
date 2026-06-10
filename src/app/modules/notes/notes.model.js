/**
 * @file Defines the Mongoose model for Notes and handles the database connection.
 * @module models/notes
 * @requires mongoose - Mongoose library for MongoDB object modeling.
 */

const mongoose = require('mongoose');

// --- GCP Database Resiliency Configuration ---
// This configuration block establishes a resilient connection to the MongoDB database,
// optimized for Google Cloud Platform environments. It should be centralized in a single
// file (e.g., db.js or app.js) in a real-world application.

/**
 * The MongoDB connection URI.
 * It uses the MONGODB_URI from environment variables or defaults to a local instance.
 * @type {string}
 */
const dbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/altidb';

/**
 * Mongoose connection options optimized for resilient connections, especially in cloud environments like GCP.
 * @type {mongoose.ConnectOptions}
 * @property {number} maxPoolSize - Limits the number of open connections to the database for this application instance. A value of 10 is a safe starting point for many applications running in a containerized environment.
 * @property {number} serverSelectionTimeoutMS - How long the driver waits to find a suitable server before erroring. Increased to 30 seconds to tolerate temporary network partitions or leader elections.
 * @property {number} socketTimeoutMS - How long a socket can be inactive before closing. Prevents hung operations. Aligned with typical load balancer idle timeouts.
 * @property {boolean} keepAlive - Essential for connections that pass through NATs, firewalls, or proxies. It prevents the network infrastructure from silently dropping idle connections.
 * @property {number} keepAliveInitialDelay - Delay in milliseconds before sending the first keepAlive probe on an idle socket.
 * @property {number} family - Forces IPv4, which can resolve connection issues in certain containerized or VPC network configurations.
 */
const mongooseOptions = {
  // --- Connection Pooling ---
  maxPoolSize: 10,

  // --- Timeout Settings for GCP ---
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,

  // --- KeepAlive for Long-Lived Connections ---
  keepAlive: true,
  keepAliveInitialDelay: 300000,

  // --- Network Configuration ---
  family: 4,
};

mongoose.connect(dbUri, mongooseOptions).catch(err => {
  console.error('Initial MongoDB connection error:', err);
  // In a production app, you might want to exit the process if the initial connection fails.
  // process.exit(1);
});

// --- Connection Event Listeners for Monitoring ---

/**
 * Mongoose event listener for a successful connection.
 * @event mongoose.connection#connected
 */
mongoose.connection.on('connected', () => {
  console.log('Mongoose connection open to database');
});

/**
 * Mongoose event listener for a connection error.
 * @event mongoose.connection#error
 * @param {Error} err - The connection error.
 */
mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

/**
 * Mongoose event listener for a disconnection.
 * @event mongoose.connection#disconnected
 */
mongoose.connection.on('disconnected', () => {
  console.log('Mongoose connection disconnected');
});

/**
 * Gracefully closes the Mongoose connection when the Node.js process receives a SIGINT signal (e.g., from Ctrl+C).
 * @listens process#SIGINT
 */
process.on('SIGINT', () => {
  mongoose.connection.close(() => {
    console.log('Mongoose connection disconnected through app termination');
    process.exit(0);
  });
});

// --- Original Model Definition ---

/**
 * Mongoose schema for a Note.
 * Each note is associated with a specific user and workspace, providing a robust multi-tenant data structure.
 *
 * @constructor Note
 * @property {string} title - The title of the note. Required.
 * @property {string} [description] - The main content or description of the note.
 * @property {mongoose.Schema.Types.ObjectId} userId - The ID of the user who owns this note. This enforces data separation between users.
 * @property {mongoose.Schema.Types.ObjectId} workspaceId - The ID of the workspace this note belongs to. Critical for multi-tenancy and role-based access control.
 * @property {Date} createdAt - Timestamp indicating when the note was created. Automatically managed by Mongoose.
 * @property {Date} updatedAt - Timestamp indicating when the note was last updated. Automatically managed by Mongoose.
 */
const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true, // A title is generally expected for a note for better data integrity.
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Assuming you have a User model
    required: true,
    index: true, // Index for efficient querying of notes by user.
  },
  // --- HIERARCHY & MULTI-TENANCY FIX ---
  // Added workspaceId to enforce tenant boundaries at the database level.
  // This is critical for security, preventing IDOR vulnerabilities where a user from one
  // workspace could potentially access data from another. It also simplifies and secures
  // queries for workspace-level roles (admin, manager), ensuring they only see data
  // within their designated tenant context. This field is essential for propagating
  // usage details and limits up to the workspace owner.
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace', // Assuming a Workspace model exists for tenancy.
    required: true,
    index: true, // Index for efficient querying of all notes within a workspace.
  },
}, {
  timestamps: true, // Automatically adds `createdAt` and `updatedAt` fields, managing their values.
                    // This is the recommended way to handle timestamps in Mongoose.
});

/**
 * Mongoose model for the 'Notes' collection.
 * @class Notes
 * @type {mongoose.Model<Note>}
 */
const Notes = mongoose.model('Notes', noteSchema);

/**
 * Exports the Mongoose model for Notes.
 * @type {mongoose.Model<Note>}
 */
module.exports = Notes;