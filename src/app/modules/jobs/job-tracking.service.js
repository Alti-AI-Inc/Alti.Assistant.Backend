import mongoose from 'mongoose';

// Define the Job Schema for tracking long-running asynchronous jobs
const JobSchema = new mongoose.Schema(
  {
    operationName: {
      type: String,
      unique: true,
      sparse: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    jobType: {
      type: String,
      required: true,
    },
    inputUri: {
      type: String,
    },
    status: {
      type: String,
      enum: ['STARTED', 'COMPLETED', 'FAILED'],
      default: 'STARTED',
      required: true,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Create or retrieve the Job Model
const Job = mongoose.models.Job || mongoose.model('Job', JobSchema);

/**
 * Service for managing tracking records of long-running operations.
 */
export const JobTrackingService = {
  /**
   * Creates a new job tracking record
   * @param {object} jobData
   * @returns {Promise<object>} The created job document
   */
  createJob: async (jobData) => {
    return await Job.create(jobData);
  },

  /**
   * Retrieves a job by its operation name
   * @param {string} operationName
   * @returns {Promise<object|null>} The job document
   */
  getJobByOperationName: async (operationName) => {
    return await Job.findOne({
      $or: [{ operationName }, { gcpOperationName: operationName }],
    });
  },

  /**
   * Updates the status of a job
   * @param {string} operationName
   * @param {string} status
   * @param {string} [errorMessage]
   * @returns {Promise<object|null>} The updated job document
   */
  updateJobStatus: async (operationName, status, errorMessage = null) => {
    const update = { status };
    if (errorMessage) {
      update.error = errorMessage;
    }
    return await Job.findOneAndUpdate(
      { $or: [{ operationName }, { gcpOperationName: operationName }] },
      { $set: update },
      { new: true }
    );
  },
};

export default JobTrackingService;
