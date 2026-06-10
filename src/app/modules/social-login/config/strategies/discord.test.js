import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Strategy } from 'passport-discord';
import { findOrCreateUserModel } from '../../social-login.utils.js';

vi.mock('passport-discord', () => {
  const mockStrategy = vi.fn();
  return { Strategy: mockStrategy };
});

vi.mock('../../social-login.utils.js', () => ({
  findOrCreateUserModel: vi.fn(),
}));

const originalEnv = process.env;

describe('Discord Strategy Configuration', () => {
  let verifyCallback;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env = {
      ...originalEnv,
      DISCORD_CLIENT_ID: 'mock_discord_client_id',
      DISCORD_CLIENT_SECRET: 'mock_discord_client_secret',
      DISCORD_CALLBACK_URL: 'http://localhost:3000/api/v1/auth-social/discord/callback',
    };

    await import('./discord.js');

    expect(Strategy).toHaveBeenCalledTimes(1);

    verifyCallback = Strategy.mock.calls[0][1];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetAllMocks();
  });

  it('should configure DiscordStrategy with correct options', () => {
    const options = Strategy.mock.calls[0][0];

    expect(options).toEqual({
      clientID: 'mock_discord_client_secret',
      clientSecret: 'mock_discord_client_secret',
      callbackURL: 'http://localhost:3000/api/v1/auth-social/discord/callback',
      scope: ['identify', 'email'],
      proxy: true,
    });
  });

  it('should use default callbackURL if DISCORD_CALLBACK_URL is not set', async () => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env = {
      ...originalEnv,
      DISCORD_CLIENT_ID: 'mock_discord_client_id',
      DISCORD_CLIENT_SECRET: 'mock_discord_client_secret',
      DISCORD_CALLBACK_URL: undefined,
    };

    await import('./discord.js');

    expect(Strategy).toHaveBeenCalledTimes(1);
    const options = Strategy.mock.calls[0][0];
    expect(options.callbackURL).toBe('/api/v1/auth-social/discord/callback');
  });

  describe('Verify Callback', () => {
    const mockAccessToken = 'mock_access_token';
    const mockRefreshToken = 'mock_refresh_token';
    const mockProfile = {
      id: 'discord_user_id',
      username: 'testuser',
      email: 'test@example.com',
      provider: 'discord',
    };
    const mockUser = { id: 'db_user_id', username: 'testuser' };
    let doneCallback;
    let consoleSpy;

    beforeEach(() => {
      doneCallback = vi.fn();
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should call findOrCreateUserModel and pass user to done callback on success', async () => {
      findOrCreateUserModel.mockResolvedValue(mockUser);

      await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, doneCallback);

      expect(consoleSpy).toHaveBeenCalledWith('profile: discord: ', mockProfile);
      expect(findOrCreateUserModel).toHaveBeenCalledWith(mockProfile, 'discord');
      expect(doneCallback).toHaveBeenCalledWith(null, mockUser);
    });

    it('should pass error to done callback if findOrCreateUserModel fails', async () => {
      const mockError = new Error('Failed to find or create user');
      findOrCreateUserModel.mockRejectedValue(mockError);

      await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, doneCallback);

      expect(consoleSpy).toHaveBeenCalledWith('profile: discord: ', mockProfile);
      expect(findOrCreateUserModel).toHaveBeenCalledWith(mockProfile, 'discord');
      expect(doneCallback).toHaveBeenCalledWith(mockError, null);
    });
  });
});