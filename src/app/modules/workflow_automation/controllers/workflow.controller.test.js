import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import { workflowController } from './workflow.controller.js';

// Mock dependencies
const sendResponse = vi.fn();

const {
  logger,
  mockWorkflow
} = vi.hoisted(() => {
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
  };

  // Mock Mongoose Workflow model
  const mockWorkflow = {
    _id: 'workflowId123',
    userId: 'userId123',
    name: 'Test Workflow',
    description: 'A test workflow',
    status: 'active',
    category: 'Automation',
    createdAt: new Date(),
    updatedAt: new Date(),
    steps: [],
    trigger: { triggerType: 'manual' },
    requiredApps: [],
    metadata: {},
  };

  return {
    logger,
    mockWorkflow
  };
});

const mockWorkflowTemplate = {
  _id: 'templateId123',
  name: 'Template Name',
  description: 'Template Description',
  steps: [{ id: 'step1', type: 'start' }],
  category: 'Productivity',
  requiredApps: ['app1'],
  isPublic: true,
  rating: { average: 4.5 },
  usageCount: 10,
  createdBy: { _id: 'creatorId', name: 'Creator', email: 'creator@example.com' },
};

const Workflow = {
  find: vi.fn().mockReturnThis(),
  findOne: vi.fn(),
  countDocuments: vi.fn(),
  findOneAndUpdate: vi.fn(),
  findOneAndDelete: vi.fn(),
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  exec: vi.fn(),
  save: vi.fn(), // For new Workflow instance
};

// Mock Workflow constructor
const WorkflowConstructor = vi.fn().mockImplementation(() => ({
  ...mockWorkflow,
  save: Workflow.save,
}));
vi.mock('../models/workflow.model.js', () => ({
  default: Workflow,
}));
// Re-assign the constructor mock after the initial mock for the default export
Object.defineProperty(Workflow, 'constructor', {
  value: WorkflowConstructor,
  writable: true,
});


const WorkflowTemplate = {
  findById: vi.fn(),
  find: vi.fn().mockReturnThis(),
  countDocuments: vi.fn(),
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  populate: vi.fn().mockReturnThis(),
  exec: vi.fn(),
  updateOne: vi.fn(),
};

const workflowLayoutService = {
  validateLayoutSchema: vi.fn(),
  compileLayoutToSteps: vi.fn(),
};

// Mock shared modules
vi.mock('http-status', () => ({ default: httpStatus }));
vi.mock('../../../../shared/catchAsync.js', () => ({
  default: (fn) => (req, res, next) => fn(req, res, next), // Simply pass through the async function for testing
}));
vi.mock('../../../../shared/sendResponse.js', () => ({ default: sendResponse }));
vi.mock('../../../../shared/logger.js', () => ({ logger }));
vi.mock('../models/workflow.model.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      find: vi.fn().mockReturnThis(),
      findOne: vi.fn(),
      countDocuments: vi.fn(),
      findOneAndUpdate: vi.fn(),
      findOneAndDelete: vi.fn(),
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      exec: vi.fn(),
      // Mock the constructor for `new Workflow(...)`
      constructor: vi.fn().mockImplementation(() => ({
        ...mockWorkflow,
        save: vi.fn().mockResolvedValue(mockWorkflow),
      })),
    },
  };
});
vi.mock('../models/workflowTemplate.model.js', () => ({
  default: WorkflowTemplate,
}));
vi.mock('../services/workflowLayout.service.js', () => ({
  workflowLayoutService,
}));

// Re-assign the Workflow mock to the local variable for easier access
const MockedWorkflow = vi.mocked(Workflow);
const MockedWorkflowTemplate = vi.mocked(WorkflowTemplate);
const MockedWorkflowLayoutService = vi.mocked(workflowLayoutService);

