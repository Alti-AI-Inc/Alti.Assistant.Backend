import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import Chatbot from './chatbot.model'; // Adjust path as necessary

// Mock mongoose connection for isolated testing
describe('Chatbot Model', () => {
  beforeEach(() => {
    // Ensure mongoose is in a clean state for each test
    // This is a common pattern for testing Mongoose models without a real DB connection
    // We're not testing Mongoose itself, but our schema definition.
    if (mongoose.connection.readyState === 1) {
      mongoose.connection.close();
    }
    // Mock mongoose.model to prevent actual model registration if not needed,
    // though in this case, we're importing the already registered model.
    // For schema-level tests, a real connection isn't strictly necessary,
    // but for testing virtuals or transforms on actual documents, it's better
    // to have a mock connection or an in-memory database.
  });

  it('should have the correct schema definition', () => {
    const schema = Chatbot.schema;

    // Check basic field types and properties
    expect(schema.path('name')).toBeDefined();
    expect(schema.path('name').instance).toBe('String');
    expect(schema.path('name').isRequired).toBe(true);
    expect(schema.path('name').validators.some(v => v.type === 'maxlength' && v.max === 100)).toBe(true);

    expect(schema.path('description')).toBeDefined();
    expect(schema.path('description').instance).toBe('String');
    expect(schema.path('description').defaultValue).toBe('');

    expect(schema.path('instructions')).toBeDefined();
    expect(schema.path('instructions').instance).toBe('String');
    expect(schema.path('instructions').defaultValue).toBe('');

    expect(schema.path('guardrails')).toBeDefined();
    expect(schema.path('guardrails').instance).toBe('String');
    expect(schema.path('guardrails').defaultValue).toBe('');

    expect(schema.path('model')).toBeDefined();
    expect(schema.path('model').instance).toBe('String');
    expect(schema.path('model').defaultValue).toBe('Gemini 1.5 Pro');

    expect(schema.path('avatar')).toBeDefined();
    expect(schema.path('avatar').instance).toBe('String');
    expect(schema.path('avatar').defaultValue).toBe('🤖');

    expect(schema.path('userId')).toBeDefined();
    expect(schema.path('userId').instance).toBe('ObjectID');
    expect(schema.path('userId').isRequired).toBe(true);
    expect(schema.path('userId').caster.options.ref).toBe('User');

    expect(schema.path('knowledgebaseIds')).toBeDefined();
    expect(schema.path('knowledgebaseIds').instance).toBe('Array');
    expect(schema.path('knowledgebaseIds').caster.instance).toBe('ObjectID');
    expect(schema.path('knowledgebaseIds').caster.options.ref).toBe('KnowledgeBase');

    expect(schema.path('isActive')).toBeDefined();
    expect(schema.path('isActive').instance).toBe('Boolean');
    expect(schema.path('isActive').defaultValue).toBe(true);

    expect(schema.path('metadata')).toBeDefined();
    expect(schema.path('metadata').instance).toBe('Mixed');
    expect(schema.path('metadata').defaultValue).toEqual({});

    expect(schema.path('tenantId')).toBeDefined();
    expect(schema.path('tenantId').instance).toBe('ObjectID');
    expect(schema.path('tenantId').caster.options.ref).toBe('Tenant');
    expect(schema.path('tenantId').defaultValue).toBe(null);

    expect(schema.path('isShared')).toBeDefined();
    expect(schema.path('isShared').instance).toBe('Boolean');
    expect(schema.path('isShared').defaultValue).toBe(false);

    // Check timestamps
    expect(schema.path('createdAt')).toBeDefined();
    expect(schema.path('updatedAt')).toBeDefined();
  });

  it('should apply toJSON transform correctly', () => {
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Test Chatbot',
      description: 'A test chatbot',
      userId: new mongoose.Types.ObjectId(),
      __v: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const transformedDoc = Chatbot.schema.options.toJSON.transform(null, doc);

    expect(transformedDoc).toBeDefined();
    expect(transformedDoc.id).toEqual(doc._id);
    expect(transformedDoc._id).toBeUndefined();
    expect(transformedDoc.__v).toBeUndefined();
    expect(transformedDoc.name).toEqual(doc.name);
    expect(transformedDoc.description).toEqual(doc.description);
    expect(transformedDoc.userId).toEqual(doc.userId);
  });

  it('should have the correct indexes', () => {
    const indexes = Chatbot.schema.indexes();

    // Expected indexes based on the schema definition
    const expectedIndexes = [
      { 'tenantId': 1, 'userId': 1, 'isActive': 1 },
      { 'tenantId': 1, 'isShared': 1, 'isActive': 1 },
      { 'userId': 1, 'isActive': 1 },
    ];

    // Extract just the key part of the indexes for comparison
    const actualIndexKeys = indexes.map(index => index[0]);

    expectedIndexes.forEach(expectedIndex => {
      expect(actualIndexKeys).toContainEqual(expectedIndex);
    });

    expect(actualIndexKeys.length).toBe(expectedIndexes.length); // Ensure no unexpected indexes
  });

  it('should create a new Chatbot instance', () => {
    const chatbotData = {
      name: 'My New Chatbot',
      userId: new mongoose.Types.ObjectId(),
    };
    const chatbot = new Chatbot(chatbotData);

    expect(chatbot).toBeInstanceOf(Chatbot);
    expect(chatbot.name).toBe(chatbotData.name);
    expect(chatbot.userId).toEqual(chatbotData.userId);
    expect(chatbot.description).toBe(''); // Default value
    expect(chatbot.model).toBe('Gemini 1.5 Pro'); // Default value
    expect(chatbot.isActive).toBe(true); // Default value
  });

  it('should validate required fields', async () => {
    const chatbot = new Chatbot({});
    let error;
    try {
      await chatbot.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.name).toBeDefined();
    expect(error.errors.name.message).toBe('Chatbot name is required');
    expect(error.errors.userId).toBeDefined();
    expect(error.errors.userId.message).toBe('Path `userId` is required.');
  });

  it('should validate maxlength for name', async () => {
    const longName = 'a'.repeat(101);
    const chatbot = new Chatbot({
      name: longName,
      userId: new mongoose.Types.ObjectId(),
    });
    let error;
    try {
      await chatbot.validate();
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.errors.name).toBeDefined();
    expect(error.errors.name.message).toBe('Chatbot name cannot exceed 100 characters');
  });
});