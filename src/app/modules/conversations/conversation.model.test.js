import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import crypto from 'crypto';

// Mock mongoose and crypto before importing the model
vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal();

  const mockSchemaInstance = {
    _definition: {}, // To store the schema definition passed to constructor
    options: {},     // To store schema options
    pre: vi.fn(),
    virtual: vi.fn(function(name, options) {
      this.virtuals[name] = options.get; // Store virtual getter
      return this; // Chainable
    }),
    methods: {}, // To store instance methods
    statics: {}, // To store static methods
    index: vi.fn(),
    add: vi.fn(), // For sub-schemas like MessageSchema
    virtuals: {}, // To store virtual getters
  };

  const mockSchemaConstructor = vi.fn(function(definition, options) {
    // Reset mock methods for each new schema instance
    Object.assign(this, mockSchemaInstance);
    this._definition = definition;
    this.options = options;
    this.pre.mockClear();
    this.virtual.mockClear();
    this.index.mockClear();
    this.add.mockClear();
    this.methods = {};
    this.statics = {};
    this.virtuals = {};
  });

  // Mock query chain for static methods
  const mockQuery = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    exec: vi.fn(() => Promise.resolve([])), // Default to resolve empty array
    then: vi.fn((cb) => cb([])), // Make it thenable for direct promise resolution
  };

  const mockModel = {
    find: vi.fn(() => mockQuery),
    findOne: vi.fn(() => mockQuery),
    // Other methods can be added as needed
  };

  return {
    default: {
      Schema: mockSchemaConstructor,
      model: vi.fn((name, schema) => {
        // Attach static methods from the schema to the mock model
        Object.assign(mockModel, schema.statics);
        return mockModel;
      }),
      Types: {
        ObjectId: vi.fn(),
        Mixed: vi.fn(),
      },
    },
    Schema: mockSchemaConstructor, // Export Schema directly for convenience
  };
});

vi.mock('crypto', () => {
  const IV_LENGTH = 16;
  const MOCK_IV = Buffer.from('0123456789abcdef', 'hex'); // 16 bytes
  const MOCK_ENCRYPTED_PREFIX = 'mock_encrypted_';

  return {
    default: {
      randomBytes: vi.fn(() => MOCK_IV),
      createCipheriv: vi.fn((algo, key, iv) => ({
        update: vi.fn((text) => Buffer.from(MOCK_ENCRYPTED_PREFIX + text)),
        final: vi.fn(() => Buffer.from('')),
      })),
      createDecipheriv: vi.fn((algo, key, iv) => ({
        update: vi.fn((encrypted) => {
          const str = encrypted.toString();
          if (str.startsWith(MOCK_ENCRYPTED_PREFIX)) {
            return Buffer.from(str.substring(MOCK_ENCRYPTED_PREFIX.length));
          }
          return Buffer.from(str); // Fallback if not our mock encrypted text
        }),
        final: vi.fn(() => Buffer.from('')),
      })),
    },
  };
});

// Now import the module under test
import Conversation from '../conversation.model';

// Get the mocked Schema constructor
const MockMongooseSchema = mongoose.Schema;

