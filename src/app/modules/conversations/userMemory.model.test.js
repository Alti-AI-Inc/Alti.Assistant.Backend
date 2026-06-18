import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import crypto from 'crypto';

// Mock process.exit and console.error/warn to prevent test suite from exiting
const mockExit = vi.fn();
const mockConsoleError = vi.fn();
const mockConsoleWarn = vi.fn();

// Store original values to restore later
const originalProcessEnv = process.env;
const originalProcessExit = process.exit;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Mock Mongoose
const mockSchemaInstance = {
  index: vi.fn(),
};

const {
  mockSchema,
  mockModel,
  mockRandomBytes,
  mockCreateCipheriv,
  mockCreateDecipheriv
} = vi.hoisted(() => {
  const mockSchema = vi.fn().mockImplementation(function() { return mockSchemaInstance; });
  const mockModel = vi.fn().mockImplementation(function() { return mockModelInstance; });

  // Mock crypto functions
  const mockRandomBytes = vi.fn();
  const mockCreateCipheriv = vi.fn();
  const mockCreateDecipheriv = vi.fn();

  return {
    mockSchema,
    mockModel,
    mockRandomBytes,
    mockCreateCipheriv,
    mockCreateDecipheriv
  };
});

const mockModelInstance = {
  find: vi.fn(),
  create: vi.fn(),
};

vi.mock('mongoose', () => ({
  Schema: mockSchema,
  model: mockModel,
}));

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
  config: vi.fn(),
}));

vi.mock('crypto', async (importOriginal) => {
  const actualCrypto = await importOriginal();
  const mockedCrypto = {
    ...actualCrypto,
    randomBytes: mockRandomBytes,
    createCipheriv: mockCreateCipheriv,
    createDecipheriv: mockCreateDecipheriv,
  };
  return {
    ...mockedCrypto,
    default: mockedCrypto,
  };
});

// Helper for mocking crypto cipher/decipher streams
const mockCipherStream = {
  update: vi.fn().mockImplementation((data, inputEnc, outputEnc) => {
    const buf = Buffer.from(`encrypted_${data}`);
    return outputEnc === 'hex' ? buf.toString('hex') : buf;
  }),
  final: vi.fn().mockImplementation((outputEnc) => {
    const buf = Buffer.from('final');
    return outputEnc === 'hex' ? buf.toString('hex') : buf;
  }),
  getAuthTag: vi.fn().mockReturnValue(Buffer.from('cdefcdefcdefcdef')), // 16 bytes
};
const mockDecipherStream = {
  update: vi.fn().mockImplementation((data, inputEnc, outputEnc) => {
    const buf = Buffer.from(`decrypted_${data}`);
    return outputEnc === 'utf8' ? buf.toString('utf8') : buf;
  }),
  final: vi.fn().mockImplementation((outputEnc) => {
    const buf = Buffer.from('final');
    return outputEnc === 'utf8' ? buf.toString('utf8') : buf;
  }),
  setAuthTag: vi.fn(),
};

async function importModel(t) {
  if (t === 1) return import('./userMemory.model.js?t=1');
  if (t === 2) return import('./userMemory.model.js?t=2');
  if (t === 3) return import('./userMemory.model.js?t=3');
  if (t === 4) return import('./userMemory.model.js?t=4');
  return import('./userMemory.model.js');
}

describe('userMemory.model encryption key validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Temporarily override process.exit and console methods
    Object.defineProperty(process, 'exit', { value: mockExit, configurable: true });
    console.error = mockConsoleError;
    console.warn = mockConsoleWarn;
    // Reset process.env for each test
    process.env = { ...originalProcessEnv };
  });

  afterEach(() => {
    // Restore original process.exit and console methods
    Object.defineProperty(process, 'exit', { value: originalProcessExit, configurable: true });
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    // Restore original process.env
    process.env = originalProcessEnv;
  });

  it('should fallback if CHAT_ENCRYPTION_KEY is not set', async () => {
    delete process.env.CHAT_ENCRYPTION_KEY;
    await importModel(1);
    expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('CHAT_ENCRYPTION_KEY environment variable is not set'));
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should fallback if CHAT_ENCRYPTION_KEY is not 32 characters long', async () => {
    process.env.CHAT_ENCRYPTION_KEY = 'shortkey'; // Not 32 chars
    await importModel(2);
    expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('CHAT_ENCRYPTION_KEY must resolve to exactly 32 bytes'));
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should not warn if CHAT_ENCRYPTION_KEY is set and valid', async () => {
    process.env.CHAT_ENCRYPTION_KEY = 'a'.repeat(32); // Valid 32-char key
    // Re-import the module to ensure it runs without exiting
    const { default: UserMemory } = await importModel(3);
    expect(mockConsoleWarn).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();
    expect(UserMemory).toBeDefined(); // Ensure the module loaded successfully
  });
});

// Set a valid key for the rest of the tests to ensure the module loads successfully
process.env.CHAT_ENCRYPTION_KEY = 'a'.repeat(32);

