import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import emailValidator from 'email-validator';

// Mock mongoose and its components
const mockSchemaInstance = {
  method: vi.fn(),
  static: vi.fn(),
  path: vi.fn().mockImplementation(() => ({
    validate: vi.fn(),
    default: vi.fn(),
    enum: vi.fn(),
    ref: vi.fn(),
    index: vi.fn(),
    select: vi.fn(),
  })),
};

const {
  mockSchemaConstructor,
  mockMongooseModel,
  mockObjectId
} = vi.hoisted(() => {
  const mockSchemaConstructor = vi.fn().mockImplementation(() => mockSchemaInstance);
  const mockMongooseModel = vi.fn().mockImplementation(() => mockModelInstance); // This will be the return value of mongoose.model
  const mockObjectId = {
    isValid: mockObjectIdIsValid,
  };

  return {
    mockSchemaConstructor,
    mockMongooseModel,
    mockObjectId
  };
});

const mockModelInstance = {
  findById: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  lean: vi.fn(),
};
const mockObjectIdIsValid = vi.fn();

vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal();
  return {
    ...actualMongoose, // Keep actual types and other utilities if needed
    Schema: mockSchemaConstructor,
    model: vi.fn().mockImplementation((name, schema) => {
      // Store the schema for inspection if needed, or just return a mock model
      return mockMongooseModel();
    }),
    Types: {
      ObjectId: mockObjectId,
    },
  };
});

// Mock crypto
vi.mock('crypto', () => ({
  randomBytes: vi.fn().mockImplementation(() => ({
    toString: vi.fn().mockImplementation(() => 'mockConfirmationToken'),
  })),
}));

// Mock email-validator
vi.mock('email-validator', () => ({
  default: {
    validate: vi.fn(),
  },
}));

// Import the model after mocks are set up
// This will trigger the mongoose.Schema and mongoose.model calls
import UserModel from './auth.model';

describe('User Model', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock model's internal state for findById, select, lean
    mockModelInstance.findById.mockReturnThis();
    mockModelInstance.select.mockReturnThis();
    mockModelInstance.lean.mockResolvedValue(null); // Default to not found
    mockSchemaConstructor.mockClear(); // Clear calls to Schema constructor
    mongoose.model.mockClear(); // Clear calls to model factory
    mockSchemaConstructor.mockImplementation(() => mockSchemaInstance); // Ensure schema instance is consistent
    mongoose.model.mockImplementation(() => mockMongooseModel()); // Ensure model instance is consistent
  });

  it('should define the User schema with correct structure and options', () => {
    expect(mockSchemaConstructor).toHaveBeenCalledTimes(1);
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
    expect(schemaDefinition.confirmationToken).toBe(String);
    expect(schemaDefinition.confirmationTokenExpires).toBe(Date);
    expect(schemaDefinition.resetPasswordOTP).toBe(String);
    expect(schemaDefinition.resetPasswordExpires).toBe(Date);
    expect(schemaDefinition.deleteAccountOTP).toBe(String);
    expect(schemaDefinition.deleteAccountExpires).toBe(Date);
    expect(schemaDefinition.stripeAccountId).toBeDefined();
    expect(schemaDefinition.subscriptionId).toBeDefined();
    expect(schemaDefinition.currentPlan).toBeDefined();
    expect(schemaDefinition.tenantId).toBeDefined();
    expect(schemaDefinition.tenantRole).toBeDefined();
    expect(schemaDefinition.tenantPermissions).toBeDefined();
    expect(schemaDefinition.activeTenantId).toBeDefined();
  });

  it('should have correct properties for email field', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    const emailField = schemaDefinition.email;

    expect(emailField.type).toBe(String);
    expect(emailField.required).toEqual([true, 'Please provide a unique email']);
    expect(emailField.unique).toBe(true);
    expect(emailField.validate).toBeInstanceOf(Function);
  });

  it('should validate email using email-validator', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    const emailValidatorFn = schemaDefinition.email.validate;

    // Test valid email
    emailValidator.default.validate.mockReturnValue(true);
    const mockUserValid = { email: 'test@example.com' };
    expect(emailValidatorFn.call(mockUserValid)).toBe(true);
    expect(emailValidator.default.validate).toHaveBeenCalledWith('test@example.com');

    // Test invalid email
    emailValidator.default.validate.mockReturnValue(false);
    const mockUserInvalid = { email: 'invalid-email' };
    expect(emailValidatorFn.call(mockUserInvalid)).toBe(false);
    expect(emailValidator.default.validate).toHaveBeenCalledWith('invalid-email');
  });

  it('should have correct properties for password field', () => {
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    const passwordField = schemaDefinition.password;

    expect(passwordField.type).toBe(String);
    expect(passwordField.unique).toBe(false);
    expect(passwordField.select).toBe(0); // Should not be selected by default
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

    expect(schemaDefinition.subscriptionId.ref).toBe('Subscription');
    expect(schemaDefinition.subscriptionId.default).toBe(null);
    expect(schemaDefinition.subscriptionId.index).toBe(true);

    expect(schemaDefinition.currentPlan.enum).toEqual(['free', 'explore', 'execute', 'command']);
    expect(schemaDefinition.currentPlan.default).toBe('free');
    expect(schemaDefinition.currentPlan.index).toBe(true);

    expect(schemaDefinition.tenantId.ref).toBe('Tenant');
    expect(schemaDefinition.tenantId.default).toBe(null);
    expect(schemaDefinition.tenantId.index).toBe(true);

    expect(schemaDefinition.tenantRole.enum).toEqual(['admin', 'manager', 'user']);
    expect(schemaDefinition.tenantRole.default).toBe(null);

    expect(schemaDefinition.tenantPermissions.type).toEqual([String]);
    expect(schemaDefinition.tenantPermissions.default).toEqual([]);

    expect(schemaDefinition.activeTenantId.ref).toBe('Tenant');
    expect(schemaDefinition.activeTenantId.default).toBe(null);
    expect(schemaDefinition.activeTenantId.index).toBe(true);
  });

  it('should define `generateConfirmationToken` as a schema method', () => {
    expect(mockSchemaInstance.method).toHaveBeenCalledWith('generateConfirmationToken', expect.any(Function));
  });

  describe('UserSchema.methods.generateConfirmationToken', () => {
    let generateConfirmationToken;
    let mockUser;

    beforeEach(() => {
      // Extract the method from the mockSchemaInstance
      generateConfirmationToken = mockSchemaInstance.method.mock.calls.find(
        (call) => call[0] === 'generateConfirmationToken'
      )[1];

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
    expect(mockSchemaInstance.static).toHaveBeenCalledWith('isUserExist', expect.any(Function));
  });

  describe('UserSchema.statics.isUserExist', () => {
    let isUserExist;

    beforeEach(() => {
      // Extract the static method from the mockSchemaInstance
      isUserExist = mockSchemaInstance.static.mock.calls.find(
        (call) => call[0] === 'isUserExist'
      )[1];

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