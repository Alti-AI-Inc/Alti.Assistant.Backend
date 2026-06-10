import { Storage } from '@google-cloud/storage';
import stream from 'stream';
import { logger } from '../../../shared/logger.js';
import { planGeneratorService } from './plan_generator.service.js';

// --- GCS Configuration ---
// Initialize GCS client.
// When running on GCP (e.g., GKE, Cloud Run), Application Default Credentials (ADC) will be used automatically.
// For local development, ensure you have authenticated via `gcloud auth application-default login`.
const storage = new Storage();

// Get bucket names from environment variables.
// These must be configured in your deployment environment (e.g., .env file, Kubernetes secrets).
const uploadBucketName = process.env.GCS_UPLOAD_BUCKET;
const resultsBucketName = process.env.GCS_RESULTS_BUCKET;
// --- End GCS Configuration ---

/**
 * @typedef {object} Task
 * @property {string} taskId - Unique identifier for the task.
 * @property {string} userId - The ID of the user who owns this task.
 * @property {string} conversationId - The ID of the conversation associated with this task.
 * @property {TASK_STATUS[keyof TASK_STATUS]} status - The current status of the task.
 * @property {TASK_STAGES[keyof TASK_STAGES]} stage - The current stage of the plan generation process.
 * @property {number} progress - The progress percentage of the task (0-100).
 * @property {string} message - A human-readable message describing the current state or progress.
 * @property {{ gcsUri: string } | any | null} result - The final result of the task. On successful completion, this will be an object containing the GCS URI of the result file.
 * @property {string | null} error - An error message if the task failed.
 * @property {Date} createdAt - Timestamp when the task was created.
 * @property {Date | null} startedAt - Timestamp when the task started processing.
 * @property {Date | null} completedAt - Timestamp when the task completed or failed.
 * @property {Date | null} [updatedAt] - Timestamp when the task was last updated.
 */

/**
 * In-memory task storage.
 * In production, this should be replaced with Redis or a database for persistence and scalability.
 * @type {Map<string, Task>}
 */
const tasks = new Map();

/**
 * Task statuses for the plan generation process.
 * @readonly
 * @enum {string}
 */
export const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Task stages for the plan generation process, detailing the steps involved.
 * @readonly
 * @enum {string}
 */
export const TASK_STAGES = {
  INITIALIZING: 'initializing',
  EXTRACTING_FILE: 'extracting_file',
  ANALYZING_IDEA: 'analyzing_idea',
  GENERATING_BRAINSTORM: 'generating_brainstorm',
  CREATING_PLAN: 'creating_plan',
  FINALIZING: 'finalizing',
  COMPLETED: 'completed',
};

/**
 * Generates a v4 signed URL for uploading a file directly to GCS.
 * This allows the client to upload a file without the backend ever handling the file stream,
 * which is crucial for a stateless, scalable architecture.
 *
 * @param {string} fileName - The original name of the file to be uploaded.
 * @param {string} contentType - The MIME type of the file (e.g., 'application/pdf').
 * @param {string} userId - The ID of the user uploading the file, used for organizing storage.
 * @returns {Promise<{uploadUrl: string, gcsUri: string, fileName: string}>} An object containing the signed URL for the PUT request, the resulting GCS URI, and the original filename.
 */
export const generateUploadSignedUrl = async (fileName, contentType, userId) => {
  if (!uploadBucketName) {
    logger.error('GCS_UPLOAD_BUCKET environment variable not set.');
    throw new Error('Server configuration error: GCS upload bucket is not configured.');
  }

  // Create a unique path for the file to avoid collisions and organize by user.
  const gcsObjectName = `uploads/${userId}/${Date.now()}-${fileName}`;
  const gcsUri = `gs://${uploadBucketName}/${gcsObjectName}`;

  const options = {
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // URL is valid for 15 minutes
    contentType: contentType,
  };

  try {
    // Get a v4 signed URL for uploading a file
    const [url] = await storage
      .bucket(uploadBucketName)
      .file(gcsObjectName)
      .getSignedUrl(options);

    logger.info(`Generated signed URL for ${gcsObjectName} in bucket ${uploadBucketName}`);
    return { uploadUrl: url, gcsUri, fileName };
  } catch (error) {
    logger.error('Failed to generate signed URL', { error: error.message, bucket: uploadBucketName, file: gcsObjectName });
    throw new Error('Could not create file upload URL.');
  }
};

