import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { findOrCreateUserModel } from '../../social-login.utils.js';
import { logger } from '../../../../../shared/logger.js';

// Mock dependencies
vi.mock('passport-facebook');
vi.mock('../../social-login.utils.js', () => ({
  findOrCreateUserModel: vi.fn(),
}));
vi.mock('../../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Capture the verify callback passed to the strategy
let verifyCallback;
FacebookStrategy.mockImplementation((options, verify) => {
  verifyCallback = verify;
});

// Hold original process.env
const originalEnv = process.env;

describe('Facebook Passport Strategy', () => {
  const mockAccessToken = 'mock_access_token';
  const mockRefreshToken = 'mock_refresh_token';
  const mockProfile = {
    id: '123456789',
    displayName: 'John Doe',
    provider: 'facebook',
    emails: [{ value: 'john.doe@example.com' }],
    photos: [{ value: 'http://example.com/photo.jpg' }],
  };
  const mockDone = vi.fn();

  beforeEach(() => {
    // Set up mock environment variables
    process.env = {
      ...originalEnv,
      FACEBOOK_APP_ID: 'test_app_id',
      FACEBOOK_APP_SECRET: 'test_app_secret',
      FACEBOOK_CALLBACK_URL: '/api/v1/auth-social/facebook/callback/test',
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  it('should correctly configure the FacebookStrategy with environment variables', async () => {
    // Dynamically import the strategy to re-trigger the constructor with the mocked env
    await import('../facebook.js');
    expect(FacebookStrategy).toHaveBeenCalledWith(
      {
        clientID: 'test_app_id',
        clientSecret: 'test_app_secret',
        callbackURL: '/api/v1/auth-social/facebook/callback/test',
        profileFields: ['id', 'displayName', 'photos', 'email'],
        proxy: true,
      },
      expect.any(Function)
    );
  });

  it('should call findOrCreateUserModel and return a user on successful authentication', async () => {
    // This test covers how a user with a specific role would be handled.
    // The role itself is assumed to be assigned within findOrCreateUserModel.
    const mockUser = { id: 'user-1', name: 'John Doe', role: 'user' };
    findOrCreateUserModel.mockResolvedValue(mockUser);

    await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, mockDone);

    expect(findOrCreateUserModel).toHaveBeenCalledWith(mockProfile, 'facebook');
    expect(mockDone).toHaveBeenCalledWith(null, mockUser);
    expect(mockDone).not.toHaveBeenCalledWith(expect.any(Error), expect.anything());
  });

  it('should handle users with different roles (e.g., admin) returned by findOrCreateUserModel', async () => {
    const mockAdminUser = { id: 'admin-1', name: 'Admin User', role: 'admin' };
    findOrCreateUserModel.mockResolvedValue(mockAdminUser);

    await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, mockDone);

    expect(findOrCreateUserModel).toHaveBeenCalledWith(mockProfile, 'facebook');
    // The strategy's responsibility is to pass through whatever user object it receives.
    // The role-based logic is encapsulated within findOrCreateUserModel.
    expect(mockDone).toHaveBeenCalledWith(null, mockAdminUser);
  });

  it('should call done with an error if findOrCreateUserModel throws an error', async () => {
    const mockError = new Error('Database connection failed');
    findOrCreateUserModel.mockRejectedValue(mockError);

    await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, mockDone);

    expect(findOrCreateUserModel).toHaveBeenCalledWith(mockProfile, 'facebook');
    expect(mockDone).toHaveBeenCalledWith(mockError, null);
    expect(mockDone).not.toHaveBeenCalledWith(null, expect.anything());
  });

  it('should log the received profile information', async () => {
    findOrCreateUserModel.mockResolvedValue({}); // Resolve to avoid error path

    await verifyCallback(mockAccessToken, mockRefreshToken, mockProfile, mockDone);

    expect(logger.info).toHaveBeenCalledWith('profile: facebook: ', mockProfile);
  });
});