import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock UserModel, as it's an external dependency
const mockUser = { id: 'user123', name: 'Test User' };
const UserModel = {
  findById: vi.fn(),
};

vi.mock('../../auth/auth.model.js', () => ({
  default: UserModel,
}));

// Mock all strategy files. They will return simple mock objects.
// This ensures that even if `isReal` passes, we get our controlled mock
// instead of trying to load actual strategy implementations.
const mockGoogleStrategy = { name: 'GoogleStrategyInstance' };
const mockFacebookStrategy = { name: 'FacebookStrategyInstance' };
const mockTwitterStrategy = { name: 'TwitterStrategyInstance' };
const mockGithubStrategy = { name: 'GithubStrategyInstance' };
const mockMicrosoftStrategy = { name: 'MicrosoftStrategyInstance' };
const mockAppleStrategy = { name: 'AppleStrategyInstance' };
const mockDiscordStrategy = { name: 'DiscordStrategyInstance' };

vi.mock('./strategies/google.js', () => ({ default: mockGoogleStrategy }));
vi.mock('./strategies/facebook.js', () => ({ default: mockFacebookStrategy }));
vi.mock('./strategies/twitter.js', () => ({ default: mockTwitterStrategy }));
vi.mock('./strategies/github.js', () => ({ default: mockGithubStrategy }));
vi.mock('./strategies/microsoft.js', () => ({ default: mockMicrosoftStrategy }));
vi.mock('./strategies/apple.js', () => ({ default: mockAppleStrategy }));
vi.mock('./strategies/discord.js', () => ({ default: mockDiscordStrategy }));