let UserMemoryModule;
let schemaDefinition;
let schemaOptions;

describe('userMemory.model core logic', () => {
  beforeAll(async () => {
    // Clear mock Schema and Model calls from the validation tests so we start clean
    mockSchema.mockClear();
    mockModel.mockClear();
    mockSchemaInstance.index.mockClear();

    // Dynamically import the module after setting the environment variable
    UserMemoryModule = await importModel(4);
    // Get the schema definition and options from the mock call
    schemaDefinition = mockSchema.mock.calls[0][0];
    schemaOptions = mockSchema.mock.calls[0][1];
  });

  beforeEach(() => {
    // Reset crypto mocks individually to preserve mockSchema/mockModel/mockSchemaInstance calls
    mockRandomBytes.mockReset();
    mockRandomBytes.mockReturnValue(Buffer.from('0123456789ab')); // 12-byte IV for GCM
    mockCreateCipheriv.mockReset();
    mockCreateCipheriv.mockReturnValue(mockCipherStream);
    mockCreateDecipheriv.mockReset();
    mockCreateDecipheriv.mockReturnValue(mockDecipherStream);
    mockCipherStream.update.mockClear();
    mockCipherStream.final.mockClear();
    mockCipherStream.getAuthTag.mockClear();
    mockDecipherStream.update.mockClear();
    mockDecipherStream.final.mockClear();
    mockDecipherStream.setAuthTag.mockClear();

    // Keep console methods mocked to assert on errors/warnings, but clear their call histories
    console.error = mockConsoleError;
    console.warn = mockConsoleWarn;
    mockConsoleError.mockClear();
    mockConsoleWarn.mockClear();
  });

  // --- Test `value` field setter (which uses encryptText) ---
  describe('userMemorySchema value setter (encryptText logic)', () => {
    it('should encrypt a given string when set', () => {
      const plainText = 'hello world';
      const expectedIvHex = '303132333435363738396162'; // '0123456789ab' in hex (12 bytes)
      const expectedTagHex = '63646566636465666364656663646566'; // 'cdefcdefcdefcdef' in hex (16 bytes)
      const expectedEncryptedHex = Buffer.from('encrypted_hello worldfinal').toString('hex');

      // Call the setter function directly from the schema definition
      const result = schemaDefinition.value.set(plainText);

      expect(mockRandomBytes).toHaveBeenCalledWith(12);
      expect(mockCreateCipheriv).toHaveBeenCalledWith('aes-256-gcm', Buffer.from('a'.repeat(32)), Buffer.from('0123456789ab'));
      expect(mockCipherStream.update).toHaveBeenCalledWith(plainText, 'utf8', 'hex');
      expect(mockCipherStream.final).toHaveBeenCalled();
      expect(result).toBe(`${expectedIvHex}:${expectedTagHex}:${expectedEncryptedHex}`);
    });

    it('should return non-string input as is when set', () => {
      expect(schemaDefinition.value.set(null)).toBe(null);
      expect(schemaDefinition.value.set(undefined)).toBe(undefined);
      expect(schemaDefinition.value.set(123)).toBe(123);
      expect(schemaDefinition.value.set({})).toEqual({});
    });

    it('should return an empty string as is when set', () => {
      expect(schemaDefinition.value.set('')).toBe('');
    });

    it('should prevent double encryption if text already looks encrypted when set', () => {
      // Modern GCM format: iv (12 bytes/24 hex) + tag (16 bytes/32 hex) + ciphertext
      const alreadyEncrypted = '303132333435363738396162:63646566636465666364656663646566:somehexdata';
      const result = schemaDefinition.value.set(alreadyEncrypted);
      expect(mockRandomBytes).not.toHaveBeenCalled();
      expect(result).toBe(alreadyEncrypted);
    });

    it('should throw an error if encryption fails when set', () => {
      mockCreateCipheriv.mockImplementation(() => { throw new Error('Cipher error'); });
      expect(() => schemaDefinition.value.set('fail me')).toThrow('Failed to encrypt data.');
      expect(mockConsoleError).toHaveBeenCalledWith('Encryption failed:', expect.any(Error));
    });
  });

  // --- Test `value` field getter (which uses decryptText) ---
  describe('userMemorySchema value getter (decryptText logic)', () => {
    // Legacy CBC
    const LEGACY_IV_HEX = '30313233343536373839616263646566'; // '0123456789abcdef' in hex (16 bytes)
    const LEGACY_ENCRYPTED_HEX = Buffer.from('encrypted_hello worldfinal').toString('hex');
    const LEGACY_ENCRYPTED_STRING = `${LEGACY_IV_HEX}:${LEGACY_ENCRYPTED_HEX}`;
    
    // Modern GCM
    const GCM_IV_HEX = '303132333435363738396162'; // 12 bytes
    const GCM_TAG_HEX = '63646566636465666364656663646566'; // 16 bytes
    const GCM_ENCRYPTED_HEX = Buffer.from('encrypted_hello worldfinal').toString('hex');
    const GCM_ENCRYPTED_STRING = `${GCM_IV_HEX}:${GCM_TAG_HEX}:${GCM_ENCRYPTED_HEX}`;
    
    const DECRYPTED_TEXT = 'decrypted_encrypted_hello worldfinalfinal'; // Based on mock decipher stream

    it('should decrypt a valid legacy CBC encrypted string when get', () => {
      const result = schemaDefinition.value.get(LEGACY_ENCRYPTED_STRING);

      expect(mockCreateDecipheriv).toHaveBeenCalledWith('aes-256-cbc', Buffer.from('a'.repeat(32)), Buffer.from(LEGACY_IV_HEX, 'hex'));
      expect(mockDecipherStream.update).toHaveBeenCalledWith(Buffer.from(LEGACY_ENCRYPTED_HEX, 'hex'), 'hex', 'utf8');
      expect(mockDecipherStream.final).toHaveBeenCalled();
      expect(result).toBe(DECRYPTED_TEXT);
    });

    it('should decrypt a valid modern GCM encrypted string when get', () => {
      const result = schemaDefinition.value.get(GCM_ENCRYPTED_STRING);

      expect(mockCreateDecipheriv).toHaveBeenCalledWith('aes-256-gcm', Buffer.from('a'.repeat(32)), Buffer.from(GCM_IV_HEX, 'hex'));
      expect(mockDecipherStream.setAuthTag).toHaveBeenCalledWith(Buffer.from(GCM_TAG_HEX, 'hex'));
      expect(mockDecipherStream.update).toHaveBeenCalledWith(Buffer.from(GCM_ENCRYPTED_HEX, 'hex'), 'hex', 'utf8');
      expect(mockDecipherStream.final).toHaveBeenCalled();
      expect(result).toBe(DECRYPTED_TEXT);
    });

    it('should return non-string input as is when get', () => {
      expect(schemaDefinition.value.get(null)).toBe(null);
      expect(schemaDefinition.value.get(undefined)).toBe(undefined);
      expect(schemaDefinition.value.get(123)).toBe(123);
      expect(schemaDefinition.value.get({})).toEqual({});
    });

    it('should return an empty string as is when get', () => {
      expect(schemaDefinition.value.get('')).toBe('');
    });

    it('should return original text if format is invalid (no colon) when get', () => {
      const invalidText = 'justplainstring';
      const result = schemaDefinition.value.get(invalidText);
      expect(mockCreateDecipheriv).not.toHaveBeenCalled();
      expect(result).toBe(invalidText);
    });

    it('should return original text if format is invalid (wrong IV length) when get', () => {
      const invalidText = 'shortiv:somehexdata';
      const result = schemaDefinition.value.get(invalidText);
      expect(mockCreateDecipheriv).not.toHaveBeenCalled();
      expect(result).toBe(invalidText);
    });

    it('should return original text and log a warning if decryption fails when get', () => {
      mockCreateDecipheriv.mockImplementation(() => { throw new Error('Decipher error'); });
      const result = schemaDefinition.value.get(GCM_ENCRYPTED_STRING);
      expect(mockConsoleWarn).toHaveBeenCalledWith('Decryption failed, returning original text:', expect.any(Error));
      expect(result).toBe(GCM_ENCRYPTED_STRING);
    });
  });

  // --- Test Mongoose Schema definition ---
  describe('userMemorySchema definition', () => {
    it('should define the UserMemory schema correctly', () => {
      expect(mockSchema).toHaveBeenCalledTimes(1);

      // Check fields
      expect(schemaDefinition.userId).toEqual({ type: String, required: true });
      expect(schemaDefinition.key).toEqual({ type: String, required: true });
      expect(schemaDefinition.value.type).toBe(String);
      expect(schemaDefinition.value.required).toBe(true);
      expect(schemaDefinition.value.get).toBeInstanceOf(Function);
      expect(schemaDefinition.value.set).toBeInstanceOf(Function);
      expect(schemaDefinition.category).toEqual({ type: String, enum: ['facts', 'preferences', 'settings'], default: 'facts' });
      expect(schemaDefinition.confidence).toEqual({ type: Number, default: 1.0 });

      // Check options
      expect(schemaOptions.timestamps).toBe(true);
      expect(schemaOptions.collection).toBe('user_memories');
      expect(schemaOptions.toJSON).toEqual({ getters: true });
      expect(schemaOptions.toObject).toEqual({ getters: true });
    });

    it('should define a unique index on userId and key', () => {
      expect(mockSchemaInstance.index).toHaveBeenCalledWith({ userId: 1, key: 1 }, { unique: true });
    });
  });

  // --- Test Mongoose Model creation ---
  describe('UserMemory model', () => {
    it('should create the UserMemory model and export it', () => {
      expect(mockModel).toHaveBeenCalledWith('UserMemory', mockSchemaInstance);
      expect(UserMemoryModule.default).toBe(mockModelInstance);
    });
  });
});