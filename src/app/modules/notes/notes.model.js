const mongoose = require('mongoose');

// --- GCP Database Resiliency Configuration ---
// This configuration block establishes a resilient connection to the MongoDB database,
// optimized for Google Cloud Platform environments. It should be centralized in a single
// file (e.g., db.js or app.js) in a real-world application.

const dbUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/altidb';

const mongooseOptions = {
  // --- Connection Pooling ---
  // Limits the number of open connections to the database for this application instance.
  // A value of 10 is a safe starting point for many applications running in a containerized environment.
  maxPoolSize: 10,

  // --- Timeout Settings for GCP ---
  // These settings help the driver gracefully handle transient network issues common in cloud environments.
  // serverSelectionTimeoutMS: How long the driver waits to find a suitable server before erroring.
  serverSelectionTimeoutMS: 30000, // 30 seconds. Increased to tolerate temporary network partitions or leader elections.
  // socketTimeoutMS: How long a socket can be inactive before closing. Prevents hung operations.
  socketTimeoutMS: 45000, // 45 seconds. Aligned with typical load balancer idle timeouts.

  // --- KeepAlive for Long-Lived Connections ---
  // Essential for connections that pass through NATs, firewalls, or proxies (like Cloud SQL Auth Proxy or VPC Peering).
  // It prevents the network infrastructure from silently dropping idle connections.
  keepAlive: true,
  keepAliveInitialDelay: 300000, // 5 minutes. Sends keepAlive probes on idle sockets.

  // --- Network Configuration ---
  // Forces IPv4, which can resolve connection issues in certain containerized or VPC network configurations.
  family: 4,
};

mongoose.connect(dbUri, mongooseOptions).catch(err => {
  console.error('Initial MongoDB connection error:', err);
  // In a production app, you might want to exit the process if the initial connection fails.
  // process.exit(1);
});

// --- Connection Event Listeners for Monitoring ---
mongoose.connection.on('connected', () => {
  console.log('Mongoose connection open to database');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose connection disconnected');
});

// Graceful shutdown on process termination
process.on('SIGINT', () => {
  mongoose.connection.close(() => {
    console.log('Mongoose connection disconnected through app termination');
    process.exit(0);
  });
});

// --- Original Model Definition ---

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
  },
}, {
  timestamps: true, // Automatically adds `createdAt` and `updatedAt` fields, managing their values.
                    // This is the recommended way to handle timestamps in Mongoose,
                    // making the manual `createdAt` and `updatedAt` definitions redundant and less error-prone.
});

const Notes = mongoose.model('Notes', noteSchema);

module.exports = Notes;