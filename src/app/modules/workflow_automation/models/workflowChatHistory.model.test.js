import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockMongoose
} = vi.hoisted(() => {
  // We need a way to capture *each* Schema instance created and its methods.
  // Let's make Schema a function that returns an object with mock methods.
  const mockMongoose = {
    Schema: vi.fn(function(definition, options) {
      // This 'this' refers to the new instance created by 'new mongoose.Schema()'
      this.obj = definition;
      this.options = options;
      this.index = vi.fn(); // Each schema instance gets its own mock index method
      this.path = vi.fn(function() { return this; }); // Each schema instance gets its own mock path method
      this.add = vi.fn(function(obj) {
        Object.assign(this.obj, obj);
      });
      // Store this instance for later inspection
      mockMongoose.Schema.instances.push(this);
    }),
    model: vi.fn().mockImplementation((name, schema) => {
      // Simulate mongoose.model caching
      if (!mockMongoose.models[name]) {
        mockMongoose.models[name] = { modelName: name, schema: schema };
      }
      return mockMongoose.models[name];
    }),
    models: {}, // Simulate mongoose.models cache
    Types: {
      ObjectId: vi.fn().mockImplementation(() => 'mockObjectId'), // Mock ObjectId type
    },
  };

  return {
    mockMongoose
  };
});
// Add an array to the mock Schema constructor to store instances
mockMongoose.Schema.instances = [];

// Mock the import of mongoose
vi.mock('mongoose', () => ({
  default: mockMongoose,
}));

// Import the model *after* mocking mongoose
// This import will run the module code and create the schemas/model
import WorkflowChatHistory from '../workflowChatHistory.model';

describe('WorkflowChatHistory Model', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockMongoose.Schema.mockClear();
    mockMongoose.Schema.instances = []; // Clear captured instances
    mockMongoose.model.mockClear();
    mockMongoose.models = {}; // Clear model cache
  });

  it('should define ChatMessageSchema correctly', () => {
    // ChatMessageSchema is the first Schema instance created
    const chatMessageSchemaInstance = mockMongoose.Schema.instances[0];
    expect(chatMessageSchemaInstance).toBeDefined();
    const chatMessageDefinition = chatMessageSchemaInstance.obj;

    expect(chatMessageDefinition.role).toEqual({
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    });
    expect(chatMessageDefinition.content).toEqual({
      type: String,
      required: true,
    });
    expect(chatMessageDefinition.timestamp).toEqual({
      type: Date,
      default: Date.now,
    });
    expect(chatMessageDefinition.metadata).toEqual({
      type: Object,
      default: {},
    });
  });

  it('should define WorkflowChatHistorySchema correctly', () => {
    // WorkflowChatHistorySchema is the second Schema instance created
    const workflowChatHistorySchemaInstance = mockMongoose.Schema.instances[1];
    expect(workflowChatHistorySchemaInstance).toBeDefined();
    const workflowChatHistoryDefinition = workflowChatHistorySchemaInstance.obj;
    const workflowChatHistoryOptions = workflowChatHistorySchemaInstance.options;

    expect(workflowChatHistoryDefinition.userId).toEqual({
      type: mockMongoose.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    });
    expect(workflowChatHistoryDefinition.conversationId).toEqual({
      type: String,
      required: true,
      unique: true,
      index: true,
    });
    expect(workflowChatHistoryDefinition.title).toEqual({
      type: String,
      trim: true,
    });
    // For messages, we expect it to be an array containing the ChatMessageSchema instance
    expect(workflowChatHistoryDefinition.messages[0]).toBe(mockMongoose.Schema.instances[0]);

    expect(workflowChatHistoryDefinition.workflowIds).toEqual([
      {
        type: mockMongoose.Types.ObjectId,
        ref: 'Workflow',
      },
    ]);
    expect(workflowChatHistoryDefinition.context).toEqual({
      type: Object,
      default: {},
    });
    expect(workflowChatHistoryDefinition.status).toEqual({
      type: String,
      enum: ['active', 'completed', 'archived'],
      default: 'active',
    });
    expect(workflowChatHistoryDefinition.lastActivity).toEqual({
      type: Date,
      default: Date.now,
    });
    expect(workflowChatHistoryDefinition.metadata).toEqual({
      userIntent: String,
      extractedEntities: Object,
      detectedApps: [String],
      workflowType: String,
      complexity: String,
    });

    expect(workflowChatHistoryOptions).toEqual({
      timestamps: true,
    });
  });

  it('should apply correct indexes to WorkflowChatHistorySchema', async () => {
    // WorkflowChatHistorySchema is the second Schema instance created
    const workflowChatHistorySchemaInstance = mockMongoose.Schema.instances[1];

    expect(workflowChatHistorySchemaInstance.index).toHaveBeenCalledTimes(3);
    expect(workflowChatHistorySchemaInstance.index).toHaveBeenCalledWith({ userId: 1, lastActivity: -1 });
    expect(workflowChatHistorySchemaInstance.index).toHaveBeenCalledWith({ conversationId: 1 });
    expect(workflowChatHistorySchemaInstance.index).toHaveBeenCalledWith({ userId: 1, status: 1 });
  });

  it('should create and export the WorkflowChatHistory model', () => {
    expect(mockMongoose.model).toHaveBeenCalledTimes(1);
    expect(mockMongoose.model).toHaveBeenCalledWith(
      'WorkflowChatHistory',
      mockMongoose.Schema.instances[1] // Ensure it's called with the correct schema instance
    );
    expect(WorkflowChatHistory).toBeDefined();
    expect(WorkflowChatHistory.modelName).toBe('WorkflowChatHistory');
    expect(WorkflowChatHistory.schema).toBe(mockMongoose.Schema.instances[1]);
  });

  it('should use existing model if already compiled', async () => {
    // Simulate an existing model in mongoose.models
    const existingModel = { modelName: 'WorkflowChatHistory_Existing' };
    mockMongoose.models.WorkflowChatHistory = existingModel;

    // Re-import the module to trigger the model creation logic
    vi.resetModules();
    vi.mock('mongoose', () => ({
      default: mockMongoose,
    }));
    const WorkflowChatHistoryModule = await import('../workflowChatHistory.model');
    const WorkflowChatHistoryReimported = WorkflowChatHistoryModule.default;

    expect(mockMongoose.model).not.toHaveBeenCalled(); // Should not call model again
    expect(WorkflowChatHistoryReimported).toBe(existingModel);
  });
});