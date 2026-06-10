import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { findOrCreateUserModel } from '../../social-login.utils.js';

/**
 * @typedef {import('passport-google-oauth20').Profile} GoogleProfile
 * @typedef {import('passport').DoneCallback} DoneCallback
 */

/**
 * Configures and initializes the Google OAuth 2.0 Passport strategy.
 * This strategy is used to authenticate users via their Google accounts.
 *
 * It retrieves Google client credentials from environment variables and defines
 * the callback URL and requested scopes. The verify callback function handles
 * the user's profile information received from Google, attempting to find or
 * create a corresponding user in the application's database.
 *
 * @type {GoogleStrategy}
 */
const strategy = new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/v1/auth-social/google/callback',
    scope: ['profile', 'email'],
    proxy: true,
  },
  /**
   * The verify callback function for the Google OAuth 2.0 strategy.
   * This function is called after Google has authenticated the user and returned their profile information.
   * It is responsible for finding or creating a user in the application's database based on the Google profile.
   *
   * @param {string} accessToken - The access token provided by Google.
   * @param {string | undefined} refreshToken - The refresh token provided by Google (may be undefined if not requested or available).
   * @param {GoogleProfile} profile - The user's profile information returned by Google.
   * @param {DoneCallback} done - The Passport callback function to signal the completion of the authentication process.
   * @returns {Promise<void>} A promise that resolves when the `done` callback has been invoked.
   */
  async (accessToken, refreshToken, profile, done) => {
    console.log('profile: google: ', profile);
    try {
      // Attempt to find an existing user or create a new one based on the Google profile.
      const user = await findOrCreateUserModel(profile, 'google');
      // If successful, pass the user object to Passport.
      return done(null, user);
    } catch (err) {
      // If an error occurs, pass the error to Passport.
      return done(err, null);
    }
  }
);

/**
 * Exports the configured Google Passport strategy.
 * This strategy can be used by Passport to authenticate users via Google.
 *
 * @exports {GoogleStrategy}
 */
export default strategy;