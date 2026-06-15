import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external dependencies
// Mock passport-apple to capture constructor arguments and the verify callback
const AppleStrategyConstructorMock = vi.fn().mockImplementation((options, verifyCallback) => {
  // Store options and verifyCallback for testing
  AppleStrategyConstructorMock.mock.lastCallOptions = options;
  AppleStrategyConstructorMock.mock.lastCallVerifyCallback = verifyCallback;
  // Return a minimal mock object that represents the strategy instance
  // This is what will be assigned to `strategy` in the original file
  return {
    name: 'apple', // A typical property of a Passport strategy
    authenticate: vi.fn(), // A typical method
  };
});

vi.mock('passport-apple', () => ({
  default: AppleStrategyConstructorMock,
}));

const {
  mockFindOrCreateUserModel
} = vi.hoisted(() => {
  // Mock the utility function
  const mockFindOrCreateUserModel = vi.fn();

  return {
    mockFindOrCreateUserModel
  };
});
vi.mock('../../social-login.utils.js', () => ({
  findOrCreateUserModel: mockFindOrCreateUserModel,
}));

// Store original process.env
const originalEnv = process.env;

describe('Apple Passport Strategy', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Reset the stored options/callback on the constructor mock
    AppleStrategyConstructorMock.mock.lastCallOptions = undefined;
    AppleStrategyConstructorMock.mock.lastCallVerifyCallback = undefined;

    // Set up a default mock environment for tests that don't explicitly override
    process.env = {
      ...originalEnv, // Keep existing env vars
      APPLE_CLIENT_ID: 'defaultClientId',
      APPLE_TEAM_ID: 'defaultTeamId',
      APPLE_KEY_ID: 'defaultKeyId',
      APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nDEFAULT_KEY_CONTENT\\n-----END PRIVATE KEY-----',
      APPLE_CALLBACK_URL: 'http://default.com/callback',
    };
  });

  afterEach(() => {
    process.env = originalEnv; // Restore original env
  });

  // Test strategy configuration
  it('should configure AppleStrategy with correct options from environment variables', async () => {
    // Ensure specific env vars for this test
    process.env.APPLE_CLIENT_ID = 'testClientId';
    process.env.APPLE_TEAM_ID = 'testTeamId';
    process.env.APPLE_KEY_ID = 'testKeyId';
    process.env.APPLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nTEST_KEY_CONTENT\\n-----END PRIVATE KEY-----';
    process.env.APPLE_CALLBACK_URL = 'http://test.com/callback';

    // Clear module cache and re-import to ensure it picks up the new env vars
    vi.resetModules();
    await import('../src/app/modules/social-login/config/strategies/apple.js');

    // Assert that AppleStrategy constructor was called
    expect(AppleStrategyConstructorMock).toHaveBeenCalledTimes(1);

    // Assert the options passed to the constructor
    const options = AppleStrategyConstructorMock.mock.lastCallOptions;
    expect(options).toBeDefined();
    expect(options.clientID).toBe('testClientId');
    expect(options.teamID).toBe('testTeamId');
    expect(options.keyID).toBe('testKeyId');
    // Verify privateKeyString transformation
    expect(options.privateKeyString).toBe('-----BEGIN PRIVATE KEY-----\nTEST_KEY_CONTENT\n-----END PRIVATE KEY-----');
    expect(options.callbackURL).toBe('http://test.com/callback');
    expect(options.scope).toEqual(['name', 'email']);
  });

  it('should use default callbackURL if APPLE_CALLBACK_URL is not set', async () => {
    // Delete the specific env var to test the fallback
    delete process.env.APPLE_CALLBACK_URL;

    vi.resetModules();
    await import('../src/app/modules/social-login/config/strategies/apple.js');

    const options = AppleStrategyConstructorMock.mock.lastCallOptions;
    expect(options.callbackURL).toBe('/api/v1/auth-social/apple/callback');
  });

  // Test the verify callback function
  describe('verify callback', () => {
    let done;
    let verifyCallback;

    beforeEach(async () => {
      // Ensure the strategy is initialized and we capture its verify callback
      // Use default env vars set in the outer beforeEach
      vi.resetModules(); // Ensure module is re-evaluated with current process.env
      await import('../src/app/modules/social-login/config/strategies/apple.js');
      verifyCallback = AppleStrategyConstructorMock.mock.lastCallVerifyCallback;
      done = vi.fn(); // Mock the done callback for each test
    });

    it('should call findOrCreateUserModel and return user on success', async () => {
      const mockProfile = {
        id: 'appleId123',
        name: { firstName: 'John', lastName: 'Doe' },
        email: 'john.doe@example.com',
      };
      const mockUser = { _id: 'dbUserId123', email: 'john.doe@example.com' };
      mockFindOrCreateUserModel.mockResolvedValueOnce({ user: mockUser });

      await verifyCallback('accessToken', 'refreshToken', 'idToken', mockProfile, done);

      expect(mockFindOrCreateUserModel).toHaveBeenCalledWith(mockProfile, 'apple');
      expect(done).toHaveBeenCalledWith(null, mockUser);
      expect(done).toHaveBeenCalledTimes(1);
    });

    it('should call done with error if findOrCreateUserModel fails', async () => {
      const mockProfile = {
        id: 'appleId123',
        name: { firstName: 'John', lastName: 'Doe' },
        email: 'john.doe@example.com',
      };
      const mockError = new Error('Database error');
      mockFindOrCreateUserModel.mockRejectedValueOnce(mockError);

      await verifyCallback('accessToken', 'refreshToken', 'idToken', mockProfile, done);

      expect(mockFindOrCreateUserModel).toHaveBeenCalledWith(mockProfile, 'apple');
      expect(done).toHaveBeenCalledWith(mockError, null);
      expect(done).toHaveBeenCalledTimes(1);
    });
  });
});