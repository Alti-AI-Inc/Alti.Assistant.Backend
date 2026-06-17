import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import emailValidator from 'email-validator';

// Mock mongoose and its components
const {
  mockSchemaInstance,
  mockSchemaConstructor,
  mockModelInstance,
  mockMongooseModel,
  mockObjectIdIsValid,
  mockObjectId
} = vi.hoisted(() => {
  const mockSchemaInstance = {
    method: vi.fn(),
    static: vi.fn(),
    index: vi.fn(),
    pre: vi.fn(),
    methods: {},
    statics: {},
    path: vi.fn().mockImplementation(() => ({
      validate: vi.fn(),
      default: vi.fn(),
      enum: vi.fn(),
      ref: vi.fn(),
      index: vi.fn(),
      select: vi.fn(),
    })),
  };
  const mockSchemaConstructor = vi.fn().mockImplementation(function() { return mockSchemaInstance; });
  const mockModelInstance = {
    findById: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn(),
  };
  const mockMongooseModel = vi.fn().mockImplementation(function() { return mockModelInstance; });
  const mockObjectIdIsValid = vi.fn();
  const mockObjectId = {
    isValid: mockObjectIdIsValid,
  };

  return {
    mockSchemaInstance,
    mockSchemaConstructor,
    mockModelInstance,
    mockMongooseModel,
    mockObjectIdIsValid,
    mockObjectId
  };
});

vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal();
  const mockModel = vi.fn().mockImplementation((name, schema) => {
    return mockMongooseModel();
  });
  
  // Copy static properties of actualMongoose.Schema (like Types) onto mockSchemaConstructor
  Object.assign(mockSchemaConstructor, actualMongoose.Schema);

  const mockMongoose = {
    ...actualMongoose,
    Schema: mockSchemaConstructor,
    model: mockModel,
    Types: {
      ...actualMongoose.Types,
      ObjectId: mockObjectId,
    },
  };
  return {
    ...mockMongoose,
    default: mockMongoose,
  };
});

// Mock crypto
vi.mock('crypto', () => {
  const mockRandomBytes = vi.fn().mockImplementation(() => ({
    toString: vi.fn().mockImplementation(() => 'mockConfirmationToken'),
  }));
  const mockUpdate = vi.fn().mockReturnThis();
  const mockDigest = vi.fn().mockReturnValue('mockConfirmationToken');
  const mockCreateHash = vi.fn().mockImplementation(() => ({
    update: mockUpdate,
    digest: mockDigest,
  }));
  const mockCrypto = {
    randomBytes: mockRandomBytes,
    createHash: mockCreateHash,
  };
  return {
    ...mockCrypto,
    default: mockCrypto,
  };
});

// Mock email-validator
vi.mock('email-validator', () => ({
  default: {
    validate: vi.fn(),
  },
}));

// Import the model dynamically after mocks are fully set up
let UserModel;
beforeAll(async () => {
  const modelModule = await import('./auth.model');
  UserModel = modelModule.default;

  // Rearrange mockSchemaConstructor.mock.calls so that the main UserSchema call is at index 0
  const mainCallIndex = mockSchemaConstructor.mock.calls.findIndex(call => call[0] && call[0].email);
  if (mainCallIndex > 0) {
    const mainCall = mockSchemaConstructor.mock.calls[mainCallIndex];
    mockSchemaConstructor.mock.calls.splice(mainCallIndex, 1);
    mockSchemaConstructor.mock.calls.unshift(mainCall);
  }
});

