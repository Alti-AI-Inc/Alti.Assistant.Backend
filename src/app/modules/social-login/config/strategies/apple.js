/**
 * @file This file configures the Passport.js Apple authentication strategy.
 * It uses the `passport-apple` library to define how users can log in via Apple.
 * The strategy integrates with a utility function to find or create a user in the database
 * based on the Apple profile information.
 */

import AppleStrategy from 'passport-apple';
import { findOrCreateUserModel } from '../../social-login.utils.js';

// Security Patch: Check for required environment variables at startup and warn if missing.
const requiredEnvVars = ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`CRITICAL: Missing required Apple OAuth environment variable: ${varName}. Apple login will be unavailable.`);
  }
}

/**
 * Configures and initializes the Passport Apple authentication strategy.
 *
 * This strategy is responsible for authenticating users via Apple's OAuth 2.0 service.
 * It uses environment variables for sensitive client information and a callback URL.
 *
 * The verify callback function (`async (req, accessToken, refreshToken, idToken, profile, done) => { ... }`)
 * is executed after Apple successfully authenticates a user. It attempts to find an existing user
 * in the application's database or create a new one based on the `profile` data provided by Apple.
 *
 * @type {AppleStrategy}
 * @constant
 */
const strategy = new AppleStrategy(
  {
    clientID: process.env.APPLE_CLIENT_ID,
    teamID: process.env.APPLE_TEAM_ID,
    keyID: process.env.APPLE_KEY_ID,
    // Ensure newline characters are correctly parsed from the environment variable
    privateKeyString: process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    callbackURL: process.env.APPLE_CALLBACK_URL || '/api/v1/auth-social/apple/callback',
    scope: ['name', 'email'],
    passReqToCallback: true, // Integration Fix: Pass the request object to the verify callback. This is essential for context-aware sign-ups (e.g., using an invite token from the session) to correctly associate a new user with a workspace/tenant, fulfilling hierarchical requirements.
  },
  /**
   * The verify callback function for the Apple Passport strategy.
   *
   * This function is called after a user has successfully authenticated with Apple.
   * It receives the request object, access token, refresh token, ID token, user profile, and a `done` callback.
   * It then uses the `findOrCreateUserModel` utility to either retrieve an existing user
   * from the database or create a new one based on the Apple profile, using context from the request.
   *
   * @param {import('express').Request} req - The Express request object, passed in because `passReqToCallback` is true.
   * @param {string} accessToken - The access token provided by Apple.
   * @param {string} refreshToken - The refresh token provided by Apple (if applicable).
   * @param {string} idToken - The ID token provided by Apple.
   * @param {object} profile - The user profile information returned by Apple.
   * @param {function(Error|null, object|false, object?): void} done - The Passport callback function.
   *   - `done(err)`: If an error occurred.
   *   - `done(null, user)`: If authentication was successful, `user` is the authenticated user.
   *   - `done(null, false)`: If authentication failed.
   * @returns {Promise<void>} A promise that resolves when the `done` callback is invoked.
   * @throws {Error} If an error occurs during the `findOrCreateUserModel` process.
   */
  async (req, accessToken, refreshToken, idToken, profile, done) => {
    try {
      // Security Note: The 'profile' object from a trusted OAuth provider like Apple is generally
      // considered safe. However, the `findOrCreateUserModel` function is responsible for any
      // necessary validation and sanitization before database operations to prevent injection attacks.
      // Integration Fix: Pass the 'req' object to the user creation/retrieval logic.
      // This allows the function to access session data (e.g., req.session.inviteCode)
      // to correctly associate the new user with a specific tenant or workspace,
      // ensuring proper hierarchical placement.
      const result = await findOrCreateUserModel(profile, 'apple', req);
      // Passport's 'done' function expects the user object as the second argument.
      // The original comment "Pass the {user, status, message} object." implies
      // that 'result' is an object containing a 'user' property.
      // To correctly populate 'req.user' with the actual user model,
      // we should pass 'result.user' instead of the entire 'result' object.
      return done(null, result.user);
    } catch (err) {
      // Security Note: Pass errors to the 'done' callback to allow Passport's centralized
      // error handling to manage them. Ensure that the application's global error handler
      // is configured to not leak sensitive stack trace information to clients in production.
      return done(err, null);
    }
  }
);

export default strategy;