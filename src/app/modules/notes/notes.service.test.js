import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addTaskServices,
  getAllTaskServiceById,
  getTaskServiceById,
  updateTaskService,
  deleteTaskService,
  bulkDeleteTaskService,
} from './notes.service';

const {
  mockLogger,
  mockTask,
  mockUserModel
} = vi.hoisted(() => {
  // Mock external dependencies
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  const mockTask = {
    create: vi.fn(),
    find: vi.fn().mockReturnThis(), // Allow chaining .populate().lean()
    findOne: vi.fn().mockReturnThis(), // Allow chaining .populate().lean()
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
    populate: vi.fn().mockReturnThis(), // Mock populate to return this for chaining
    lean: vi.fn(), // Mock lean
  };

  const mockUserModel = {
    findOneAndUpdate: vi.fn(),
  };

  return {
    mockLogger,
    mockTask,
    mockUserModel
  };
});

// Mock the modules
vi.mock('../../../shared/logger', () => ({
  logger: mockLogger,
}));

vi.mock('../auth/auth.model', () => ({
  __esModule: true,
  default: mockUserModel,
}));

vi.mock('./notes.model', () => ({
  __esModule: true,
  default: mockTask,
}));

describe('Notes Service', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Ensure lean and populate return resolved promises or specific values
    mockTask.lean.mockResolvedValue([]); // Default for find
    mockTask.populate.mockReturnThis(); // Ensure populate returns the mockTask object for chaining
  });

  describe('addTaskServices', () => {
    it('should successfully create a task and update the user', async () => {
      const userId = 'user123';
      const taskData = { title: 'New Task', description: 'Task description' };
      const createdTask = { _id: 'task123', ...taskData, userId };

      mockTask.create.mockResolvedValue(createdTask);
      mockUserModel.findOneAndUpdate.mockResolvedValue({ _id: userId, task: ['task123'] });

      const result = await addTaskServices(userId, taskData);

      expect(mockTask.create).toHaveBeenCalledWith({ ...taskData, userId });
      expect(mockUserModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: userId },
        { $push: { task: createdTask._id } },
        { new: true }
      );
      expect(result).toEqual(createdTask);
    });

    it('should handle errors during task creation', async () => {
      const userId = 'user123';
      const taskData = { title: 'New Task' };
      const error = new Error('Failed to create task');

      mockTask.create.mockRejectedValue(error);

      await expect(addTaskServices(userId, taskData)).rejects.toThrow(error);
      expect(mockTask.create).toHaveBeenCalledWith({ ...taskData, userId });
      expect(mockUserModel.findOneAndUpdate).not.toHaveBeenCalled(); // Should not be called if task creation fails
    });
  });

  describe('getAllTaskServiceById', () => {
    it('should retrieve all tasks for a given user ID', async () => {
      const userId = 'user123';
      const tasks = [
        { _id: 'task1', title: 'Task 1', userId: { _id: userId, name: 'Test User' } },
        { _id: 'task2', title: 'Task 2', userId: { _id: userId, name: 'Test User' } },
      ];

      mockTask.find.mockReturnThis();
      mockTask.populate.mockReturnThis();
      mockTask.lean.mockResolvedValue(tasks);

      const result = await getAllTaskServiceById(userId);

      expect(mockTask.find).toHaveBeenCalledWith({ userId });
      expect(mockTask.populate).toHaveBeenCalledWith({
        path: 'userId',
        select: '-password -wishlist -task -role -contract',
      });
      expect(mockTask.lean).toHaveBeenCalled();
      expect(result).toEqual(tasks);
    });

    it('should return an empty array if no tasks are found for the user', async () => {
      const userId = 'user123';

      mockTask.find.mockReturnThis();
      mockTask.populate.mockReturnThis();
      mockTask.lean.mockResolvedValue([]);

      const result = await getAllTaskServiceById(userId);

      expect(mockTask.find).toHaveBeenCalledWith({ userId });
      expect(mockTask.populate).toHaveBeenCalled();
      expect(mockTask.lean).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('getTaskServiceById', () => {
    it('should retrieve a specific task for a given task ID and user ID', async () => {
      const taskId = 'task123';
      const userId = 'user123';
      const task = { _id: taskId, title: 'Specific Task', userId: { _id: userId, name: 'Test User' } };

      mockTask.findOne.mockReturnThis();
      mockTask.populate.mockReturnThis();
      mockTask.lean.mockResolvedValue(task);

      const result = await getTaskServiceById(taskId, userId);

      expect(mockTask.findOne).toHaveBeenCalledWith({ _id: taskId, userId });
      expect(mockTask.populate).toHaveBeenCalledWith({
        path: 'userId',
        select: '-password -wishlist -task -role -contract',
      });
      expect(mockTask.lean).toHaveBeenCalled();
      expect(result).toEqual(task);
    });

    it('should return null if the task is not found or does not belong to the user', async () => {
      const taskId = 'task123';
      const userId = 'user123';

      mockTask.findOne.mockReturnThis();
      mockTask.populate.mockReturnThis();
      mockTask.lean.mockResolvedValue(null);

      const result = await getTaskServiceById(taskId, userId);

      expect(mockTask.findOne).toHaveBeenCalledWith({ _id: taskId, userId });
      expect(mockTask.populate).toHaveBeenCalled();
      expect(mockTask.lean).toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('updateTaskService', () => {
    it('should successfully update a task with allowed fields', async () => {
      const taskId = 'task123';
      const userId = 'user123';
      const updateData = { title: 'Updated Title', description: 'Updated Description', status: 'completed' };
      const updateResult = { acknowledged: true, modifiedCount: 1, matchedCount: 1 };

      mockTask.updateOne.mockResolvedValue(updateResult);

      const result = await updateTaskService(taskId, userId, updateData);

      expect(mockTask.updateOne).toHaveBeenCalledWith(
        { _id: taskId, userId },
        { $set: { title: 'Updated Title', description: 'Updated Description', status: 'completed' } },
        { runValidators: true }
      );
      expect(result).toEqual(updateResult);
    });

    it('should ignore disallowed fields and only update allowed ones', async () => {
      const taskId = 'task123';
      const userId = 'user123';
      const updateData = { title: 'Updated Title', maliciousField: 'attack', status: 'pending' };
      const updateResult = { acknowledged: true, modifiedCount: 1, matchedCount: 1 };

      mockTask.updateOne.mockResolvedValue(updateResult);

      const result = await updateTaskService(taskId, userId, updateData);

      expect(mockTask.updateOne).toHaveBeenCalledWith(
        { _id: taskId, userId },
        { $set: { title: 'Updated Title', status: 'pending' } }, // maliciousField should be ignored
        { runValidators: true }
      );
      expect(result).toEqual(updateResult);
    });

    it('should return modifiedCount: 0 if no allowed fields are provided for update', async () => {
      const taskId = 'task123';
      const userId = 'user123';
      const updateData = { maliciousField: 'attack' }; // Only disallowed fields
      const expectedResult = { acknowledged: true, modifiedCount: 0, matchedCount: 0 };

      const result = await updateTaskService(taskId, userId, updateData);

      expect(mockTask.updateOne).not.toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('should return modifiedCount: 0 if allowed fields are provided but undefined', async () => {
      const taskId = 'task123';
      const userId = 'user123';
      const updateData = { title: undefined, description: undefined }; // Allowed fields but undefined
      const expectedResult = { acknowledged: true, modifiedCount: 0, matchedCount: 0 };

      const result = await updateTaskService(taskId, userId, updateData);

      expect(mockTask.updateOne).not.toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });
  });

  describe('deleteTaskService', () => {
    it('should successfully delete a task for a given task ID and user ID', async () => {
      const taskId = 'task123';
      const userId = 'user123';
      const deleteResult = { acknowledged: true, deletedCount: 1 };

      mockTask.deleteOne.mockResolvedValue(deleteResult);

      const result = await deleteTaskService(taskId, userId);

      expect(mockTask.deleteOne).toHaveBeenCalledWith({ _id: taskId, userId });
      expect(result).toEqual(deleteResult);
    });

    it('should return deletedCount: 0 if the task is not found or does not belong to the user', async () => {
      const taskId = 'task123';
      const userId = 'user123';
      const deleteResult = { acknowledged: true, deletedCount: 0 };

      mockTask.deleteOne.mockResolvedValue(deleteResult);

      const result = await deleteTaskService(taskId, userId);

      expect(mockTask.deleteOne).toHaveBeenCalledWith({ _id: taskId, userId });
      expect(result).toEqual(deleteResult);
    });
  });

  describe('bulkDeleteTaskService', () => {
    it('should successfully bulk delete tasks for a given list of IDs and user ID', async () => {
      const taskIds = ['task1', 'task2', 'task3'];
      const userId = 'user123';
      const deleteResult = { acknowledged: true, deletedCount: 3 };

      mockTask.deleteMany.mockResolvedValue(deleteResult);

      const result = await bulkDeleteTaskService(taskIds, userId);

      expect(mockLogger.info).toHaveBeenCalledWith(taskIds, 'idssssssss');
      expect(mockTask.deleteMany).toHaveBeenCalledWith({ _id: { $in: taskIds }, userId });
      expect(mockLogger.info).toHaveBeenCalledWith(deleteResult);
      expect(result).toEqual(deleteResult);
    });

    it('should return deletedCount: 0 if no tasks are found for the given IDs and user ID', async () => {
      const taskIds = ['nonExistentTask1', 'nonExistentTask2'];
      const userId = 'user123';
      const deleteResult = { acknowledged: true, deletedCount: 0 };

      mockTask.deleteMany.mockResolvedValue(deleteResult);

      const result = await bulkDeleteTaskService(taskIds, userId);

      expect(mockLogger.info).toHaveBeenCalledWith(taskIds, 'idssssssss');
      expect(mockTask.deleteMany).toHaveBeenCalledWith({ _id: { $in: taskIds }, userId });
      expect(mockLogger.info).toHaveBeenCalledWith(deleteResult);
      expect(result).toEqual(deleteResult);
    });

    it('should handle an empty array of IDs for bulk deletion', async () => {
      const taskIds = [];
      const userId = 'user123';
      const deleteResult = { acknowledged: true, deletedCount: 0 }; // MongoDB returns 0 for empty $in

      mockTask.deleteMany.mockResolvedValue(deleteResult);

      const result = await bulkDeleteTaskService(taskIds, userId);

      expect(mockLogger.info).toHaveBeenCalledWith(taskIds, 'idssssssss');
      expect(mockTask.deleteMany).toHaveBeenCalledWith({ _id: { $in: taskIds }, userId });
      expect(mockLogger.info).toHaveBeenCalledWith(deleteResult);
      expect(result).toEqual(deleteResult);
    });
  });
});