/**
 * Generates a v4 signed URL for downloading a result file from GCS.
 * This is used to grant temporary, secure access to a result file stored in a private bucket.
 *
 * @param {string} gcsUri - The GCS URI of the file to download (e.g., 'gs://your-bucket-name/your-object-name').
 * @returns {Promise<string>} The signed URL for the GET request, valid for 1 hour.
 */
export const generateDownloadSignedUrl = async (gcsUri) => {
  if (!gcsUri || !gcsUri.startsWith('gs://')) {
    logger.error('Invalid GCS URI provided for download URL generation.', { gcsUri });
    throw new Error('Invalid file identifier provided.');
  }

  // Parse the bucket and file name from the GCS URI
  const [bucketName, ...filePathParts] = gcsUri.replace('gs://', '').split('/');
  const objectName = filePathParts.join('/');

  if (!bucketName || !objectName) {
    logger.error('Could not parse bucket and file name from GCS URI.', { gcsUri });
    throw new Error('Invalid file identifier format.');
  }

  const options = {
    version: 'v4',
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, // URL is valid for 1 hour
  };

  try {
    const [url] = await storage
      .bucket(bucketName)
      .file(objectName)
      .getSignedUrl(options);

    logger.info(`Generated download signed URL for ${objectName} in bucket ${bucketName}`);
    return url;
  } catch (error) {
    logger.error('Failed to generate download signed URL', { error: error.message, bucket: bucketName, file: objectName });
    // Check if the error is because the file doesn't exist
    if (error.code === 404) {
      throw new Error('The requested file does not exist.');
    }
    throw new Error('Could not create file download URL.');
  }
};

/**
 * Creates a new task for plan generation and stores it in memory.
 *
 * @param {string} userId - The ID of the user initiating the task.
 * @param {string} conversationId - The ID of the conversation associated with this task.
 * @returns {Task} The newly created task object.
 */
export const createTask = (userId, conversationId) => {
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const task = {
    taskId,
    userId,
    conversationId,
    status: TASK_STATUS.PENDING,
    stage: TASK_STAGES.INITIALIZING,
    progress: 0,
    message: 'Task created, waiting to start...',
    result: null,
    error: null,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
  };

  tasks.set(taskId, task);
  logger.info('Task created:', { taskId, userId, conversationId });

  return task;
};

/**
 * Retrieves a task by its ID.
 * Optionally, verifies task ownership if `expectedUserId` is provided, preventing unauthorized access.
 *
 * @param {string} taskId - The unique identifier of the task to retrieve.
 * @param {string | null} [expectedUserId=null] - Optional. The ID of the user expected to own the task.
 *   If provided, the function will return `null` if the task exists but does not belong to this user.
 * @returns {Task | null} The task object if found and authorized, otherwise `null`.
 */
export const getTask = (taskId, expectedUserId = null) => {
  const task = tasks.get(taskId);
  // If an expectedUserId is provided, ensure the task belongs to that user.
  if (task && expectedUserId && task.userId !== expectedUserId) {
    logger.warn('Unauthorized access attempt to task:', { taskId, expectedUserId, actualUserId: task.userId });
    return null; // Return null for unauthorized access, consistent with "not found"
  }
  return task;
};

/**
 * Updates the progress and status of an existing task.
 * Optionally, verifies task ownership if `expectedUserId` is provided, preventing unauthorized updates.
 *
 * @param {string} taskId - The unique identifier of the task to update.
 * @param {Partial<Task>} updates - An object containing the fields to update (e.g., `status`, `stage`, `progress`, `message`, `result`, `error`).
 * @param {string | null} [expectedUserId=null] - Optional. The ID of the user expected to own the task.
 *   If provided, the function will return `null` if the task exists but does not belong to this user.
 * @returns {Task | null} The updated task object if successful and authorized, otherwise `null`.
 */
