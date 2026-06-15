import { vi, describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';

// Containers to hold the actual statics and methods objects passed to the schema
const staticsContainer = {};
const methodsContainer = {};

// Mock Schema constructor and its methods
const mockSchemaInstance = {
  index: vi.fn(),
  statics: vi.fn().mockImplementation((obj) => Object.assign(staticsContainer, obj)), // Assign to container
  methods: vi.fn().mockImplementation((obj) => Object.assign(methodsContainer, obj)), // Assign to container
  pre: vi.fn(),
};

const {
  mockSchemaConstructor
} = vi.hoisted(() => {
  const mockSchemaConstructor = vi.fn().mockImplementation((definition, options) => mockSchemaInstance);

  return {
    mockSchemaConstructor
  };
});
mockSchemaConstructor.Types = {
  ObjectId: mongoose.Types.ObjectId, // Use real ObjectId for type consistency
};

vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal();
  return {
    ...actualMongoose,
    Schema: mockSchemaConstructor,
    model: vi.fn().mockImplementation((name, schema) => {
      // This mock model will contain the statics and methods defined on the schema
      const MockModel = function (data) {
        Object.assign(this, data);
        this.save = vi.fn().mockImplementation(async () => this); // Mock save method for instances
      };
      // Attach static methods from the staticsContainer
      Object.assign(MockModel, staticsContainer);
      // Attach instance methods from the methodsContainer
      Object.assign(MockModel.prototype, methodsContainer);

      // Mock query methods on the model
      MockModel.find = vi.fn().mockImplementation(() => ({
        populate: vi.fn().mockReturnThis(),
        exec: vi.fn().mockImplementation(() => Promise.resolve([])),
      }));
      MockModel.findOne = vi.fn().mockImplementation(() => ({
        populate: vi.fn().mockReturnThis(),
        exec: vi.fn().mockImplementation(() => Promise.resolve(null)),
      }));
      return MockModel;
    }),
    Types: {
      ObjectId: actualMongoose.Types.ObjectId,
    },
  };
});

vi.mock('crypto', () => ({
  randomBytes: vi.fn().mockImplementation(() => ({
    toString: vi.fn().mockImplementation(() => 'mockedCryptoToken1234567890abcdefghijklmnopqrstuvwxyz'),
  })),
}));

// Import the file to be tested AFTER mocks are set up
// This import will trigger the mongoose.Schema and mongoose.model calls once globally.
import TenantInvitation from './tenantInvitation.model';

