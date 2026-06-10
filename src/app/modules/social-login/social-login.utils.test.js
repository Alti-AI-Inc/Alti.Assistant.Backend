import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserModel from '../auth/auth.model.js';
import { findOrCreateUserModel } from './social-login.utils.js';

vi.mock('../auth/auth.model.js', () => {
  return {
    default: {
      findOne: vi.fn(),
      create: vi.fn(),
    },
  };
});

// Mock console.error to keep test output clean
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('findOrCreateUserModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return existing user if found by provider and providerId', async () => {
    const mockUser = { id: 'user123', provider: 'google', providerId: 'google123' };
    UserModel.findOne.mockResolvedValueOnce(mockUser);

    const profile = { id: 'google123' };
    const result = await findOrCreateUserModel(profile, 'google');

    expect(UserModel.findOne).toHaveBeenCalledWith({
      provider: 'google',
      providerId: 'google123',
    });
    expect(result).toEqual({
      user: mockUser,
      status: 'existing',
      message: 'Logged in successfully.',
    });
  });

  it('should throw an error if email exists and has a password', async () => {
    const profile = { id: 'google123', emails: [{ value: 'test@example.com' }] };
    const mockUserWithPassword = { email: 'test@example.com', password: 'hashedpassword' };

    UserModel.findOne.mockResolvedValueOnce(null);
    UserModel.findOne.mockReturnValueOnce({
      select: vi.fn().mockResolvedValueOnce(mockUserWithPassword),
    });

    await expect(findOrCreateUserModel(profile, 'google')).rejects.toThrow(
      'This email is registered with a password. Please sign in using your email and password.'
    );
  });

  it('should throw an error if email is already linked to a different provider', async () => {
    const profile = { id: 'google123', emails: [{ value: 'test@example.com' }] };
    const mockUserDifferentProvider = { email: 'test@example.com', provider: 'github', password: null };

    UserModel.findOne.mockResolvedValueOnce(null);
    UserModel.findOne.mockReturnValueOnce({
      select: vi.fn().mockResolvedValueOnce(mockUserDifferentProvider),
    });

    await expect(findOrCreateUserModel(profile, 'google')).rejects.toThrow(
      'This email is already linked to a github account. Please sign in using github.'
    );
  });

  it('should link the account if email exists, has no password, and provider matches or is empty', async () => {
    const profile = {
      id: 'google123',
      emails: [{ value: 'test@example.com' }],
      photos: [{ value: 'http://avatar.url' }]
    };
    const mockUserToLink = {
      email: 'test@example.com',
      provider: 'google',
      password: null,
      save: vi.fn().mockResolvedValue(true),
    };

    UserModel.findOne.mockResolvedValueOnce(null);
    UserModel.findOne.mockReturnValueOnce({
      select: vi.fn().mockResolvedValueOnce(mockUserToLink),
    });

    const result = await findOrCreateUserModel(profile, 'google');

    expect(mockUserToLink.provider).toBe('google');
    expect(mockUserToLink.providerId).toBe('google123');
    expect(mockUserToLink.avatar).toBe('http://avatar.url');
    expect(mockUserToLink.save).toHaveBeenCalled();
    expect(result).toEqual({
      user: mockUserToLink,
      status: 'linked',
      message: 'Successfully linked google to your existing account.',
    });
  });

  it('should link the account and fallback to empty avatar if profile has no photos', async () => {
    const profile = {
      id: 'google123',
      emails: [{ value: 'test@example.com' }]
    };
    const mockUserToLink = {
      email: 'test@example.com',
      provider: 'google',
      password: null,
      save: vi.fn().mockResolvedValue(true),
    };

    UserModel.findOne.mockResolvedValueOnce(null);
    UserModel.findOne.mockReturnValueOnce({
      select: vi.fn().mockResolvedValueOnce(mockUserToLink),
    });

    const result = await findOrCreateUserModel(profile, 'google');

    expect(mockUserToLink.avatar).toBe('');
    expect(mockUserToLink.save).toHaveBeenCalled();
    expect(result.status).toBe('linked');
  });

  it('should create a new user if no existing user or email is found', async () => {
    const profile = {
      id: 'google123',
      emails: [{ value: 'new@example.com' }],
      displayName: 'New User',
      photos: [{ value: 'http://avatar.url' }]
    };
    const mockNewUser = {
      id: 'new_user_id',
      provider: 'google',
      providerId: 'google123',
      email: 'new@example.com',
      role: 'user',
      name: 'New User',
      avatar: 'http://avatar.url'
    };

    UserModel.findOne.mockResolvedValueOnce(null);
    UserModel.findOne.mockReturnValueOnce({
      select: vi.fn().mockResolvedValueOnce(null),
    });
    UserModel.create.mockResolvedValueOnce(mockNewUser);

    const result = await findOrCreateUserModel(profile, 'google');

    expect(UserModel.create).toHaveBeenCalledWith({
      provider: 'google',
      providerId: 'google123',
      email: 'new@example.com',
      role: 'user',
      name: 'New User',
      avatar: 'http://avatar.url',
    });
    expect(result).toEqual({
      user: mockNewUser,
      status: 'created',
      message: 'User created and logged in successfully.',
    });
  });

  it('should create a new user with fallback email, default name, and empty avatar if not provided in profile', async () => {
    const profile = {
      id: 'google123',
    };
    const mockNewUser = {
      id: 'new_user_id',
      provider: 'google',
      providerId: 'google123',
      email: 'google_google123@noemail.social',
      role: 'user',
      name: 'Unnamed User',
      avatar: ''
    };

    UserModel.findOne.mockResolvedValueOnce(null);
    UserModel.create.mockResolvedValueOnce(mockNewUser);

    const result = await findOrCreateUserModel(profile, 'google');

    expect(UserModel.create).toHaveBeenCalledWith({
      provider: 'google',
      providerId: 'google123',
      email: 'google_google123@noemail.social',
      role: 'user',
      name: 'Unnamed User',
      avatar: '',
    });
    expect(result).toEqual({
      user: mockNewUser,
      status: 'created',
      message: 'User created and logged in successfully.',
    });
  });

  it('should log and rethrow errors', async () => {
    const profile = { id: 'google123' };
    const dbError = new Error('Database connection failed');
    UserModel.findOne.mockRejectedValueOnce(dbError);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(findOrCreateUserModel(profile, 'google')).rejects.toThrow('Database connection failed');
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Social Auth Error] Provider: google, Profile ID: google123 - Database connection failed'
    );
  });
});