describe('User Model', () => {
  beforeEach(() => {
    // Reset the mock model's internal state for findById, select, lean
    mockModelInstance.findById.mockReturnThis();
    mockModelInstance.select.mockReturnThis();
    mockModelInstance.lean.mockResolvedValue(null); // Default to not found
    mockSchemaConstructor.mockImplementation(function() { return mockSchemaInstance; }); // Ensure schema instance is consistent
    mongoose.model.mockImplementation(function() { return mockMongooseModel(); }); // Ensure model instance is consistent
  });

  it('should define the User schema with correct structure and options', () => {
    expect(mockSchemaConstructor).toHaveBeenCalledTimes(2);
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    const schemaOptions = mockSchemaConstructor.mock.calls[0][1];

    expect(schemaOptions).toEqual({ timestamps: true });

    // Basic field checks
    expect(schemaDefinition.email).toBeDefined();
    expect(schemaDefinition.password).toBeDefined();
    expect(schemaDefinition.isSubscribed).toBeDefined();
    expect(schemaDefinition.subscription).toBeDefined();
    expect(schemaDefinition.freePlanUsage).toBeDefined();
    expect(schemaDefinition.dailyRequestLimit).toBeDefined();
    expect(schemaDefinition.role).toBeDefined();
    expect(schemaDefinition.llamaAiSessions).toBeDefined();
    expect(schemaDefinition.browserSessions).toBeDefined();
    expect(schemaDefinition.notifications).toBeDefined();
    expect(schemaDefinition.confirmationToken).toBeDefined();
    expect(schemaDefinition.confirmationTokenExpires).toBe(Date);
    expect(schemaDefinition.resetPasswordOTP).toBeDefined();
    expect(schemaDefinition.resetPasswordExpires).toBe(Date);
    expect(schemaDefinition.deleteAccountOTP).toBeDefined();
    expect(schemaDefinition.deleteAccountExpires).toBe(Date);
    expect(schemaDefinition.stripeAccountId).toBeDefined();
    expect(schemaDefinition.workspaces).toBeDefined();
    expect(schemaDefinition.activeWorkspaceId).toBeDefined();
  });

  it('should have correct properties for email field', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    const emailField = schemaDefinition.email;

    expect(emailField.type).toBe(String);
    expect(emailField.required).toEqual([true, 'Please provide a unique email']);
    expect(emailField.unique).toBe(true);
    expect(emailField.validate.validator).toBeInstanceOf(Function);
  });

  it('should validate email using email-validator', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    const emailValidatorFn = schemaDefinition.email.validate.validator;

    // Test valid email
    emailValidator.validate.mockReturnValue(true);
    const mockUserValid = { email: 'test@example.com' };
    expect(emailValidatorFn.call(mockUserValid, mockUserValid.email)).toBe(true);
    expect(emailValidator.validate).toHaveBeenCalledWith('test@example.com');

    // Test invalid email
    emailValidator.validate.mockReturnValue(false);
    const mockUserInvalid = { email: 'invalid-email' };
    expect(emailValidatorFn.call(mockUserInvalid, mockUserInvalid.email)).toBe(false);
    expect(emailValidator.validate).toHaveBeenCalledWith('invalid-email');
  });

  it('should have correct properties for password field', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    const passwordField = schemaDefinition.password;

    expect(passwordField.type).toBe(String);
    expect(passwordField.unique).toBe(false);
    expect(passwordField.select).toBe(false); // Should not be selected by default
  });

  it('should have correct defaults and enums for various fields', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];

    expect(schemaDefinition.isSubscribed.default).toBe(false);

    expect(schemaDefinition.subscription.duration.enum).toEqual(['month', 'year']);
    expect(schemaDefinition.subscription.status.enum).toEqual(['paid', 'expired']);

    expect(schemaDefinition.freePlanUsage.promptsUsed.default).toBe(0);
    expect(schemaDefinition.freePlanUsage.imagesUsed.default).toBe(0);
    expect(schemaDefinition.freePlanUsage.lastResetAt.default).toBe(Date.now);

    expect(schemaDefinition.dailyRequestLimit.requestsUsed.default).toBe(0);
    expect(schemaDefinition.dailyRequestLimit.maxRequests.default).toBe(10);
    expect(schemaDefinition.dailyRequestLimit.lastResetAt.default).toBe(Date.now);

    expect(schemaDefinition.role.enum.values).toEqual(['user', 'buyer', 'admin', 'super_admin', 'unauthorized']);
    expect(schemaDefinition.role.default).toBe('unauthorized');

    expect(schemaDefinition.activeWorkspaceId.ref).toBe('Tenant');
    expect(schemaDefinition.activeWorkspaceId.default).toBe(null);
    expect(schemaDefinition.activeWorkspaceId.index).toBe(true);
  });

  it('should define `generateConfirmationToken` as a schema method', () => {
    expect(mockSchemaInstance.methods.generateConfirmationToken).toBeInstanceOf(Function);
  });

  describe('UserSchema.methods.generateConfirmationToken', () => {
    let generateConfirmationToken;
    let mockUser;

    beforeEach(() => {
      // Extract the method from the mockSchemaInstance
      generateConfirmationToken = mockSchemaInstance.methods.generateConfirmationToken;

      mockUser = {
        confirmationToken: null,
        confirmationTokenExpires: null,
      };
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-01-01T12:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should generate a confirmation token and set expiration', () => {
      const token = generateConfirmationToken.call(mockUser);

      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
      expect(token).toBe('mockConfirmationToken');
      expect(mockUser.confirmationToken).toBe('mockConfirmationToken');

      const expectedExpiration = new Date('2023-01-02T12:00:00.000Z'); // 1 day later
      expect(mockUser.confirmationTokenExpires).toEqual(expectedExpiration);
    });
  });

  it('should define `isUserExist` as a schema static method', () => {
    expect(mockSchemaInstance.statics.isUserExist).toBeInstanceOf(Function);
  });

  describe('UserSchema.statics.isUserExist', () => {
    let isUserExist;

    beforeEach(() => {
      // Extract the static method from the mockSchemaInstance
      isUserExist = mockSchemaInstance.statics.isUserExist;

      // Reset mock model instance methods for each test
      mockModelInstance.findById.mockClear().mockReturnThis();
      mockModelInstance.select.mockClear().mockReturnThis();
      mockModelInstance.lean.mockClear().mockResolvedValue(null); // Default to user not found
    });

    it('should return true if user exists for a valid ObjectId', async () => {
      mockObjectIdIsValid.mockReturnValue(true);
      mockModelInstance.lean.mockResolvedValue({ _id: 'mockUserId' }); // User found

      const result = await isUserExist.call(mockMongooseModel(), 'mockUserId');

      expect(mockObjectIdIsValid).toHaveBeenCalledWith('mockUserId');
      expect(mockModelInstance.findById).toHaveBeenCalledWith('mockUserId');
      expect(mockModelInstance.select).toHaveBeenCalledWith('_id');
      expect(mockModelInstance.lean).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false if user does not exist for a valid ObjectId', async () => {
      mockObjectIdIsValid.mockReturnValue(true);
      mockModelInstance.lean.mockResolvedValue(null); // User not found

      const result = await isUserExist.call(mockMongooseModel(), 'nonExistentUserId');

      expect(mockObjectIdIsValid).toHaveBeenCalledWith('nonExistentUserId');
      expect(mockModelInstance.findById).toHaveBeenCalledWith('nonExistentUserId');
      expect(mockModelInstance.select).toHaveBeenCalledWith('_id');
      expect(mockModelInstance.lean).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should return false for an invalid ObjectId string', async () => {
      mockObjectIdIsValid.mockReturnValue(false); // Invalid ObjectId

      const result = await isUserExist.call(mockMongooseModel(), 'invalid-id-string');

      expect(mockObjectIdIsValid).toHaveBeenCalledWith('invalid-id-string');
      expect(mockModelInstance.findById).not.toHaveBeenCalled(); // Should not attempt to findById
      expect(result).toBe(false);
    });
  });

  it('should create and export the UserModel', () => {
    expect(mongoose.model).toHaveBeenCalledWith('User', mockSchemaInstance);
    expect(UserModel).toBe(mockMongooseModel()); // UserModel should be the result of mongoose.model
  });
});