import { vi, describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';

const { StoredWorkflowConstructor, mockStoredWorkflowInstance, mockComposioAuth, mockPlanWorkflowNode, mockLogger, mockWithTenantPipeline } = vi.hoisted(() => {
  // Mock StoredWorkflow model instance creator
  const mockStoredWorkflowInstance = (data = {}) => ({
    workflowId: 'mockWorkflowId123',
    userId: 'mockUserId',
    title: 'Mock Workflow Title',
    description: 'Mock Description',
    workflowType: 'single_step',
    status: 'ready',
    requiredApps: [],
    executionPlan: [],
    totalSteps: 1,
    crossStepParameters: {},
    originalUserInput: 'Mock user input',
    planningMetadata: {},
    conversationId: 'mockConversationId',
    conversationContext: {},
    connectedAccounts: [],
    missingConnections: [],
    tags: [],
    category: 'other',
    createdAt: new Date(),
    isExecutable: true,
    save: vi.fn(),
    updateConnections: vi.fn(),
    ...data,
  });

  // Mock StoredWorkflow Mongoose model (constructor and static methods)
  const StoredWorkflowConstructor = vi.fn().mockImplementation(function (data) {
    const instance = mockStoredWorkflowInstance(data);
    instance.save.mockResolvedValue(instance);
    instance.updateConnections.mockResolvedValue(undefined);
    return instance;
  });

  // Attach static methods to the constructor function
  StoredWorkflowConstructor.find = vi.fn().mockImplementation(() => ({
    sort: vi.fn().mockImplementation(() => ({
      skip: vi.fn().mockImplementation(() => ({
        limit: vi.fn().mockImplementation(() => ({
          lean: vi.fn(),
        })),
      })),
    })),
    lean: vi.fn(),
  }));
  StoredWorkflowConstructor.findOne = vi.fn().mockImplementation(() => ({
    lean: vi.fn(),
  }));
  StoredWorkflowConstructor.sort = vi.fn().mockReturnThis();
  StoredWorkflowConstructor.skip = vi.fn().mockReturnThis();
  StoredWorkflowConstructor.limit = vi.fn().mockReturnThis();
  StoredWorkflowConstructor.lean = vi.fn().mockReturnThis();
  StoredWorkflowConstructor.deleteOne = vi.fn();
  StoredWorkflowConstructor.countDocuments = vi.fn();
  StoredWorkflowConstructor.aggregate = vi.fn();
  StoredWorkflowConstructor.generateWorkflowId = vi.fn();
  StoredWorkflowConstructor.searchWorkflows = vi.fn();
  StoredWorkflowConstructor.findExecutableWorkflows = vi.fn();

  // Mock ComposioAuth Mongoose model
  const mockComposioAuth = {
    find: vi.fn().mockImplementation(() => ({
      lean: vi.fn(),
    })),
    lean: vi.fn(),
  };

  // Mock planWorkflowNode function
  const mockPlanWorkflowNode = vi.fn();

  // Mock logger
  const mockLogger = {
    error: vi.fn(),
  };

  // Mock withTenantPipeline helper
  const mockWithTenantPipeline = vi.fn().mockImplementation((req, pipeline) => pipeline);

  return {
    StoredWorkflowConstructor,
    mockStoredWorkflowInstance,
    mockComposioAuth,
    mockPlanWorkflowNode,
    mockLogger,
    mockWithTenantPipeline
  };
});

vi.mock('../models/storedWorkflow.model.js', () => ({
  default: StoredWorkflowConstructor,
  __esModule: true,
}));

vi.mock('./aiPlanner.js', () => ({
  planWorkflowNode: mockPlanWorkflowNode,
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../helpers/tenantQuery.js', () => ({
  withTenantPipeline: mockWithTenantPipeline,
}));

// Mock console.log and console.error to prevent noise during tests
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

// Import the service after mocks are set up
import { workflowStorageService } from './workflowStorage.service.js';

describe('WorkflowStorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset StoredWorkflow mocks
    StoredWorkflowConstructor.find.mockReturnThis();
    StoredWorkflowConstructor.findOne.mockReturnThis();
    StoredWorkflowConstructor.find().sort.mockReturnThis();
    StoredWorkflowConstructor.find().sort().skip.mockReturnThis();
    StoredWorkflowConstructor.find().sort().skip().limit.mockReturnThis();
    StoredWorkflowConstructor.find().sort().skip().limit().lean.mockResolvedValue([]); // Default for find
    StoredWorkflowConstructor.findOne().lean.mockResolvedValue(null); // Default for findOne
    StoredWorkflowConstructor.deleteOne.mockResolvedValue({ deletedCount: 1 });
    StoredWorkflowConstructor.countDocuments.mockResolvedValue(0);
    StoredWorkflowConstructor.aggregate.mockResolvedValue([]);
    StoredWorkflowConstructor.generateWorkflowId.mockReturnValue('generated-workflow-id-123');
    StoredWorkflowConstructor.searchWorkflows.mockResolvedValue([]);
    StoredWorkflowConstructor.findExecutableWorkflows.mockResolvedValue([]);

    // Reset ComposioAuth mocks
    mockComposioAuth.find.mockReturnThis();
    mockComposioAuth.find().lean.mockResolvedValue([]);

    vi.spyOn(workflowStorageService, 'getUserConnectedAccounts').mockImplementation(async (userId) => {
      return await mockComposioAuth.find({ userId, status: 'ACTIVE' }).lean();
    });

    // Reset planWorkflowNode mock
    mockPlanWorkflowNode.mockResolvedValue({
      workflowType: 'single_step',
      executionPlan: [{ step: 1, tool: 'tool1' }],
      requiredApps: ['app1'],
      totalSteps: 1,
      crossStepParameters: {},
      planningMetadata: { some: 'metadata' },
    });

    // Reset logger mock
    mockLogger.error.mockImplementation(() => {});

    // Reset tenant pipeline mock
    mockWithTenantPipeline.mockImplementation((req, pipeline) => pipeline);

    // Reset console spies
    consoleLogSpy.mockImplementation(() => {});
    consoleErrorSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('analyzeAndStoreWorkflow', () => {
    const defaultInputs = {
      userInput: 'Analyze this input',
      userId: 'user123',
      title: 'Test Workflow',
      description: 'A test workflow',
      conversationId: 'conv123',
      conversationContext: { history: ['hi'] },
      tags: ['test', 'analysis'],
      category: 'testing',
    };

    it('should return an error if userInput or userId is missing', async () => {
      const result1 = await workflowStorageService.analyzeAndStoreWorkflow({ userId: 'user123' });
      expect(result1).toEqual({ success: false, error: 'User input and user ID are required' });

      const result2 = await workflowStorageService.analyzeAndStoreWorkflow({ userInput: 'input' });
      expect(result2).toEqual({ success: false, error: 'User input and user ID are required' });
    });

    it('should successfully analyze and store a workflow when all apps are connected', async () => {
      const mockConnectedAccounts = [{ app: 'app1', toolkit: { slug: 'app1' } }];
      mockComposioAuth.find().lean.mockResolvedValue(mockConnectedAccounts);

      const mockPlanResult = {
        workflowType: 'single_step',
        executionPlan: [{ step: 1, tool: 'tool1' }],
        requiredApps: ['app1'],
        totalSteps: 1,
        crossStepParameters: {},
        planningMetadata: { some: 'metadata' },
      };
      mockPlanWorkflowNode.mockResolvedValue(mockPlanResult);

      const mockWorkflowInstance = mockStoredWorkflowInstance({
        workflowId: 'generated-workflow-id-123',
        userId: defaultInputs.userId,
        title: defaultInputs.title,
        description: defaultInputs.description,
        workflowType: mockPlanResult.workflowType,
        status: 'ready',
        requiredApps: mockPlanResult.requiredApps,
        executionPlan: mockPlanResult.executionPlan,
        totalSteps: mockPlanResult.totalSteps,
        originalUserInput: defaultInputs.userInput,
        planningMetadata: mockPlanResult.planningMetadata,
        conversationId: defaultInputs.conversationId,
        conversationContext: defaultInputs.conversationContext,
        connectedAccounts: mockConnectedAccounts,
        missingConnections: [],
        tags: defaultInputs.tags,
        category: defaultInputs.category,
      });
      StoredWorkflowConstructor.mockImplementation(function () {
        return mockWorkflowInstance;
      });

      const result = await workflowStorageService.analyzeAndStoreWorkflow(defaultInputs);

      expect(mockComposioAuth.find).toHaveBeenCalledWith({ userId: defaultInputs.userId, status: 'ACTIVE' });
      expect(mockPlanWorkflowNode).toHaveBeenCalledWith(expect.objectContaining({
        userInput: defaultInputs.userInput,
        userId: defaultInputs.userId,
        connectedAccounts: mockConnectedAccounts,
      }));
      expect(StoredWorkflowConstructor.generateWorkflowId).toHaveBeenCalled();
      expect(StoredWorkflowConstructor).toHaveBeenCalledWith(expect.objectContaining({
        workflowId: 'generated-workflow-id-123',
        userId: defaultInputs.userId,
        title: defaultInputs.title,
        status: 'ready',
        missingConnections: [],
        requiredApps: ['app1'],
      }));
      expect(mockWorkflowInstance.save).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({
        workflowId: 'generated-workflow-id-123',
        title: defaultInputs.title,
        status: 'ready',
        isExecutable: true,
        missingConnections: [],
      }));
    });

    it('should store a workflow with "draft" status if there are missing connections', async () => {
      const mockConnectedAccounts = [{ app: 'app2', toolkit: { slug: 'app2' } }];
      mockComposioAuth.find().lean.mockResolvedValue(mockConnectedAccounts);

      const mockPlanResult = {
        workflowType: 'multi_step',
        executionPlan: [{ step: 1, tool: 'tool1' }, { step: 2, tool: 'tool2' }],
        requiredApps: ['app1', 'app2'],
        totalSteps: 2,
        planningMetadata: {},
      };
      mockPlanWorkflowNode.mockResolvedValue(mockPlanResult);

      const mockWorkflowInstance = mockStoredWorkflowInstance({
        workflowId: 'generated-workflow-id-123',
        userId: defaultInputs.userId,
        title: defaultInputs.title,
        workflowType: mockPlanResult.workflowType,
        status: 'draft',
        requiredApps: mockPlanResult.requiredApps,
        missingConnections: ['app1'],
        isExecutable: false,
      });
      StoredWorkflowConstructor.mockImplementation(function () {
        return mockWorkflowInstance;
      });

      const result = await workflowStorageService.analyzeAndStoreWorkflow(defaultInputs);

      expect(StoredWorkflowConstructor).toHaveBeenCalledWith(expect.objectContaining({
        status: 'draft',
        missingConnections: ['app1'],
      }));
      expect(result.success).toBe(true);
      expect(result.data).toEqual(expect.objectContaining({
        status: 'draft',
        isExecutable: false,
        missingConnections: ['app1'],
      }));
    });

    it('should generate a title if not provided', async () => {
      const inputsWithoutTitle = { ...defaultInputs, title: undefined };
      const mockPlanResult = {
        workflowType: 'multi_step',
        executionPlan: [{ step: 1 }],
        requiredApps: [],
        totalSteps: 1,
        planningMetadata: {},
      };
      mockPlanWorkflowNode.mockResolvedValue(mockPlanResult);

      const mockWorkflowInstance = mockStoredWorkflowInstance({
        workflowId: 'generated-workflow-id-123',
        userId: defaultInputs.userId,
        title: 'Analyze this input (1 steps)', // Expected generated title
      });
      StoredWorkflowConstructor.mockImplementation(function () {
        return mockWorkflowInstance;
      });

      const result = await workflowStorageService.analyzeAndStoreWorkflow(inputsWithoutTitle);

      expect(StoredWorkflowConstructor).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Analyze this input (1 steps)',
      }));
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('Analyze this input (1 steps)');
    });

    it('should handle planWorkflowNode returning an error', async () => {
      mockPlanWorkflowNode.mockResolvedValue({
        error: { message: 'Planning failed', details: { code: 'PLAN_ERROR' } },
      });

      const result = await workflowStorageService.analyzeAndStoreWorkflow(defaultInputs);

      expect(result).toEqual({
        success: false,
        error: 'Planning failed',
        details: { message: 'Planning failed', details: { code: 'PLAN_ERROR' } },
      });
      expect(StoredWorkflowConstructor).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled(); // Error is returned, not an unhandled exception
    });

    it('should handle a general error during workflow analysis and storage', async () => {
      const mockError = new Error('Database connection failed');
      mockComposioAuth.find().lean.mockRejectedValue(mockError); // Simulate DB error

      const result = await workflowStorageService.analyzeAndStoreWorkflow(defaultInputs);

      expect(result).toEqual({
        success: false,
        error: mockError.message,
        details: {
          stack: expect.any(String),
          name: mockError.name,
        },
      });
      expect(mockLogger.error).toHaveBeenCalledWith('Error in analyzeAndStoreWorkflow:', mockError);
    });

    it('should handle tags as a single string', async () => {
      const inputsWithSingleTag = { ...defaultInputs, tags: 'singleTag' };
      const mockConnectedAccounts = [{ app: 'app1', toolkit: { slug: 'app1' } }];
      mockComposioAuth.find().lean.mockResolvedValue(mockConnectedAccounts);

      const mockWorkflowInstance = mockStoredWorkflowInstance({
        workflowId: 'generated-workflow-id-123',
        userId: defaultInputs.userId,
        tags: ['singleTag'],
      });
      StoredWorkflowConstructor.mockImplementation(function () {
        return mockWorkflowInstance;
      });

      const result = await workflowStorageService.analyzeAndStoreWorkflow(inputsWithSingleTag);

      expect(StoredWorkflowConstructor).toHaveBeenCalledWith(expect.objectContaining({
        tags: ['singleTag'],
      }));
      expect(result.success).toBe(true);
    });

    it('should handle empty tags array', async () => {
      const inputsWithEmptyTags = { ...defaultInputs, tags: [] };
      const mockConnectedAccounts = [{ app: 'app1', toolkit: { slug: 'app1' } }];
      mockComposioAuth.find().lean.mockResolvedValue(mockConnectedAccounts);

      const mockWorkflowInstance = mockStoredWorkflowInstance({
        workflowId: 'generated-workflow-id-123',
        userId: defaultInputs.userId,
        tags: [],
      });
      StoredWorkflowConstructor.mockImplementation(function () {
        return mockWorkflowInstance;
      });

      const result = await workflowStorageService.analyzeAndStoreWorkflow(inputsWithEmptyTags);

      expect(StoredWorkflowConstructor).toHaveBeenCalledWith(expect.objectContaining({
        tags: [],
      }));
      expect(result.success).toBe(true);
    });
  });

  describe('getUserStoredWorkflows', () => {
    const userId = 'user123';
    const mockWorkflows = [
      mockStoredWorkflowInstance({ workflowId: 'w1', status: 'ready', tags: ['tag1'] }),
      mockStoredWorkflowInstance({ workflowId: 'w2', status: 'draft', tags: ['tag2'] }),
    ];

    it('should return a list of workflows for a user', async () => {
      StoredWorkflowConstructor.find().sort().skip().limit().lean.mockResolvedValue(mockWorkflows);
      StoredWorkflowConstructor.countDocuments.mockResolvedValue(mockWorkflows.length);

      const result = await workflowStorageService.getUserStoredWorkflows(userId);

      expect(StoredWorkflowConstructor.find).toHaveBeenCalledWith({ userId });
      expect(StoredWorkflowConstructor.find().sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(StoredWorkflowConstructor.find().sort().skip).toHaveBeenCalledWith(0);
      expect(StoredWorkflowConstructor.find().sort().skip().limit).toHaveBeenCalledWith(50);
      expect(StoredWorkflowConstructor.countDocuments).toHaveBeenCalledWith({ userId });
      expect(result.success).toBe(true);
      expect(result.data.workflows).toEqual(mockWorkflows);
      expect(result.data.totalCount).toBe(mockWorkflows.length);
      expect(result.data.hasMore).toBe(false);
    });

    it('should apply filters and pagination options', async () => {
      const options = {
        status: 'ready',
        workflowType: 'single_step',
        category: 'testing',
        tags: ['tag1'],
        limit: 10,
        offset: 5,
        sortBy: 'title',
        sortOrder: 1,
      };
      StoredWorkflowConstructor.find().sort().skip().limit().lean.mockResolvedValue([mockWorkflows[0]]);
      StoredWorkflowConstructor.countDocuments.mockResolvedValue(1);

      const result = await workflowStorageService.getUserStoredWorkflows(userId, options);

      expect(StoredWorkflowConstructor.find).toHaveBeenCalledWith({
        userId,
        status: 'ready',
        workflowType: 'single_step',
        category: 'testing',
        tags: { $in: ['tag1'] },
      });
      expect(StoredWorkflowConstructor.find().sort).toHaveBeenCalledWith({ title: 1 });
      expect(StoredWorkflowConstructor.find().sort().skip).toHaveBeenCalledWith(5);
      expect(StoredWorkflowConstructor.find().sort().skip().limit).toHaveBeenCalledWith(10);
      expect(StoredWorkflowConstructor.countDocuments).toHaveBeenCalledWith({
        userId,
        status: 'ready',
        workflowType: 'single_step',
        category: 'testing',
        tags: { $in: ['tag1'] },
      });
      expect(result.success).toBe(true);
      expect(result.data.workflows).toEqual([mockWorkflows[0]]);
      expect(result.data.totalCount).toBe(1);
      expect(result.data.offset).toBe(5);
      expect(result.data.limit).toBe(10);
    });

    it('should handle tags as a single string in options', async () => {
      const options = { tags: 'tag1' };
      StoredWorkflowConstructor.find().sort().skip().limit().lean.mockResolvedValue([mockWorkflows[0]]);
      StoredWorkflowConstructor.countDocuments.mockResolvedValue(1);

      await workflowStorageService.getUserStoredWorkflows(userId, options);

      expect(StoredWorkflowConstructor.find).toHaveBeenCalledWith({
        userId,
        tags: { $in: ['tag1'] },
      });
    });

    it('should return empty data if no workflows are found', async () => {
      StoredWorkflowConstructor.find().sort().skip().limit().lean.mockResolvedValue([]);
      StoredWorkflowConstructor.countDocuments.mockResolvedValue(0);

      const result = await workflowStorageService.getUserStoredWorkflows(userId);

      expect(result.success).toBe(true);
      expect(result.data.workflows).toEqual([]);
      expect(result.data.totalCount).toBe(0);
    });

    it('should handle database errors', async () => {
      const mockError = new Error('DB read error');
      StoredWorkflowConstructor.find().sort().skip().limit().lean.mockRejectedValue(mockError);

      const result = await workflowStorageService.getUserStoredWorkflows(userId);

      expect(result).toEqual({ success: false, error: mockError.message });
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting user stored workflows:', mockError);
    });
  });

  describe('getStoredWorkflow', () => {
    const workflowId = 'w1';
    const userId = 'user123';
    const mockWorkflow = mockStoredWorkflowInstance({ workflowId, userId });

    it('should return a specific workflow', async () => {
      StoredWorkflowConstructor.findOne().lean.mockResolvedValue(mockWorkflow);

      const result = await workflowStorageService.getStoredWorkflow(workflowId, userId);

      expect(StoredWorkflowConstructor.findOne).toHaveBeenCalledWith({ workflowId, userId });
      expect(StoredWorkflowConstructor.findOne().lean).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockWorkflow);
    });

    it('should return an error if workflow is not found', async () => {
      StoredWorkflowConstructor.findOne().lean.mockResolvedValue(null);

      const result = await workflowStorageService.getStoredWorkflow(workflowId, userId);

      expect(result).toEqual({ success: false, error: 'Workflow not found' });
    });

    it('should handle database errors', async () => {
      const mockError = new Error('DB find error');
      StoredWorkflowConstructor.findOne().lean.mockRejectedValue(mockError);

      const result = await workflowStorageService.getStoredWorkflow(workflowId, userId);

      expect(result).toEqual({ success: false, error: mockError.message });
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting stored workflow:', mockError);
    });
  });

  describe('updateStoredWorkflow', () => {
    const workflowId = 'w1';
    const userId = 'user123';
    const initialWorkflow = mockStoredWorkflowInstance({ workflowId, userId, title: 'Old Title', tags: ['old'] });
    const mockUpdatedWorkflow = { ...initialWorkflow, title: 'New Title', tags: ['new'] };

    beforeEach(() => {
      StoredWorkflowConstructor.findOne.mockReturnThis(); // For the non-lean findOne
      StoredWorkflowConstructor.findOne.mockResolvedValue(initialWorkflow); // Return the actual instance for modification
      initialWorkflow.save.mockImplementation(function() { return Promise.resolve(this); }); // Return the modified instance itself
    });

    it('should update allowed fields and save the workflow', async () => {
      const updates = {
        title: 'New Title',
        description: 'New Description',
        tags: ['new'],
        category: 'updated',
        status: 'draft',
        disallowedField: 'should not be updated',
      };

      const result = await workflowStorageService.updateStoredWorkflow(workflowId, userId, updates);

      expect(StoredWorkflowConstructor.findOne).toHaveBeenCalledWith({ workflowId, userId });
      expect(initialWorkflow.title).toBe(updates.title);
      expect(initialWorkflow.description).toBe(updates.description);
      expect(initialWorkflow.tags).toEqual(updates.tags);
      expect(initialWorkflow.category).toBe(updates.category);
      expect(initialWorkflow.status).toBe(updates.status);
      expect(initialWorkflow.disallowedField).toBeUndefined(); // Ensure disallowed field is not set
      expect(initialWorkflow.save).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(initialWorkflow);
      expect(result.message).toBe('Workflow updated successfully');
    });

    it('should return an error if workflow is not found', async () => {
      StoredWorkflowConstructor.findOne.mockResolvedValue(null);

      const updates = { title: 'New Title' };
      const result = await workflowStorageService.updateStoredWorkflow(workflowId, userId, updates);

      expect(result).toEqual({ success: false, error: 'Workflow not found' });
      expect(initialWorkflow.save).not.toHaveBeenCalled();
    });

    it('should handle database errors during update', async () => {
      const mockError = new Error('DB update error');
      initialWorkflow.save.mockRejectedValue(mockError);

      const updates = { title: 'New Title' };
      const result = await workflowStorageService.updateStoredWorkflow(workflowId, userId, updates);

      expect(result).toEqual({ success: false, error: mockError.message });
      expect(mockLogger.error).toHaveBeenCalledWith('Error updating stored workflow:', mockError);
    });
  });

  describe('deleteStoredWorkflow', () => {
    const workflowId = 'w1';
    const userId = 'user123';

    it('should successfully delete a workflow', async () => {
      StoredWorkflowConstructor.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await workflowStorageService.deleteStoredWorkflow(workflowId, userId);

      expect(StoredWorkflowConstructor.deleteOne).toHaveBeenCalledWith({ workflowId, userId });
      expect(result.success).toBe(true);
      expect(result.message).toBe('Workflow deleted successfully');
    });

    it('should return an error if workflow is not found', async () => {
      StoredWorkflowConstructor.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await workflowStorageService.deleteStoredWorkflow(workflowId, userId);

      expect(result).toEqual({ success: false, error: 'Workflow not found' });
    });

    it('should handle database errors', async () => {
      const mockError = new Error('DB delete error');
      StoredWorkflowConstructor.deleteOne.mockRejectedValue(mockError);

      const result = await workflowStorageService.deleteStoredWorkflow(workflowId, userId);

      expect(result).toEqual({ success: false, error: mockError.message });
      expect(mockLogger.error).toHaveBeenCalledWith('Error deleting stored workflow:', mockError);
    });
  });

  describe('searchStoredWorkflows', () => {
    const userId = 'user123';
    const searchTerm = 'search term';
    const mockWorkflows = [mockStoredWorkflowInstance({ title: 'Found Workflow' })];

    it('should successfully search for workflows', async () => {
      StoredWorkflowConstructor.searchWorkflows.mockResolvedValue(mockWorkflows);

      const result = await workflowStorageService.searchStoredWorkflows(userId, searchTerm);

      expect(StoredWorkflowConstructor.searchWorkflows).toHaveBeenCalledWith(userId, searchTerm, {});
      expect(result.success).toBe(true);
      expect(result.data.workflows).toEqual(mockWorkflows);
      expect(result.data.searchTerm).toBe(searchTerm);
      expect(result.data.resultCount).toBe(mockWorkflows.length);
    });

    it('should pass options to searchWorkflows', async () => {
      const options = { limit: 5, category: 'test' };
      StoredWorkflowConstructor.searchWorkflows.mockResolvedValue([]);

      await workflowStorageService.searchStoredWorkflows(userId, searchTerm, options);

      expect(StoredWorkflowConstructor.searchWorkflows).toHaveBeenCalledWith(userId, searchTerm, options);
    });

    it('should return empty results if no workflows match', async () => {
      StoredWorkflowConstructor.searchWorkflows.mockResolvedValue([]);

      const result = await workflowStorageService.searchStoredWorkflows(userId, searchTerm);

      expect(result.success).toBe(true);
      expect(result.data.workflows).toEqual([]);
      expect(result.data.resultCount).toBe(0);
    });

    it('should handle database errors', async () => {
      const mockError = new Error('DB search error');
      StoredWorkflowConstructor.searchWorkflows.mockRejectedValue(mockError);

      const result = await workflowStorageService.searchStoredWorkflows(userId, searchTerm);

      expect(result).toEqual({ success: false, error: mockError.message });
      expect(mockLogger.error).toHaveBeenCalledWith('Error searching stored workflows:', mockError);
    });
  });

  describe('getExecutableWorkflows', () => {
    const userId = 'user123';
    const mockWorkflows = [mockStoredWorkflowInstance({ status: 'ready', isExecutable: true })];

    it('should successfully retrieve executable workflows', async () => {
      StoredWorkflowConstructor.findExecutableWorkflows.mockResolvedValue(mockWorkflows);

      const result = await workflowStorageService.getExecutableWorkflows(userId);

      expect(StoredWorkflowConstructor.findExecutableWorkflows).toHaveBeenCalledWith(userId);
      expect(result.success).toBe(true);
      expect(result.data.workflows).toEqual(mockWorkflows);
      expect(result.data.count).toBe(mockWorkflows.length);
    });

    it('should return empty results if no executable workflows are found', async () => {
      StoredWorkflowConstructor.findExecutableWorkflows.mockResolvedValue([]);

      const result = await workflowStorageService.getExecutableWorkflows(userId);

      expect(result.success).toBe(true);
      expect(result.data.workflows).toEqual([]);
      expect(result.data.count).toBe(0);
    });

    it('should handle database errors', async () => {
      const mockError = new Error('DB executable workflows error');
      StoredWorkflowConstructor.findExecutableWorkflows.mockRejectedValue(mockError);

      const result = await workflowStorageService.getExecutableWorkflows(userId);

      expect(result).toEqual({ success: false, error: mockError.message });
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting executable workflows:', mockError);
    });
  });

  describe('refreshWorkflowConnections', () => {
    const workflowId = 'w1';
    const userId = 'user123';
    const initialWorkflow = mockStoredWorkflowInstance({ workflowId, userId, status: 'draft', missingConnections: ['app1'] });
    // Note: The actual workflow object is modified in place by updateConnections mock
    // So we don't need a separate 'updatedWorkflow' object here.

    beforeEach(() => {
      StoredWorkflowConstructor.findOne.mockReturnThis(); // For the non-lean findOne
      StoredWorkflowConstructor.findOne.mockResolvedValue(initialWorkflow); // Return the actual instance for modification
      initialWorkflow.updateConnections.mockImplementation(async (connectedAccounts) => {
        // Simulate update logic
        initialWorkflow.connectedAccounts = connectedAccounts;
        initialWorkflow.missingConnections = []; // Assume all connected now
        initialWorkflow.status = 'ready';
        initialWorkflow.isExecutable = true;
      });
    });

    it('should refresh connections and update workflow status', async () => {
      const result = await workflowStorageService.refreshWorkflowConnections(workflowId, userId);

      expect(StoredWorkflowConstructor.findOne).toHaveBeenCalledWith({ workflowId, userId });
      expect(initialWorkflow.updateConnections).toHaveBeenCalledWith([]);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        workflowId,
        status: 'ready',
        missingConnections: [],
        isExecutable: true,
      });
      expect(result.message).toBe('Workflow connections updated');
    });

    it('should return an error if workflow is not found', async () => {
      StoredWorkflowConstructor.findOne.mockResolvedValue(null);

      const result = await workflowStorageService.refreshWorkflowConnections(workflowId, userId);

      expect(result).toEqual({ success: false, error: 'Workflow not found' });
      expect(initialWorkflow.updateConnections).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const mockError = new Error('DB refresh error');
      StoredWorkflowConstructor.findOne.mockRejectedValue(mockError);

      const result = await workflowStorageService.refreshWorkflowConnections(workflowId, userId);

      expect(result).toEqual({ success: false, error: mockError.message });
      expect(mockLogger.error).toHaveBeenCalledWith('Error refreshing workflow connections:', mockError);
    });
  });

  describe('prepareWorkflowForExecution', () => {
    const workflowId = 'w1';
    const userId = 'user123';
    const executableWorkflow = mockStoredWorkflowInstance({
      workflowId,
      userId,
      status: 'ready',
      isExecutable: true,
      executionPlan: [{ step: 1 }],
      requiredApps: ['app1'],
      originalUserInput: 'Execute this',
      conversationId: 'conv1',
      conversationContext: { data: 'context' },
    });
    const nonExecutableWorkflow = mockStoredWorkflowInstance({
      workflowId,
      userId,
      status: 'draft',
      isExecutable: false,
      missingConnections: ['app2'],
    });

    it('should prepare an executable workflow for execution', async () => {
      StoredWorkflowConstructor.findOne().lean.mockResolvedValue(executableWorkflow);

      const result = await workflowStorageService.prepareWorkflowForExecution(workflowId, userId);

      expect(StoredWorkflowConstructor.findOne).toHaveBeenCalledWith({ workflowId, userId });
      expect(StoredWorkflowConstructor.findOne().lean).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        userId,
        title: executableWorkflow.title,
        description: executableWorkflow.description,
        executionPlan: executableWorkflow.executionPlan,
        workflowType: executableWorkflow.workflowType,
        requiredApps: executableWorkflow.requiredApps,
        triggerType: 'manual',
        originalUserInput: executableWorkflow.originalUserInput,
        conversationId: executableWorkflow.conversationId,
        conversationContext: executableWorkflow.conversationContext,
      });
      expect(result.message).toBe('Workflow prepared for execution');
    });

    it('should return an error if workflow is not found', async () => {
      StoredWorkflowConstructor.findOne().lean.mockResolvedValue(null);

      const result = await workflowStorageService.prepareWorkflowForExecution(workflowId, userId);

      expect(result).toEqual({ success: false, error: 'Workflow not found' });
    });

    it('should return an error if workflow is not executable', async () => {
      StoredWorkflowConstructor.findOne().lean.mockResolvedValue(nonExecutableWorkflow);

      const result = await workflowStorageService.prepareWorkflowForExecution(workflowId, userId);

      expect(result).toEqual({
        success: false,
        error: 'Workflow is not executable. Missing connections: app2',
      });
    });

    it('should handle database errors', async () => {
      const mockError = new Error('DB prepare error');
      StoredWorkflowConstructor.findOne().lean.mockRejectedValue(mockError);

      const result = await workflowStorageService.prepareWorkflowForExecution(workflowId, userId);

      expect(result).toEqual({ success: false, error: mockError.message });
      expect(mockLogger.error).toHaveBeenCalledWith('Error preparing workflow for execution:', mockError);
    });
  });

  describe('generateWorkflowTitle', () => {
    const planResultSingleStep = { workflowType: 'single_step', totalSteps: 1 };
    const planResultMultiStep = { workflowType: 'multi_step', totalSteps: 3 };
    const planResultMultiStepNoTotalSteps = { workflowType: 'multi_step', executionPlan: [{}, {}, {}] };
    const planResultMultiStepNoStepsInfo = { workflowType: 'multi_step' };

    it('should return the user input with single step suffix for short input', async () => {
      const userInput = 'Short input';
      const title = await workflowStorageService.generateWorkflowTitle(userInput, planResultSingleStep);
      expect(title).toBe('Short input');
    });

    it('should truncate long user input and add single step suffix', async () => {
      const userInput = 'This is a very long user input that needs to be truncated because it exceeds the character limit for a workflow title.';
      const title = await workflowStorageService.generateWorkflowTitle(userInput, planResultSingleStep);
      expect(title).toBe('This is a very long user input that needs to be...');
    });

    it('should add multi-step suffix with total steps', async () => {
      const userInput = 'Multi-step task';
      const title = await workflowStorageService.generateWorkflowTitle(userInput, planResultMultiStep);
      expect(title).toBe('Multi-step task (3 steps)');
    });

    it('should add multi-step suffix with execution plan length if totalSteps is missing', async () => {
      const userInput = 'Multi-step task';
      const title = await workflowStorageService.generateWorkflowTitle(userInput, planResultMultiStepNoTotalSteps);
      expect(title).toBe('Multi-step task (3 steps)');
    });

    it('should add multi-step suffix with "Multi" if no step info is available', async () => {
      const userInput = 'Multi-step task';
      const title = await workflowStorageService.generateWorkflowTitle(userInput, planResultMultiStepNoStepsInfo);
      expect(title).toBe('Multi-step task (Multi steps)');
    });

    it('should handle errors gracefully by returning truncated user input as fallback', async () => {
      const userInput = 'User input that causes an error and is very long to test truncation fallback';
      // Passing null for planResult will cause an error when accessing its properties
      const errorTitle = await workflowStorageService.generateWorkflowTitle(userInput, null);
      expect(errorTitle).toBe(userInput.substring(0, 47) + '...'); // Fallback for long input
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error generating workflow title:', expect.any(TypeError)); // Expect TypeError from null access
    });

    it('should handle errors gracefully by returning original user input as fallback for short input', async () => {
      const userInput = 'Short error input';
      const errorTitle = await workflowStorageService.generateWorkflowTitle(userInput, null);
      expect(errorTitle).toBe(userInput); // Fallback for short input
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error generating workflow title:', expect.any(TypeError));
    });
  });

  describe('getUserConnectedAccounts', () => {
    const userId = 'user123';

    it('should return connected accounts for a user as empty directly', async () => {
      const result = await workflowStorageService.getUserConnectedAccounts(userId);
      expect(result).toEqual([]);
    });
  });

  describe('getWorkflowStatistics', () => {
    const userId = 'user123';
    const mockStatsResult = [{
      _id: null,
      totalWorkflows: 5,
      readyWorkflows: 3,
      draftWorkflows: 2,
      singleStepWorkflows: 4,
      multiStepWorkflows: 1,
      totalExecutions: 10,
      averageSteps: 2.5,
    }];

    it('should return workflow statistics for a user', async () => {
      StoredWorkflowConstructor.aggregate.mockResolvedValue(mockStatsResult);

      const result = await workflowStorageService.getWorkflowStatistics(userId);

      expect(StoredWorkflowConstructor.aggregate).toHaveBeenCalledWith([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalWorkflows: { $sum: 1 },
            readyWorkflows: { $sum: { $cond: [{ $eq: ['$status', 'ready'] }, 1, 0] } },
            draftWorkflows: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
            singleStepWorkflows: { $sum: { $cond: [{ $eq: ['$workflowType', 'single_step'] }, 1, 0] } },
            multiStepWorkflows: { $sum: { $cond: [{ $eq: ['$workflowType', 'multi_step'] }, 1, 0] } },
            totalExecutions: { $sum: '$executionCount' },
            averageSteps: { $avg: '$totalSteps' },
          },
        },
      ]);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockStatsResult[0]);
    });

    it('should return zeroed statistics if no workflows are found', async () => {
      StoredWorkflowConstructor.aggregate.mockResolvedValue([]);

      const result = await workflowStorageService.getWorkflowStatistics(userId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        totalWorkflows: 0,
        readyWorkflows: 0,
        draftWorkflows: 0,
        singleStepWorkflows: 0,
        multiStepWorkflows: 0,
        totalExecutions: 0,
        averageSteps: 0,
      });
    });

    it('should apply tenant pipeline if req object is provided', async () => {
      const mockReq = { tenantId: 'tenant123' };
      const initialPipeline = [
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalWorkflows: { $sum: 1 },
            readyWorkflows: { $sum: { $cond: [{ $eq: ['$status', 'ready'] }, 1, 0] } },
            draftWorkflows: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
            singleStepWorkflows: { $sum: { $cond: [{ $eq: ['$workflowType', 'single_step'] }, 1, 0] } },
            multiStepWorkflows: { $sum: { $cond: [{ $eq: ['$workflowType', 'multi_step'] }, 1, 0] } },
            totalExecutions: { $sum: '$executionCount' },
            averageSteps: { $avg: '$totalSteps' },
          },
        },
      ];
      const modifiedPipeline = [{ $match: { tenantId: 'tenant123' } }, ...initialPipeline];
      mockWithTenantPipeline.mockReturnValue(modifiedPipeline);
      StoredWorkflowConstructor.aggregate.mockResolvedValue(mockStatsResult);

      await workflowStorageService.getWorkflowStatistics(userId, mockReq);

      expect(mockWithTenantPipeline).toHaveBeenCalledWith(mockReq, initialPipeline);
      expect(StoredWorkflowConstructor.aggregate).toHaveBeenCalledWith(modifiedPipeline);
    });

    it('should handle database errors', async () => {
      const mockError = new Error('DB aggregation error');
      StoredWorkflowConstructor.aggregate.mockRejectedValue(mockError);

      const result = await workflowStorageService.getWorkflowStatistics(userId);

      expect(result).toEqual({ success: false, error: mockError.message });
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting workflow statistics:', mockError);
    });
  });
});