describe('Passport Configuration', () => {
  let mockPassport;
  let configurePassport; // This will hold the default export of the module

  beforeEach(() => {
    mockPassport = {
      use: vi.fn(),
      serializeUser: vi.fn(),
      deserializeUser: vi.fn(),
    };
    // Reset mocks for UserModel before each test
    UserModel.findById.mockClear();
  });

  afterEach(() => {
    // Clean up environment stubs after each test
    vi.unstubAllEnvs();
    // Reset modules to ensure a fresh import for each test,
    // especially important for modules with top-level await and conditional imports.
    vi.resetModules();
  });

  // Helper function to import and configure the module under test
  const importAndConfigure = async () => {
    // Dynamically import the module after environment variables are set
    const module = await import('./passport.js');
    configurePassport = module.default;
    configurePassport(mockPassport);
  };

  describe('Strategy Registration based on Environment Variables', () => {
    it('should register all strategies if all credentials are real', async () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', 'real_google_id');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'real_google_secret');
      vi.stubEnv('FACEBOOK_APP_ID', 'real_facebook_id');
      vi.stubEnv('FACEBOOK_APP_SECRET', 'real_facebook_secret');
      vi.stubEnv('TWITTER_CLIENT_ID', 'real_twitter_id');
      vi.stubEnv('TWITTER_CLIENT_SECRET', 'real_twitter_secret');
      vi.stubEnv('GITHUB_CLIENT_ID', 'real_github_id');
      vi.stubEnv('GITHUB_CLIENT_SECRET', 'real_github_secret');
      vi.stubEnv('MICROSOFT_CLIENT_ID', 'real_microsoft_id');
      vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'real_microsoft_secret');
      vi.stubEnv('APPLE_CLIENT_ID', 'real_apple_id');
      vi.stubEnv('APPLE_TEAM_ID', 'real_apple_team');
      vi.stubEnv('APPLE_KEY_ID', 'real_apple_key');
      vi.stubEnv('APPLE_PRIVATE_KEY', 'real_apple_private');
      vi.stubEnv('DISCORD_CLIENT_ID', 'real_discord_id');
      vi.stubEnv('DISCORD_CLIENT_SECRET', 'real_discord_secret');

      await importAndConfigure();

      expect(mockPassport.use).toHaveBeenCalledTimes(7);
      expect(mockPassport.use).toHaveBeenCalledWith(mockGoogleStrategy);
      expect(mockPassport.use).toHaveBeenCalledWith(mockFacebookStrategy);
      expect(mockPassport.use).toHaveBeenCalledWith(mockTwitterStrategy);
      expect(mockPassport.use).toHaveBeenCalledWith(mockGithubStrategy);
      expect(mockPassport.use).toHaveBeenCalledWith(mockMicrosoftStrategy);
      expect(mockPassport.use).toHaveBeenCalledWith(mockAppleStrategy);
      expect(mockPassport.use).toHaveBeenCalledWith(mockDiscordStrategy);
    });

    it('should register no strategies if all credentials are placeholders or missing', async () => {
      // Stub all relevant environment variables with placeholder or invalid values
      vi.stubEnv('GOOGLE_CLIENT_ID', 'your_google_id');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'your_google_secret');
      vi.stubEnv('FACEBOOK_APP_ID', ''); // Empty string
      vi.stubEnv('FACEBOOK_APP_SECRET', 'undefined'); // String 'undefined'
      vi.stubEnv('TWITTER_CLIENT_ID', undefined); // Actual undefined
      vi.stubEnv('TWITTER_CLIENT_SECRET', null); // Actual null
      vi.stubEnv('GITHUB_CLIENT_ID', 'your_github_id');
      vi.stubEnv('GITHUB_CLIENT_SECRET', '');
      vi.stubEnv('MICROSOFT_CLIENT_ID', 'undefined');
      vi.stubEnv('MICROSOFT_CLIENT_SECRET', undefined);
      vi.stubEnv('APPLE_CLIENT_ID', 'your_apple_id');
      vi.stubEnv('APPLE_TEAM_ID', '');
      vi.stubEnv('APPLE_KEY_ID', 'undefined');
      vi.stubEnv('APPLE_PRIVATE_KEY', null);
      vi.stubEnv('DISCORD_CLIENT_ID', 'your_discord_id');
      vi.stubEnv('DISCORD_CLIENT_SECRET', '');

      await importAndConfigure();

      expect(mockPassport.use).not.toHaveBeenCalled();
    });

    it('should register only Google and Apple strategies if only their credentials are real', async () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', 'real_google_id');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'real_google_secret');
      vi.stubEnv('APPLE_CLIENT_ID', 'real_apple_id');
      vi.stubEnv('APPLE_TEAM_ID', 'real_apple_team');
      vi.stubEnv('APPLE_KEY_ID', 'real_apple_key');
      vi.stubEnv('APPLE_PRIVATE_KEY', 'real_apple_private');

      // Ensure other strategies' envs are not real
      vi.stubEnv('FACEBOOK_APP_ID', 'your_facebook_id');
      vi.stubEnv('TWITTER_CLIENT_ID', '');
      vi.stubEnv('GITHUB_CLIENT_ID', 'undefined');
      vi.stubEnv('MICROSOFT_CLIENT_ID', undefined);
      vi.stubEnv('DISCORD_CLIENT_ID', null);

      await importAndConfigure();

      expect(mockPassport.use).toHaveBeenCalledTimes(2);
      expect(mockPassport.use).toHaveBeenCalledWith(mockGoogleStrategy);
      expect(mockPassport.use).toHaveBeenCalledWith(mockAppleStrategy);
      expect(mockPassport.use).not.toHaveBeenCalledWith(mockFacebookStrategy);
      expect(mockPassport.use).not.toHaveBeenCalledWith(mockTwitterStrategy);
      expect(mockPassport.use).not.toHaveBeenCalledWith(mockGithubStrategy);
      expect(mockPassport.use).not.toHaveBeenCalledWith(mockMicrosoftStrategy);
      expect(mockPassport.use).not.toHaveBeenCalledWith(mockDiscordStrategy);
    });
  });

  describe('Serialization and Deserialization', () => {
    // Re-import and configure for each test in this block to ensure
    // serializeUser/deserializeUser are set up.
    // We set some real envs to ensure the module loads without issues,
    // though for serialize/deserialize it doesn't strictly matter which strategies load.
    beforeEach(async () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', 'real_id');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'real_secret');
      await importAndConfigure();
    });

    it('should configure serializeUser correctly', () => {
      expect(mockPassport.serializeUser).toHaveBeenCalledTimes(1);
      const serializeCallback = mockPassport.serializeUser.mock.calls[0][0];
      const done = vi.fn();
      const user = { id: 'testUserId', name: 'Test User' };

      serializeCallback(user, done);

      expect(done).toHaveBeenCalledWith(null, user.id);
    });

    it('should configure deserializeUser correctly and find user', async () => {
      expect(mockPassport.deserializeUser).toHaveBeenCalledTimes(1);
      const deserializeCallback = mockPassport.deserializeUser.mock.calls[0][0];
      const done = vi.fn();

      UserModel.findById.mockResolvedValue(mockUser);

      await deserializeCallback(mockUser.id, done);

      expect(UserModel.findById).toHaveBeenCalledWith(mockUser.id);
      expect(done).toHaveBeenCalledWith(null, mockUser);
    });

    it('should configure deserializeUser correctly and handle error', async () => {
      expect(mockPassport.deserializeUser).toHaveBeenCalledTimes(1);
      const deserializeCallback = mockPassport.deserializeUser.mock.calls[0][0];
      const done = vi.fn();
      const error = new Error('User not found');

      UserModel.findById.mockRejectedValue(error);

      await deserializeCallback('nonExistentId', done);

      expect(UserModel.findById).toHaveBeenCalledWith('nonExistentId');
      expect(done).toHaveBeenCalledWith(error, null);
    });
  });
});