import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks ---
// Mock the findOrCreateUserModel utility
const mockFindOrCreateUserModel = vi.fn();
vi.mock('../../social-login.utils.js', () => ({
  findOrCreateUserModel: mockFindOrCreateUserModel,
}));

// Mock the passport-microsoft Strategy
let capturedConfig;
let capturedVerifyCallback;
const mockMicrosoftStrategy = vi.fn((config, verifyCallback) => {
  capturedConfig = config;
  capturedVerifyCallback = verifyCallback;
});
vi.mock('passport-microsoft', () => ({
  Strategy: mockMicrosoftStrategy,
}));

// --- Test Suite ---
describe('Microsoft Passport Strategy (microsoft.js)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset mocks and environment variables before each test
    vi.resetModules(); // Important to re-evaluate the module with new env vars
    mockMicrosoftStrategy.mockClear();
    mockFindOrCreateUserModel.mockClear();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('Strategy Configuration', () => {
    it('should instantiate MicrosoftStrategy with configuration from environment variables', async () => {
      process.env.MICROSOFT_CLIENT_ID = 'test-ms-client-id';
      process.env.MICROSOFT_CLIENT_SECRET = 'test-ms-client-secret';
      process.env.MICROSOFT_CALLBACK_URL = 'https://test.com/callback';

      await import('./microsoft.js');

      expect(mockMicrosoftStrategy).toHaveBeenCalledOnce();
      expect(capturedConfig).toBeDefined();
      expect(capturedConfig.clientID).toBe('test-ms-client-id');
      expect(capturedConfig.clientSecret).toBe('test-ms-client-secret');
      expect(capturedConfig.callbackURL).toBe('https://test.com/callback');
      expect(capturedConfig.scope).toEqual(['profile', 'email']);
      expect(capturedConfig.proxy).toBe(true);
    });

    it('should use a default callbackURL if not provided in environment variables', async () => {
      process.env.MICROSOFT_CLIENT_ID = 'test-ms-client-id';
      process.env.MICROSOFT_CLIENT_SECRET = 'test-ms-client-secret';
      delete process.env.MICROSOFT_CALLBACK_URL;

      await import('./microsoft.js');

      expect(mockMicrosoftStrategy).toHaveBeenCalledOnce();
      expect(capturedConfig).toBeDefined();
      expect(capturedConfig.callbackURL).toBe('/api/v1/auth-social/microsoft/callback');
    });
  });

  describe('Verify Callback Logic', () => {
    const mockAccessToken = 'mock-access-token';
    const mockRefreshToken = 'mock-refresh-token';
    const mockProfile = {
      id: 'microsoft12345',
      displayName: 'Microsoft User',
      emails: [{ value: 'ms.user@example.com' }],
      provider: 'microsoft',
    };
    const mockDone = vi.fn();

    beforeEach(async () => {
      // Ensure the strategy is imported and the callback is captured
      process.env.MICROSOFT_CLIENT_ID = 'test-ms-client-id';
      process.env.MICROSOFT_CLIENT_SECRET = 'test-ms-client-secret';
      await import('./microsoft.js');
      mockDone.mockClear();
    });

    it('should call done(null, user) on successful user creation/retrieval', async () => {
      const mockUser = {
        id: 'db-user-id-123',
        name: 'Microsoft User',
        email: 'ms.user@example.com',
        role: 'user', // This file does not check roles, but we can verify the user object is passed correctly
      };
      mockFindOrCreateUserModel.mockResolvedValue(mockUser);

      await capturedVerifyCallback(mockAccessToken, mockRefreshToken, mockProfile, mockDone);

      expect(mockFindOrCreateUserModel).toHaveBeenCalledOnce();
      expect(mockFindOrCreateUserModel).toHaveBeenCalledWith(mockProfile, 'microsoft');
      expect(mockDone).toHaveBeenCalledOnce();
      expect(mockDone).toHaveBeenCalledWith(null, mockUser);
    });

    it('should call done(err, null) when findOrCreateUserModel throws an error', async () => {
      const mockError = new Error('Database connection failed');
      mockFindOrCreateUserModel.mockRejectedValue(mockError);

      await capturedVerifyCallback(mockAccessToken, mockRefreshToken, mockProfile, mockDone);

      expect(mockFindOrCreateUserModel).toHaveBeenCalledOnce();
      expect(mockFindOrCreateUserModel).toHaveBeenCalledWith(mockProfile, 'microsoft');
      expect(mockDone).toHaveBeenCalledOnce();
      expect(mockDone).toHaveBeenCalledWith(mockError, null);
    });

    it('should correctly pass context boundaries to findOrCreateUserModel', async () => {
      const differentProfile = {
        id: 'another-ms-id',
        displayName: 'Another User',
        emails: [{ value: 'another@example.com' }],
        provider: 'microsoft',
      };
      mockFindOrCreateUserModel.mockResolvedValue({});

      await capturedVerifyCallback(mockAccessToken, mockRefreshToken, differentProfile, mockDone);

      expect(mockFindOrCreateUserModel).toHaveBeenCalledOnce();
      expect(mockFindOrCreateUserModel).toHaveBeenCalledWith(differentProfile, 'microsoft');
    });
  });
});