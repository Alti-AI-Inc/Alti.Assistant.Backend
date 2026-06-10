import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock mongoose
const mockSchemaInstance = {
  index: vi.fn(),
  virtual: vi.fn((name) => ({
    get: vi.fn((getter) => {
      mockSchemaInstance._virtuals = mockSchemaInstance._virtuals || {};
      mockSchemaInstance._virtuals[name] = getter;
    }),
  })),
  statics: vi.fn((methods) => {
    mockSchemaInstance._statics = { ...mockSchemaInstance._statics, ...methods };
  }),
  methods: vi.fn((methods) => {
    mockSchemaInstance._methods = { ...mockSchemaInstance._methods, ...methods };
  }),
  path: vi.fn(() => ({
    validate: vi.fn(),
  })),
  pre: vi.fn(),
};

const mockMongoose = {
  Schema: vi.fn(() => mockSchemaInstance),
  model: vi.fn((name, schema) => {
    // This mock 'model' will act as the StoredWorkflow class
    const MockModel = function (data) {
      Object.assign(this, data);
      this.save = vi.fn(() => Promise.resolve(this)); // Mock save method for instance methods
    };

    // Attach static methods
    if (schema._statics) {
      Object.assign(MockModel, schema._statics);
    }

    // Attach instance methods
    if (schema._methods) {
      Object.assign(MockModel.prototype, schema._methods);
    }

    // Attach virtuals as getters on the prototype
    if (schema._virtuals) {
      for (const virtualName in schema._virtuals) {
        Object.defineProperty(MockModel.prototype, virtualName, {
          get: schema._virtuals[virtualName],
          configurable: true,
        });
      }
    }

    // Mock chainable methods for static methods like find, sort, limit, skip
    MockModel.find = vi.fn(() => {
      const chainable = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        exec: vi.fn(() => Promise.resolve([])), // Default to empty array
      };
      return chainable;
    });

    return MockModel;
  }),
  Types: {
    Mixed: 'Mixed', // Mock Mongoose.Schema.Types.Mixed
  },
};

// Replace the actual mongoose import with our mock
vi.mock('mongoose', () => mockMongoose);

// Import the model AFTER mocking mongoose
import StoredWorkflow from '../storedWorkflow.model';