describe('Conversation Model', () => {
  // Set a mock encryption key for consistent testing
  const originalEnvKey = process.env.CHAT_ENCRYPTION_KEY;
  const IV_LENGTH = 16;
  const MOCK_IV_HEX = '0123456789abcdef0123456789abcdef'; // MOCK_IV.toString('hex') + MOCK_IV.toString('hex')
  const MOCK_ENCRYPTED_PREFIX_HEX = Buffer.from('mock_encrypted_').toString('hex');

  beforeEach(() => {
    process.env.CHAT_ENCRYPTION_KEY = 'testkey123456789012345678901234'; // 32 chars
    vi.clearAllMocks();
    // Re-initialize schema instances to clear internal state for each test
    // This ensures that MockMongooseSchema.mock.calls and instances are fresh
    new MockMongooseSchema(); // For MessageSchema
    new MockMongooseSchema(); // For ConversationSchema
  });

  afterEach(() => {
    process.env.CHAT_ENCRYPTION_KEY = originalEnvKey;
  });

  // Helper functions to directly test the encryption/decryption logic
  // as they are not exported from the original file.
  const getEncryptionKey = () => process.env.CHAT_ENCRYPTION_KEY || '12345678901234567890123456789012';

  function testEncryptText(text) {
    if (!text || typeof text !== 'string') return text;
    if (text.includes(':') && text.split(':')[0].length === 32) return text;

    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(getEncryptionKey()), iv);
      let encrypted = cipher.update(text);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (err) {
      return text;
    }
  }

  function testDecryptText(text) {
    if (!text || typeof text !== 'string') return text;
    try {
      const textParts = text.split(':');
      if (textParts.length !== 2) return text;
      const iv = Buffer.from(textParts[0], 'hex');
      const encryptedText = Buffer.from(textParts[1], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(getEncryptionKey()), iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    } catch (err) {
      return text;
    }
  }

  describe('Encryption/Decryption Functions', () => {
    it('should encrypt text correctly', () => {
      const text = 'Hello, Vitest!';
      const encrypted = testEncryptText(text);
      const expectedEncryptedHex = MOCK_ENCRYPTED_PREFIX_HEX + Buffer.from(text).toString('hex');
      expect(encrypted).toBe(`${MOCK_IV_HEX}:${expectedEncryptedHex}`);
      expect(crypto.randomBytes).toHaveBeenCalledWith(IV_LENGTH);
      expect(crypto.createCipheriv).toHaveBeenCalledWith('aes-256-cbc', Buffer.from(getEncryptionKey()), Buffer.from('0123456789abcdef', 'hex'));
    });

    it('should decrypt text correctly', () => {
      const originalText = 'Hello, Vitest!';
      const encryptedText = `${MOCK_IV_HEX}:${MOCK_ENCRYPTED_PREFIX_HEX}${Buffer.from(originalText).toString('hex')}`;
      const decrypted = testDecryptText(encryptedText);
      expect(decrypted).toBe(originalText);
      expect(crypto.createDecipheriv).toHaveBeenCalledWith('aes-256-cbc', Buffer.from(getEncryptionKey()), Buffer.from('0123456789abcdef', 'hex'));
    });

    it('should return original text if encryption fails', () => {
      const text = 'Failed encryption test';
      crypto.createCipheriv.mockImplementationOnce(() => { throw new Error('Cipher error'); });
      const encrypted = testEncryptText(text);
      expect(encrypted).toBe(text);
    });

    it('should return original text if decryption fails', () => {
      const invalidEncryptedText = 'invalid:format';
      const decrypted = testDecryptText(invalidEncryptedText);
      expect(decrypted).toBe(invalidEncryptedText);

      const malformedEncryptedText = `${MOCK_IV_HEX}:malformedhex`;
      crypto.createDecipheriv.mockImplementationOnce(() => { throw new Error('Decipher error'); });
      const decryptedMalformed = testDecryptText(malformedEncryptedText);
      expect(decryptedMalformed).toBe(malformedEncryptedText);
    });

    it('should not re-encrypt already encrypted text (heuristic)', () => {
      const alreadyEncrypted = `${MOCK_IV_HEX}:somehexdata`;
      const encrypted = testEncryptText(alreadyEncrypted);
      expect(encrypted).toBe(alreadyEncrypted);
      expect(crypto.randomBytes).not.toHaveBeenCalled(); // Should skip encryption
    });

    it('should handle non-string input for encryption', () => {
      expect(testEncryptText(null)).toBe(null);
      expect(testEncryptText(undefined)).toBe(undefined);
      expect(testEncryptText(123)).toBe(123);
    });

    it('should handle non-string input for decryption', () => {
      expect(testDecryptText(null)).toBe(null);
      expect(testDecryptText(undefined)).toBe(undefined);
      expect(testDecryptText(123)).toBe(123);
    });
  });

  describe('MessageSchema Definition', () => {
    let messageSchemaDefinition;
    let messageSchemaOptions;

    beforeEach(() => {
      // The MessageSchema is the first call to MockMongooseSchema
      const messageSchemaCall = MockMongooseSchema.mock.calls[0];
      messageSchemaDefinition = messageSchemaCall[0];
      messageSchemaOptions = messageSchemaCall[1];
    });

    it('should define MessageSchema correctly', () => {
      expect(MockMongooseSchema).toHaveBeenCalledTimes(2); // One for Message, one for Conversation
      expect(messageSchemaDefinition).toBeDefined();
      expect(messageSchemaOptions).toEqual({
        _id: false,
        toJSON: { getters: true },
        toObject: { getters: true },
      });
    });

    it('should define role field', () => {
      const role = messageSchemaDefinition.role;
      expect(role).toEqual({
        type: String,
        enum: ['user', 'assistant', 'system'],
        required: true,
      });
    });

    it('should define content field with getters and setters', () => {
      const content = messageSchemaDefinition.content;
      expect(content).toBeDefined();
      expect(content.type).toBe(String);
      expect(content.required).toBe(true);
      expect(typeof content.get).toBe('function');
      expect(typeof content.set).toBe('function');
    });

    it('should encrypt content on set and decrypt on get', () => {
      const contentField = messageSchemaDefinition.content;
      const originalContent = 'This is a secret message.';

      // Simulate setter
      const encryptedContent = contentField.set(originalContent);
      const expectedEncryptedHex = MOCK_ENCRYPTED_PREFIX_HEX + Buffer.from(originalContent).toString('hex');
      expect(encryptedContent).toBe(`${MOCK_IV_HEX}:${expectedEncryptedHex}`);

      // Simulate getter
      const decryptedContent = contentField.get(encryptedContent);
      expect(decryptedContent).toBe(originalContent);
    });

    it('should define timestamp field', () => {
      const timestamp = messageSchemaDefinition.timestamp;
      expect(timestamp).toEqual({
        type: Date,
        default: Date.now,
      });
    });

    it('should define metadata field', () => {
      const metadata = messageSchemaDefinition.metadata;
      expect(metadata).toEqual({
        type: mongoose.Schema.Types.Mixed,
        default: {},
      });
    });
  });

  describe('ConversationSchema Definition', () => {
    let conversationSchemaDefinition;
    let conversationSchemaOptions;
    let conversationSchemaInstance;

    beforeEach(() => {
      // The ConversationSchema is the second call to MockMongooseSchema
      const conversationSchemaCall = MockMongooseSchema.mock.calls[1];
      conversationSchemaDefinition = conversationSchemaCall[0];
      conversationSchemaOptions = conversationSchemaCall[1];
      conversationSchemaInstance = MockMongooseSchema.mock.instances[1]; // Get the actual instance
    });

    it('should define ConversationSchema correctly', () => {
      expect(conversationSchemaDefinition).toBeDefined();
      expect(conversationSchemaOptions).toEqual({
        timestamps: true,
        versionKey: false,
        strict: false,
        toJSON: { getters: true },
        toObject: { getters: true },
      });
    });

    it('should define conversationId field', () => {
      const field = conversationSchemaDefinition.conversationId;
      expect(field).toEqual({
        type: String,
        required: true,
        unique: true,
        index: true,
      });
    });

    it('should define userId field', () => {
      const field = conversationSchemaDefinition.userId;
      expect(field).toEqual({
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
      });
    });

    it('should define knowledgebaseId field', () => {
      const field = conversationSchemaDefinition.knowledgebaseId;
      expect(field).toEqual({
        type: mongoose.Schema.Types.ObjectId,
        ref: 'KnowledgeBase',
        default: null,
        index: true,
      });
    });

    it('should define title field with getters and setters', () => {
      const titleField = conversationSchemaDefinition.title;
      expect(titleField).toBeDefined();
      expect(titleField.type).toBe(String);
      expect(titleField.default).toBe('New Conversation');
      expect(typeof titleField.get).toBe('function');
      expect(typeof titleField.set).toBe('function');
    });

    it('should encrypt title on set and decrypt on get', () => {
      const titleField = conversationSchemaDefinition.title;
      const originalTitle = 'My Awesome Conversation';

      // Simulate setter
      const encryptedTitle = titleField.set(originalTitle);
      const expectedEncryptedHex = MOCK_ENCRYPTED_PREFIX_HEX + Buffer.from(originalTitle).toString('hex');
      expect(encryptedTitle).toBe(`${MOCK_IV_HEX}:${expectedEncryptedHex}`);

      // Simulate getter
      const decryptedTitle = titleField.get(encryptedTitle);
      expect(decryptedTitle).toBe(originalTitle);
    });

    it('should define messages field as an array of MessageSchema', () => {
      const messagesField = conversationSchemaDefinition.messages;
      expect(messagesField).toBeInstanceOf(Array);
      expect(messagesField[0]).toBeInstanceOf(MockMongooseSchema); // Should be the MessageSchema instance
    });

    it('should define status field', () => {
      const field = conversationSchemaDefinition.status;
      expect(field).toEqual({
        type: String,
        enum: ['active', 'archived', 'deleted'],
        default: 'active',
      });
    });

    it('should define metadata field with sub-fields', () => {
      const field = conversationSchemaDefinition.metadata;
      expect(field.model).toEqual({ type: String });
      expect(field.temperature).toEqual({ type: Number });
      expect(field.maxTokens).toEqual({ type: Number });
      expect(field.tags).toEqual([{ type: String }]);
      expect(field.category).toEqual({ type: String });
      expect(field.customData).toEqual({ type: mongoose.Schema.Types.Mixed });
      expect(field.userType).toEqual({ type: String });
      expect(field.isGuest).toEqual({ type: Boolean, default: false });
    });

    it('should define documents_metadata field', () => {
      const field = conversationSchemaDefinition.documents_metadata;
      expect(field.documents).toEqual({ type: mongoose.Schema.Types.Mixed });
      expect(field.currentDocumentId).toEqual({ type: String });
    });

    it('should define contractMetadata field', () => {
      const field = conversationSchemaDefinition.contractMetadata;
      expect(field.generatedContract).toEqual({ type: String });
      expect(field.contractType).toEqual({ type: String });
      expect(field.contractParams).toEqual({ type: mongoose.Schema.Types.Mixed });
      expect(field.pendingQuestions).toEqual({ type: mongoose.Schema.Types.Mixed });
      expect(field.currentQuestionIndex).toEqual({ type: Number, default: 0 });
      expect(field.allQuestionsAnswered).toEqual({ type: Boolean, default: false });
      expect(field.contractGenerated).toEqual({ type: Boolean, default: false });
      expect(field.uploadedFiles).toEqual([{ type: mongoose.Schema.Types.Mixed }]);
      expect(field.currentDocumentId).toEqual({ type: String });
    });

    it('should define presentation_metadata field', () => {
      const field = conversationSchemaDefinition.presentation_metadata;
      expect(field).toEqual({ type: mongoose.Schema.Types.Mixed });
    });

    it('should define lastActivity field', () => {
      const field = conversationSchemaDefinition.lastActivity;
      expect(field).toEqual({ type: Date, default: Date.now });
    });

    it('should define messageCount field', () => {
      const field = conversationSchemaDefinition.messageCount;
      expect(field).toEqual({ type: Number, default: 0 });
    });

    it('should define isPublic field', () => {
      const field = conversationSchemaDefinition.isPublic;
      expect(field).toEqual({ type: Boolean, default: false });
    });

    it('should define is_deep_search field', () => {
      const field = conversationSchemaDefinition.is_deep_search;
      expect(field).toEqual({ type: Boolean, default: false });
    });

    it('should define is_saved field', () => {
      const field = conversationSchemaDefinition.is_saved;
      expect(field).toEqual({ type: Boolean, default: false });
    });

    it('should define tenantId field', () => {
      const field = conversationSchemaDefinition.tenantId;
      expect(field).toEqual({
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        default: null,
        index: true,
      });
    });

    it('should define indexes', () => {
      // Total indexes: 4 from field definitions + 13 explicit calls = 17
      // However, the mock `index` method is called for each `index: true` in the schema definition
      // and then again for explicit `ConversationSchema.index` calls.
      // Let's count the explicit calls only, as field-level indexes are implicitly handled by Mongoose.
      // The explicit calls are 13.
      expect(conversationSchemaInstance.index).toHaveBeenCalledTimes(13);

      // Custom indexes
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ tenantId: 1, userId: 1, createdAt: -1 });
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ tenantId: 1, userId: 1, status: 1 });
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ tenantId: 1, userId: 1, knowledgebaseId: 1 });
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ tenantId: 1, knowledgebaseId: 1, status: 1 });
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ tenantId: 1, 'metadata.category': 1 });
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ tenantId: 1, lastActivity: -1 });
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ tenantId: 1, userId: 1, is_deep_search: 1 });
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ userId: 1, createdAt: -1 });
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ userId: 1, status: 1 });
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ userId: 1, knowledgebaseId: 1 });
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ knowledgebaseId: 1, status: 1 });
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ 'metadata.category': 1 });
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ lastActivity: -1 });
      expect(conversationSchemaInstance.index).toHaveBeenCalledWith({ userId: 1, is_deep_search: 1 });
    });
  });

  describe('ConversationSchema Hooks and Virtuals', () => {
    let conversationSchemaInstance;
    beforeEach(() => {
      conversationSchemaInstance = MockMongooseSchema.mock.instances[1];
    });

    it('should define a pre-save hook for messages', () => {
      expect(conversationSchemaInstance.pre).toHaveBeenCalledWith('save', expect.any(Function));
    });

    it('pre-save hook should update lastActivity and messageCount if messages are modified', () => {
      const preSaveHook = conversationSchemaInstance.pre.mock.calls.find(call => call[0] === 'save')[1];
      const mockDoc = {
        messages: [{ content: 'msg1' }],
        isModified: vi.fn((field) => field === 'messages'),
        lastActivity: new Date('2023-01-01T00:00:00.000Z'),
        messageCount: 0,
      };
      const next = vi.fn();

      preSaveHook.call(mockDoc, next);

      expect(mockDoc.isModified).toHaveBeenCalledWith('messages');
      expect(mockDoc.lastActivity).toBeInstanceOf(Date);
      expect(mockDoc.lastActivity.getTime()).toBeGreaterThan(new Date('2023-01-01T00:00:00.000Z').getTime());
      expect(mockDoc.messageCount).toBe(1);
      expect(next).toHaveBeenCalled();
    });

    it('pre-save hook should not update lastActivity and messageCount if messages are not modified', () => {
      const preSaveHook = conversationSchemaInstance.pre.mock.calls.find(call => call[0] === 'save')[1];
      const mockDoc = {
        messages: [{ content: 'msg1' }],
        isModified: vi.fn((field) => field !== 'messages'),
        lastActivity: new Date('2023-01-01T00:00:00.000Z'),
        messageCount: 0,
      };
      const next = vi.fn();

      preSaveHook.call(mockDoc, next);

      expect(mockDoc.isModified).toHaveBeenCalledWith('messages');
      expect(mockDoc.lastActivity.getTime()).toBe(new Date('2023-01-01T00:00:00.000Z').getTime());
      expect(mockDoc.messageCount).toBe(0);
      expect(next).toHaveBeenCalled();
    });

    it('should define a virtual for url', () => {
      expect(conversationSchemaInstance.virtual).toHaveBeenCalledWith('url', expect.any(Object));
      expect(conversationSchemaInstance.virtuals.url).toBeInstanceOf(Function);
    });

    it('virtual url should return the correct URL', () => {
      const urlGetter = conversationSchemaInstance.virtuals.url;
      const mockDoc = { conversationId: 'conv123' };
      expect(urlGetter.call(mockDoc)).toBe('/conversations/conv123');
    });
  });

  describe('ConversationSchema Instance Methods', () => {
    let conversationSchemaInstance;
    let mockConversationDoc;

    beforeEach(() => {
      conversationSchemaInstance = MockMongooseSchema.mock.instances[1];
      mockConversationDoc = {
        messages: [],
        lastActivity: new Date('2023-01-01T00:00:00.000Z'),
        messageCount: 0,
      };
      Object.assign(mockConversationDoc, conversationSchemaInstance.methods); // Attach methods
    });

    it('should have an addMessage method', () => {
      expect(conversationSchemaInstance.methods.addMessage).toBeInstanceOf(Function);
    });

    it('addMessage should add a new message and update activity/count', () => {
      const initialMessageCount = mockConversationDoc.messages.length;
      const initialLastActivity = mockConversationDoc.lastActivity;

      mockConversationDoc.addMessage('user', 'Hello there!', { source: 'web' });

      expect(mockConversationDoc.messages).toHaveLength(initialMessageCount + 1);
      const newMessage = mockConversationDoc.messages[0];
      expect(newMessage.role).toBe('user');
      expect(newMessage.content).toBe('Hello there!'); // Content is not encrypted here, as it's a direct push
      expect(newMessage.metadata).toEqual({ source: 'web' });
      expect(newMessage.timestamp).toBeInstanceOf(Date);
      expect(mockConversationDoc.lastActivity.getTime()).toBeGreaterThan(initialLastActivity.getTime());
      expect(mockConversationDoc.messageCount).toBe(initialMessageCount + 1);
    });

    it('should have a getRecentMessages method', () => {
      expect(conversationSchemaInstance.methods.getRecentMessages).toBeInstanceOf(Function);
    });

    it('getRecentMessages should return the latest messages with default limit', () => {
      mockConversationDoc.messages = [
        { role: 'user', content: 'msg1', timestamp: new Date('2023-01-01'), metadata: {} },
        { role: 'assistant', content: 'msg2', timestamp: new Date('2023-01-02'), metadata: {} },
        { role: 'user', content: 'msg3', timestamp: new Date('2023-01-03'), metadata: {} },
        { role: 'assistant', content: 'msg4', timestamp: new Date('2023-01-04'), metadata: {} },
        { role: 'user', content: 'msg5', timestamp: new Date('2023-01-05'), metadata: {} },
        { role: 'assistant', content: 'msg6', timestamp: new Date('2023-01-06'), metadata: {} },
        { role: 'user', content: 'msg7', timestamp: new Date('2023-01-07'), metadata: {} },
        { role: 'assistant', content: 'msg8', timestamp: new Date('2023-01-08'), metadata: {} },
        { role: 'user', content: 'msg9', timestamp: new Date('2023-01-09'), metadata: {} },
        { role: 'assistant', content: 'msg10', timestamp: new Date('2023-01-10'), metadata: {} },
        { role: 'user', content: 'msg11', timestamp: new Date('2023-01-11'), metadata: {} },
        { role: 'assistant', content: 'msg12', timestamp: new Date('2023-01-12'), metadata: {} },
      ];

      const recentMessages = mockConversationDoc.getRecentMessages(); // Default limit 10
      expect(recentMessages).toHaveLength(10);
      expect(recentMessages[0].content).toBe('msg3'); // Should be msg3 to msg12
      expect(recentMessages[9].content).toBe('msg12');
    });

    it('getRecentMessages should return the latest messages with a custom limit', () => {
      mockConversationDoc.messages = [
        { role: 'user', content: 'msg1', timestamp: new Date('2023-01-01'), metadata: {} },
        { role: 'assistant', content: 'msg2', timestamp: new Date('2023-01-02'), metadata: {} },
        { role: 'user', content: 'msg3', timestamp: new Date('2023-01-03'), metadata: {} },
      ];

      const recentMessages = mockConversationDoc.getRecentMessages(2);
      expect(recentMessages).toHaveLength(2);
      expect(recentMessages[0].content).toBe('msg2');
      expect(recentMessages[1].content).toBe('msg3');
    });

    it('getRecentMessages should return all messages if limit is greater than total messages', () => {
      mockConversationDoc.messages = [
        { role: 'user', content: 'msg1', timestamp: new Date('2023-01-01'), metadata: {} },
        { role: 'assistant', content: 'msg2', timestamp: new Date('2023-01-02'), metadata: {} },
      ];

      const recentMessages = mockConversationDoc.getRecentMessages(5);
      expect(recentMessages).toHaveLength(2);
      expect(recentMessages[0].content).toBe('msg1');
      expect(recentMessages[1].content).toBe('msg2');
    });

    it('getRecentMessages should return empty array if no messages', () => {
      mockConversationDoc.messages = [];
      const recentMessages = mockConversationDoc.getRecentMessages();
      expect(recentMessages).toHaveLength(0);
    });
  });

  describe('ConversationSchema Static Methods', () => {
    let mockConversationModel;
    let mockQuery;

    beforeEach(() => {
      // Get the mock model returned by mongoose.model
      mockConversationModel = mongoose.model('Conversation');
      // Get a fresh mock query object for each test
      mockQuery = {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        exec: vi.fn(() => Promise.resolve([])),
        then: vi.fn((cb) => cb([])),
      };
      mockConversationModel.find.mockReturnValue(mockQuery);
      mockConversationModel.findOne.mockReturnValue(mockQuery);
    });

    it('should have a findActiveByUser method', () => {
      expect(mockConversationModel.findActiveByUser).toBeInstanceOf(Function);
    });

    it('findActiveByUser should query for active conversations by userId with default options', async () => {
      const userId = 'user123';
      await mockConversationModel.findActiveByUser(userId);

      expect(mockConversationModel.find).toHaveBeenCalledWith({ userId, status: 'active' });
      expect(mockQuery.sort).toHaveBeenCalledWith({ lastActivity: -1 });
      expect(mockQuery.limit).toHaveBeenCalledWith(20);
      expect(mockQuery.skip).toHaveBeenCalledWith(0);
      expect(mockQuery.select).toHaveBeenCalledWith('-messages');
      expect(mockQuery.exec).toHaveBeenCalled();
    });

    it('findActiveByUser should apply custom options', async () => {
      const userId = 'user123';
      const options = {
        limit: 5,
        skip: 10,
        sortBy: 'createdAt',
        sortOrder: 1,
      };
      await mockConversationModel.findActiveByUser(userId, options);

      expect(mockConversationModel.find).toHaveBeenCalledWith({ userId, status: 'active' });
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: 1 });
      expect(mockQuery.limit).toHaveBeenCalledWith(5);
      expect(mockQuery.skip).toHaveBeenCalledWith(10);
      expect(mockQuery.select).toHaveBeenCalledWith('-messages');
      expect(mockQuery.exec).toHaveBeenCalled();
    });

    it('should have a findByConversationId method', () => {
      expect(mockConversationModel.findByConversationId).toBeInstanceOf(Function);
    });

    it('findByConversationId should find by conversationId only', async () => {
      const conversationId = 'conv456';
      await mockConversationModel.findByConversationId(conversationId);

      expect(mockConversationModel.findOne).toHaveBeenCalledWith({ conversationId });
      expect(mockQuery.exec).toHaveBeenCalled();
    });

    it('findByConversationId should find by conversationId and userId', async () => {
      const conversationId = 'conv456';
      const userId = 'user123';
      await mockConversationModel.findByConversationId(conversationId, userId);

      expect(mockConversationModel.findOne).toHaveBeenCalledWith({ conversationId, userId });
      expect(mockQuery.exec).toHaveBeenCalled();
    });
  });
});