import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';

// Mock dependencies before importing the module under test
vi.mock('passport');
vi.mock('jsonwebtoken');
vi.mock('../../../../config/index.js', () => ({
  default: {
    client_url: 'http://localhost:3000',
    superAdminEmail: 'super@admin.com',
    jwt: {
      access_token: 'test-secret',
      access_expires_in: '7d',
    },
  },
}));

// Now import the router from the file under test
import { socialLoginRotes } from './social-login.route.js';

// Setup a minimal express app to host the router
const app = express();
app.use('/social-login', socialLoginRotes);

describe('Social Login Routes', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    // Spy on console.error to verify error logging without polluting test output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  /**
   * Helper function to configure the mock for passport.authenticate.
   * It simulates the behavior of passport calling the callback with specified arguments.
   * @param {Error | null} err - The error object to simulate.
   * @param {object | null} user - The user object to simulate.
   * @param {object | null} info - The info object to simulate.
   */
  const setupPassportMock = (err, user, info) => {
    const mockPassportMiddleware = (req, res, next) => {
      // The callback is the 3rd argument passed to authenticate in the route handler
      const authCallback = passport.authenticate.mock.calls[0][2];
      authCallback(err, user, info);
    };
    passport.authenticate.mockReturnValue(mockPassportMiddleware);
  };

  describe('Callback Handler Logic', () => {
    // --- Success Scenarios & Role-Based Access Checks ---
    it('should redirect with a token for a standard "user" role', async () => {
      const mockUser = { user: { _id: 'user123', email: 'test@example.com', role: 'user' } };
      setupPassportMock(null, mockUser, null);
      jwt.sign.mockReturnValue('mock-user-token');

      const response = await request(app).get('/social-login/google/callback');

      expect(passport.authenticate).toHaveBeenCalledWith('google', { session: false }, expect.any(Function));
      expect(jwt.sign).toHaveBeenCalledWith(
        { role: 'user', _id: 'user123' },
        'test-secret',
        { expiresIn: '7d' }
      );
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/auth/social-callback?token=mock-user-token');
    });

    it('should redirect with a token for an "admin" role', async () => {
      const mockUser = { user: { _id: 'admin456', email: 'admin@example.com', role: 'admin' } };
      setupPassportMock(null, mockUser, null);
      jwt.sign.mockReturnValue('mock-admin-token');

      const response = await request(app).get('/social-login/google/callback');

      expect(jwt.sign).toHaveBeenCalledWith(
        { role: 'admin', _id: 'admin456' },
        'test-secret',
        { expiresIn: '7d' }
      );
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/auth/social-callback?token=mock-admin-token');
    });

    it('should redirect with a token for a "manager" role', async () => {
      const mockUser = { user: { _id: 'manager789', email: 'manager@example.com', role: 'manager' } };
      setupPassportMock(null, mockUser, null);
      jwt.sign.mockReturnValue('mock-manager-token');

      const response = await request(app).get('/social-login/google/callback');

      expect(jwt.sign).toHaveBeenCalledWith(
        { role: 'manager', _id: 'manager789' },
        'test-secret',
        { expiresIn: '7d' }
      );
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/auth/social-callback?token=mock-manager-token');
    });

    it('should upgrade role to "super_admin" if email matches config, overriding original role', async () => {
      const mockUser = { user: { _id: 'super1', email: 'super@admin.com', role: 'user' } };
      setupPassportMock(null, mockUser, null);
      jwt.sign.mockReturnValue('mock-super-admin-token');

      const response = await request(app).get('/social-login/google/callback');

      expect(jwt.sign).toHaveBeenCalledWith(
        { role: 'super_admin', _id: 'super1' },
        'test-secret',
        { expiresIn: '7d' }
      );
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/auth/social-callback?token=mock-super-admin-token');
    });

    it('should handle case-insensitivity for super_admin email check', async () => {
      const mockUser = { user: { _id: 'super2', email: 'SUPER@admin.com', role: 'admin' } };
      setupPassportMock(null, mockUser, null);
      jwt.sign.mockReturnValue('mock-super-admin-token-2');

      const response = await request(app).get('/social-login/google/callback');

      expect(jwt.sign).toHaveBeenCalledWith(
        { role: 'super_admin', _id: 'super2' },
        'test-secret',
        { expiresIn: '7d' }
      );
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/auth/social-callback?token=mock-super-admin-token-2');
    });

    // --- Failure Scenarios from handleSocialAuthCallback ---
    it('should redirect to failure URL if passport returns no user', async () => {
      setupPassportMock(null, null, null);

      const response = await request(app).get('/social-login/google/callback');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000?showLogin=true&error=authentication_cancelled');
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('should redirect with "server_error" if passport returns a generic error', async () => {
      const error = new Error('Something went wrong');
      setupPassportMock(error, null, null);

      const response = await request(app).get('/social-login/google/callback');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/?showLogin=true&error=server_error');
      expect(consoleErrorSpy).toHaveBeenCalledWith('PASSPORT AUTHENTICATION ERROR:', error);
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('should redirect with "email_has_password" error for password conflict', async () => {
      const error = new Error('This email is registered with a password');
      setupPassportMock(error, null, null);

      const response = await request(app).get('/social-login/google/callback');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/?showLogin=true&error=email_has_password');
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('should redirect with "email_exists_{provider}" for social conflict', async () => {
      const error = new Error('This email is already linked to a facebook account.');
      setupPassportMock(error, null, null);

      const response = await request(app).get('/social-login/google/callback');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/?showLogin=true&error=email_exists_facebook');
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    // --- Failure Scenarios from sendTokenResponse (Context Boundary) ---
    it('should redirect with "invalid_user_data" if passport user object is malformed (missing user.user)', async () => {
      const malformedUser = { notUser: { _id: '123' } }; // Missing the 'user' property
      setupPassportMock(null, malformedUser, null);

      const response = await request(app).get('/social-login/google/callback');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/?showLogin=true&error=invalid_user_data');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Token generation error: Invalid user object received.', undefined);
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('should redirect with "invalid_user_data" if user._id is missing', async () => {
      const malformedUser = { user: { email: 'test@test.com', role: 'user' } }; // Missing _id
      setupPassportMock(null, malformedUser, null);

      const response = await request(app).get('/social-login/google/callback');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/?showLogin=true&error=invalid_user_data');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Token generation error: Invalid user object received.', malformedUser.user);
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('should redirect with "token_generation_failed" if jwt.sign throws an error', async () => {
      const mockUser = { user: { _id: 'user123', email: 'test@example.com', role: 'user' } };
      const jwtError = new Error('JWT signing failed');
      setupPassportMock(null, mockUser, null);
      jwt.sign.mockImplementation(() => {
        throw jwtError;
      });

      const response = await request(app).get('/social-login/google/callback');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/?showLogin=true&error=token_generation_failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Token generation error:', jwtError);
    });
  });

  // Test a different provider (with a different HTTP method) to ensure the factory works broadly
  describe('POST /social-login/apple/callback', () => {
    it('should handle apple callback successfully', async () => {
      const mockUser = { user: { _id: 'apple123', email: 'apple@icloud.com', role: 'user' } };
      setupPassportMock(null, mockUser, null);
      jwt.sign.mockReturnValue('mock-apple-token');

      const response = await request(app).post('/social-login/apple/callback');

      expect(passport.authenticate).toHaveBeenCalledWith('apple', { session: false }, expect.any(Function));
      expect(jwt.sign).toHaveBeenCalledWith(
        { role: 'user', _id: 'apple123' },
        'test-secret',
        { expiresIn: '7d' }
      );
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/auth/social-callback?token=mock-apple-token');
    });
  });
});