export const updateTaskProgress = (taskId, updates, expectedUserId = null) => {
  const task = tasks.get(taskId); // Retrieve task first
  if (!task) {
    logger.warn('Task not found for update:', taskId);
    return null;
  }

  // Check for authorization if expectedUserId is provided
  if (expectedUserId && task.userId !== expectedUserId) {
    logger.warn('Unauthorized update attempt to task:', { taskId, expectedUserId, actualUserId: task.userId });
    return null; // Return null for unauthorized update
  }

  Object.assign(task, updates, { updatedAt: new Date() });
  tasks.set(taskId, task);

  logger.info('Task updated:', {
    taskId,
    status: task.status,
    stage: task.stage,
    progress: task.progress,
  });

  return task;
};

/**
 * Asynchronously processes a plan generation task through various stages.
 * This function orchestrates the call to the `planGeneratorService` and updates the task's
 * status, stage, and progress in real-time. The final result is streamed to GCS.
 *
 * @param {string} taskId - The unique identifier of the task to process.
 * @param {string} userId - The ID of the user who owns the task and initiated the process. Used for initial authorization.
 * @param {string} message - The user's input message or prompt for plan generation.
 * @param {string} conversationId - The ID of the conversation context.
 * @param {boolean} isGuest - Boolean indicating if the user is a guest.
 * @param {object | null} fileInfo - Optional object containing information about a file uploaded to GCS.
 * @param {string} [fileInfo.gcsUri] - The GCS URI of the uploaded file (e.g., 'gs://your-bucket-name/your-object-name').
 * @param {string} [fileInfo.fileName] - The original name of the file.
 * @returns {Promise<void>} A promise that resolves when the task processing is complete (success or failure).
 */
export const processTask = async (
  taskId,
  userId, // This userId is the owner of the task initiating the process
  message,
  conversationId,
  isGuest,
  fileInfo
) => {
  // Authorize task access at the entry point of processing to prevent IDOR
  const task = getTask(taskId, userId);
  if (!task) {
    logger.error('Task not found or unauthorized for processing:', { taskId, userId });
    return; // Stop processing if task is not found or not owned by the user
  }

  try {
    // All subsequent updateTaskProgress calls within this function are internal system updates
    // for *this* task, which has already been authorized by the initial getTask(taskId, userId) call.
    // Therefore, no need to pass userId to updateTaskProgress for these internal updates.

    // Mark as processing
    updateTaskProgress(taskId, {
      status: TASK_STATUS.PROCESSING,
      stage: TASK_STAGES.INITIALIZING,
      progress: 5,
      message: 'Starting plan generation...',
      startedAt: new Date(),
    });

    // Stage 1: File extraction (if present)
    if (fileInfo) {
      updateTaskProgress(taskId, {
        stage: TASK_STAGES.EXTRACTING_FILE,
        progress: 15,
        message: 'Processing uploaded file...',
      });
    }

    // Stage 2: Analyzing idea
    updateTaskProgress(taskId, {
      stage: TASK_STAGES.ANALYZING_IDEA,
      progress: 30,
      message: 'Analyzing your idea and requirements...',
    });

    // Stage 3: Generate brainstorm
    updateTaskProgress(taskId, {
      stage: TASK_STAGES.GENERATING_BRAINSTORM,
      progress: 50,
      message: 'Brainstorming solutions and approaches...',
    });

    // Stage 4: Creating plan
    updateTaskProgress(taskId, {
      stage: TASK_STAGES.CREATING_PLAN,
      progress: 70,
      message: 'Generating detailed project plan...',
    });

    // Execute the actual plan generation
    const resultData = await planGeneratorService.conversationalAssistant(
      userId,
      message,
      conversationId,
      isGuest,
      fileInfo // Pass the fileInfo object with GCS URI to the service layer
    );

    // Stage 5: Finalizing
    updateTaskProgress(taskId, {
      stage: TASK_STAGES.FINALIZING,
      progress: 95,
      message: 'Finalizing and saving plan...',
    });

    // Instead of storing the large result in memory, stream it to GCS and store the URI.
    if (!resultsBucketName) {
      logger.error('GCS_RESULTS_BUCKET environment variable not set.');
      // Fail the task gracefully if the server is misconfigured
      throw new Error('Server configuration error: GCS results bucket is not configured.');
    }
    const resultObjectName = `results/${userId}/${taskId}-result.json`;
    const resultFile = storage.bucket(resultsBucketName).file(resultObjectName);
    const resultGcsUri = `gs://${resultsBucketName}/${resultObjectName}`;

    // Use a PassThrough stream to pipe the JSON string to the GCS write stream.
    // This is efficient for converting in-memory data to a stream without temporary files.
    const passthroughStream = new stream.PassThrough();
    passthroughStream.end(JSON.stringify(resultData, null, 2));

    await new Promise((resolve, reject) => {
      passthroughStream.pipe(resultFile.createWriteStream({
        resumable: false, // Use a simple upload for potentially smaller JSON results. For very large files, 'true' might be better.
        contentType: 'application/json',
      }))
      .on('error', (err) => {
        logger.error('Failed to upload result to GCS', { taskId, gcsUri: resultGcsUri, error: err.message });
        reject(new Error('Failed to save the generated plan.')); // Propagate a user-friendly error
      })
      .on('finish', () => {
        logger.info('Successfully uploaded result to GCS', { taskId, gcsUri: resultGcsUri });
        resolve();
      });
    });

    // Task completed
    updateTaskProgress(taskId, {
      status: TASK_STATUS.COMPLETED,
      stage: TASK_STAGES.COMPLETED,
      progress: 100,
      message: 'Plan generation completed successfully!',
      result: { gcsUri: resultGcsUri }, // Store the GCS URI instead of the full object
      completedAt: new Date(),
    });

    logger.info('Task completed successfully:', {
      taskId,
      conversationId: resultData.conversationId,
    });
  } catch (error) {
    logger.error('Task failed:', { taskId, error: error.message });

    updateTaskProgress(taskId, {
      status: TASK_STATUS.FAILED,
      progress: 0,
      message: error.message || 'Plan generation failed', // Provide a more specific error message if available
      error: error.message,
      completedAt: new Date(),
    });
  }
};

