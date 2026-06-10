import { vi, describe, it, expect, beforeEach } from 'vitest';

// --- Mocks ---
const mockSchemaDefinition = {};
const mockSchemaOptions = {};
const mockSchemaInstance = {
  pre: vi.fn(),
  post: vi.fn(),
  method: vi.fn(),
  virtual: vi.fn(),
  statics: vi.fn(),
  query: vi.fn(),
  index: vi.fn(),
};

const mockSchemaConstructor = vi.fn(function(definition, options) {
  // Capture the definition and options when mongoose.Schema is called
  Object.assign(mockSchemaDefinition, definition);
  Object.assign(mockSchemaOptions, options);
  // Assign mock methods to the 'this' context of the schema instance
  Object.assign(this, mockSchemaInstance);
});

// Mock Mongoose ObjectId type
const MockObjectIdType = function() {};
Object.defineProperty(MockObjectIdType, 'name', { value: 'ObjectId' });

const mockMongoose = {
  // Assign Types to the Schema constructor itself, as used in the model file
  Schema: Object.assign(mockSchemaConstructor, {
    Types: {
      ObjectId: MockObjectIdType,
    },
  }),
  model: vi.fn((name, schema) => ({ name, schema })),
  // Also provide Mongoose.Types.ObjectId for completeness if used directly
  Types: {
    ObjectId: MockObjectIdType,
  },
};

const mockValidator = {
  isEmail: vi.fn(() => true), // Mock the validator function
};

const mockCategoryValues = ['General', 'Technical', 'Announcements'];

// Mock external modules
vi.mock('mongoose', () => mockMongoose);
vi.mock('validator', () => mockValidator);
vi.mock('./forum.constant', () => ({ categoryValues: mockCategoryValues }));

// --- Import the module under test ---
// It's important to import *after* mocks are set up.
// The path is relative to the test file. Assuming test file is in `src/app/modules/forum/__tests__`
// and model file is in `src/app/modules/forum`.
import ForumModel from '../forum.model';

describe('Forum Model Schema', () => {
  // Clear mock call counts before each test.
  // The captured schema definition (`mockSchemaDefinition`, `mockSchemaOptions`)
  // remains the same across tests as the module is imported only once.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should define the Forum schema correctly', () => {
    // Assert that mongoose.Schema was called exactly once during module import
    expect(mockMongoose.Schema).toHaveBeenCalledTimes(1);
    expect(mockMongoose.Schema).toHaveBeenCalledWith(
      expect.any(Object), // The schema definition
      expect.any(Object)  // The options
    );

    // Assert that mongoose.model was called exactly once during module import
    expect(mockMongoose.model).toHaveBeenCalledTimes(1);
    expect(mockMongoose.model).toHaveBeenCalledWith('Forum', mockSchemaInstance);

    // Assert the exported model is the one returned by mockMongoose.model
    expect(ForumModel).toEqual({ name: 'Forum', schema: mockSchemaInstance });
  });

  describe('Schema Fields', () => {
    it('should have a "title" field', () => {
      const field = mockSchemaDefinition.title;
      expect(field).toBeDefined();
      expect(field.type).toBe(String);
      expect(field.minLength).toEqual([3, 'title must be at list 3 characters']);
      expect(field.maxLength).toEqual([100, 'Name is too learge']);
    });

    it('should have an "img" field', () => {
      const field = mockSchemaDefinition.img;
      expect(field).toBeDefined();
      expect(field.type).toBe(String);
      expect(field.required).toEqual([true, 'Forum image is required']);
    });

    it('should have a "category" field', () => {
      const field = mockSchemaDefinition.category;
      expect(field).toBeDefined();
      expect(field.type).toBe(String);
      expect(field.required).toEqual([true, 'Please provide a forum category']);
      expect(field.enum).toBeDefined();
      expect(field.enum.values).toEqual(mockCategoryValues);
      expect(field.enum.message).toBe('Invalid category');
    });

    it('should have an "author" field', () => {
      const field = mockSchemaDefinition.author;
      expect(field).toBeDefined();
      expect(field.type).toBe(MockObjectIdType);
      expect(field.ref).toBe('User');
      expect(field.required).toBe(true);
    });

    it('should have "userActivities" field', () => {
      const field = mockSchemaDefinition.userActivities;
      expect(field).toBeDefined();
      expect(Array.isArray(field)).toBe(true);
      expect(field[0].type).toBe(MockObjectIdType);
      expect(field[0].ref).toBe('forum-User-Activities');
    });

    it('should have an "authorEmail" field', () => {
      const field = mockSchemaDefinition.authorEmail;
      expect(field).toBeDefined();
      expect(field.type).toBe(String);
      expect(field.lowercase).toBe(true);
      expect(field.trim).toBe(true);
      expect(field.validate).toBeDefined();
      expect(field.validate[0]).toBe(mockValidator.isEmail); // Check if the validator function is assigned
      expect(field.validate[1]).toBe('Please provide a valid email');
    });

    it('should have a "description" field as an array of objects', () => {
      const field = mockSchemaDefinition.description;
      expect(field).toBeDefined();
      expect(Array.isArray(field)).toBe(true);
      expect(field.length).toBe(4); // Based on the provided schema
      expect(field[0]).toEqual({
        title: String,
        content1: String,
        content2: String,
      });
      // Assuming all array elements have the same structure
      expect(field[1]).toEqual(field[0]);
      expect(field[2]).toEqual(field[0]);
      expect(field[3]).toEqual(field[0]);
    });

    it('should have "createdAt" field with default Date.now', () => {
      const field = mockSchemaDefinition.createdAt;
      expect(field).toBeDefined();
      expect(field.type).toBe(Date);
      expect(field.default).toBe(Date.now);
    });

    it('should have "updatedAt" field with default Date.now', () => {
      const field = mockSchemaDefinition.updatedAt;
      expect(field).toBeDefined();
      expect(field.type).toBe(Date);
      expect(field.default).toBe(Date.now);
    });

    it('should have "tenantId" field', () => {
      const field = mockSchemaDefinition.tenantId;
      expect(field).toBeDefined();
      expect(field.type).toBe(MockObjectIdType);
      expect(field.ref).toBe('Tenant');
      expect(field.default).toBe(null);
      expect(field.index).toBe(true);
    });
  });

  describe('Schema Options', () => {
    it('should have timestamps enabled', () => {
      expect(mockSchemaOptions.timestamps).toBe(true);
    });
  });
});