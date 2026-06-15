import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';

// Mock dependencies
const catchAsync = vi.fn().mockImplementation((fn) => fn); // Mock catchAsync to just return the function
const sendResponse = vi.fn();

const {
  logger,
  mockMongoose
} = vi.hoisted(() => {
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  // Mock mongoose.Types.ObjectId.isValid
  // This needs to be done carefully as mongoose might not be fully initialized in a unit test.
  // We'll mock the specific method used.
  const mockMongoose = {
    Types: {
      ObjectId: {
        isValid: vi.fn(),
      },
    },
  };

  return {
    logger,
    mockMongoose
  };
});

const supportService = {
  reqForSupportService: vi.fn(),
  getAllSupportService: vi.fn(),
  getSupportServiceById: vi.fn(),
  updateSupportReqService: vi.fn(),
  deleteSupportReqService: vi.fn(),
  bulkDeleteSupportReqService: vi.fn(),
};

// Replace the actual mongoose import with our mock for the test scope
vi.mock('mongoose', () => mockMongoose);

// Mock the shared utilities and service
vi.mock('../../../shared/catchAsync.js', () => ({ default: catchAsync }));
vi.mock('../../../shared/sendResponse.js', () => ({ default: sendResponse }));
vi.mock('./support.service.js', () => ({ supportService }));
vi.mock('../../../shared/logger.js', () => ({ logger }));

// Now import the actual controller after mocks are set up
import { SupportController } from '../support.controller.js';

