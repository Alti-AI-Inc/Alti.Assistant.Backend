/**
 * @file This file configures the Microsoft OAuth 2.0 authentication strategy for Passport.js.
 * It integrates with the `passport-microsoft` library to handle user authentication via Microsoft accounts.
 * The strategy uses environment variables for client ID, client secret, and callback URL,
 * and leverages a utility function to find or create a user in the database based on the Microsoft profile.
 */

import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { findOrCreateUserModel } from '../../social-login.utils.js';

/**
 * Configures and initializes the Microsoft Passport strategy.
 * This strategy is responsible for authenticating users via their Microsoft accounts.
 *
 * @type {MicrosoftStrategy}
 * @constant
 */
const strategy = new MicrosoftStrategy(
  {
    /**
     * The client ID provided by Microsoft for the application.
     * @type {string}
     */
    clientID: process.env.MICROSOFT_CLIENT_ID,
    /**
     * The client secret provided by Microsoft for the application.
     * @type {string}
     */
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    /**
     * The URL to which Microsoft will redirect the user after granting permission.
     * Defaults to '/api/v1/auth-social/microsoft/callback' if not specified in environment variables.
     * @type {string}
     */
    callbackURL: process.env.MICROSOFT_CALLBACK_URL || '/api/v1/auth-social/microsoft/callback',
    /**
     * The requested permissions from the user's Microsoft account.
     * @type {string[]}
     */
    scope: ['profile', 'email'],
    /**
     * Indicates whether the callback URL is behind a proxy.
     * @type {boolean}
     */
    proxy: true,
  },
  /**
   * The verify callback function for the Microsoft strategy.
   * This function is called after Microsoft has authenticated the user and returned their profile.
   * It is responsible for finding or creating a user in the application's database
   * and passing the user object to Passport.
   *
   * @param {string} accessToken - The access token provided by Microsoft.
   * @param {string} refreshToken - The refresh token provided by Microsoft (if requested).
   * @param {object} profile - The user's profile information returned by Microsoft.
   * @param {function(Error | null, object | null)} done - Passport's callback function to indicate success or failure.
   *   - `done(err)` if an error occurred.
   *   - `done(null, user)` if authentication was successful and a user object was retrieved/created.
   * @returns {Promise<void>} A promise that resolves when the `done` callback is invoked.
   */
  async (accessToken, refreshToken, profile, done) => {
    console.log('profile: microsoft: ', profile);
    try {
      /**
       * Finds an existing user or creates a new one based on the Microsoft profile.
       * @type {object}
       */
      const user = await findOrCreateUserModel(profile, 'microsoft');
      /**
       * Calls the Passport `done` callback with the authenticated user.
       */
      return done(null, user);
    } catch (err) {
      /**
       * Calls the Passport `done` callback with an error if user handling fails.
       */
      return done(err, null);
    }
  }
);

/**
 * Exports the configured Microsoft Passport strategy.
 * This strategy will be used by Passport to authenticate users via Microsoft.
 * @exports {MicrosoftStrategy}
 */
export default strategy;