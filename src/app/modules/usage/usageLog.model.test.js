import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose'; // This will be mocked

// Mock mongoose before importing the model
const mockSchemaInstance = {
  index: vi.fn(),
  statics: {}, // This will be populated by the schema definition
};

const mockMongoose = {
  Schema: vi.fn(() => mockSchemaInstance),
  model: vi.fn((name, schema) => {
    // Attach statics from the schema to the mock model
    const mockModel = {
      create: vi.fn(),
      aggregate: vi.fn(),
      // Any other methods that might be called on the model instance
    };
    // Mongoose attaches statics directly to the model constructor
    Object.assign(mockModel, schema.statics);
    return mockModel;
  }),
  Types: {
    ObjectId: vi.fn((id) => ({
      _id: id, // Simulate the internal _id property of an ObjectId
      toString: () => id, // Simulate toString method
      equals: (other) => other && (other._id === id || other.toString() === id),
      // Mongoose ObjectId instances are objects. For testing, we return an object
      // that holds the ID string and has methods similar to a real ObjectId.
      // This allows us to assert against its presence in the aggregation pipeline.
    })),
    Mixed: {}, // Just needs to exist for the schema definition
  },
};

vi.mock('mongoose', () => ({
  default: mockMongoose,
}));

// Import the model AFTER mongoose is mocked
import UsageLog from './usageLog.model'; // Adjust path if necessary

