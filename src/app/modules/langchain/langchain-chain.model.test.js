import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock mongoose
const mockSchemaInstance = {
  index: vi.fn(),
  path: vi.fn().mockImplementation((key) => {
    // Simulate mongoose.Schema.prototype.path for basic type checks
    const paths = {
      name: { instanceType: 'String', isRequired: true, isIndexed: true },
      description: { instanceType: 'String', defaultValue: '' },
      userId: { instanceType: 'String', isRequired: true, isIndexed: true },
      inputVariables: { instanceType: 'Array', defaultValue: [] },
      outputVariables: { instanceType: 'Array', defaultValue: [] },
      'steps.name': { instanceType: 'String', isRequired: true },
      'steps.type': { instanceType: 'String', isRequired: true, enum: ['prompt', 'llm', 'parser', 'retriever', 'tool', 'branch'] },
      'steps.config': { instanceType: 'Mixed', defaultValue: {} },
      isActive: { instanceType: 'Boolean', defaultValue: true },
      version: { instanceType: 'Number', defaultValue: 1 }
    };
    return paths[key] || { instanceType: 'Unknown' };
  })
};
const mockSchemaConstructor = vi.fn().mockImplementation(() => mockSchemaInstance);
mockSchemaConstructor.Types = {
  Mixed: 'Mixed' // Simulate mongoose.Schema.Types.Mixed
};

const mockMongooseModel = {
  modelName: 'LangchainChain',
  schema: mockSchemaInstance
};
const {
  mockMongoose
} = vi.hoisted(() => {
  const mockMongoose = {
    Schema: mockSchemaConstructor,
    model: vi.fn().mockImplementation(() => mockMongooseModel),
    models: {} // Initially empty, will be populated by the model creation logic if it runs
  };

  return {
    mockMongoose
  };
});

vi.mock('mongoose', () => ({
  default: mockMongoose
}));

describe('LangchainChain Model', () => {
  let LangchainChain;

  beforeEach(async () => {
    // Clear mocks before each test
    vi.clearAllMocks();
    // Reset mongoose.models to ensure model creation logic runs
    mockMongoose.models = {};
    // Dynamically import the module after mocks are set up
    const module = await import('./langchain-chain.model.js');
    LangchainChain = module.default;
  });

  it('should define the LangchainChainSchema correctly', () => {
    expect(mockSchemaConstructor).toHaveBeenCalledTimes(1);
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    const schemaOptions = mockSchemaConstructor.mock.calls[0][1];

    // Verify schema options
    expect(schemaOptions).toEqual({ timestamps: true });

    // Verify top-level fields
    expect(schemaDefinition.name).toEqual({ type: String, required: true, index: true });
    expect(schemaDefinition.description).toEqual({ type: String, default: '' });
    expect(schemaDefinition.userId).toEqual({ type: String, required: true, index: true });
    expect(schemaDefinition.inputVariables).toEqual({ type: [String], default: [] });
    expect(schemaDefinition.outputVariables).toEqual({ type: [String], default: [] });
    expect(schemaDefinition.isActive).toEqual({ type: Boolean, default: true });
    expect(schemaDefinition.version).toEqual({ type: Number, default: 1 });

    // Verify steps array and its sub-fields
    expect(schemaDefinition.steps).toBeInstanceOf(Array);
    expect(schemaDefinition.steps[0].name).toEqual({ type: String, required: true });
    expect(schemaDefinition.steps[0].type).toEqual({
      type: String,
      required: true,
      enum: ['prompt', 'llm', 'parser', 'retriever', 'tool', 'branch']
    });
    expect(schemaDefinition.steps[0].config).toEqual({
      type: mockSchemaConstructor.Types.Mixed,
      default: {}
    });
  });

  it('should define a compound unique index for userId and name', () => {
    expect(mockSchemaInstance.index).toHaveBeenCalledTimes(1);
    expect(mockSchemaInstance.index).toHaveBeenCalledWith(
      { userId: 1, name: 1 },
      { unique: true }
    );
  });

  it('should create and export the LangchainChain model', () => {
    expect(mockMongoose.model).toHaveBeenCalledTimes(1);
    expect(mockMongoose.model).toHaveBeenCalledWith('LangchainChain', mockSchemaInstance);
    expect(LangchainChain).toBe(mockMongooseModel);
  });

  it('should not re-create the model if it already exists in mongoose.models', async () => {
    // Simulate model already existing
    mockMongoose.models.LangchainChain = mockMongooseModel;
    vi.clearAllMocks(); // Clear calls from initial import

    // Re-import the module
    const module = await import('./langchain-chain.model.js');
    const LangchainChainReimported = module.default;

    expect(mockMongoose.model).not.toHaveBeenCalled(); // Should not call mongoose.model again
    expect(LangchainChainReimported).toBe(mockMongooseModel);
  });
});