/**
 * Cleans up old tasks from the in-memory storage.
 * Tasks that are either completed or failed and exceed a specified age will be removed.
 * This function is intended to be run periodically to prevent memory leaks.
 *
 * @param {number} [maxAgeMinutes=60] - The maximum age (in minutes) for a task to be kept after completion or failure.
 * @returns {void}
 */
export const cleanupOldTasks = (maxAgeMinutes = 60) => {
  const now = new Date();
  let cleaned = 0;

  for (const [taskId, task] of tasks.entries()) {
    const age = (now - task.createdAt) / (1000 * 60); // age in minutes
    if (
      age > maxAgeMinutes &&
      (task.status === TASK_STATUS.COMPLETED ||
        task.status === TASK_STATUS.FAILED)
    ) {
      tasks.delete(taskId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info(`Cleaned up ${cleaned} old tasks`);
  }
};

// Cleanup old tasks every 30 minutes
setInterval(() => cleanupOldTasks(60), 30 * 60 * 1000);

/**
 * An object exporting all task management functions for easy access.
 * @namespace taskManager
 * @property {function(string, string, string): Promise<{uploadUrl: string, gcsUri: string, fileName: string}>} generateUploadSignedUrl - Function to generate a GCS signed URL for file uploads.
 * @property {function(string): Promise<string>} generateDownloadSignedUrl - Function to generate a GCS signed URL for downloading a result file.
 * @property {function(string, string): Task} createTask - Function to create a new task.
 * @property {function(string, string=): (Task | null)} getTask - Function to retrieve a task by ID with optional authorization.
 * @property {function(string, Partial<Task>, string=): (Task | null)} updateTaskProgress - Function to update task progress with optional authorization.
 * @property {function(string, string, string, string, boolean, object | null): Promise<void>} processTask - Function to asynchronously process a plan generation task.
 * @property {function(number=): void} cleanupOldTasks - Function to clean up old tasks from memory.
 */
export const taskManager = {
  generateUploadSignedUrl,
  generateDownloadSignedUrl,
  createTask,
  getTask,
  updateTaskProgress,
  processTask,
  cleanupOldTasks,
};