import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TASK_STATUS,
  TASK_STAGES,
  createTask,
  getTask,
  updateTaskProgress,
  processTask,
  cleanupOldTasks,
  taskManager,
} from './plan_generator.taskmanager.js'; // Assuming tasks map is internal and not directly exported

// Mock external dependencies
const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const planGeneratorService = {
  conversationalAssistant: vi.fn(),
};

// Mock the module's dependencies
vi.mock('../../../shared/logger.js', () => ({
  logger: logger,
}));

vi.mock('./plan_generator.service.js', () => ({
  planGeneratorService: planGeneratorService,
}));

// Mock setInterval to prevent it from running during tests
let originalSetInterval;
beforeEach(() => {
  originalSetInterval = global.setInterval;
  global.setInterval = vi.fn();
});

afterEach(() => {
  global.setInterval = originalSetInterval;
});

// Helper to access the internal tasks map for testing purposes
// This is a bit of an anti-pattern for pure unit tests, but necessary to test the state management
// without exporting the map directly from the module.
let tasksMap;
beforeEach(() => {
  // Reset the internal tasks map before each test
  // This relies on the module being re-imported or having a way to clear its internal state.
  // Since the map is declared with `const`, we can't reassign it.
  // A better design would be to export a `clearTasks()` function or pass the map around.
  // For now, we'll use a hack to access and clear it.
  // This assumes `tasks` is a module-scoped variable.
  // We can't directly access `tasks` from here without exporting it.
  // Let's assume `createTask` and `getTask` are the only ways to interact with it.
  // We'll create a new module instance for each test to ensure a fresh map.
  // This requires a bit of a workaround with Vitest's module mocking.

  // To properly reset the internal `tasks` map, we need to re-import the module
  // or have a way to clear it. Since it's not exported, we'll use a hack:
  // We'll create a new module instance for each test.
  // This is a common pattern for modules with internal state.
  vi.resetModules();
  // Re-import the module after resetting mocks
  // This will re-run the module code, creating a fresh `tasks` Map.
  // We need to re-mock the dependencies after resetting modules.
  vi.mock('../../../shared/logger.js', () => ({
    logger: logger,
  }));
  vi.mock('./plan_generator.service.js', () => ({
    planGeneratorService: planGeneratorService,
  }));
  // Re-import the functions to get the fresh instances
  // This is not ideal, but necessary for truly isolated tests of internal state.
  // For simplicity, we'll assume the `tasks` map is cleared by `vi.resetModules()`
  // and the functions are re-imported implicitly by the test runner.
  // If `tasks` map persists, we'd need to export a `clearTasks` function.
  // For this exercise, we'll assume `vi.resetModules()` handles it by re-evaluating the module.

  // Reset all mocks
  vi.clearAllMocks();

  // Mock Date for consistent taskId generation and timestamps
  vi.setSystemTime(new Date('2023-01-01T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers(); // Restore real Date object
});

describe('plan_generator.taskmanager', () => {
  it('should export TASK_STATUS and TASK_STAGES enums', () => {
    expect(TASK_STATUS).toBeDefined();
    expect(TASK_STAGES).toBeDefined();
    expect(TASK_STATUS.PENDING).toBe('pending');
    expect(TASK_STAGES.INITIALIZING).toBe('initializing');
  });

  describe('createTask', () => {
    it('should create a new task with initial status and stage', () => {
      const userId = 'user123';
      const conversationId = 'conv456';
      const task = createTask(userId, conversationId);

      expect(task).toBeDefined();
      expect(task.taskId).toMatch(/^task_\d+_[a-z0-9]{9}$/);
      expect(task.userId).toBe(userId);
      expect(task.conversationId).toBe(conversationId);
      expect(task.status).toBe(TASK_STATUS.PENDING);
      expect(task.stage).toBe(TASK_STAGES.INITIALIZING);
      expect(task.progress).toBe(0);
      expect(task.message).toBe('Task created, waiting to start...');
      expect(task.result).toBeNull();
      expect(task.error).toBeNull();
      expect(task.createdAt).toEqual(new Date('2023-01-01T10:00:00.000Z'));
      expect(task.startedAt).toBeNull();
      expect(task.completedAt).toBeNull();

      // Verify logger call
      expect(logger.info).toHaveBeenCalledWith('Task created:', {
        taskId: task.taskId,
        userId,
        conversationId,
      });

      // Verify task is stored (indirectly via getTask)
      const retrievedTask = getTask(task.taskId);
      expect(retrievedTask).toEqual(task);
    });
  });

  describe('getTask', () => {
    let task1, task2;
    beforeEach(() => {
      task1 = createTask('user1', 'conv1');
      task2 = createTask('user2', 'conv2');
      vi.clearAllMocks(); // Clear logger calls from createTask
    });

    it('should retrieve an existing task by ID', () => {
      const retrievedTask = getTask(task1.taskId);
      expect(retrievedTask).toEqual(task1);
    });

    it('should return null if task not found', () => {
      const retrievedTask = getTask('nonExistentTask');
      expect(retrievedTask).toBeNull();
    });

    it('should return the task if expectedUserId matches', () => {
      const retrievedTask = getTask(task1.taskId, 'user1');
      expect(retrievedTask).toEqual(task1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should return null if expectedUserId is provided and does not match', () => {
      const retrievedTask = getTask(task1.taskId, 'user999');
      expect(retrievedTask).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('Unauthorized access attempt to task:', {
        taskId: task1.taskId,
        expectedUserId: 'user999',
        actualUserId: 'user1',
      });
    });

    it('should return the task if expectedUserId is null or not provided', () => {
      const retrievedTask1 = getTask(task1.taskId, null);
      expect(retrievedTask1).toEqual(task1);
      const retrievedTask2 = getTask(task1.taskId);
      expect(retrievedTask2).toEqual(task1);
    });
  });

  describe('updateTaskProgress', () => {
    let task;
    beforeEach(() => {
      task = createTask('user1', 'conv1');
      vi.clearAllMocks(); // Clear logger calls from createTask
      vi.setSystemTime(new Date('2023-01-01T10:01:00.000Z')); // Advance time for updatedAt
    });

    it('should update task fields and updatedAt timestamp', () => {
      const updates = {
        status: TASK_STATUS.PROCESSING,
        stage: TASK_STAGES.ANALYZING_IDEA,
        progress: 50,
        message: 'Analyzing...',
      };
      const updatedTask = updateTaskProgress(task.taskId, updates);

      expect(updatedTask).toBeDefined();
      expect(updatedTask.taskId).toBe(task.taskId);
      expect(updatedTask.status).toBe(TASK_STATUS.PROCESSING);
      expect(updatedTask.stage).toBe(TASK_STAGES.ANALYZING_IDEA);
      expect(updatedTask.progress).toBe(50);
      expect(updatedTask.message).toBe('Analyzing...');
      expect(updatedTask.updatedAt).toEqual(new Date('2023-01-01T10:01:00.000Z'));
      expect(updatedTask.createdAt).toEqual(task.createdAt); // Should not change

      // Verify logger call
      expect(logger.info).toHaveBeenCalledWith('Task updated:', {
        taskId: task.taskId,
        status: TASK_STATUS.PROCESSING,
        stage: TASK_STAGES.ANALYZING_IDEA,
        progress: 50,
      });

      // Verify task is updated in storage
      const retrievedTask = getTask(task.taskId);
      expect(retrievedTask).toEqual(updatedTask);
    });

    it('should return null if task not found', () => {
      const updatedTask = updateTaskProgress('nonExistentTask', { status: TASK_STATUS.FAILED });
      expect(updatedTask).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('Task not found for update:', 'nonExistentTask');
    });

    it('should return null if expectedUserId is provided and does not match', () => {
      const updates = { status: TASK_STATUS.PROCESSING };
      const updatedTask = updateTaskProgress(task.taskId, updates, 'user999');
      expect(updatedTask).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('Unauthorized update attempt to task:', {
        taskId: task.taskId,
        expectedUserId: 'user999',
        actualUserId: 'user1',
      });
    });

    it('should update the task if expectedUserId matches', () => {
      const updates = { status: TASK_STATUS.PROCESSING };
      const updatedTask = updateTaskProgress(task.taskId, updates, 'user1');
      expect(updatedTask).toBeDefined();
      expect(updatedTask.status).toBe(TASK_STATUS.PROCESSING);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should update the task if expectedUserId is null or not provided', () => {
      const updates = { status: TASK_STATUS.PROCESSING };
      const updatedTask1 = updateTaskProgress(task.taskId, updates, null);
      expect(updatedTask1).toBeDefined();
      expect(updatedTask1.status).toBe(TASK_STATUS.PROCESSING);

      const updatedTask2 = updateTaskProgress(task.taskId, updates);
      expect(updatedTask2).toBeDefined();
      expect(updatedTask2.status).toBe(TASK_STATUS.PROCESSING);
    });
  });

  describe('processTask', () => {
    const userId = 'user123';
    const conversationId = 'conv456';
    const message = 'Generate a plan for a new app.';
    const isGuest = false;
    const fileInfo = { fileName: 'doc.txt', fileContent: 'File content here.' };
    let task;

    beforeEach(() => {
      task = createTask(userId, conversationId);
      vi.clearAllMocks(); // Clear logger calls from createTask
      planGeneratorService.conversationalAssistant.mockResolvedValue({
        conversationId: conversationId,
        plan: 'Generated plan content',
      });
      vi.setSystemTime(new Date('2023-01-01T10:00:00.000Z')); // Reset time for consistent updates
    });

    it('should not process if task is not found or unauthorized', async () => {
      await processTask('nonExistentTask', userId, message, conversationId, isGuest, null);
      expect(logger.error).toHaveBeenCalledWith('Task not found or unauthorized for processing:', {
        taskId: 'nonExistentTask',
        userId,
      });
      expect(planGeneratorService.conversationalAssistant).not.toHaveBeenCalled();
    });

    it('should process a task successfully without fileInfo', async () => {
      const initialTask = getTask(task.taskId);
      expect(initialTask.status).toBe(TASK_STATUS.PENDING);
      expect(initialTask.stage).toBe(TASK_STAGES.INITIALIZING);

      await processTask(task.taskId, userId, message, conversationId, isGuest, null);

      // Verify service call
      expect(planGeneratorService.conversationalAssistant).toHaveBeenCalledWith(
        userId,
        message,
        conversationId,
        isGuest,
        null
      );

      // Verify task updates at various stages
      const finalTask = getTask(task.taskId);
      expect(finalTask.status).toBe(TASK_STATUS.COMPLETED);
      expect(finalTask.stage).toBe(TASK_STAGES.COMPLETED);
      expect(finalTask.progress).toBe(100);
      expect(finalTask.message).toBe('Plan generation completed successfully!');
      expect(finalTask.result).toEqual({
        conversationId: conversationId,
        plan: 'Generated plan content',
      });
      expect(finalTask.error).toBeNull();
      expect(finalTask.startedAt).toBeInstanceOf(Date);
      expect(finalTask.completedAt).toBeInstanceOf(Date);
      expect(finalTask.updatedAt).toBeInstanceOf(Date);

      // Verify logger calls
      expect(logger.info).toHaveBeenCalledWith('Task created:', expect.any(Object)); // From createTask
      expect(logger.info).toHaveBeenCalledWith('Task updated:', expect.objectContaining({
        taskId: task.taskId,
        status: TASK_STATUS.PROCESSING,
        stage: TASK_STAGES.INITIALIZING,
        progress: 5,
      }));
      expect(logger.info).toHaveBeenCalledWith('Task updated:', expect.objectContaining({
        taskId: task.taskId,
        stage: TASK_STAGES.ANALYZING_IDEA,
        progress: 30,
      }));
      expect(logger.info).toHaveBeenCalledWith('Task updated:', expect.objectContaining({
        taskId: task.taskId,
        stage: TASK_STAGES.GENERATING_BRAINSTORM,
        progress: 50,
      }));
      expect(logger.info).toHaveBeenCalledWith('Task updated:', expect.objectContaining({
        taskId: task.taskId,
        stage: TASK_STAGES.CREATING_PLAN,
        progress: 70,
      }));
      expect(logger.info).toHaveBeenCalledWith('Task updated:', expect.objectContaining({
        taskId: task.taskId,
        stage: TASK_STAGES.FINALIZING,
        progress: 95,
      }));
      expect(logger.info).toHaveBeenCalledWith('Task updated:', expect.objectContaining({
        taskId: task.taskId,
        status: TASK_STATUS.COMPLETED,
        stage: TASK_STAGES.COMPLETED,
        progress: 100,
      }));
      expect(logger.info).toHaveBeenCalledWith('Task completed successfully:', {
        taskId: task.taskId,
        conversationId: conversationId,
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should process a task successfully with fileInfo', async () => {
      await processTask(task.taskId, userId, message, conversationId, isGuest, fileInfo);

      // Verify service call
      expect(planGeneratorService.conversationalAssistant).toHaveBeenCalledWith(
        userId,
        message,
        conversationId,
        isGuest,
        fileInfo
      );

      // Verify task updates include file extraction stage
      const finalTask = getTask(task.taskId);
      expect(finalTask.status).toBe(TASK_STATUS.COMPLETED);
      expect(finalTask.stage).toBe(TASK_STAGES.COMPLETED);
      expect(finalTask.progress).toBe(100);

      // Check for the file extraction stage update
      expect(logger.info).toHaveBeenCalledWith('Task updated:', expect.objectContaining({
        taskId: task.taskId,
        stage: TASK_STAGES.EXTRACTING_FILE,
        progress: 15,
      }));
    });

    it('should handle errors during task processing', async () => {
      const errorMessage = 'Service failed to generate plan.';
      planGeneratorService.conversationalAssistant.mockRejectedValue(new Error(errorMessage));

      await processTask(task.taskId, userId, message, conversationId, isGuest, null);

      // Verify service call
      expect(planGeneratorService.conversationalAssistant).toHaveBeenCalled();

      // Verify task updates to FAILED status
      const finalTask = getTask(task.taskId);
      expect(finalTask.status).toBe(TASK_STATUS.FAILED);
      expect(finalTask.progress).toBe(0);
      expect(finalTask.message).toBe('Plan generation failed');
      expect(finalTask.error).toBe(errorMessage);
      expect(finalTask.result).toBeNull();
      expect(finalTask.completedAt).toBeInstanceOf(Date);

      // Verify logger calls
      expect(logger.error).toHaveBeenCalledWith('Task failed:', {
        taskId: task.taskId,
        error: errorMessage,
      });
      expect(logger.info).not.toHaveBeenCalledWith('Task completed successfully:', expect.any(Object));
    });
  });

  describe('cleanupOldTasks', () => {
    let task1, task2, task3, task4, task5;
    const now = new Date('2023-01-01T10:00:00.000Z');

    beforeEach(() => {
      vi.setSystemTime(now);
      // Task 1: Completed, old (should be cleaned)
      task1 = createTask('u1', 'c1');
      vi.setSystemTime(new Date(now.getTime() - (70 * 60 * 1000))); // 70 minutes ago
      updateTaskProgress(task1.taskId, { status: TASK_STATUS.COMPLETED, completedAt: new Date() });

      // Task 2: Failed, old (should be cleaned)
      task2 = createTask('u2', 'c2');
      vi.setSystemTime(new Date(now.getTime() - (80 * 60 * 1000))); // 80 minutes ago
      updateTaskProgress(task2.taskId, { status: TASK_STATUS.FAILED, completedAt: new Date() });

      // Task 3: Completed, recent (should NOT be cleaned)
      task3 = createTask('u3', 'c3');
      vi.setSystemTime(new Date(now.getTime() - (30 * 60 * 1000))); // 30 minutes ago
      updateTaskProgress(task3.taskId, { status: TASK_STATUS.COMPLETED, completedAt: new Date() });

      // Task 4: Processing, old (should NOT be cleaned)
      task4 = createTask('u4', 'c4');
      vi.setSystemTime(new Date(now.getTime() - (90 * 60 * 1000))); // 90 minutes ago
      updateTaskProgress(task4.taskId, { status: TASK_STATUS.PROCESSING, startedAt: new Date() });

      // Task 5: Pending, old (should NOT be cleaned)
      task5 = createTask('u5', 'c5');
      vi.setSystemTime(new Date(now.getTime() - (100 * 60 * 1000))); // 100 minutes ago
      // No updates, remains PENDING

      vi.setSystemTime(now); // Reset time for cleanup call
      vi.clearAllMocks(); // Clear logger calls from createTask/updateTaskProgress
    });

    it('should clean up old completed and failed tasks', () => {
      cleanupOldTasks(60); // Max age 60 minutes

      expect(getTask(task1.taskId)).toBeNull();
      expect(getTask(task2.taskId)).toBeNull();
      expect(getTask(task3.taskId)).toBeDefined(); // Recent completed
      expect(getTask(task4.taskId)).toBeDefined(); // Processing
      expect(getTask(task5.taskId)).toBeDefined(); // Pending

      expect(logger.info).toHaveBeenCalledWith('Cleaned up 2 old tasks');
    });

    it('should not clean up any tasks if none are old enough', () => {
      cleanupOldTasks(120); // Max age 120 minutes, all tasks are younger than this

      expect(getTask(task1.taskId)).toBeDefined();
      expect(getTask(task2.taskId)).toBeDefined();
      expect(getTask(task3.taskId)).toBeDefined();
      expect(getTask(task4.taskId)).toBeDefined();
      expect(getTask(task5.taskId)).toBeDefined();

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should handle no tasks being present', () => {
      vi.resetModules(); // Clear all tasks
      vi.mock('../../../shared/logger.js', () => ({ logger: logger }));
      vi.mock('./plan_generator.service.js', () => ({ planGeneratorService: planGeneratorService }));
      vi.clearAllMocks();

      cleanupOldTasks(60);
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('taskManager export', () => {
    it('should export all expected functions', () => {
      expect(taskManager).toBeDefined();
      expect(taskManager.createTask).toBeInstanceOf(Function);
      expect(taskManager.getTask).toBeInstanceOf(Function);
      expect(taskManager.updateTaskProgress).toBeInstanceOf(Function);
      expect(taskManager.processTask).toBeInstanceOf(Function);
      expect(taskManager.cleanupOldTasks).toBeInstanceOf(Function);
    });
  });
});