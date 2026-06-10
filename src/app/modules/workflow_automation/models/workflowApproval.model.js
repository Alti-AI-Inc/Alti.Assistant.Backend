import mongoose from 'mongoose';

// --- GCP Database Resiliency Configuration ---
// This block establishes a resilient connection to the MongoDB database,
// optimized for Google Cloud Platform environments (e.g., running on GCE, GKE, or Cloud Run
// and connecting to MongoDB Atlas via VPC Peering or a managed MongoDB service).

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local'
  );
}

const dbOptions = {
  // maxPoolSize: The maximum number of sockets the driver will keep open for this connection.
  // A higher value is crucial for applications with high concurrency, like those on Cloud Run or GKE.
  // Default is 100 in Mongoose 6+. We set it explicitly for clarity.
  maxPoolSize: 50,

  // minPoolSize: The minimum number of sockets the driver will keep open.
  // This helps handle sudden traffic bursts by having ready-to-use connections, reducing latency.
  minPoolSize: 5,

  // serverSelectionTimeoutMS: How long the driver will try to find a suitable server for an operation
  // before timing out. A value of 5000ms (5 seconds) allows for quick failure,
  // which is beneficial for orchestrators like Kubernetes to restart a faulty pod.
  serverSelectionTimeoutMS: 5000,

  // socketTimeoutMS: How long a socket can be idle before being closed by the driver.
  // This is critical in GCP to prevent connections from being silently dropped by network intermediaries
  // like NAT gateways, firewalls, or the Cloud SQL Auth Proxy. A value of 45000ms is a safe starting point.
  socketTimeoutMS: 45000,

  // keepAlive: Enables TCP Keep-Alive probes on the underlying socket.
  // When true, the driver sends probes on idle sockets to keep the connection alive
  // through stateful network devices that might otherwise terminate them.
  keepAlive: true,

  // keepAliveInitialDelay: The number of milliseconds to wait before initiating the first keep-alive probe.
  // A common value is 300000 (5 minutes), which is often less than typical firewall timeout periods.
  keepAliveInitialDelay: 300000,
};

// It's a best practice to connect only once and reuse the connection.
// This check prevents re-establishing the connection on every model import,
// which is especially important in serverless or hot-reloading environments.
if (mongoose.connection.readyState === 0) {
  mongoose.connect(MONGODB_URI, dbOptions).catch(err => {
    console.error('MongoDB initial connection error:', err);
    // In a production application, you should handle this error gracefully,
    // perhaps by exiting the process to allow an orchestrator to restart the container.
    process.exit(1);
  });
}

mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to DB');
});

mongoose.connection.on('error', err => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

// --- End of Resiliency Configuration ---

const WorkflowApprovalSchema = new mongoose.Schema(
  {
    approvalId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    workflowId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workflow',
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    stepId: {
      type: String,
      required: true,
    },
    action: {
      type: String, // e.g. 'gmail.send_email'
      required: true,
    },
    parameters: {
      type: Object, // The parameters the step would be called with
      default: {},
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    checkpointId: {
      type: String, // The exact interrupted checkpoint ID to resume from
      required: true,
    },
    formSchema: {
      type: Object, // Optional dynamic schema for human input forms
      default: null,
    },
    formResponse: {
      type: Object, // User-submitted form responses
      default: null,
    },
    decisionTime: Date,
  },
  {
    timestamps: true,
  }
);

const WorkflowApproval =
  mongoose.models.WorkflowApproval ||
  mongoose.model('WorkflowApproval', WorkflowApprovalSchema);

export default WorkflowApproval;