describe('UsageLog Model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset statics on the mockSchemaInstance for each test to ensure isolation
    mockSchemaInstance.statics = {};
    // Mock console.error for logAsync error handling tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should define the UsageLog schema correctly', () => {
    expect(mockMongoose.Schema).toHaveBeenCalledTimes(1);
    const schemaDefinition = mockMongoose.Schema.mock.calls[0][0];
    const schemaOptions = mockMongoose.Schema.mock.calls[0][1];

    // Check schema options
    expect(schemaOptions).toEqual({
      timestamps: false,
      collection: 'usagelogs',
    });

    // Check key fields and their properties
    expect(schemaDefinition.timestamp).toEqual({
      type: Date,
      default: Date.now,
      index: true,
      required: true,
    });
    expect(schemaDefinition.userId).toEqual({
      type: mockMongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      required: true,
    });
    expect(schemaDefinition.tenantId).toEqual({
      type: mockMongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
      sparse: true,
    });
    expect(schemaDefinition.module).toEqual({
      type: String,
      required: true,
      index: true,
      enum: [
        'auth', 'tenant', 'legal-contract', 'legal-contract-review',
        'document-review', 'document-analysis', 'document-drafting',
        'knowledge-bank', 'code-generation', 'search', 'deep-research',
        'presentation', 'report-generation', 'article-writer',
        'creative-writing', 'rewrite', 'translation', 'transcription',
        'brainstorm', 'plan-generator', 'image-generation', 'stripe',
        'other',
      ],
    });
    expect(schemaDefinition.module.enum).toHaveLength(23); // Verify enum length
    expect(schemaDefinition.action).toEqual({
      type: String,
      required: true,
    });
    expect(schemaDefinition.endpoint).toEqual({
      type: String,
      required: true,
    });
    expect(schemaDefinition.method).toEqual({
      type: String,
      required: true,
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    });
    expect(schemaDefinition.startTime).toEqual({
      type: Date,
      required: true,
    });
    expect(schemaDefinition.endTime).toEqual({
      type: Date,
      required: true,
    });
    expect(schemaDefinition.duration).toEqual({
      type: Number,
      required: true,
      index: true,
    });
    expect(schemaDefinition.status).toEqual({
      type: String,
      required: true,
      enum: ['success', 'error', 'partial'],
      index: true,
    });
    expect(schemaDefinition.statusCode).toEqual({
      type: Number,
      required: true,
      index: true,
    });
    expect(schemaDefinition.errorType).toEqual({
      type: String,
      enum: [
        'validation', 'authentication', 'authorization', 'rate-limit',
        'server', 'external-service', 'timeout', 'not-found', null,
      ],
      default: null,
    });
    expect(schemaDefinition.errorMessage).toEqual({
      type: String,
      default: null,
    });
    expect(schemaDefinition.tokensUsed).toEqual({
      type: Number,
      default: 0,
    });
    expect(schemaDefinition.modelUsed).toEqual({
      type: String,
      default: null,
    });
    expect(schemaDefinition.inputSize).toEqual({
      type: Number,
      default: 0,
    });
    expect(schemaDefinition.outputSize).toEqual({
      type: Number,
      default: 0,
    });
    expect(schemaDefinition.requestId).toEqual({
      type: String,
      unique: true,
      sparse: true,
      index: true,
    });
    expect(schemaDefinition.ipAddress).toEqual({
      type: String,
      default: null,
    });
    expect(schemaDefinition.userAgent).toEqual({
      type: String,
      default: null,
    });
    expect(schemaDefinition.metadata).toEqual({
      type: mockMongoose.Schema.Types.Mixed,
      default: {},
    });

    // Check that the model was created
    expect(mockMongoose.model).toHaveBeenCalledWith('UsageLog', mockSchemaInstance);

    // Check indexes
    expect(mockSchemaInstance.index).toHaveBeenCalledTimes(6);
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ tenantId: 1, timestamp: -1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ userId: 1, timestamp: -1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ module: 1, timestamp: -1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ status: 1, timestamp: -1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ tenantId: 1, module: 1, timestamp: -1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith(
      { timestamp: 1 },
      { expireAfterSeconds: 90 * 24 * 60 * 60 }
    );
  });

  describe('Static Methods', () => {
    describe('logAsync', () => {
      beforeEach(() => {
        vi.useFakeTimers(); // Control setImmediate
      });

      afterEach(() => {
        vi.runOnlyPendingTimers(); // Ensure any pending setImmediate calls are run
        vi.useRealTimers();
      });

      it('should create a usage log asynchronously without awaiting', async () => {
        const logData = {
          userId: 'user123',
          tenantId: 'tenant456',
          module: 'auth',
          action: 'login',
          endpoint: '/api/v1/auth/login',
          method: 'POST',
          startTime: new Date(),
          endTime: new Date(),
          duration: 100,
          status: 'success',
          statusCode: 200,
        };

        UsageLog.logAsync(logData);

        // Expect create not to be called immediately
        expect(UsageLog.create).not.toHaveBeenCalled();

        // Advance timers to run setImmediate
        vi.runAllTimers();

        // Now expect create to have been called
        expect(UsageLog.create).toHaveBeenCalledTimes(1);
        expect(UsageLog.create).toHaveBeenCalledWith(logData);
      });

      it('should log an error if usage log creation fails', async () => {
        const logData = {
          userId: 'user123',
          module: 'auth',
          action: 'login',
          endpoint: '/api/v1/auth/login',
          method: 'POST',
          startTime: new Date(),
          endTime: new Date(),
          duration: 100,
          status: 'success',
          statusCode: 200,
        };
        const errorMessage = 'Validation failed';
        UsageLog.create.mockRejectedValue(new Error(errorMessage));

        UsageLog.logAsync(logData);

        vi.runAllTimers(); // Advance timers to trigger the async operation

        // Await pending promises (like the .catch block) that were scheduled by setImmediate
        await vi.runOnlyPendingTimersAsync();

        expect(UsageLog.create).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledWith(
          'Failed to create usage log:',
          errorMessage
        );
      });
    });

    describe('getTenantUsageSummary', () => {
      it('should return a tenant usage summary using aggregation', async () => {
        const tenantId = 'tenant123';
        const startDate = new Date('2023-01-01T00:00:00Z');
        const endDate = new Date('2023-01-31T23:59:59Z');
        const mockAggregateResult = [{ module: 'auth', totalRequests: 10 }];

        UsageLog.aggregate.mockResolvedValue(mockAggregateResult);

        const result = await UsageLog.getTenantUsageSummary(
          tenantId,
          startDate,
          endDate
        );

        expect(UsageLog.aggregate).toHaveBeenCalledTimes(1);
        const expectedPipeline = [
          {
            $match: {
              tenantId: { _id: tenantId, toString: expect.any(Function), equals: expect.any(Function) }, // Mocked ObjectId
              timestamp: {
                $gte: startDate,
                $lte: endDate,
              },
            },
          },
          {
            $group: {
              _id: '$module',
              totalRequests: { $sum: 1 },
              successCount: {
                $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
              },
              errorCount: {
                $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] },
              },
              avgDuration: { $avg: '$duration' },
              totalTokens: { $sum: '$tokensUsed' },
            },
          },
          {
            $project: {
              module: '$_id',
              totalRequests: 1,
              successCount: 1,
              errorCount: 1,
              successRate: {
                $multiply: [{ $divide: ['$successCount', '$totalRequests'] }, 100],
              },
              avgDuration: { $round: ['$avgDuration', 2] },
              totalTokens: 1,
            },
          },
        ];

        // Check the call to mongoose.Types.ObjectId
        expect(mockMongoose.Types.ObjectId).toHaveBeenCalledWith(tenantId);
        // Ensure the mocked ObjectId instance is used in the pipeline
        expect(UsageLog.aggregate.mock.calls[0][0][0].$match.tenantId).toEqual(
          mockMongoose.Types.ObjectId.mock.results[0].value
        );

        // Deep equality check for the entire pipeline
        expect(UsageLog.aggregate).toHaveBeenCalledWith(expectedPipeline);
        expect(result).toEqual(mockAggregateResult);
      });
    });

    describe('getUserUsageSummary', () => {
      it('should return a user usage summary using aggregation', async () => {
        const userId = 'user789';
        const startDate = new Date('2023-02-01T00:00:00Z');
        const endDate = new Date('2023-02-28T23:59:59Z');
        const mockAggregateResult = [{ module: 'search', count: 5 }];

        UsageLog.aggregate.mockResolvedValue(mockAggregateResult);

        const result = await UsageLog.getUserUsageSummary(
          userId,
          startDate,
          endDate
        );

        expect(UsageLog.aggregate).toHaveBeenCalledTimes(1);
        const expectedPipeline = [
          {
            $match: {
              userId: { _id: userId, toString: expect.any(Function), equals: expect.any(Function) }, // Mocked ObjectId
              timestamp: {
                $gte: startDate,
                $lte: endDate,
              },
            },
          },
          {
            $group: {
              _id: '$module',
              count: { $sum: 1 },
              totalTokens: { $sum: '$tokensUsed' },
              avgDuration: { $avg: '$duration' },
            },
          },
          {
            $sort: { count: -1 },
          },
        ];

        // Check the call to mongoose.Types.ObjectId
        expect(mockMongoose.Types.ObjectId).toHaveBeenCalledWith(userId);
        // Ensure the mocked ObjectId instance is used in the pipeline
        expect(UsageLog.aggregate.mock.calls[0][0][0].$match.userId).toEqual(
          mockMongoose.Types.ObjectId.mock.results[0].value
        );

        // Deep equality check for the entire pipeline
        expect(UsageLog.aggregate).toHaveBeenCalledWith(expectedPipeline);
        expect(result).toEqual(mockAggregateResult);
      });
    });
  });
});