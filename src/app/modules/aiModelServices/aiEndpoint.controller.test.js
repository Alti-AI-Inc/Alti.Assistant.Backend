import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';

// Mock the Mongoose model
const AiEndpoint = {
  findOne: vi.fn(),
  create: vi.fn(),
  find: vi.fn(),
  updateMany: vi.fn(),
  findOneAndUpdate: vi.fn(),
};

// Mock the utility data
const aiEndpointsUtilData = [
  {
    title: 'Static Endpoint 1',
    nickName: 'Static 1',
    add: '/static/add1',
    history: '/static/history1',
    delete: '/static/delete1',
    enabled: true,
    default: false,
  },
  {
    title: 'Static Endpoint 2',
    nickName: 'Static 2',
    add: '/static/add2',
    history: '/static/history2',
    delete: '/static/delete2',
    enabled: false,
    default: false,
  },
];

// Mock the external modules
vi.mock('./aiEndpoint.Model.js', () => ({ default: AiEndpoint }));
vi.mock('./aiEndpoint.utils.js', () => ({ default: aiEndpointsUtilData }));

// Import the controller functions after mocks are set up
import { AiEndpointsController } from './aiEndpoint.controller.js';

describe('AiEndpointsController', () => {
  let req;
  let res;
  let statusSpy;
  let jsonSpy;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy }); // Chain .json() after .status()

    req = {
      body: {},
      params: {},
    };
    res = {
      status: statusSpy,
      json: jsonSpy, // In case .status() is called directly without .status()
    };
  });

  describe('addAiEndpoint', () => {
    it('should return 400 if required fields are missing', async () => {
      req.body = {
        title: 'Test Endpoint',
        nickName: 'Test Nickname',
        add: '/add',
        history: '/history',
        // 'delete' is missing
      };

      await AiEndpointsController.addAiEndpoint(req, res);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        status: 'fail',
        message: 'All fields (title, nickName, add, history, delete) are required.',
      });
      expect(AiEndpoint.findOne).not.toHaveBeenCalled();
      expect(AiEndpoint.create).not.toHaveBeenCalled();
    });

    it('should return 400 if an endpoint with the same title already exists', async () => {
      req.body = {
        title: 'Existing Endpoint',
        nickName: 'Existing Nickname',
        add: '/add',
        history: '/history',
        delete: '/delete',
      };
      AiEndpoint.findOne.mockResolvedValue({ title: 'Existing Endpoint' }); // Simulate existing endpoint

      await AiEndpointsController.addAiEndpoint(req, res);

      expect(AiEndpoint.findOne).toHaveBeenCalledWith({
        $or: [{ title: 'Existing Endpoint' }, { _id: undefined }],
      });
      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        status: 'fail',
        message: "AI endpoint with 'Existing Endpoint' already exists.",
      });
      expect(AiEndpoint.create).not.toHaveBeenCalled();
    });

    it('should return 400 if an endpoint with the same ID already exists', async () => {
      req.body = {
        id: 'someId123',
        title: 'New Endpoint',
        nickName: 'New Nickname',
        add: '/add',
        history: '/history',
        delete: '/delete',
      };
      AiEndpoint.findOne.mockResolvedValue({ _id: 'someId123' }); // Simulate existing endpoint by ID

      await AiEndpointsController.addAiEndpoint(req, res);

      expect(AiEndpoint.findOne).toHaveBeenCalledWith({
        $or: [{ title: 'New Endpoint' }, { _id: 'someId123' }],
      });
      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        status: 'fail',
        message: "AI endpoint with 'someId123' already exists.",
      });
      expect(AiEndpoint.create).not.toHaveBeenCalled();
    });

    it('should create a new AI endpoint and return 201', async () => {
      const newEndpointData = {
        title: 'New Endpoint',
        nickName: 'New Nickname',
        enabled: true,
        default: false,
        add: '/add',
        history: '/history',
        delete: '/delete',
      };
      req.body = newEndpointData;
      AiEndpoint.findOne.mockResolvedValue(null); // No existing endpoint
      AiEndpoint.create.mockResolvedValue({ _id: 'newId', ...newEndpointData });

      await AiEndpointsController.addAiEndpoint(req, res);

      expect(AiEndpoint.findOne).toHaveBeenCalledWith({
        $or: [{ title: 'New Endpoint' }, { _id: undefined }],
      });
      expect(AiEndpoint.create).toHaveBeenCalledWith(newEndpointData);
      expect(statusSpy).toHaveBeenCalledWith(201);
      expect(jsonSpy).toHaveBeenCalledWith({
        statusCode: httpStatus.OK, // Note: The controller uses httpStatus.OK (200) for a 201 response.
        status: 'Success',
        message: "AI endpoint 'New Endpoint' created successfully.",
        data: { _id: 'newId', ...newEndpointData },
      });
    });

    it('should handle internal server errors', async () => {
      req.body = {
        title: 'Error Endpoint',
        nickName: 'Error Nickname',
        add: '/add',
        history: '/history',
        delete: '/delete',
      };
      const errorMessage = 'Database connection failed';
      AiEndpoint.findOne.mockRejectedValue(new Error(errorMessage));

      await AiEndpointsController.addAiEndpoint(req, res);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        status: 'fail',
        message: 'Error creating AI endpoint',
        error: errorMessage,
      });
      expect(AiEndpoint.create).not.toHaveBeenCalled();
    });
  });

  describe('getWebAiEndpoint', () => {
    it('should return all AI endpoints from the database with 200 status', async () => {
      const mockEndpoints = [
        { _id: '1', title: 'Web Endpoint 1' },
        { _id: '2', title: 'Web Endpoint 2' },
      ];
      AiEndpoint.find.mockResolvedValue(mockEndpoints);

      await AiEndpointsController.getWebAiEndpoint(req, res);

      expect(AiEndpoint.find).toHaveBeenCalledTimes(1);
      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith({
        statusCode: httpStatus.OK,
        status: 'Success',
        message: 'Fetched AI socket endpoints successfully',
        anonymously: '/groq/get-response-anonymously',
        data: mockEndpoints,
      });
    });

    it('should handle internal server errors when fetching web endpoints', async () => {
      const errorMessage = 'Network error';
      AiEndpoint.find.mockRejectedValue(new Error(errorMessage));

      await AiEndpointsController.getWebAiEndpoint(req, res);

      expect(AiEndpoint.find).toHaveBeenCalledTimes(1);
      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        status: 'fail',
        message: 'Error fetching AI endpoints',
        error: errorMessage,
      });
    });
  });

  describe('getAiEndpointForApp', () => {
    it('should return static AI endpoints from utils with 200 status', async () => {
      await AiEndpointsController.getAiEndpointForApp(req, res);

      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith({
        statusCode: httpStatus.OK,
        status: 'Success',
        message: 'Get aiSocketEndpoint successfully',
        anonymously: '/groq/get-response-anonymously',
        data: aiEndpointsUtilData, // Expecting the mocked utility data
      });
    });

    // The current implementation's catch block for getAiEndpointForApp is unreachable
    // because `aiEndpoints` is a static import and does not throw.
    // Therefore, no specific error test case is provided for this function.
  });

  describe('updateWebAiEndpoint', () => {
    it('should return 400 if title is missing', async () => {
      req.body = { enabled: true }; // Missing title

      await AiEndpointsController.updateWebAiEndpoint(req, res);

      expect(statusSpy).toHaveBeenCalledWith(400);
      expect(jsonSpy).toHaveBeenCalledWith({
        status: 'fail',
        message: 'Title is required to identify the AI endpoint.',
      });
      expect(AiEndpoint.updateMany).not.toHaveBeenCalled();
      expect(AiEndpoint.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should return 404 if the AI endpoint is not found', async () => {
      req.body = { title: 'NonExistent Endpoint', enabled: true };
      AiEndpoint.findOneAndUpdate.mockResolvedValue(null); // Simulate not found

      await AiEndpointsController.updateWebAiEndpoint(req, res);

      expect(AiEndpoint.updateMany).not.toHaveBeenCalled(); // Not called because isDefault is not true
      expect(AiEndpoint.findOneAndUpdate).toHaveBeenCalledWith(
        { title: 'NonExistent Endpoint' },
        { enabled: true, default: undefined }, // 'default' is undefined in req.body
        { new: true, runValidators: true }
      );
      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        status: 'fail',
        message: "AI endpoint 'NonExistent Endpoint' not found.",
      });
    });

    it('should update an AI endpoint and return 200', async () => {
      const updatedData = { title: 'Existing Endpoint', enabled: false, default: false };
      req.body = { title: 'Existing Endpoint', enabled: false };
      AiEndpoint.findOneAndUpdate.mockResolvedValue({ _id: '1', ...updatedData });

      await AiEndpointsController.updateWebAiEndpoint(req, res);

      expect(AiEndpoint.updateMany).not.toHaveBeenCalled(); // 'default' is not true
      expect(AiEndpoint.findOneAndUpdate).toHaveBeenCalledWith(
        { title: 'Existing Endpoint' },
        { enabled: false, default: undefined }, // 'default' is undefined in req.body
        { new: true, runValidators: true }
      );
      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith({
        statusCode: httpStatus.OK,
        status: 'Success',
        message: "Updated AI endpoint 'Existing Endpoint' successfully.",
        data: { _id: '1', ...updatedData },
      });
    });

    it('should set other endpoints to non-default if the updated endpoint is set to default', async () => {
      const updatedData = { title: 'Existing Endpoint', enabled: true, default: true };
      req.body = { title: 'Existing Endpoint', default: true };
      AiEndpoint.updateMany.mockResolvedValue({ nModified: 2 });
      AiEndpoint.findOneAndUpdate.mockResolvedValue({ _id: '1', ...updatedData });

      await AiEndpointsController.updateWebAiEndpoint(req, res);

      expect(AiEndpoint.updateMany).toHaveBeenCalledWith({}, { default: false });
      expect(AiEndpoint.findOneAndUpdate).toHaveBeenCalledWith(
        { title: 'Existing Endpoint' },
        { enabled: undefined, default: true }, // 'enabled' is undefined in req.body
        { new: true, runValidators: true }
      );
      expect(statusSpy).toHaveBeenCalledWith(200);
      expect(jsonSpy).toHaveBeenCalledWith({
        statusCode: httpStatus.OK,
        status: 'Success',
        message: "Updated AI endpoint 'Existing Endpoint' successfully.",
        data: { _id: '1', ...updatedData },
      });
    });

    it('should handle internal server errors when updating', async () => {
      req.body = { title: 'Error Endpoint', enabled: true };
      const errorMessage = 'Database update failed';
      AiEndpoint.findOneAndUpdate.mockRejectedValue(new Error(errorMessage));

      await AiEndpointsController.updateWebAiEndpoint(req, res);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        status: 'fail',
        message: 'Error updating AI endpoint',
        error: errorMessage,
      });
    });
  });
});