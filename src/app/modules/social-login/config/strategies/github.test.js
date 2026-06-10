import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock passport-github2 to capture the strategy constructor arguments, especially the verify callback
const mockStrategyConstructor = vi.fn();
vi.mock('passport-github2', () => {
  class MockGithubStrategy {
    constructor(...args) {
      mockStrategyConstructor(...args);
    }
  }
  return { Strategy: MockGithubStrategy };
});

// Mock the utility function
const mockFindOrCreateUserModel = vi.fn();
vi.mock('../../social-login.utils.js', () => ({
  findOrCreateUserModel: mockFindOrCreateUserModel,
}));

describe('Github Strategy', () => {
  let githubStrategyModule;
  let verifyCallback;

  const mockEnv = {
    GITHUB_CLIENT_ID: 'test-github-client-id',
    GITHUB_CLIENT_SECRET: 'test-github-client-secret',
    GITHUB_CALLBACK_URL: 'http://localhost:3000/api/v1/auth-social/github/callback',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Stub environment variables
    vi.stubEnv('GITHUB_CLIENT_ID', mockEnv.GITHUB_CLIENT_ID);
    vi.stubEnv('GITHUB_CLIENT_SECRET', mockEnv.GITHUB_CLIENT_SECRET);
    vi.stubEnv('GITHUB_CALLBACK_URL', mockEnv.GITHUB_CALLBACK_URL);

    // Dynamically import the module after setting up mocks and env vars
    // This ensures the module uses the mocked dependencies and env vars
    githubStrategyModule = await import('./github.js');

    // Extract the verify callback from the mocked constructor call
    expect(mockStrategyConstructor).toHaveBeenCalledTimes(1);
    const constructorArgs = mockStrategyConstructor.mock.calls[0];
    verifyCallback = constructorArgs[1]; // The second argument is the verify callback
  });

  it('should be initialized with correct options', () => {
    const options = mockStrategyConstructor.mock.calls[0][0]; // The first argument is the options object

    expect(options).toEqual({
      clientID: mockEnv.GITHUB_CLIENT_ID,
      clientSecret: mockEnv.GITHUB_CLIENT_SECRET,
      callbackURL: mockEnv.GITHUB_CALLBACK_URL,
      scope: ['profile', 'email'],
      proxy: true,
    });
  });

  describe('verify callback', () => {
    const mockAccessToken = 'mockAccessToken';
    const mockRefreshToken = 'mockRefreshToken';
    const mockProfile = {
      id: 'github123',
      displayName: 'Test User',
      provider: 'github',
      emails: [{ value: 'test@example.com' }],
      _json: {
        login: 'testuser',
        avatar_url: 'http://example.com/avatar.png',
      },
    };
    const mockUser = { id: 'user123', email: 'test@example.com', provider: 'github' };

    it('should call findOrCreateUserModel and return user on success', async () => {
      mockFindOrCreateUserModel.mockResolvedValueOnce(mockUser);
      const done = vi.fn();

      await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, done);

      expect(mockFindOrCreateUserModel).toHaveBeenCalledTimes(1);
      expect(mockFindOrCreateUserModel).toHaveBeenCalledWith(mockProfile, 'github');
      expect(done).toHaveBeenCalledTimes(1);
      expect(done).toHaveBeenCalledWith(null, mockUser);
    });

    it('should call done with error if findOrCreateUserModel fails', async () => {
      const mockError = new Error('Failed to create or find user');
      mockFindOrCreateUserModel.mockRejectedValueOnce(mockError);
      const done = vi.fn();

      await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, done);

      expect(mockFindOrCreateUserModel).toHaveBeenCalledTimes(1);
      expect(mockFindOrCreateUserModel).toHaveBeenCalledWith(mockProfile, 'github');
      expect(done).toHaveBeenCalledTimes(1);
      expect(done).toHaveBeenCalledWith(mockError, null);
    });

    it('should use default callbackURL if GITHUB_CALLBACK_URL is not set', async () => {
      vi.clearAllMocks();
      vi.stubEnv('GITHUB_CLIENT_ID', mockEnv.GITHUB_CLIENT_ID);
      vi.stubEnv('GITHUB_CLIENT_SECRET', mockEnv.GITHUB_CLIENT_SECRET);
      vi.stubEnv('GITHUB_CALLBACK_URL', ''); // Unset the callback URL

      await import('./github.js'); // Re-import to re-evaluate with new env

      const options = mockStrategyConstructor.mock.calls[0][0];
      expect(options.callbackURL).toBe('/api/v1/auth-social/github/callback');
    });
  });
});