import {
  vi,
  describe,
  it,
  expect,
  beforeEach
} from 'vitest';
import httpStatus from 'http-status';

// Mock dependencies
const mockAddTaskServices = vi.fn();
const mockGetTaskServiceById = vi.fn();
const mockUpdateTaskService = vi.fn();
const mockDeleteTaskService = vi.fn();
const mockGetAllTaskServiceById = vi.fn();
const mockBulkDeleteTaskService = vi.fn();

vi.mock('./notes.service', () => ({
  addTaskServices: mockAddTaskServices,
  getTaskServiceById: mockGetTaskServiceById,
  updateTaskService: mockUpdateTaskService,
  deleteTaskService: mockDeleteTaskService,
  getAllTaskServiceById: mockGetAllTaskServiceById,
  bulkDeleteTaskService: mockBulkDeleteTaskService,
}));

const mockSendResponse = vi.fn();
vi.mock('../../../shared/sendResponse', () => ({
  sendResponse: mockSendResponse,
}));

// Mock catchAsync to simply return the function it wraps,
// allowing direct testing of the async logic.
const mockCatchAsync = vi.fn((fn) => fn);
vi.mock('../../../shared/catchAsync', () => ({
  catchAsync: mockCatchAsync,
}));

const mockLoggerInfo = vi.fn();
vi.mock('../../../shared/logger', () => ({
  logger: {
    info: mockLoggerInfo,
  },
}));

const mockMongooseTypesObjectIdIsValid = vi.fn();
vi.mock('mongoose', () => ({
  default: {
    Types: {
      ObjectId: {
        isValid: mockMongooseTypesObjectIdIsValid,
      },
    },
  },
}));

// Import the controller functions after mocks are set up
const {
  addTask,
  getAllTask,
  getTaskById,
  updateTask,
  deleteTask,
  bulkDeleteTask,
} = require('./notes.controller');