describe('TenantInvitation Model', () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the containers for statics and methods, as they are populated globally on import
    for (const key in staticsContainer) {
      delete staticsContainer[key];
    }
    for (const key in methodsContainer) {
      delete methodsContainer[key];
    }
    // Re-initialize the mockSchemaInstance.statics and .methods to ensure they are fresh vi.fn()
    // for any potential re-evaluation of the schema (though not typical for global imports).
    mockSchemaInstance.statics = vi.fn().mockImplementation((obj) => Object.assign(staticsContainer, obj));
    mockSchemaInstance.methods = vi.fn().mockImplementation((obj) => Object.assign(methodsContainer, obj));
  });

  it('should define the TenantInvitationSchema correctly', () => {
    // The schema constructor is called once when the model file is imported.
    expect(mockSchemaConstructor).toHaveBeenCalledTimes(1);
    const schemaDefinition = mockSchemaConstructor.mock.calls[0][0];
    const schemaOptions = mockSchemaConstructor.mock.calls[0][1];

    // Verify schema fields
    expect(schemaDefinition.tenantId).toEqual({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant ID is required'],
      index: true,
    });
    expect(schemaDefinition.email).toEqual({
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      index: true,
    });
    expect(schemaDefinition.role).toEqual({
      type: String,
      enum: ['admin', 'manager', 'user'],
      required: [true, 'Role is required'],
      default: 'user',
    });
    expect(schemaDefinition.invitedBy).toEqual({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Inviter ID is required'],
    });
    expect(schemaDefinition.token).toEqual({
      type: String,
      required: true,
      unique: true,
      index: true,
    });
    expect(schemaDefinition.status).toEqual({
      type: String,
      enum: ['pending', 'pending_email', 'accepted', 'expired', 'cancelled'],
      default: 'pending',
      index: true,
    });
    expect(schemaDefinition.expiresAt).toEqual({
      type: Date,
      required: true,
      index: true,
    });
    expect(schemaDefinition.acceptedAt).toEqual({
      type: Date,
      default: null,
    });
    expect(schemaDefinition.acceptedBy).toEqual({
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    });
    expect(schemaDefinition.metadata).toEqual({
      inviterName: String,
      tenantName: String,
      message: String,
      ipAddress: String,
      userAgent: String,
    });

    // Verify schema options
    expect(schemaOptions).toEqual({ timestamps: true });

    // Verify indexes
    expect(mockSchemaInstance.index).toHaveBeenCalledTimes(4);
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ email: 1, tenantId: 1, status: 1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ token: 1, status: 1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith({ expiresAt: 1, status: 1 });
    expect(mockSchemaInstance.index).toHaveBeenCalledWith(
      { expiresAt: 1 },
      {
        expireAfterSeconds: 2592000,
        partialFilterExpression: { status: 'expired' },
      }
    );

    // Verify pre-save hook
    expect(mockSchemaInstance.pre).toHaveBeenCalledTimes(1);
    expect(mockSchemaInstance.pre).toHaveBeenCalledWith('save', expect.any(Function));

    // Verify model creation
    expect(mongoose.model).toHaveBeenCalledTimes(1);
    expect(mongoose.model).toHaveBeenCalledWith('TenantInvitation', mockSchemaInstance);
  });

  describe('Static Methods', () => {
    it('generateToken should generate a secure token', () => {
      const token = TenantInvitation.generateToken();
      expect(crypto.randomBytes).toHaveBeenCalledWith(32);
      expect(crypto.randomBytes().toString).toHaveBeenCalledWith('hex');
      expect(token).toBe('mockedCryptoToken1234567890abcdefghijklmnopqrstuvwxyz');
      expect(token).toHaveLength(64); // 32 bytes * 2 hex chars/byte
    });

    it('findPendingByEmail should query for pending invitations by email', async () => {
      const mockEmail = 'test@example.com';
      const mockFindResult = [{ email: mockEmail, status: 'pending' }];

      // Mock the chainable methods on the result of TenantInvitation.find
      const mockQuery = {
        populate: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockFindResult),
      };
      TenantInvitation.find.mockReturnValue(mockQuery);

      const result = await TenantInvitation.findPendingByEmail(mockEmail);

      expect(TenantInvitation.find).toHaveBeenCalledTimes(1);
      const findArgs = TenantInvitation.find.mock.calls[0][0];
      expect(findArgs.email).toBe(mockEmail.toLowerCase());
      expect(findArgs.status).toBe('pending');
      expect(findArgs.expiresAt.$gt).toBeInstanceOf(Date);
      expect(result).toEqual(mockFindResult);
    });

    it('findByToken should find a pending invitation by token and populate tenantId', async () => {
      const mockToken = 'someSecureToken';
      const mockInvitation = {
        token: mockToken,
        status: 'pending',
        expiresAt: new Date(Date.now() + 100000), // Future date
        tenantId: { _id: new mongoose.Types.ObjectId(), name: 'Test Tenant', slug: 'test-tenant' },
      };

      // Mock the chainable methods on the result of TenantInvitation.findOne
      const mockQuery = {
        populate: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockInvitation),
      };
      TenantInvitation.findOne.mockReturnValue(mockQuery);

      const result = await TenantInvitation.findByToken(mockToken);

      expect(TenantInvitation.findOne).toHaveBeenCalledTimes(1);
      const findOneArgs = TenantInvitation.findOne.mock.calls[0][0];
      expect(findOneArgs.token).toBe(mockToken);
      expect(findOneArgs.status).toBe('pending');
      expect(findOneArgs.expiresAt.$gt).toBeInstanceOf(Date);

      expect(mockQuery.populate).toHaveBeenCalledTimes(1);
      expect(mockQuery.populate).toHaveBeenCalledWith('tenantId', 'name slug');
      expect(result).toEqual(mockInvitation);
    });

    it('findByToken should return null if invitation is expired or not found', async () => {
      const mockToken = 'someSecureToken';
      // Mock findOne to return null, simulating no active invitation found
      const mockQuery = {
        populate: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),
      };
      TenantInvitation.findOne.mockReturnValue(mockQuery);

      const result = await TenantInvitation.findByToken(mockToken);
      expect(result).toBeNull();
    });
  });

  describe('Instance Methods', () => {
    let invitationInstance;
    const mockUserId = new mongoose.Types.ObjectId();

    beforeEach(() => {
      // Create a fresh instance for each test
      invitationInstance = new TenantInvitation({
        tenantId: new mongoose.Types.ObjectId(),
        email: 'user@example.com',
        role: 'user',
        invitedBy: new mongoose.Types.ObjectId(),
        token: 'testtoken123',
        status: 'pending',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      });
      // Clear mocks on the instance's save method if it was called during construction
      invitationInstance.save.mockClear();
    });

    it('isExpired should return true if expiresAt is in the past', () => {
      invitationInstance.expiresAt = new Date(Date.now() - 1000); // 1 second ago
      expect(invitationInstance.isExpired()).toBe(true);
    });

    it('isExpired should return false if expiresAt is in the future', () => {
      invitationInstance.expiresAt = new Date(Date.now() + 1000); // 1 second from now
      expect(invitationInstance.isExpired()).toBe(false);
    });

    it('markAsAccepted should update status, acceptedAt, acceptedBy and save', async () => {
      const initialStatus = invitationInstance.status;
      const initialAcceptedAt = invitationInstance.acceptedAt;
      const initialAcceptedBy = invitationInstance.acceptedBy;

      const updatedInvitation = await invitationInstance.markAsAccepted(mockUserId);

      expect(updatedInvitation.status).toBe('accepted');
      expect(updatedInvitation.acceptedAt).toBeInstanceOf(Date);
      expect(updatedInvitation.acceptedAt).not.toBe(initialAcceptedAt);
      expect(updatedInvitation.acceptedBy).toEqual(mockUserId);
      expect(invitationInstance.save).toHaveBeenCalledTimes(1);
    });

    it('cancel should update status to cancelled and save', async () => {
      const initialStatus = invitationInstance.status;

      const updatedInvitation = await invitationInstance.cancel();

      expect(updatedInvitation.status).toBe('cancelled');
      expect(updatedInvitation.status).not.toBe(initialStatus);
      expect(invitationInstance.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('Pre-save Hook', () => {
    let preSaveHook;
    let mockNext;
    let invitationDoc;

    beforeEach(() => {
      // The pre-save hook is defined once when the schema is created.
      // We retrieve the function that was passed to `mockSchemaInstance.pre`.
      preSaveHook = mockSchemaInstance.pre.mock.calls[0][1];
      mockNext = vi.fn();
      invitationDoc = {
        status: 'pending',
        expiresAt: new Date(Date.now() + 3600000), // Future date
        isExpired: vi.fn().mockImplementation(() => false), // Mock isExpired method
      };
    });

    it('should change status to "expired" if pending and expired', () => {
      invitationDoc.isExpired.mockReturnValue(true);
      preSaveHook.call(invitationDoc, mockNext);
      expect(invitationDoc.status).toBe('expired');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should not change status if pending but not expired', () => {
      invitationDoc.isExpired.mockReturnValue(false);
      preSaveHook.call(invitationDoc, mockNext);
      expect(invitationDoc.status).toBe('pending');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should not change status if not pending, even if expired', () => {
      invitationDoc.status = 'accepted';
      invitationDoc.isExpired.mockReturnValue(true);
      preSaveHook.call(invitationDoc, mockNext);
      expect(invitationDoc.status).toBe('accepted');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should always call next()', () => {
      preSaveHook.call(invitationDoc, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });
});