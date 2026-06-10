import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Strategy as TwitterStrategy } from 'passport-twitter-oauth2';
import { findOrCreateUserModel } from '../../social-login.utils.js';

// Mock dependencies
vi.mock('passport-twitter-oauth2', () => ({
  Strategy: vi.fn(),
}));

vi.mock('../../social-login.utils.js', () => ({
  findOrCreateUserModel: vi.fn(),
}));

describe('Twitter OAuth2 Strategy Configuration', () => {
  const OLD_ENV = process.env;

  beforeEach(async () => {
    vi.resetModules(); // Reset modules to re-evaluate the strategy with new env vars
    vi.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      TWITTER_CLIENT_ID: 'test_client_id',
      TWITTER_CLIENT_SECRET: 'test_client_secret',
      TWITTER_CALLBACK_URL: 'http://localhost:3000/callback',
    };
    // Dynamically import the module to apply the new env vars
    await import('./twitter.js');
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('should initialize TwitterStrategy with correct configuration', () => {
    expect(TwitterStrategy).toHaveBeenCalledOnce();
    const strategyOptions = vi.mocked(TwitterStrategy).mock.calls[0][0];

    expect(strategyOptions).toEqual({
      clientID: 'test_client_id',
      clientSecret: 'test_client_secret',
      callbackURL: 'http://localhost:3000/callback',
      clientType: 'confidential',
      scope: ['tweet.read', 'users.read', 'offline.access'],
      passReqToCallback: false,
      proxy: true,
    });
  });

  describe('Verify Callback Logic', () => {
    let verifyCallback;
    const mockDone = vi.fn();
    const mockAccessToken = 'mock_access_token';
    const mockRefreshToken = 'mock_refresh_token';

    beforeEach(() => {
      // The verify callback is the second argument to the Strategy constructor
      verifyCallback = vi.mocked(TwitterStrategy).mock.calls[0][1];
    });

    it('should call done with user object on successful findOrCreateUserModel', async () => {
      const mockProfile = {
        id: '12345',
        displayName: 'Test User',
        username: 'testuser',
        photos: [{ url: 'http://example.com/photo.jpg' }],
        email: 'test@example.com',
        provider: 'twitter',
      };

      const mockUser = {
        _id: 'user_id_123',
        email: 'test@example.com',
        role: 'user',
      };

      vi.mocked(findOrCreateUserModel).mockResolvedValue({ user: mockUser });

      await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, mockDone);

      const expectedAdaptedProfile = {
        id: '12345',
        displayName: 'Test User',
        username: 'testuser',
        photos: [{ value: 'http://example.com/photo.jpg' }],
        emails: [{ value: 'test@example.com' }],
        provider: 'twitter',
      };

      expect(findOrCreateUserModel).toHaveBeenCalledWith(expectedAdaptedProfile, 'twitter');
      expect(mockDone).toHaveBeenCalledWith(null, { user: mockUser });
    });

    it('should handle profiles with missing email and photos', async () => {
      const mockProfile = {
        id: '67890',
        displayName: 'Minimal User',
        username: 'minimaluser',
        // No photos or email
      };

      const mockUser = {
        _id: 'user_id_456',
        email: null,
        role: 'user',
      };

      vi.mocked(findOrCreateUserModel).mockResolvedValue({ user: mockUser });

      await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, mockDone);

      const expectedAdaptedProfile = {
        id: '67890',
        displayName: 'Minimal User',
        username: 'minimaluser',
        photos: [],
        emails: [],
        provider: 'twitter',
      };

      expect(findOrCreateUserModel).toHaveBeenCalledWith(expectedAdaptedProfile, 'twitter');
      expect(mockDone).toHaveBeenCalledWith(null, { user: mockUser });
    });

    it('should call done with an error if findOrCreateUserModel fails', async () => {
      const mockProfile = {
        id: '12345',
        displayName: 'Test User',
        username: 'testuser',
        email: 'test@example.com',
      };
      const dbError = new Error('Database connection failed');

      vi.mocked(findOrCreateUserModel).mockRejectedValue(dbError);

      await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, mockDone);

      expect(findOrCreateUserModel).toHaveBeenCalled();
      expect(mockDone).toHaveBeenCalledWith(dbError, null);
    });

    it('should correctly adapt a profile with an empty photos array', async () => {
        const mockProfile = {
          id: '54321',
          displayName: 'No Photo User',
          username: 'nophoto',
          photos: [],
          email: 'nophoto@example.com',
        };
  
        const mockUser = {
          _id: 'user_id_789',
          email: 'nophoto@example.com',
          role: 'user',
        };
  
        vi.mocked(findOrCreateUserModel).mockResolvedValue({ user: mockUser });
  
        await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, mockDone);
  
        const expectedAdaptedProfile = {
          id: '54321',
          displayName: 'No Photo User',
          username: 'nophoto',
          photos: [{ value: undefined }], // This is the behavior based on `profile.photos[0]?.url`
          emails: [{ value: 'nophoto@example.com' }],
          provider: 'twitter',
        };
  
        expect(findOrCreateUserModel).toHaveBeenCalledWith(expectedAdaptedProfile, 'twitter');
        expect(mockDone).toHaveBeenCalledWith(null, { user: mockUser });
      });
  });
});