describe('Notes Controller', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    req = {
      body: {},
      params: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
    };
    next = vi.fn();

    // Ensure catchAsync returns the function directly for testing
    mockCatchAsync.mockImplementation((fn) => fn);
  });

  describe('addTask', () => {
    it('should add a task and send a success response', async () => {
      const mockTaskData = {
        title: 'Test Task',
        description: 'This is a test task.',
        userId: 'user123',
      };
      const mockResult = {
        _id: 'task123',
        ...mockTaskData,
      };

      req.body = mockTaskData;
      mockAddTaskServices.mockResolvedValue(mockResult);

      await addTask(req, res, next);

      expect(mockAddTaskServices).toHaveBeenCalledWith(
        mockTaskData.userId,
        mockTaskData
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Add Note Successfully',
        data: mockResult,
      });
    });
  });

  describe('getAllTask', () => {
    it('should get all tasks for a user and send a success response', async () => {
      const userId = 'user123';
      const mockTasks = [{
        _id: 'task1',
        title: 'Task 1'
      }, {
        _id: 'task2',
        title: 'Task 2'
      }, ];

      req.params.userId = userId;
      mockGetAllTaskServiceById.mockResolvedValue(mockTasks);

      await getAllTask(req, res, next);

      expect(mockLoggerInfo).toHaveBeenCalledWith(userId, 'all taskk userId');
      expect(mockGetAllTaskServiceById).toHaveBeenCalledWith(userId);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Successfully Get all notes',
        data: mockTasks,
      });
    });
  });

  describe('getTaskById', () => {
    it('should get a task by ID and send a success response', async () => {
      const taskId = 'task123';
      const mockTask = {
        _id: taskId,
        title: 'Test Task'
      };

      req.params.id = taskId;
      mockGetTaskServiceById.mockResolvedValue(mockTask);

      await getTaskById(req, res, next);

      expect(mockLoggerInfo).toHaveBeenCalledWith(taskId, 'taskk idddd');
      expect(mockGetTaskServiceById).toHaveBeenCalledWith(taskId);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Get note by id successfully',
        data: mockTask,
      });
    });
  });

  describe('updateTask', () => {
    it('should update a task and send a success response', async () => {
      const taskId = 'task123';
      const updateData = {
        title: 'Updated Task'
      };
      const mockUpdatedTask = {
        _id: taskId,
        ...updateData,
        userId: 'user123',
      };

      req.params.id = taskId;
      req.body = updateData;
      mockUpdateTaskService.mockResolvedValue(mockUpdatedTask);

      await updateTask(req, res, next);

      expect(mockUpdateTaskService).toHaveBeenCalledWith(taskId, updateData);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Note Update Successfully',
        data: mockUpdatedTask,
      });
    });
  });

  describe('deleteTask', () => {
    it('should delete a task and send a NO_CONTENT response if successful', async () => {
      const taskId = 'task123';
      const mockResult = {
        deletedCount: 1
      };

      req.params.id = taskId;
      mockDeleteTaskService.mockResolvedValue(mockResult);

      await deleteTask(req, res, next);

      expect(mockDeleteTaskService).toHaveBeenCalledWith(taskId);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NO_CONTENT,
        success: true,
        message: 'Task Delete Successfully',
        data: mockResult,
      });
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should return 400 if no task was deleted', async () => {
      const taskId = 'task123';
      const mockResult = {
        deletedCount: 0
      };

      req.params.id = taskId;
      mockDeleteTaskService.mockResolvedValue(mockResult);

      await deleteTask(req, res, next);

      expect(mockDeleteTaskService).toHaveBeenCalledWith(taskId);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        error: "Could't delete the note",
      });
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });

  describe('bulkDeleteTask', () => {
    it('should bulk delete tasks and send a success response if all IDs are valid', async () => {
      const ids = ['id1', 'id2', 'id3'];
      const mockResult = {
        deletedCount: 3
      };

      req.body.ids = ids;
      mockMongooseTypesObjectIdIsValid.mockReturnValue(true); // All IDs are valid
      mockBulkDeleteTaskService.mockResolvedValue(mockResult);

      await bulkDeleteTask(req, res, next);

      expect(mockLoggerInfo).toHaveBeenCalledWith(ids, 'controller idddddddddddd');
      expect(mockMongooseTypesObjectIdIsValid).toHaveBeenCalledTimes(ids.length);
      expect(mockMongooseTypesObjectIdIsValid).toHaveBeenCalledWith('id1');
      expect(mockMongooseTypesObjectIdIsValid).toHaveBeenCalledWith('id2');
      expect(mockMongooseTypesObjectIdIsValid).toHaveBeenCalledWith('id3');
      expect(mockBulkDeleteTaskService).toHaveBeenCalledWith(ids);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'All Task Delete Successfully ',
        data: mockResult,
      });
    });

    it('should throw an error if any ID is invalid', async () => {
      const ids = ['id1', 'invalidId', 'id3'];

      req.body.ids = ids;
      // Mock isValid to return true for 'id1', false for 'invalidId', true for 'id3'
      mockMongooseTypesObjectIdIsValid
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      // Since catchAsync is mocked to return the function directly,
      // we can use .rejects to test the thrown error.
      await expect(bulkDeleteTask(req, res, next)).rejects.toEqual({
        message: 'Invalid IDs provided',
      });

      expect(mockLoggerInfo).toHaveBeenCalledWith(ids, 'controller idddddddddddd');
      expect(mockMongooseTypesObjectIdIsValid).toHaveBeenCalledTimes(2); // Stops after the first invalid ID
      expect(mockMongooseTypesObjectIdIsValid).toHaveBeenCalledWith('id1');
      expect(mockMongooseTypesObjectIdIsValid).toHaveBeenCalledWith('invalidId');
      expect(mockBulkDeleteTaskService).not.toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });

    it('should handle empty ids array gracefully', async () => {
      const ids = [];
      const mockResult = {
        deletedCount: 0
      };

      req.body.ids = ids;
      mockMongooseTypesObjectIdIsValid.mockReturnValue(true); // Won't be called for empty array
      mockBulkDeleteTaskService.mockResolvedValue(mockResult);

      await bulkDeleteTask(req, res, next);

      expect(mockLoggerInfo).toHaveBeenCalledWith(ids, 'controller idddddddddddd');
      expect(mockMongooseTypesObjectIdIsValid).not.toHaveBeenCalled();
      expect(mockBulkDeleteTaskService).toHaveBeenCalledWith(ids);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'All Task Delete Successfully ',
        data: mockResult,
      });
    });
  });
});