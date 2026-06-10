import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { findOrCreateUserModel } from '../../social-login.utils.js';
import logger from '../../../../config/logger.js';

/**
 * @typedef {import('express').Request} Request
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
    // INTEGRATION FIX: Pass the request object to the callback. This is critical for accessing session data
    // (e.g., invitation tokens, workspace identifiers) needed for multi-tenant and role-based account provisioning.
    passReqToCallback: true,
  },
  /**
   * The verify callback function for the Google OAuth 2.0 strategy.
   * This function is called after Google has authenticated the user and returned their profile information.
   * It is responsible for finding or creating a user in the application's database based on the Google profile.
   *
   * @param {Request} req - The Express request object, available because `passReqToCallback` is true.
   * @param {string} accessToken - The access token provided by Google.
   * @param {string | undefined} refreshToken - The refresh token provided by Google (may be undefined if not requested or available).
   * @param {GoogleProfile} profile - The user's profile information returned by Google.
   * @param {DoneCallback} done - The Passport callback function to signal the completion of the authentication process.
   * @returns {Promise<void>} A promise that resolves when the `done` callback has been invoked.
   */
  async (req, accessToken, refreshToken, profile, done) => {
    // SECURITY FIX: Avoid logging the entire user profile which may contain PII.
    // Use a structured logger and log only non-sensitive identifiers for debugging purposes.
    logger.debug({ googleProfileId: profile.id, email: profile.emails?.[0]?.value }, 'Received Google profile for authentication');

    try {
      // HIERARCHY/INTEGRATION FIX: Extract tenant and invitation context from the request session.
      // This context is essential for correctly associating a new user with a specific workspace and role,
      // respecting the application's multi-tenant and hierarchical structure.
      // The session should be populated by upstream middleware, for example, when a user accepts an invitation link.
      const invitationToken = req.session?.invitationToken;
      const workspaceId = req.session?.workspaceId;

      const context = {
        invitationToken,
        workspaceId,
        ipAddress: req.ip, // Include IP for security auditing.
      };

      // The `findOrCreateUserModel` utility must be implemented to handle this context.
      // It should use the invitationToken or workspaceId to find the correct tenant,
      // validate the user's email, and assign the appropriate role (e.g., user, manager)
      // as defined by the invitation or workspace rules.
      const user = await findOrCreateUserModel(profile, 'google', context);

      // Clean up session state after successful use to prevent token reuse.
      if (req.session) {
        delete req.session.invitationToken;
        delete req.session.workspaceId;
      }

      // If successful, pass the user object to Passport to establish a login session.
      return done(null, user);
    } catch (err) {
      // If an error occurs (e.g., invalid invitation, email mismatch, database error), pass the error to Passport.
      logger.error({ error: err.message, stack: err.stack }, 'Error during Google authentication strategy');
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