describe('SupportController', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Mock `catchAsync` to simply return the function it wraps,
    // allowing us to test the inner async function directly.
    catchAsync.mockImplementation((fn) => fn);

    // Standard mock for Express req/res objects
    req = {
      body: {},
      params: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    next = vi.fn();

    // Ensure mongoose.Types.ObjectId.isValid is reset for each test
    // and defaults to true for valid IDs unless specifically overridden
    mockMongoose.Types.ObjectId.isValid.mockReturnValue(true);
  });

  describe('reqForSupport', () => {
    it('should create a support request and send a 201 response', async () => {
      const mockRequestBody = {
        id: 'user123',
        subject: 'Login Issue',
        description: 'Cannot log in to my account.',
      };
      const mockServiceResult = {
        _id: 'supportReq1',
        userId: 'user123',
        subject: 'Login Issue',
        description: 'Cannot log in to my account.',
        status: 'open',
        priority: 'medium',
      };

      req.body = mockRequestBody;
      supportService.reqForSupportService.mockResolvedValue(mockServiceResult);

      await SupportController.reqForSupport(req, res, next);

      expect(supportService.reqForSupportService).toHaveBeenCalledWith(
        mockRequestBody.id,
        mockRequestBody
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Support Req Add Successfully',
        data: mockServiceResult,
      });
      expect(logger.info).not.toHaveBeenCalled(); // Original logger.info was commented out
    });

    it('should handle errors during support request creation', async () => {
      const mockRequestBody = {
        id: 'user123',
        subject: 'Login Issue',
        description: 'Cannot log in to my account.',
      };
      const mockError = new Error('Service error');

      req.body = mockRequestBody;
      supportService.reqForSupportService.mockRejectedValue(mockError);

      await expect(SupportController.reqForSupport(req, res, next)).rejects.toThrow(mockError);
      expect(supportService.reqForSupportService).toHaveBeenCalledWith(
        mockRequestBody.id,
        mockRequestBody
      );
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('getAllSupportReq', () => {
    it('should retrieve all support requests and send a 200 response', async () => {
      const mockServiceResult = [
        { _id: 'req1', subject: 'Issue 1' },
        { _id: 'req2', subject: 'Issue 2' },
      ];
      supportService.getAllSupportService.mockResolvedValue(mockServiceResult);

      await SupportController.getAllSupportReq(req, res, next);

      expect(supportService.getAllSupportService).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Successfully Get all Support Requests',
        data: mockServiceResult,
      });
    });

    it('should handle errors during retrieval of all support requests', async () => {
      const mockError = new Error('Database error');
      supportService.getAllSupportService.mockRejectedValue(mockError);

      await expect(SupportController.getAllSupportReq(req, res, next)).rejects.toThrow(mockError);
      expect(supportService.getAllSupportService).toHaveBeenCalledTimes(1);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('getSupportById', () => {
    it('should retrieve a support request by ID and send a 200 response', async () => {
      const supportId = 'supportReq1';
      const mockServiceResult = { _id: supportId, subject: 'Specific Issue' };

      req.params.id = supportId;
      supportService.getSupportServiceById.mockResolvedValue(mockServiceResult);

      await SupportController.getSupportById(req, res, next);

      expect(logger.info).toHaveBeenCalledWith(supportId, 'idddddddd');
      expect(supportService.getSupportServiceById).toHaveBeenCalledWith(supportId);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Get Support Reqest by id successfully',
        data: mockServiceResult,
      });
    });

    it('should handle not found case for getSupportById', async () => {
      const supportId = 'nonExistentId';

      req.params.id = supportId;
      supportService.getSupportServiceById.mockResolvedValue(null); // Service returns null if not found

      await SupportController.getSupportById(req, res, next);

      expect(supportService.getSupportServiceById).toHaveBeenCalledWith(supportId);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Get Support Reqest by id successfully',
        data: null,
      });
    });

    it('should handle errors during retrieval of support request by ID', async () => {
      const supportId = 'supportReq1';
      const mockError = new Error('Network error');

      req.params.id = supportId;
      supportService.getSupportServiceById.mockRejectedValue(mockError);

      await expect(SupportController.getSupportById(req, res, next)).rejects.toThrow(mockError);
      expect(supportService.getSupportServiceById).toHaveBeenCalledWith(supportId);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('updateSupportReq', () => {
    it('should update a support request and send a 200 response', async () => {
      const supportId = 'supportReq1';
      const updatePayload = { status: 'closed', description: 'Issue resolved.' };
      const mockServiceResult = {
        _id: supportId,
        subject: 'Specific Issue',
        ...updatePayload,
      };

      req.params.id = supportId;
      req.body = updatePayload;
      supportService.updateSupportReqService.mockResolvedValue(mockServiceResult);

      await SupportController.updateSupportReq(req, res, next);

      expect(supportService.updateSupportReqService).toHaveBeenCalledWith(
        supportId,
        updatePayload
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Support Request Update Successfully',
        data: mockServiceResult,
      });
    });

    it('should handle errors during update of support request', async () => {
      const supportId = 'supportReq1';
      const updatePayload = { status: 'closed' };
      const mockError = new Error('Validation error');

      req.params.id = supportId;
      req.body = updatePayload;
      supportService.updateSupportReqService.mockRejectedValue(mockError);

      await expect(SupportController.updateSupportReq(req, res, next)).rejects.toThrow(mockError);
      expect(supportService.updateSupportReqService).toHaveBeenCalledWith(
        supportId,
        updatePayload
      );
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('deleteSupportReq', () => {
    it('should delete a support request and send a 200 response', async () => {
      const supportId = 'supportReq1';
      const mockServiceResult = { _id: supportId, deletedCount: 1 };

      req.params.id = supportId;
      supportService.deleteSupportReqService.mockResolvedValue(mockServiceResult);

      await SupportController.deleteSupportReq(req, res, next);

      expect(supportService.deleteSupportReqService).toHaveBeenCalledWith(supportId);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Support Request Delete Successfully',
        data: mockServiceResult,
      });
    });

    it('should handle errors during deletion of support request', async () => {
      const supportId = 'supportReq1';
      const mockError = new Error('Deletion failed');

      req.params.id = supportId;
      supportService.deleteSupportReqService.mockRejectedValue(mockError);

      await expect(SupportController.deleteSupportReq(req, res, next)).rejects.toThrow(mockError);
      expect(supportService.deleteSupportReqService).toHaveBeenCalledWith(supportId);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });

  describe('bulkDeleteSupportReq', () => {
    it('should bulk delete support requests with valid IDs and send a 200 response', async () => {
      const idsToDelete = ['60d0fe4f5311236168a109cb', '60d0fe4f5311236168a109cc'];
      const mockServiceResult = { deletedCount: 2 };

      req.body.ids = idsToDelete;
      mockMongoose.Types.ObjectId.isValid.mockReturnValue(true); // All IDs are valid
      supportService.bulkDeleteSupportReqService.mockResolvedValue(mockServiceResult);

      await SupportController.bulkDeleteSupportReq(req, res, next);

      expect(logger.info).toHaveBeenCalledWith(idsToDelete, 'controller idddddddddddd');
      expect(mockMongoose.Types.ObjectId.isValid).toHaveBeenCalledTimes(idsToDelete.length);
      expect(mockMongoose.Types.ObjectId.isValid).toHaveBeenCalledWith(idsToDelete[0]);
      expect(mockMongoose.Types.ObjectId.isValid).toHaveBeenCalledWith(idsToDelete[1]);
      expect(supportService.bulkDeleteSupportReqService).toHaveBeenCalledWith(idsToDelete);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'All Support Request Delete Successfully ',
        data: mockServiceResult,
      });
    });

    it('should handle empty IDs array for bulk delete', async () => {
      const idsToDelete = [];
      const mockServiceResult = { deletedCount: 0 };

      req.body.ids = idsToDelete;
      // isValid should not be called for an empty array
      supportService.bulkDeleteSupportReqService.mockResolvedValue(mockServiceResult);

      await SupportController.bulkDeleteSupportReq(req, res, next);

      expect(logger.info).toHaveBeenCalledWith(idsToDelete, 'controller idddddddddddd');
      expect(mockMongoose.Types.ObjectId.isValid).not.toHaveBeenCalled(); // No IDs to validate
      expect(supportService.bulkDeleteSupportReqService).toHaveBeenCalledWith(idsToDelete);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'All Support Request Delete Successfully ',
        data: mockServiceResult,
      });
    });

    it('should throw an error for invalid IDs during bulk delete (mongoose validation)', async () => {
      const idsToDelete = ['60d0fe4f5311236168a109cb', 'invalidId'];

      req.body.ids = idsToDelete;
      mockMongoose.Types.ObjectId.isValid.mockImplementation((id) => id !== 'invalidId'); // One ID is invalid

      await expect(SupportController.bulkDeleteSupportReq(req, res, next)).rejects.toEqual({
        message: 'Invalid IDs provided',
      });
      expect(logger.info).toHaveBeenCalledWith(idsToDelete, 'controller idddddddddddd');
      expect(mockMongoose.Types.ObjectId.isValid).toHaveBeenCalledTimes(2); // Called for both
      expect(supportService.bulkDeleteSupportReqService).not.toHaveBeenCalled(); // Service should not be called
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it('should throw an error for invalid IDs during bulk delete (fallback regex validation)', async () => {
      // Temporarily disable mongoose.Types.ObjectId.isValid to test the fallback
      const originalIsValid = mockMongoose.Types.ObjectId.isValid;
      mockMongoose.Types.ObjectId.isValid = undefined; // Simulate mongoose.Types.ObjectId.isValid not being a function

      const idsToDelete = ['60d0fe4f5311236168a109cb', 'shortId']; // 'shortId' won't pass regex

      req.body.ids = idsToDelete;

      await expect(SupportController.bulkDeleteSupportReq(req, res, next)).rejects.toEqual({
        message: 'Invalid IDs provided (format mismatch)',
      });
      expect(logger.info).toHaveBeenCalledWith(idsToDelete, 'controller idddddddddddd');
      expect(supportService.bulkDeleteSupportReqService).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();

      // Restore original isValid for other tests
      mockMongoose.Types.ObjectId.isValid = originalIsValid;
    });

    it('should handle errors from service during bulk delete', async () => {
      const idsToDelete = ['60d0fe4f5311236168a109cb'];
      const mockError = new Error('Bulk deletion service failed');

      req.body.ids = idsToDelete;
      mockMongoose.Types.ObjectId.isValid.mockReturnValue(true);
      supportService.bulkDeleteSupportReqService.mockRejectedValue(mockError);

      await expect(SupportController.bulkDeleteSupportReq(req, res, next)).rejects.toThrow(mockError);
      expect(logger.info).toHaveBeenCalledWith(idsToDelete, 'controller idddddddddddd');
      expect(mockMongoose.Types.ObjectId.isValid).toHaveBeenCalledWith(idsToDelete[0]);
      expect(supportService.bulkDeleteSupportReqService).toHaveBeenCalledWith(idsToDelete);
      expect(sendResponse).not.toHaveBeenCalled();
    });
  });
});