describe('StoredWorkflow Model', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Re-initialize mockSchemaInstance properties for each test if needed,
    // especially for _statics, _methods, _virtuals to ensure isolation.
    mockSchemaInstance.index.mockClear();
    mockSchemaInstance.virtual.mockClear();
    mockSchemaInstance.statics.mockClear();
    mockSchemaInstance.methods.mockClear();
    mockSchemaInstance._statics = {};
    mockSchemaInstance._methods = {};
    mockSchemaInstance._virtuals = {};
    mockMongoose.Schema.mockClear();
    mockMongoose.model.mockClear();
    // Ensure the static find method on the mocked StoredWorkflow is also cleared
    if (StoredWorkflow.find) {
      StoredWorkflow.find.mockClear();
    }
  });

  it('should define the StoredWorkflow schema correctly', () => {
    expect(mockMongoose.Schema).toHaveBeenCalledTimes(1);
    const schemaDefinition = mockMongoose.Schema.mock.calls[0][0];
    const schemaOptions = mockMongoose.Schema.mock.calls[0][1];

    expect(schemaDefinition).toBeDefined();
    expect(schemaOptions).toEqual({
      timestamps: true,
      toJSON: { virtuals: true },
      toObject: { virtuals: true },
    });

    // Check key fields and their types/properties
    expect(schemaDefinition.workflowId).toEqual({
      type: String,
      required: true,
      unique: true,
      index: true,
    });
    expect(schemaDefinition.userId).toEqual({
      type: String,
      required: true,
      index: true,
    });
    expect(schemaDefinition.title).toEqual({
      type: String,
      required: true,
      maxlength: 200,
    });
    expect(schemaDefinition.description).toEqual({
      type: String,
      maxlength: 1000,
    });
    expect(schemaDefinition.workflowType).toEqual({
      type: String,
      enum: ['single_step', 'multi_step'],
      required: true,
      index: true,
    });
    expect(schemaDefinition.status).toEqual({
      type: String,
      enum: ['draft', 'ready', 'archived'],
      default: 'draft',
      index: true,
    });
    expect(schemaDefinition.requiredApps).toEqual([
      {
        type: String,
        required: true,
      },
    ]);
    expect(schemaDefinition.executionPlan).toBeInstanceOf(Array);
    expect(schemaDefinition.executionPlan[0].step).toEqual({
      type: Number,
      required: true,
    });
    expect(schemaDefinition.executionPlan[0].parameters).toEqual({
      type: mockMongoose.Types.Mixed,
      default: {},
    });
    expect(schemaDefinition.totalSteps).toEqual({
      type: Number,
      required: true,
      min: 1,
    });
    expect(schemaDefinition.crossStepParameters).toEqual({
      type: mockMongoose.Types.Mixed,
      default: {},
    });
    expect(schemaDefinition.originalUserInput).toEqual({
      type: String,
      required: true,
    });
    expect(schemaDefinition.planningMetadata).toEqual({
      reasoning: String,
      confidence: Number,
      planningTime: Date,
      executionType: String,
    });
    expect(schemaDefinition.conversationId).toEqual({
      type: String,
      index: true,
    });
    expect(schemaDefinition.conversationContext).toEqual({
      type: mockMongoose.Types.Mixed,
      default: {},
    });
    expect(schemaDefinition.connectedAccounts).toEqual([
      {
        type: mockMongoose.Types.Mixed,
      },
    ]);
    expect(schemaDefinition.missingConnections).toEqual([
      {
        type: String,
      },
    ]);
    expect(schemaDefinition.tags).toEqual([
      {
        type: String,
        trim: true,
      },
    ]);
    expect(schemaDefinition.category).toEqual({
      type: String,
      enum: [
        'automation',
        'data_processing',
        'communication',
        'productivity',
        'integration',
        'other',
      ],
      default: 'other',
    });
    expect(schemaDefinition.isTemplate).toEqual({
      type: Boolean,
      default: false,
    });
    expect(schemaDefinition.executionCount).toEqual({
      type: Number,
      default: 0,
    });
    expect(schemaDefinition.lastExecuted).toEqual({
      type: Date,
    });

    expect(mockMongoose.model).toHaveBeenCalledWith('StoredWorkflow', mockSchemaInstance);
  });

  it('should define schema indexes', () => {
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ userId: 1, status: 1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ userId: 1, workflowType: 1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ userId: 1, createdAt: -1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ requiredApps: 1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ tags: 1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ category: 1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledTimes(6);
  });

  describe('Virtuals', () => {
    it('isExecutable should return true if status is "ready" and no missing connections', () => {
      const workflow = new StoredWorkflow({
        status: 'ready',
        missingConnections: [],
      });
      expect(workflow.isExecutable).toBe(true);

      const workflow2 = new StoredWorkflow({
        status: 'ready',
        missingConnections: null,
      });
      expect(workflow2.isExecutable).toBe(true);

      const workflow3 = new StoredWorkflow({
        status: 'ready',
        // missingConnections not defined
      });
      expect(workflow3.isExecutable).toBe(true);
    });

    it('isExecutable should return false if status is not "ready"', () => {
      const workflow = new StoredWorkflow({
        status: 'draft',
        missingConnections: [],
      });
      expect(workflow.isExecutable).toBe(false);
    });

    it('isExecutable should return false if there are missing connections', () => {
      const workflow = new StoredWorkflow({
        status: 'ready',
        missingConnections: ['app1'],
      });
      expect(workflow.isExecutable).toBe(false);
    });

    it('complexity should return "simple" for 1 step', () => {
      const workflow = new StoredWorkflow({ totalSteps: 1 });
      expect(workflow.complexity).toBe('simple');
    });

    it('complexity should return "medium" for 2-3 steps', () => {
      const workflow1 = new StoredWorkflow({ totalSteps: 2 });
      expect(workflow1.complexity).toBe('medium');
      const workflow2 = new StoredWorkflow({ totalSteps: 3 });
      expect(workflow2.complexity).toBe('medium');
    });

    it('complexity should return "complex" for more than 3 steps', () => {
      const workflow = new StoredWorkflow({ totalSteps: 4 });
      expect(workflow.complexity).toBe('complex');
    });
  });

  describe('Static Methods', () => {
    it('generateWorkflowId should return a unique ID in the correct format', () => {
      vi.setSystemTime(new Date('2023-01-01T12:00:00.000Z'));
      const id1 = StoredWorkflow.generateWorkflowId();
      const id2 = StoredWorkflow.generateWorkflowId();

      expect(id1).toMatch(/^workflow_\d+_[a-z0-9]{9}$/);
      expect(id2).toMatch(/^workflow_\d+_[a-z0-9]{9}$/);
      expect(id1).not.toBe(id2); // Should be unique due to random part
      vi.useRealTimers();
    });

    describe('findByUserId', () => {
      const mockFindResult = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        exec: vi.fn(() => Promise.resolve([{ _id: 'mockId1' }])),
      };

      beforeEach(() => {
        StoredWorkflow.find.mockReturnValue(mockFindResult);
      });

      it('should find workflows by userId with default options', async () => {
        const userId = 'user123';
        await StoredWorkflow.findByUserId(userId);

        expect(StoredWorkflow.find).toHaveBeenCalledWith({ userId });
        expect(mockFindResult.sort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(mockFindResult.limit).toHaveBeenCalledWith(50);
        expect(mockFindResult.skip).toHaveBeenCalledWith(0);
        expect(mockFindResult.exec).toHaveBeenCalled();
      });

      it('should apply status filter', async () => {
        const userId = 'user123';
        await StoredWorkflow.findByUserId(userId, { status: 'ready' });
        expect(StoredWorkflow.find).toHaveBeenCalledWith({ userId, status: 'ready' });
      });

      it('should apply workflowType filter', async () => {
        const userId = 'user123';
        await StoredWorkflow.findByUserId(userId, { workflowType: 'single_step' });
        expect(StoredWorkflow.find).toHaveBeenCalledWith({
          userId,
          workflowType: 'single_step',
        });
      });

      it('should apply category filter', async () => {
        const userId = 'user123';
        await StoredWorkflow.findByUserId(userId, { category: 'automation' });
        expect(StoredWorkflow.find).toHaveBeenCalledWith({
          userId,
          category: 'automation',
        });
      });

      it('should apply all filters and pagination/sorting options', async () => {
        const userId = 'user123';
        const options = {
          status: 'archived',
          workflowType: 'multi_step',
          category: 'communication',
          limit: 10,
          offset: 5,
          sortBy: 'title',
          sortOrder: 1,
        };
        await StoredWorkflow.findByUserId(userId, options);

        expect(StoredWorkflow.find).toHaveBeenCalledWith({
          userId,
          status: 'archived',
          workflowType: 'multi_step',
          category: 'communication',
        });
        expect(mockFindResult.sort).toHaveBeenCalledWith({ title: 1 });
        expect(mockFindResult.limit).toHaveBeenCalledWith(10);
        expect(mockFindResult.skip).toHaveBeenCalledWith(5);
      });
    });

    describe('findExecutableWorkflows', () => {
      const mockFindResult = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        exec: vi.fn(() => Promise.resolve([{ _id: 'execId1' }])),
      };

      beforeEach(() => {
        StoredWorkflow.find.mockReturnValue(mockFindResult);
      });

      it('should find workflows that are ready and have no missing connections', async () => {
        const userId = 'user123';
        await StoredWorkflow.findExecutableWorkflows(userId);

        expect(StoredWorkflow.find).toHaveBeenCalledWith({
          userId,
          status: 'ready',
          $or: [
            { missingConnections: { $exists: false } },
            { missingConnections: { $size: 0 } },
          ],
        });
        expect(mockFindResult.exec).toHaveBeenCalled();
      });
    });

    describe('searchWorkflows', () => {
      const mockFindResult = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        exec: vi.fn(() => Promise.resolve([{ _id: 'searchId1' }])),
      };

      beforeEach(() => {
        StoredWorkflow.find.mockReturnValue(mockFindResult);
      });

      it('should search workflows by title, description, originalUserInput, or tags', async () => {
        const userId = 'user123';
        const searchTerm = 'test query';
        await StoredWorkflow.searchWorkflows(userId, searchTerm);

        expect(StoredWorkflow.find).toHaveBeenCalledWith({
          userId,
          $or: [
            { title: { $regex: searchTerm, $options: 'i' } },
            { description: { $regex: searchTerm, $options: 'i' } },
            { originalUserInput: { $regex: searchTerm, $options: 'i' } },
            { tags: { $in: [new RegExp(searchTerm, 'i')] } },
          ],
        });
        expect(mockFindResult.sort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(mockFindResult.limit).toHaveBeenCalledWith(20);
        expect(mockFindResult.skip).toHaveBeenCalledWith(0);
        expect(mockFindResult.exec).toHaveBeenCalled();
      });

      it('should apply custom limit and offset', async () => {
        const userId = 'user123';
        const searchTerm = 'another query';
        const options = { limit: 5, offset: 10 };
        await StoredWorkflow.searchWorkflows(userId, searchTerm, options);

        expect(mockFindResult.limit).toHaveBeenCalledWith(5);
        expect(mockFindResult.skip).toHaveBeenCalledWith(10);
      });
    });
  });

  describe('Instance Methods', () => {
    let workflow;
    const initialDate = new Date('2023-01-01T10:00:00.000Z');

    beforeEach(() => {
      vi.setSystemTime(initialDate);
      workflow = new StoredWorkflow({
        executionCount: 5,
        lastExecuted: new Date('2022-12-31T09:00:00.000Z'),
        requiredApps: ['app1', 'app2'],
        connectedAccounts: [],
        missingConnections: ['app1', 'app2'],
        status: 'draft',
        tags: ['tagA', 'tagB'],
      });
      workflow.save.mockClear(); // Clear save mock for each test
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('markAsExecuted should increment executionCount and update lastExecuted', async () => {
      const newDate = new Date('2023-01-01T11:00:00.000Z');
      vi.setSystemTime(newDate);

      await workflow.markAsExecuted();

      expect(workflow.executionCount).toBe(6);
      expect(workflow.lastExecuted).toEqual(newDate);
      expect(workflow.save).toHaveBeenCalledTimes(1);
    });

    describe('updateConnections', () => {
      it('should update connectedAccounts and missingConnections correctly', async () => {
        const newConnectedAccounts = [
          { app: 'app1', toolkit: { slug: 'app1' } },
          { app: 'app3', toolkit: { slug: 'app3' } },
        ];
        workflow.requiredApps = ['app1', 'app2', 'app4'];
        workflow.status = 'draft';

        await workflow.updateConnections(newConnectedAccounts);

        expect(workflow.connectedAccounts).toEqual(newConnectedAccounts);
        expect(workflow.missingConnections).toEqual(['app2', 'app4']);
        expect(workflow.status).toBe('draft'); // Still draft because missing connections
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });

      it('should set status to "ready" if all required apps are connected and status was "draft"', async () => {
        const newConnectedAccounts = [
          { app: 'app1', toolkit: { slug: 'app1' } },
          { app: 'app2', toolkit: { slug: 'app2' } },
        ];
        workflow.requiredApps = ['app1', 'app2'];
        workflow.status = 'draft';
        workflow.missingConnections = ['app1', 'app2']; // Ensure it starts with missing

        await workflow.updateConnections(newConnectedAccounts);

        expect(workflow.connectedAccounts).toEqual(newConnectedAccounts);
        expect(workflow.missingConnections).toEqual([]);
        expect(workflow.status).toBe('ready');
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });

      it('should set status to "draft" if there are missing connections, even if it was "ready"', async () => {
        const newConnectedAccounts = [{ app: 'app1', toolkit: { slug: 'app1' } }];
        workflow.requiredApps = ['app1', 'app2'];
        workflow.status = 'ready'; // Was ready
        workflow.missingConnections = []; // Was no missing connections

        await workflow.updateConnections(newConnectedAccounts);

        expect(workflow.connectedAccounts).toEqual(newConnectedAccounts);
        expect(workflow.missingConnections).toEqual(['app2']);
        expect(workflow.status).toBe('draft'); // Now draft
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });

      it('should not change status if it was "archived" regardless of connections', async () => {
        const newConnectedAccounts = [
          { app: 'app1', toolkit: { slug: 'app1' } },
          { app: 'app2', toolkit: { slug: 'app2' } },
        ];
        workflow.requiredApps = ['app1', 'app2'];
        workflow.status = 'archived'; // Archived status
        workflow.missingConnections = ['app1']; // Still missing some

        await workflow.updateConnections(newConnectedAccounts);

        expect(workflow.missingConnections).toEqual([]);
        expect(workflow.status).toBe('archived'); // Should remain archived
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });

      it('should handle empty connectedAccounts gracefully', async () => {
        workflow.requiredApps = ['app1', 'app2'];
        workflow.status = 'ready';
        workflow.missingConnections = [];

        await workflow.updateConnections([]);

        expect(workflow.connectedAccounts).toEqual([]);
        expect(workflow.missingConnections).toEqual(['app1', 'app2']);
        expect(workflow.status).toBe('draft');
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });

      it('should handle connectedAccounts with different structure (no toolkit.slug)', async () => {
        const newConnectedAccounts = [
          { app: 'app1' }, // No toolkit.slug
          { app: 'app3', toolkit: { slug: 'app3' } },
        ];
        workflow.requiredApps = ['app1', 'app2', 'app3'];
        workflow.status = 'draft';

        await workflow.updateConnections(newConnectedAccounts);

        expect(workflow.connectedAccounts).toEqual(newConnectedAccounts);
        expect(workflow.missingConnections).toEqual(['app2']);
        expect(workflow.status).toBe('draft');
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });
    });

    describe('addTags', () => {
      it('should add new tags to an existing array', async () => {
        workflow.tags = ['tagA', 'tagB'];
        await workflow.addTags(['tagC', 'tagD']);
        expect(workflow.tags).toEqual(['tagA', 'tagB', 'tagC', 'tagD']);
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });

      it('should handle adding a single tag (string)', async () => {
        workflow.tags = ['tagA'];
        await workflow.addTags('tagB');
        expect(workflow.tags).toEqual(['tagA', 'tagB']);
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });

      it('should not add duplicate tags', async () => {
        workflow.tags = ['tagA', 'tagB'];
        await workflow.addTags(['tagB', 'tagC']);
        expect(workflow.tags).toEqual(['tagA', 'tagB', 'tagC']);
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });

      it('should initialize tags array if it does not exist', async () => {
        workflow.tags = undefined;
        await workflow.addTags(['tagX']);
        expect(workflow.tags).toEqual(['tagX']);
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });

      it('should handle empty newTags array', async () => {
        workflow.tags = ['tagA'];
        await workflow.addTags([]);
        expect(workflow.tags).toEqual(['tagA']);
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });
    });

    describe('removeTags', () => {
      it('should remove specified tags from the array', async () => {
        workflow.tags = ['tagA', 'tagB', 'tagC'];
        await workflow.removeTags(['tagA', 'tagC']);
        expect(workflow.tags).toEqual(['tagB']);
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });

      it('should handle removing a single tag (string)', async () => {
        workflow.tags = ['tagA', 'tagB'];
        await workflow.removeTags('tagA');
        expect(workflow.tags).toEqual(['tagB']);
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });

      it('should do nothing if tags to remove are not present', async () => {
        workflow.tags = ['tagA', 'tagB'];
        await workflow.removeTags(['tagC', 'tagD']);
        expect(workflow.tags).toEqual(['tagA', 'tagB']);
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });

      it('should handle empty tags array gracefully', async () => {
        workflow.tags = [];
        await workflow.removeTags(['tagA']);
        expect(workflow.tags).toEqual([]);
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });

      it('should handle undefined tags array gracefully', async () => {
        workflow.tags = undefined;
        await workflow.removeTags(['tagA']);
        expect(workflow.tags).toEqual([]);
        expect(workflow.save).toHaveBeenCalledTimes(1);
      });
    });
  });
});