/**
 * @file This file configures the Passport.js Discord strategy for social login.
 * It integrates with Discord's OAuth2 to authenticate users and manage their profiles.
 * @module strategies/discord
 */

import { Strategy as DiscordStrategy } from 'passport-discord';
import { findOrCreateUserModel } from '../../social-login.utils.js';

/**
 * Configures and initializes the Passport.js Discord strategy.
 * This strategy handles the OAuth2 flow with Discord, authenticating users
 * and retrieving their profile information.
 *
 * The strategy uses environment variables for sensitive credentials and configuration:
 * - `process.env.DISCORD_CLIENT_ID`: The client ID obtained from Discord Developer Portal.
 * - `process.env.DISCORD_CLIENT_SECRET`: The client secret obtained from Discord Developer Portal.
 * - `process.env.DISCORD_CALLBACK_URL`: The URL where Discord will redirect after authentication.
 *   Defaults to `/api/v1/auth-social/discord/callback` if not set.
 * - `scope`: Defines the permissions requested from the user (e.g., 'identify', 'email').
 * - `proxy`: Set to `true` to trust the first proxy header, useful in production environments behind a proxy.
 * - `passReqToCallback`: Set to `true` to pass the Express request object to the verify callback,
 *   allowing access to session data for contextual user creation (e.g., using an invite token).
 *
 * The verify callback function is executed after Discord successfully authenticates the user.
 * It's responsible for finding an existing user or creating a new one in the application's database
 * based on the Discord profile information and any contextual data from the session.
 *
 * @type {DiscordStrategy}
 */
const strategy = new DiscordStrategy(
  {
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL || '/api/v1/auth-social/discord/callback',
    scope: ['identify', 'email'],
    proxy: true,
    passReqToCallback: true, // Pass the request object to the verify callback
  },
  /**
   * The verify callback function for the Discord strategy.
   * This function is called after Discord successfully authenticates a user.
   * It handles user creation and association with a workspace/tenant via an invite token.
   *
   * @async
   * @param {import('express').Request} req - The Express request object, available via `passReqToCallback: true`. Used to access session data like an invitation token.
   * @param {string} accessToken - The access token provided by Discord for the authenticated user.
   * @param {string} refreshToken - The refresh token provided by Discord (may not always be present depending on scope).
   * @param {object} profile - The user's Discord profile information, including ID, username, email, etc.
   * @param {function(Error|null, object|null): void} done - Passport's callback function to signify completion.
   *   - `done(err)`: If an error occurred during the process.
   *   - `done(null, user)`: If the user was successfully found or created.
   *   - `done(null, false)`: If authentication failed for some reason.
   * @returns {Promise<void>} A promise that resolves when the `done` callback is invoked.
   */
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      // BUG FIX: Integration gap - Lack of tenant context during social sign-up.
      // The original implementation did not handle associating a new user with a specific
      // workspace or tenant during social login. This is critical in a multi-tenant
      // application where users must belong to a workspace to access resources and for
      // role-based access control to function correctly.
      //
      // FIX: We now use `passReqToCallback: true` to access the request object.
      // We expect an `inviteToken` to be present in the session, which would have been
      // set when the user initiated the sign-up flow from an invitation link.
      // This token is passed to `findOrCreateUserModel` to correctly associate the new
      // user with the appropriate workspace and role.

      const inviteToken = req.session?.inviteToken;

      // The findOrCreateUserModel function is now responsible for handling the invite token.
      // If the token is valid, it will associate the user with the correct workspace/tenant
      // and assign the appropriate role. If no token is present, it can handle it as a
      // standard sign-up without a workspace, if the application logic allows for that.
      const user = await findOrCreateUserModel(profile, 'discord', inviteToken);

      // Clean up the session to prevent token reuse.
      if (req.session?.inviteToken) {
        delete req.session.inviteToken;
      }

      // Pass the user object to Passport, indicating successful authentication.
      return done(null, user);
    } catch (err) {
      // If an error occurs during user lookup/creation, pass the error to Passport.
      // Also ensure the session token is cleared on error to prevent inconsistent states.
      if (req.session?.inviteToken) {
        delete req.session.inviteToken;
      }
      return done(err, null);
    }
  }
);

/**
 * Exports the configured Passport.js Discord strategy.
 * This strategy can be used by Passport to authenticate users via Discord.
 * @type {DiscordStrategy}
 */
export default strategy;