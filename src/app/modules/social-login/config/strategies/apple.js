/**
 * @file This file configures the Passport.js Apple authentication strategy.
 * It uses the `passport-apple` library to define how users can log in via Apple.
 * The strategy integrates with a utility function to find or create a user in the database
 * based on the Apple profile information.
 */

import AppleStrategy from 'passport-apple';
import { findOrCreateUserModel } from '../../social-login.utils.js';

/**
 * Configures and initializes the Passport Apple authentication strategy.
 *
 * This strategy is responsible for authenticating users via Apple's OAuth 2.0 service.
 * It uses environment variables for sensitive client information and a callback URL.
 *
 * The verify callback function (`async (accessToken, refreshToken, idToken, profile, done) => { ... }`)
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
  },
  /**
   * The verify callback function for the Apple Passport strategy.
   *
   * This function is called after a user has successfully authenticated with Apple.
   * It receives the access token, refresh token, ID token, user profile, and a `done` callback.
   * It then uses the `findOrCreateUserModel` utility to either retrieve an existing user
   * from the database or create a new one based on the Apple profile.
   *
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
  async (accessToken, refreshToken, idToken, profile, done) => {
    try {
      const result = await findOrCreateUserModel(profile, 'apple');
      // Passport's 'done' function expects the user object as the second argument.
      // The original comment "Pass the {user, status, message} object." implies
      // that 'result' is an object containing a 'user' property.
      // To correctly populate 'req.user' with the actual user model,
      // we should pass 'result.user' instead of the entire 'result' object.
      return done(null, result.user);
    } catch (err) {
      return done(err, null);
    }
  }
);

export default strategy;