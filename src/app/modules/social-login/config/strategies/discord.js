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
 *
 * The verify callback function is executed after Discord successfully authenticates the user.
 * It's responsible for finding an existing user or creating a new one in the application's database
 * based on the Discord profile information.
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
  },
  /**
   * The verify callback function for the Discord strategy.
   * This function is called after Discord successfully authenticates a user.
   * It logs the Discord profile, attempts to find or create a user in the database,
   * and then passes the user object to Passport's `done` callback.
   *
   * @async
   * @param {string} accessToken - The access token provided by Discord for the authenticated user.
   * @param {string} refreshToken - The refresh token provided by Discord (may not always be present depending on scope).
   * @param {object} profile - The user's Discord profile information, including ID, username, email, etc.
   * @param {function(Error|null, object|null): void} done - Passport's callback function to signify completion.
   *   - `done(err)`: If an error occurred during the process.
   *   - `done(null, user)`: If the user was successfully found or created.
   *   - `done(null, false)`: If authentication failed for some reason (e.g., invalid credentials, though less common in OAuth).
   * @returns {Promise<void>} A promise that resolves when the `done` callback is invoked.
   */
  async (accessToken, refreshToken, profile, done) => {
    console.log('profile: discord: ', profile);
    try {
      // Attempt to find an existing user or create a new one based on the Discord profile.
      const user = await findOrCreateUserModel(profile, 'discord');
      // Pass the user object to Passport, indicating successful authentication.
      return done(null, user);
    } catch (err) {
      // If an error occurs during user lookup/creation, pass the error to Passport.
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