describe('workflowController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      user: { _id: 'userId123' },
      userId: 'userId123',
      query: {},
      params: {},
      body: {},
    };
    res = {}; // sendResponse directly uses res, no need for res.status().json()
    vi.clearAllMocks();

    // Reset Mongoose chainable mocks
    MockedWorkflow.find.mockReturnThis();
    MockedWorkflow.sort.mockReturnThis();
    MockedWorkflow.limit.mockReturnThis();
    MockedWorkflow.skip.mockReturnThis();
    MockedWorkflow.exec.mockResolvedValue([]);
    MockedWorkflow.countDocuments.mockResolvedValue(0);

    MockedWorkflowTemplate.find.mockReturnThis();
    MockedWorkflowTemplate.sort.mockReturnThis();
    MockedWorkflowTemplate.limit.mockReturnThis();
    MockedWorkflowTemplate.skip.mockReturnThis();
    MockedWorkflowTemplate.populate.mockReturnThis();
    MockedWorkflowTemplate.exec.mockResolvedValue([]);
    MockedWorkflowTemplate.countDocuments.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- getUserWorkflowsController ---
  describe('getUserWorkflowsController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = undefined;
      req.userId = undefined;

      await workflowController.getUserWorkflowsController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should retrieve workflows successfully with default pagination', async () => {
      MockedWorkflow.exec.mockResolvedValue([mockWorkflow]);
      MockedWorkflow.countDocuments.mockResolvedValue(1);

      await workflowController.getUserWorkflowsController(req, res);

      expect(MockedWorkflow.find).toHaveBeenCalledWith({ userId: 'userId123' });
      expect(MockedWorkflow.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(MockedWorkflow.limit).toHaveBeenCalledWith(50);
      expect(MockedWorkflow.skip).toHaveBeenCalledWith(0);
      expect(MockedWorkflow.exec).toHaveBeenCalled();
      expect(MockedWorkflow.countDocuments).toHaveBeenCalledWith({ userId: 'userId123' });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflows retrieved successfully',
        data: {
          workflows: [mockWorkflow],
          total: 1,
          limit: 50,
          offset: 0,
        },
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should retrieve workflows with status and category filters', async () => {
      req.query = { status: 'active', category: 'Test' };
      MockedWorkflow.exec.mockResolvedValue([mockWorkflow]);
      MockedWorkflow.countDocuments.mockResolvedValue(1);

      await workflowController.getUserWorkflowsController(req, res);

      expect(MockedWorkflow.find).toHaveBeenCalledWith({
        userId: 'userId123',
        status: 'active',
        category: 'Test',
      });
      expect(MockedWorkflow.countDocuments).toHaveBeenCalledWith({
        userId: 'userId123',
        status: 'active',
        category: 'Test',
      });
      expect(sendResponse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        statusCode: httpStatus.OK,
        success: true,
      }));
    });

    it('should handle database errors', async () => {
      const error = new Error('DB Error');
      MockedWorkflow.exec.mockRejectedValue(error);

      await workflowController.getUserWorkflowsController(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error in getUserWorkflowsController:', error);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'DB Error',
      });
    });
  });

  // --- getWorkflowController ---
  describe('getWorkflowController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = undefined;
      req.userId = undefined;
      req.params.workflowId = 'workflowId123';

      await workflowController.getWorkflowController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if workflowId is missing', async () => {
      await workflowController.getWorkflowController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow ID is required',
      });
    });

    it('should return NOT_FOUND if workflow is not found', async () => {
      req.params.workflowId = 'nonExistentId';
      MockedWorkflow.findOne.mockResolvedValue(null);

      await workflowController.getWorkflowController(req, res);

      expect(MockedWorkflow.findOne).toHaveBeenCalledWith({ _id: 'nonExistentId', userId: 'userId123' });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    });

    it('should retrieve a specific workflow successfully', async () => {
      req.params.workflowId = 'workflowId123';
      MockedWorkflow.findOne.mockResolvedValue(mockWorkflow);

      await workflowController.getWorkflowController(req, res);

      expect(MockedWorkflow.findOne).toHaveBeenCalledWith({ _id: 'workflowId123', userId: 'userId123' });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow retrieved successfully',
        data: mockWorkflow,
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('DB Error');
      req.params.workflowId = 'workflowId123';
      MockedWorkflow.findOne.mockRejectedValue(error);

      await workflowController.getWorkflowController(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error in getWorkflowController:', error);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'DB Error',
      });
    });
  });

  // --- updateWorkflowController ---
  describe('updateWorkflowController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = undefined;
      req.userId = undefined;
      req.params.workflowId = 'workflowId123';

      await workflowController.updateWorkflowController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if workflowId is missing', async () => {
      await workflowController.updateWorkflowController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow ID is required',
      });
    });

    it('should return NOT_FOUND if workflow is not found', async () => {
      req.params.workflowId = 'nonExistentId';
      req.body = { name: 'Updated Name' };
      MockedWorkflow.findOneAndUpdate.mockResolvedValue(null);

      await workflowController.updateWorkflowController(req, res);

      expect(MockedWorkflow.findOneAndUpdate).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    });

    it('should update a workflow successfully and exclude restricted fields', async () => {
      req.params.workflowId = 'workflowId123';
      const updateData = {
        name: 'New Workflow Name',
        description: 'New description',
        _id: 'shouldBeRemoved',
        userId: 'shouldBeRemoved',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      req.body = updateData;
      const updatedWorkflow = { ...mockWorkflow, name: 'New Workflow Name', description: 'New description' };
      MockedWorkflow.findOneAndUpdate.mockResolvedValue(updatedWorkflow);

      await workflowController.updateWorkflowController(req, res);

      expect(MockedWorkflow.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'workflowId123', userId: 'userId123' },
        {
          $set: expect.objectContaining({
            name: 'New Workflow Name',
            description: 'New description',
            updatedAt: expect.any(Date),
          }),
        },
        { new: true, runValidators: true }
      );
      expect(MockedWorkflow.findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('_id');
      expect(MockedWorkflow.findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('userId');
      expect(MockedWorkflow.findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('createdAt');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow updated successfully',
        data: updatedWorkflow,
      });
      expect(logger.info).toHaveBeenCalledWith(`Workflow updated: ${req.params.workflowId}`);
    });

    it('should handle database errors', async () => {
      const error = new Error('DB Error');
      req.params.workflowId = 'workflowId123';
      req.body = { name: 'Updated Name' };
      MockedWorkflow.findOneAndUpdate.mockRejectedValue(error);

      await workflowController.updateWorkflowController(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error in updateWorkflowController:', error);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'DB Error',
      });
    });
  });

  // --- deleteWorkflowController ---
  describe('deleteWorkflowController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = undefined;
      req.userId = undefined;
      req.params.workflowId = 'workflowId123';

      await workflowController.deleteWorkflowController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if workflowId is missing', async () => {
      await workflowController.deleteWorkflowController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow ID is required',
      });
    });

    it('should return NOT_FOUND if workflow is not found', async () => {
      req.params.workflowId = 'nonExistentId';
      MockedWorkflow.findOneAndDelete.mockResolvedValue(null);

      await workflowController.deleteWorkflowController(req, res);

      expect(MockedWorkflow.findOneAndDelete).toHaveBeenCalledWith({ _id: 'nonExistentId', userId: 'userId123' });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    });

    it('should delete a workflow successfully', async () => {
      req.params.workflowId = 'workflowId123';
      MockedWorkflow.findOneAndDelete.mockResolvedValue(mockWorkflow);

      await workflowController.deleteWorkflowController(req, res);

      expect(MockedWorkflow.findOneAndDelete).toHaveBeenCalledWith({ _id: 'workflowId123', userId: 'userId123' });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow deleted successfully',
      });
      expect(logger.info).toHaveBeenCalledWith(`Workflow deleted: ${req.params.workflowId}`);
    });

    it('should handle database errors', async () => {
      const error = new Error('DB Error');
      req.params.workflowId = 'workflowId123';
      MockedWorkflow.findOneAndDelete.mockRejectedValue(error);

      await workflowController.deleteWorkflowController(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error in deleteWorkflowController:', error);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'DB Error',
      });
    });
  });

  // --- toggleWorkflowStatusController ---
  describe('toggleWorkflowStatusController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = undefined;
      req.userId = undefined;
      req.params.workflowId = 'workflowId123';
      req.body.status = 'inactive';

      await workflowController.toggleWorkflowStatusController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if workflowId is missing', async () => {
      req.body.status = 'inactive';

      await workflowController.toggleWorkflowStatusController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow ID is required',
      });
    });

    it('should return BAD_REQUEST if status is invalid', async () => {
      req.params.workflowId = 'workflowId123';
      req.body.status = 'invalidStatus';

      await workflowController.toggleWorkflowStatusController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Valid status is required (active, inactive, paused)',
      });
    });

    it('should return NOT_FOUND if workflow is not found', async () => {
      req.params.workflowId = 'nonExistentId';
      req.body.status = 'inactive';
      MockedWorkflow.findOneAndUpdate.mockResolvedValue(null);

      await workflowController.toggleWorkflowStatusController(req, res);

      expect(MockedWorkflow.findOneAndUpdate).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    });

    it('should toggle workflow status to inactive successfully', async () => {
      req.params.workflowId = 'workflowId123';
      req.body.status = 'inactive';
      const updatedWorkflow = { ...mockWorkflow, status: 'inactive' };
      MockedWorkflow.findOneAndUpdate.mockResolvedValue(updatedWorkflow);

      await workflowController.toggleWorkflowStatusController(req, res);

      expect(MockedWorkflow.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'workflowId123', userId: 'userId123' },
        { $set: { status: 'inactive', updatedAt: expect.any(Date) } },
        { new: true }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow deactivated successfully',
        data: updatedWorkflow,
      });
      expect(logger.info).toHaveBeenCalledWith(`Workflow status changed to inactive: ${req.params.workflowId}`);
    });

    it('should toggle workflow status to active successfully', async () => {
      req.params.workflowId = 'workflowId123';
      req.body.status = 'active';
      const updatedWorkflow = { ...mockWorkflow, status: 'active' };
      MockedWorkflow.findOneAndUpdate.mockResolvedValue(updatedWorkflow);

      await workflowController.toggleWorkflowStatusController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow activated successfully',
        data: updatedWorkflow,
      });
    });

    it('should toggle workflow status to paused successfully', async () => {
      req.params.workflowId = 'workflowId123';
      req.body.status = 'paused';
      const updatedWorkflow = { ...mockWorkflow, status: 'paused' };
      MockedWorkflow.findOneAndUpdate.mockResolvedValue(updatedWorkflow);

      await workflowController.toggleWorkflowStatusController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow paused successfully',
        data: updatedWorkflow,
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('DB Error');
      req.params.workflowId = 'workflowId123';
      req.body.status = 'active';
      MockedWorkflow.findOneAndUpdate.mockRejectedValue(error);

      await workflowController.toggleWorkflowStatusController(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error in toggleWorkflowStatusController:', error);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'DB Error',
      });
    });
  });

  // --- getWorkflowTemplatesController ---
  describe('getWorkflowTemplatesController', () => {
    it('should retrieve workflow templates successfully with default pagination', async () => {
      MockedWorkflowTemplate.exec.mockResolvedValue([mockWorkflowTemplate]);
      MockedWorkflowTemplate.countDocuments.mockResolvedValue(1);

      await workflowController.getWorkflowTemplatesController(req, res);

      expect(MockedWorkflowTemplate.find).toHaveBeenCalledWith({ isPublic: true });
      expect(MockedWorkflowTemplate.sort).toHaveBeenCalledWith({ 'rating.average': -1, usageCount: -1 });
      expect(MockedWorkflowTemplate.limit).toHaveBeenCalledWith(50);
      expect(MockedWorkflowTemplate.skip).toHaveBeenCalledWith(0);
      expect(MockedWorkflowTemplate.populate).toHaveBeenCalledWith('createdBy', 'name email');
      expect(MockedWorkflowTemplate.exec).toHaveBeenCalled();
      expect(MockedWorkflowTemplate.countDocuments).toHaveBeenCalledWith({ isPublic: true });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow templates retrieved successfully',
        data: {
          templates: [mockWorkflowTemplate],
          total: 1,
          limit: 50,
          offset: 0,
        },
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should retrieve templates with category, tags, and difficulty filters', async () => {
      req.query = { category: 'Productivity', tags: 'tag1,tag2', difficulty: 'easy' };
      MockedWorkflowTemplate.exec.mockResolvedValue([mockWorkflowTemplate]);
      MockedWorkflowTemplate.countDocuments.mockResolvedValue(1);

      await workflowController.getWorkflowTemplatesController(req, res);

      expect(MockedWorkflowTemplate.find).toHaveBeenCalledWith({
        isPublic: true,
        category: 'Productivity',
        difficulty: 'easy',
        tags: { $in: ['tag1', 'tag2'] },
      });
      expect(MockedWorkflowTemplate.countDocuments).toHaveBeenCalledWith({
        isPublic: true,
        category: 'Productivity',
        difficulty: 'easy',
        tags: { $in: ['tag1', 'tag2'] },
      });
      expect(sendResponse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        statusCode: httpStatus.OK,
        success: true,
      }));
    });

    it('should handle database errors', async () => {
      const error = new Error('DB Error');
      MockedWorkflowTemplate.exec.mockRejectedValue(error);

      await workflowController.getWorkflowTemplatesController(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error in getWorkflowTemplatesController:', error);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'DB Error',
      });
    });
  });

  // --- createFromTemplateController ---
  describe('createFromTemplateController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = undefined;
      req.userId = undefined;
      req.params.templateId = 'templateId123';

      await workflowController.createFromTemplateController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if templateId is missing', async () => {
      await workflowController.createFromTemplateController(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Template ID is required',
      });
    });

    it('should return NOT_FOUND if template is not found', async () => {
      req.params.templateId = 'nonExistentTemplate';
      MockedWorkflowTemplate.findById.mockResolvedValue(null);

      await workflowController.createFromTemplateController(req, res);

      expect(MockedWorkflowTemplate.findById).toHaveBeenCalledWith('nonExistentTemplate');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Template not found',
      });
    });

    it('should create a workflow from template successfully', async () => {
      req.params.templateId = 'templateId123';
      req.body = { name: 'My Custom Workflow', customizations: { trigger: { triggerType: 'scheduled' }, metadata: { customKey: 'value' } } };
      MockedWorkflowTemplate.findById.mockResolvedValue(mockWorkflowTemplate);
      MockedWorkflow.save.mockResolvedValue(mockWorkflow); // Mock the save method of the new Workflow instance
      MockedWorkflowTemplate.updateOne.mockResolvedValue({ nModified: 1 });

      await workflowController.createFromTemplateController(req, res);

      expect(MockedWorkflowTemplate.findById).toHaveBeenCalledWith('templateId123');
      expect(Workflow.constructor).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'userId123',
        name: 'My Custom Workflow',
        description: mockWorkflowTemplate.description,
        originalPrompt: `Created from template: ${mockWorkflowTemplate.name}`,
        steps: mockWorkflowTemplate.steps,
        trigger: { triggerType: 'scheduled' },
        category: mockWorkflowTemplate.category,
        requiredApps: [{ app: 'app1', connected: false }],
        metadata: {
          templateId: mockWorkflowTemplate._id,
          createdFromTemplate: true,
          customKey: 'value',
        },
      }));
      expect(MockedWorkflow.save).toHaveBeenCalled();
      expect(MockedWorkflowTemplate.updateOne).toHaveBeenCalledWith(
        { _id: 'templateId123' },
        { $inc: { usageCount: 1 } }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Workflow created from template successfully',
        data: mockWorkflow,
      });
      expect(logger.info).toHaveBeenCalledWith(
        `Workflow created from template ${req.params.templateId}: ${mockWorkflow._id}`
      );
    });

    it('should use template name if custom name is not provided', async () => {
      req.params.templateId = 'templateId123';
      req.body = {}; // No custom name
      MockedWorkflowTemplate.findById.mockResolvedValue(mockWorkflowTemplate);
      MockedWorkflow.save.mockResolvedValue(mockWorkflow);
      MockedWorkflowTemplate.updateOne.mockResolvedValue({ nModified: 1 });

      await workflowController.createFromTemplateController(req, res);

      expect(Workflow.constructor).toHaveBeenCalledWith(expect.objectContaining({
        name: mockWorkflowTemplate.name,
      }));
    });

    it('should handle database errors', async () => {
      const error = new Error('DB Error');
      req.params.templateId = 'templateId123';
      MockedWorkflowTemplate.findById.mockResolvedValue(mockWorkflowTemplate);
      MockedWorkflow.save.mockRejectedValue(error);

      await workflowController.createFromTemplateController(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error in createFromTemplateController:', error);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'DB Error',
      });
    });
  });

  // --- validateWorkflowLayoutController ---
  describe('validateWorkflowLayoutController', () => {
    it('should return BAD_REQUEST if nodes are missing or invalid', async () => {
      req.body = {};
      await workflowController.validateWorkflowLayoutController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Nodes must be a valid array',
      });

      vi.clearAllMocks();
      req.body = { nodes: 'not an array' };
      await workflowController.validateWorkflowLayoutController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Nodes must be a valid array',
      });
    });

    it('should validate layout successfully', async () => {
      const nodes = [{ id: '1', type: 'start' }];
      const edges = [];
      const validationReport = { isValid: true, errors: [] };
      req.body = { nodes, edges };
      MockedWorkflowLayoutService.validateLayoutSchema.mockReturnValue(validationReport);

      await workflowController.validateWorkflowLayoutController(req, res);

      expect(MockedWorkflowLayoutService.validateLayoutSchema).toHaveBeenCalledWith(nodes, edges);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Layout validation completed',
        data: validationReport,
      });
    });

    it('should handle service errors during validation', async () => {
      const error = new Error('Validation failed');
      req.body = { nodes: [{ id: '1', type: 'start' }], edges: [] };
      MockedWorkflowLayoutService.validateLayoutSchema.mockImplementation(() => {
        throw error;
      });

      await workflowController.validateWorkflowLayoutController(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error in validateWorkflowLayoutController:', error);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Validation failed',
      });
    });
  });

  // --- compileWorkflowLayoutController ---
  describe('compileWorkflowLayoutController', () => {
    it('should return BAD_REQUEST if nodes are missing or invalid', async () => {
      req.body = {};
      await workflowController.compileWorkflowLayoutController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Nodes must be a valid array',
      });

      vi.clearAllMocks();
      req.body = { nodes: 'not an array' };
      await workflowController.compileWorkflowLayoutController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Nodes must be a valid array',
      });
    });

    it('should compile layout successfully', async () => {
      const nodes = [{ id: '1', type: 'start' }];
      const edges = [];
      const compiledSteps = [{ stepId: '1', action: 'start' }];
      req.body = { nodes, edges };
      MockedWorkflowLayoutService.compileLayoutToSteps.mockReturnValue(compiledSteps);

      await workflowController.compileWorkflowLayoutController(req, res);

      expect(MockedWorkflowLayoutService.compileLayoutToSteps).toHaveBeenCalledWith(nodes, edges);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Layout compiled successfully',
        data: { steps: compiledSteps },
      });
    });

    it('should handle service errors during compilation', async () => {
      const error = new Error('Compilation failed');
      req.body = { nodes: [{ id: '1', type: 'start' }], edges: [] };
      MockedWorkflowLayoutService.compileLayoutToSteps.mockImplementation(() => {
        throw error;
      });

      await workflowController.compileWorkflowLayoutController(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error in compileWorkflowLayoutController:', error);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST, // Note: This controller returns BAD_REQUEST for service errors, not INTERNAL_SERVER_ERROR
        success: false,
        message: 'Compilation failed',
      });
    });
  });
});