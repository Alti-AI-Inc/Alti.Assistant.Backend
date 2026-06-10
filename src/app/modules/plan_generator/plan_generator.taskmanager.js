import { logger } from '../../../shared/logger.js';
import { planGeneratorService } from './plan_generator.service.js';

/**
 * @typedef {object} Task
 * @property {string} taskId - Unique identifier for the task.
 * @property {string} userId - The ID of the user who owns this task.
 * @property {string} conversationId - The ID of the conversation associated with this task.
 * @property {TASK_STATUS[keyof TASK_STATUS]} status - The current status of the task.
 * @property {TASK_STAGES[keyof TASK_STAGES]} stage - The current stage of the plan generation process.
 * @property {number} progress - The progress percentage of the task (0-100).
 * @property {string} message - A human-readable message describing the current state or progress.
 * @property {any | null} result - The final result of the task upon completion.
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
 * status, stage, and progress in real-time.
 *
 * @param {string} taskId - The unique identifier of the task to process.
 * @param {string} userId - The ID of the user who owns the task and initiated the process. Used for initial authorization.
 * @param {string} message - The user's input message or prompt for plan generation.
 * @param {string} conversationId - The ID of the conversation context.
 * @param {boolean} isGuest - Boolean indicating if the user is a guest.
 * @param {object | null} fileInfo - Optional object containing information about an uploaded file.
 * @param {string} [fileInfo.fileName] - The name of the uploaded file.
 * @param {string} [fileInfo.fileContent] - The extracted content of the uploaded file.
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
        message: 'Extracting text from uploaded file...',
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
    const result = await planGeneratorService.conversationalAssistant(
      userId,
      message,
      conversationId,
      isGuest,
      fileInfo
    );

    // Stage 5: Finalizing
    updateTaskProgress(taskId, {
      stage: TASK_STAGES.FINALIZING,
      progress: 95,
      message: 'Finalizing plan...',
    });

    // Task completed
    updateTaskProgress(taskId, {
      status: TASK_STATUS.COMPLETED,
      stage: TASK_STAGES.COMPLETED,
      progress: 100,
      message: 'Plan generation completed successfully!',
      result,
      completedAt: new Date(),
    });

    logger.info('Task completed successfully:', {
      taskId,
      conversationId: result.conversationId,
    });
  } catch (error) {
    logger.error('Task failed:', { taskId, error: error.message });

    updateTaskProgress(taskId, {
      status: TASK_STATUS.FAILED,
      progress: 0,
      message: 'Plan generation failed',
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
 * @property {function(string, string): Task} createTask - Function to create a new task.
 * @property {function(string, string=): (Task | null)} getTask - Function to retrieve a task by ID with optional authorization.
 * @property {function(string, Partial<Task>, string=): (Task | null)} updateTaskProgress - Function to update task progress with optional authorization.
 * @property {function(string, string, string, string, boolean, object | null): Promise<void>} processTask - Function to asynchronously process a plan generation task.
 * @property {function(number=): void} cleanupOldTasks - Function to clean up old tasks from memory.
 */
export const taskManager = {
  createTask,
  getTask,
  updateTaskProgress,
  processTask,
  cleanupOldTasks,
};