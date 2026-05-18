import { logger } from '../../../shared/logger.js';
import { planGeneratorService } from './plan_generator.service.js';

/**
 * In-memory task storage
 * In production, this should be replaced with Redis or a database
 */
const tasks = new Map();

/**
 * Task statuses
 */
export const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Task stages for plan generation
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
 * Create a new task
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
 * Get task by ID
 */
export const getTask = (taskId) => {
  return tasks.get(taskId);
};

/**
 * Update task progress
 */
export const updateTaskProgress = (taskId, updates) => {
  const task = tasks.get(taskId);
  if (!task) {
    logger.warn('Task not found for update:', taskId);
    return null;
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
 * Process plan generation task asynchronously
 */
export const processTask = async (
  taskId,
  userId,
  message,
  conversationId,
  isGuest,
  fileInfo
) => {
  const task = tasks.get(taskId);
  if (!task) {
    logger.error('Task not found:', taskId);
    return;
  }

  try {
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
 * Clean up old tasks (optional - run periodically)
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

export const taskManager = {
  createTask,
  getTask,
  updateTaskProgress,
  processTask,
  cleanupOldTasks,
};
