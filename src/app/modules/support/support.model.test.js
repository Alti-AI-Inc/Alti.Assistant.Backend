import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Mongoose Schema and Model behavior
const mockSchemaInstance = {
  obj: {}, // Stores the schema definition object
  options: {}, // Stores schema options
  path: {}, // Simulates schema paths for validation checks
  virtual: vi.fn().mockImplementation(() => mockSchemaInstance),
  pre: vi.fn().mockImplementation(() => mockSchemaInstance),
  post: vi.fn().mockImplementation(() => mockSchemaInstance),
  method: vi.fn().mockImplementation(() => mockSchemaInstance),
  static: vi.fn().mockImplementation(() => mockSchemaInstance),
  // Mock validateSync to simulate Mongoose validation
  validateSync: vi.fn(function(doc) {
    const errors = {};
    let hasErrors = false;

    // Create a mutable copy of the document for trim simulation
    const docToValidate = { ...doc };

    for (const key in this.obj) {
      const field = this.obj[key];
      let value = docToValidate[key];

      // Simulate 'trim' (Mongoose applies this before validation)
      if (field.type === String && field.trim && typeof value === 'string') {
        value = value.trim();
        docToValidate[key] = value; // Update the value in the document being validated
      }

      // Simulate 'required' validation
      if (field.required && (value === undefined || value === null || (typeof value === 'string' && value === ''))) {
        errors[key] = {
          name: 'ValidatorError',
          message: `Path \`${key}\` is required.`,
          properties: { path: key, type: 'required', message: `Path \`${key}\` is required.` },
          kind: 'required',
          path: key,
          value: doc[key], // Use original value for error reporting
        };
        hasErrors = true;
      }

      // Simulate 'enum' validation
      if (field.enum && value !== undefined && !field.enum.includes(value)) {
        errors[key] = {
          name: 'ValidatorError',
          message: `\`${value}\` is not a valid enum value for path \`${key}\`.`,
          properties: { path: key, type: 'enum', message: `\`${value}\` is not a valid enum value for path \`${key}\`.`, enum: field.enum },
          kind: 'enum',
          path: key,
          value: value,
        };
        hasErrors = true;
      }
    }

    if (hasErrors) {
      const validationError = new Error('Validation failed');
      validationError.name = 'ValidationError';
      validationError.errors = errors;
      return validationError;
    }
    return undefined; // Mongoose returns undefined for no errors
  }),
};

const {
  mockMongoose
} = vi.hoisted(() => {
  const mockMongoose = {
    Schema: vi.fn().mockImplementation((schemaDef, options) => {
      // Reset mockSchemaInstance properties for each new Schema call
      mockSchemaInstance.obj = schemaDef;
      mockSchemaInstance.options = options;
      mockSchemaInstance.path = {};
      for (const key in schemaDef) {
        mockSchemaInstance.path[key] = {
          options: schemaDef[key],
          get: (prop) => schemaDef[key][prop] // Basic getter for path options
        };
      }
      return mockSchemaInstance;
    }),
    model: vi.fn().mockImplementation((name, schema) => {
      // Return a mock model class that can be instantiated
      return class MockModel {
        constructor(data) {
          this._doc = { ...data }; // Simulate document data
          // Apply defaults based on the schema definition
          for (const key in schema.obj) {
            if (this._doc[key] === undefined && schema.obj[key].default !== undefined) {
              // If default is a function, call it. Otherwise, use the value.
              this._doc[key] = typeof schema.obj[key].default === 'function'
                ? schema.obj[key].default()
                : schema.obj[key].default;
            }
          }
        }
        validateSync() {
          // Pass a clone of _doc to validateSync so that trim simulation doesn't affect the original _doc
          // unless we explicitly want it to. For this simple case, modifying _doc directly is fine.
          return schema.validateSync(this._doc);
        }
        get(key) {
          return this._doc[key];
        }
        set(key, value) {
          this._doc[key] = value;
        }
        toObject() {
          return { ...this._doc };
        }
      };
    }),
    Types: {
      ObjectId: vi.fn().mockImplementation(() => 'mockObjectId'),
    },
  };

  return {
    mockMongoose
  };
});

vi.mock('mongoose', () => ({
  default: mockMongoose,
}));

// Import the model after mongoose is mocked
import Support from './support.model'; // Assuming relative path from test file

