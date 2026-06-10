import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

// Mock the entire mongoose module
vi.mock('mongoose', () => {
  const mockConnection = {
    on: vi.fn(),
    // Add other properties if your code uses them
  };
  return {
    default: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      connection: mockConnection,
    },
  };
});

// We need to dynamically import the module under test to apply the mocks
// and to reset its internal state for each test.
let connectToMongoDB;
let getMongoDBConnection;
let disconnectFromMongoDB;

describe('MongoDB Connection Utility', () => {
  beforeEach(async () => {
    // Reset mocks and modules before each test to ensure isolation
    vi.resetAllMocks();
    vi.resetModules();

    // Dynamically import the module to get a fresh instance with a clean state
    const module = await import(
      '../../../../src/app/modules/deep_research/utils/mongodb-connection.js'
    );
    connectToMongoDB = module.connectToMongoDB;
    getMongoDBConnection = module.getMongoDBConnection;
    disconnectFromMongoDB = module.disconnectFromMongoDB;

    // Mock console to prevent logging during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Default successful connection mock
    mongoose.connect.mockResolvedValue(mongoose);
    mongoose.disconnect.mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connectToMongoDB', () => {
    const defaultUri = 'mongodb://localhost:27017/research_agent';
    const customUri = 'mongodb://test-host:27017/test-db';

    it('should connect to the default MongoDB URI if none is provided', async () => {
      await connectToMongoDB();
      expect(mongoose.connect).toHaveBeenCalledTimes(1);
      expect(mongoose.connect).toHaveBeenCalledWith(defaultUri, { family: 4 });
    });

    it('should connect to the specified MongoDB URI', async () => {
      await connectToMongoDB(customUri);
      expect(mongoose.connect).toHaveBeenCalledTimes(1);
      expect(mongoose.connect).toHaveBeenCalledWith(customUri, { family: 4 });
      expect(console.log).toHaveBeenCalledWith(
        'Connecting to MongoDB for research agent...'
      );
      expect(console.log).toHaveBeenCalledWith(
        'MongoDB connected successfully for research agent'
      );
    });

    it('should return the mongoose connection object on successful connection', async () => {
      const connection = await connectToMongoDB(customUri);
      expect(connection).toBe(mongoose);
    });

    it('should not attempt to reconnect if already connected to the same URI', async () => {
      await connectToMongoDB(customUri);
      await connectToMongoDB(customUri);

      expect(mongoose.connect).toHaveBeenCalledTimes(1);
    });

    it('should disconnect and reconnect if called with a different URI', async () => {
      const anotherUri = 'mongodb://another-host/another-db';

      // First connection
      await connectToMongoDB(customUri);
      expect(mongoose.connect).toHaveBeenCalledTimes(1);
      expect(mongoose.connect).toHaveBeenCalledWith(customUri, { family: 4 });

      // Second connection with different URI
      await connectToMongoDB(anotherUri);
      expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
      expect(mongoose.connect).toHaveBeenCalledTimes(2);
      expect(mongoose.connect).toHaveBeenLastCalledWith(anotherUri, {
        family: 4,
      });
      expect(console.log).toHaveBeenCalledWith(
        'Disconnecting from previous MongoDB connection...'
      );
    });

    it('should throw an error and reset state if connection fails', async () => {
      const connectionError = new Error('Connection failed');
      mongoose.connect.mockRejectedValue(connectionError);

      await expect(connectToMongoDB(customUri)).rejects.toThrow(
        connectionError
      );

      expect(console.error).toHaveBeenCalledWith(
        'Error connecting to MongoDB:',
        connectionError
      );

      // Verify state is reset
      expect(() => getMongoDBConnection()).toThrow(
        'MongoDB is not connected. Call connectToMongoDB() first.'
      );
    });

    it('should register event listeners for error, disconnected, and reconnected', async () => {
      await connectToMongoDB(customUri);

      expect(mongoose.connection.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function)
      );
      expect(mongoose.connection.on).toHaveBeenCalledWith(
        'disconnected',
        expect.any(Function)
      );
      expect(mongoose.connection.on).toHaveBeenCalledWith(
        'reconnected',
        expect.any(Function)
      );
    });
  });

  describe('getMongoDBConnection', () => {
    it('should return the connection object if connected', async () => {
      await connectToMongoDB();
      const connection = getMongoDBConnection();
      expect(connection).toBe(mongoose.connection);
    });

    it('should throw an error if not connected', () => {
      expect(() => getMongoDBConnection()).toThrow(
        'MongoDB is not connected. Call connectToMongoDB() first.'
      );
    });
  });

  describe('disconnectFromMongoDB', () => {
    it('should disconnect if a connection is active', async () => {
      await connectToMongoDB();
      await disconnectFromMongoDB();

      expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith('MongoDB disconnected');
    });

    it('should reset the connection state after disconnecting', async () => {
      await connectToMongoDB();
      await disconnectFromMongoDB();

      expect(() => getMongoDBConnection()).toThrow(
        'MongoDB is not connected. Call connectToMongoDB() first.'
      );
    });

    it('should do nothing if not connected', async () => {
      await disconnectFromMongoDB();
      expect(mongoose.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('Connection Event Handlers', () => {
    it('should update state when the "disconnected" event is emitted', async () => {
      await connectToMongoDB();

      // Find the registered 'disconnected' callback
      const disconnectedCallback = mongoose.connection.on.mock.calls.find(
        (call) => call[0] === 'disconnected'
      )[1];

      // Simulate the event
      disconnectedCallback();

      expect(console.log).toHaveBeenCalledWith('MongoDB disconnected');
      expect(() => getMongoDBConnection()).toThrow(
        'MongoDB is not connected. Call connectToMongoDB() first.'
      );
    });

    it('should update state and log error when the "error" event is emitted', async () => {
      await connectToMongoDB();
      const mockError = new Error('DB connection lost');

      // Find the registered 'error' callback
      const errorCallback = mongoose.connection.on.mock.calls.find(
        (call) => call[0] === 'error'
      )[1];

      // Simulate the event
      errorCallback(mockError);

      expect(console.error).toHaveBeenCalledWith(
        'MongoDB connection error:',
        mockError
      );
      expect(() => getMongoDBConnection()).toThrow(
        'MongoDB is not connected. Call connectToMongoDB() first.'
      );
    });

    it('should update state when the "reconnected" event is emitted', async () => {
      await connectToMongoDB();

      // Simulate disconnection first
      const disconnectedCallback = mongoose.connection.on.mock.calls.find(
        (call) => call[0] === 'disconnected'
      )[1];
      disconnectedCallback();
      expect(() => getMongoDBConnection()).toThrow(); // Verify disconnected

      // Find and simulate the 'reconnected' event
      const reconnectedCallback = mongoose.connection.on.mock.calls.find(
        (call) => call[0] === 'reconnected'
      )[1];
      reconnectedCallback();

      expect(console.log).toHaveBeenCalledWith('MongoDB reconnected');
      // Now it should not throw
      expect(() => getMongoDBConnection()).not.toThrow();
    });
  });
});