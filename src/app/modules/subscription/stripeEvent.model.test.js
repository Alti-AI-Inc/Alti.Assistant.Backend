import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create a mock object that will act as the Mongoose Schema instance.
// This object will capture the definition and options passed to the Schema constructor.
const mockSchemaInstance = {
  definition: {},
  options: {},
  // Mongoose Schema instances have a 'path' method, but for these unit tests,
  // we are primarily interested in what was passed to the constructor.
  // If we needed to test methods called on the schema instance, we would mock them here.
};

const {
  mockSchemaConstructor,
  mockModel
} = vi.hoisted(() => {
  // Mock the mongoose.Schema constructor.
  // When `new mongoose.Schema()` is called in the module under test, this function runs.
  const mockSchemaConstructor = vi.fn(function(definition, options) {
    mockSchemaInstance.definition = definition;
    mockSchemaInstance.options = options;
    // Return the mockSchemaInstance so that `StripeEventSchema` in the original file
    // holds our mock object, allowing `mongoose.model` to receive it.
    return mockSchemaInstance;
  });

  // Mock the mongoose.model method.
  // When `mongoose.model()` is called in the module under test, this function runs.
  const mockModel = vi.fn().mockImplementation((name, schema) => {
    // Return a simple object that mimics a Mongoose model.
    // This allows us to check what was returned by mongoose.model and exported.
    return {
      modelName: name,
      schema: schema,
      // Add other mock methods (e.g., find, create) here if the application code
      // directly calls them on the exported model in a way that needs testing.
    };
  });

  return {
    mockSchemaConstructor,
    mockModel
  };
});

// Mock the entire 'mongoose' module.
// This ensures that when the module under test imports 'mongoose', it gets our mocks.
vi.mock('mongoose', () => ({
  Schema: mockSchemaConstructor,
  model: mockModel,
  // If other mongoose exports (e.g., Types, connect) were used in the file,
  // they would also need to be mocked here.
}));

// Import the module under test AFTER setting up the mocks.
// This ensures that `new mongoose.Schema()` and `mongoose.model()` calls
// within the imported module use our mocked functions.
import StripeEvent from './stripeEvent.model';

describe('StripeEvent Model', () => {
  // The module under test defines the schema and model once when it's imported.
  // We'll clear mocks before each test to ensure `toHaveBeenCalledTimes` counts correctly
  // if we were to re-import, but primarily to ensure any captured state is clean.
  beforeEach(() => {
    mockSchemaConstructor.mockClear();
    mockModel.mockClear();
    // Reset the captured state in our mockSchemaInstance for isolation,
    // though for this specific file, the module is imported only once.
    mockSchemaInstance.definition = {};
    mockSchemaInstance.options = {};
  });

  it('should define the StripeEventSchema correctly', () => {
    // Verify that mongoose.Schema was called exactly once during module import.
    expect(mockSchemaConstructor).toHaveBeenCalledTimes(1);

    // Access the captured definition and options from our mockSchemaInstance.
    // These reflect the arguments passed to `new mongoose.Schema()`.
    const definition = mockSchemaInstance.definition;
    const options = mockSchemaInstance.options;

    // Test 'eventId' field properties.
    expect(definition.eventId).toBeDefined();
    expect(definition.eventId.type).toBe(String);
    expect(definition.eventId.required).toBe(true);
    expect(definition.eventId.unique).toBe(true);
    expect(definition.eventId.index).toBe(true);

    // Test 'processedAt' field properties.
    expect(definition.processedAt).toBeDefined();
    expect(definition.processedAt.type).toBe(Date);
    // Ensure the default is the Date.now function reference, not its result.
    expect(definition.processedAt.default).toBe(Date.now);
    expect(definition.processedAt.expires).toBe(2592000); // 30 days in seconds

    // Test schema options.
    expect(options).toBeDefined();
    expect(options.timestamps).toBe(true);
  });

  it('should create the StripeEvent model using the defined schema', () => {
    // Verify that mongoose.model was called exactly once during module import.
    expect(mockModel).toHaveBeenCalledTimes(1);
    // Verify it was called with the correct model name and our mock schema instance.
    expect(mockModel).toHaveBeenCalledWith('StripeEvent', mockSchemaInstance);

    // Verify that the exported `StripeEvent` is the result of our mock `mongoose.model` call.
    expect(StripeEvent).toBeDefined();
    expect(StripeEvent.modelName).toBe('StripeEvent');
    expect(StripeEvent.schema).toBe(mockSchemaInstance);
  });

  it('should ensure timestamps are enabled for the schema', () => {
    // This directly checks the `timestamps` option passed to the Schema constructor.
    expect(mockSchemaInstance.options.timestamps).toBe(true);
  });
});