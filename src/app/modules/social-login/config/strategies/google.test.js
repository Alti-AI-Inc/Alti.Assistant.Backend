import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies at the top level. Vitest hoists these.
vi.mock('passport-google-oauth20', () => ({
  Strategy: vi.fn(),
}));

vi.mock('../../social-login.utils.js', () => ({
  findOrCreateUserModel: vi.fn(),
}));

describe('Google Passport Strategy', () => {
  let GoogleStrategy;
  let findOrCreateUserModel;
  let originalEnv;

  beforeEach(async () => {
    // Reset modules to clear cache and allow re-evaluation of the strategy file
    vi.resetModules();

    // Backup and set environment variables for the test
    originalEnv = { ...process.env };
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
    process.env.GOOGLE_CALLBACK_URL = '/test/google/callback';

    // Dynamically import the mocked modules to get the fresh mock instances for this test run
    const passportGoogleMock = await import('passport-google-oauth20');
    GoogleStrategy = passportGoogleMock.Strategy;

    const utilsMock = await import('../../social-login.utils.js');
    findOrCreateUserModel = utilsMock.findOrCreateUserModel;

    // Dynamically import the module under test. This will execute its top-level
    // code, including the `new GoogleStrategy(...)` call, using the fresh mocks and env vars.
    await import('./google.js');
  });

  afterEach(() => {
    // Restore environment variables and clear mocks
    process.env = originalEnv;
  });

  describe('Strategy Configuration', () => {
    it('should instantiate GoogleStrategy with correct configuration from process.env', () => {
      expect(GoogleStrategy).toHaveBeenCalledTimes(1);

      const strategyOptions = GoogleStrategy.mock.calls[0][0];
      expect(strategyOptions).toEqual({
        clientID: 'test-google-client-id',
        clientSecret: 'test-google-client-secret',
        callbackURL: '/test/google/callback',
        scope: ['profile', 'email'],
        proxy: true,
      });
    });

    it('should use default callbackURL if GOOGLE_CALLBACK_URL is not set', async () => {
      vi.resetModules();
      delete process.env.GOOGLE_CALLBACK_URL; // Modify env before import

      const passportGoogleMock = await import('passport-google-oauth20');
      const FreshGoogleStrategy = passportGoogleMock.Strategy;

      await import('./google.js');

      expect(FreshGoogleStrategy).toHaveBeenCalledTimes(1);
      const strategyOptions = FreshGoogleStrategy.mock.calls[0][0];
      expect(strategyOptions.callbackURL).toBe('/api/v1/auth-social/google/callback');
    });
  });

  describe('Verify Callback Logic', () => {
    let verifyCallback;
    const mockAccessToken = 'mock-access-token';
    const mockRefreshToken = 'mock-refresh-token';
    const mockProfile = {
      id: 'google-12345',
      displayName: 'Google User',
      emails: [{ value: 'google.user@example.com', verified: true }],
      provider: 'google',
    };
    const mockDone = vi.fn();

    beforeEach(() => {
      // The strategy is instantiated in the parent beforeEach.
      // We grab the verify callback (the second argument to the constructor) from the mock.
      verifyCallback = GoogleStrategy.mock.calls[0][1];
    });

    it('should call done(null, user) on successful user lookup or creation', async () => {
      // This mock represents a user object that could be returned, potentially with any role.
      // The strategy itself does not check the role, it just passes the object along.
      const mockUser = { id: 'user-abc-123', email: 'google.user@example.com', role: 'user' };
      findOrCreateUserModel.mockResolvedValue(mockUser);

      await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, mockDone);

      // Verify the context boundary: the strategy correctly calls our utility function
      expect(findOrCreateUserModel).toHaveBeenCalledTimes(1);
      expect(findOrCreateUserModel).toHaveBeenCalledWith(mockProfile, 'google');

      // Verify the outcome: Passport's done callback is invoked with the user
      expect(mockDone).toHaveBeenCalledTimes(1);
      expect(mockDone).toHaveBeenCalledWith(null, mockUser);
    });

    it('should call done(err, null) when findOrCreateUserModel throws an error', async () => {
      const mockError = new Error('Database connection failed');
      findOrCreateUserModel.mockRejectedValue(mockError);

      await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, mockDone);

      // Verify the context boundary: the strategy correctly calls our utility function
      expect(findOrCreateUserModel).toHaveBeenCalledTimes(1);
      expect(findOrCreateUserModel).toHaveBeenCalledWith(mockProfile, 'google');

      // Verify the outcome: Passport's done callback is invoked with the error
      expect(mockDone).toHaveBeenCalledTimes(1);
      expect(mockDone).toHaveBeenCalledWith(mockError, null);
    });
  });
});