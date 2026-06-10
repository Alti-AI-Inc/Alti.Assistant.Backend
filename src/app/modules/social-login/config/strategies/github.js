/**
 * @fileoverview Configures the Passport.js strategy for GitHub OAuth 2.0 authentication.
 * This file sets up the `passport-github2` strategy with credentials from environment
 * variables and defines the verification callback function that processes the user's
 * profile after a successful GitHub login.
 * @module config/strategies/github
 */

import { Strategy as GithubStrategy } from 'passport-github2';
import { findOrCreateUserModel } from '../../social-login.utils.js';

/**
 * The Passport strategy for authenticating with GitHub using OAuth 2.0.
 *
 * The strategy is configured with the client ID, client secret, and callback URL,
 * which are retrieved from environment variables. It requests the 'profile' and 'email' scopes.
 *
 * The verification callback function receives the access token, refresh token, and user profile
 * from GitHub. It then uses the `findOrCreateUserModel` utility to find an existing user
 * associated with the GitHub profile ID or create a new user if one doesn't exist.
 *
 * @constant {GithubStrategy}
 * @see {@link http://www.passportjs.org/packages/passport-github2/} for more information on the passport-github2 strategy.
 */
const strategy = new GithubStrategy(
  {
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL || '/api/v1/auth-social/github/callback',
    scope: ['profile', 'email'],
    proxy: true,
  },
  /**
   * The verification callback for the GitHub strategy. This function is called
   * after a user successfully authenticates with GitHub.
   *
   * @param {string} accessToken - The access token provided by GitHub.
   * @param {string} refreshToken - The refresh token provided by GitHub (may be null).
   * @param {object} profile - The user's profile information from GitHub.
   * @param {Function} done - The Passport callback to be called with the result of the authentication.
   *                          It should be called as `done(error, user, info)`.
   * @returns {Promise<void>} A promise that resolves when the verification is complete.
   */
  async (accessToken, refreshToken, profile, done) => {
    // In a production environment, avoid logging sensitive profile data directly to the console
    // as it can pose a security risk if logs are not properly secured.
    // console.log('profile: github: ', profile);
    try {
      const user = await findOrCreateUserModel(profile, 'github');
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
);

export default strategy;