describe('Support Model', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Reset mockSchemaInstance properties for each test
    mockSchemaInstance.obj = {};
    mockSchemaInstance.options = {};
    mockSchemaInstance.path = {};
    // Ensure validateSync is reset as well
    mockSchemaInstance.validateSync.mockClear();
  });

  it('should define the Support schema correctly', () => {
    // Verify that mongoose.Schema was called
    expect(mockMongoose.Schema).toHaveBeenCalledTimes(1);

    // Get the schema definition passed to mongoose.Schema
    const schemaDefinition = mockMongoose.Schema.mock.calls[0][0];
    const schemaOptions = mockMongoose.Schema.mock.calls[0][1];

    // Check schema fields
    expect(schemaDefinition).toHaveProperty('subject');
    expect(schemaDefinition.subject.type).toBe(String);
    expect(schemaDefinition.subject.required).toBe(true);
    expect(schemaDefinition.subject.trim).toBe(true);

    expect(schemaDefinition).toHaveProperty('message');
    expect(schemaDefinition.message.type).toBe(String);
    expect(schemaDefinition.message.required).toBe(true);

    expect(schemaDefinition).toHaveProperty('status');
    expect(schemaDefinition.status.type).toBe(String);
    expect(schemaDefinition.status.enum).toEqual(['open', 'pending', 'closed']);
    expect(schemaDefinition.status.default).toBe('open');

    expect(schemaDefinition).toHaveProperty('isRead');
    expect(schemaDefinition.isRead.type).toBe(Boolean);
    expect(schemaDefinition.isRead.default).toBe(false);

    // Check schema options
    expect(schemaOptions).toHaveProperty('timestamps', true);

    // Verify that mongoose.model was called with the correct name and schema
    expect(mockMongoose.model).toHaveBeenCalledTimes(1);
    expect(mockMongoose.model).toHaveBeenCalledWith('Support', mockSchemaInstance);
  });

  describe('Schema Validation', () => {
    it('should validate a valid support ticket', () => {
      const validTicket = {
        subject: 'Test Subject',
        message: 'This is a test message.',
        status: 'open',
        isRead: false,
      };
      const supportInstance = new Support(validTicket);
      const error = supportInstance.validateSync();
      expect(error).toBeUndefined(); // Mongoose returns undefined for no validation errors
    });

    it('should apply default values correctly', () => {
      const ticketWithoutDefaults = {
        subject: 'Default Test',
        message: 'Message for default test.',
      };
      const supportInstance = new Support(ticketWithoutDefaults);
      expect(supportInstance.get('status')).toBe('open');
      expect(supportInstance.get('isRead')).toBe(false);
    });

    it('should require subject', () => {
      const invalidTicket = {
        // subject: missing
        message: 'This is a test message.',
      };
      const supportInstance = new Support(invalidTicket);
      const error = supportInstance.validateSync();
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ValidationError');
      expect(error.errors).toHaveProperty('subject');
      expect(error.errors.subject.message).toContain('Path `subject` is required.');
    });

    it('should require message', () => {
      const invalidTicket = {
        subject: 'Test Subject',
        // message: missing
      };
      const supportInstance = new Support(invalidTicket);
      const error = supportInstance.validateSync();
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ValidationError');
      expect(error.errors).toHaveProperty('message');
      expect(error.errors.message.message).toContain('Path `message` is required.');
    });

    it('should enforce status enum', () => {
      const invalidTicket = {
        subject: 'Test Subject',
        message: 'This is a test message.',
        status: 'invalid_status', // Invalid enum value
      };
      const supportInstance = new Support(invalidTicket);
      const error = supportInstance.validateSync();
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ValidationError');
      expect(error.errors).toHaveProperty('status');
      expect(error.errors.status.message).toContain('`invalid_status` is not a valid enum value for path `status`.');
    });

    it('should trim subject field', () => {
      const ticketWithSpaces = {
        subject: '  Trimmed Subject  ',
        message: 'Message.',
      };
      const supportInstance = new Support(ticketWithSpaces);
      // The mock validateSync simulates trim in place on the _doc
      supportInstance.validateSync();
      expect(supportInstance.get('subject')).toBe('Trimmed Subject');
    });

    it('should handle empty string for required fields as invalid', () => {
      const invalidTicket = {
        subject: '', // Empty string
        message: 'Valid message.',
      };
      const supportInstance = new Support(invalidTicket);
      const error = supportInstance.validateSync();
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ValidationError');
      expect(error.errors).toHaveProperty('subject');
      expect(error.errors.subject.message).toContain('Path `subject` is required.');
    });
  });
});