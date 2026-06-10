/**
 * @file This file configures the Microsoft OAuth 2.0 authentication strategy for Passport.js.
 * It integrates with the `passport-microsoft` library to handle user authentication via Microsoft accounts.
 * The strategy uses environment variables for client ID, client secret, and callback URL,
 * and leverages a utility function to find or create a user in the database based on the Microsoft profile.
 * This implementation is enhanced to handle tenant context for multi-tenant applications,
 * such as associating new users with a workspace via an invitation.
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
     * 'openid' is crucial for OIDC compliance.
     * @type {string[]}
     */
    // BUGFIX: Corrected scope to include 'openid' for OIDC compliance, which is standard for modern authentication flows.
    scope: ['openid', 'profile', 'email'],
    /**
     * Indicates whether the callback URL is behind a proxy.
     * @type {boolean}
     */
    proxy: true,
    /**
     * INTEGRATION_FIX: Pass the request object to the verify callback.
     * This is essential for accessing session data, such as invitation tokens or workspace IDs,
     * allowing the social login flow to respect the application's tenant context.
     * @type {boolean}
     */
    passReqToCallback: true,
  },
  /**
   * The verify callback function for the Microsoft strategy.
   * This function is called after Microsoft has authenticated the user and returned their profile.
   * It is responsible for finding or creating a user in the application's database
   * and passing the user object to Passport. It also handles associating the user with the
   * correct tenant/workspace if context is provided via the session.
   *
   * @param {import('express').Request} req - The Express request object.
   * @param {string} accessToken - The access token provided by Microsoft.
   * @param {string} refreshToken - The refresh token provided by Microsoft (if requested).
   * @param {object} profile - The user's profile information returned by Microsoft.
   * @param {function(Error | null, object | null)} done - Passport's callback function to indicate success or failure.
   *   - `done(err)` if an error occurred.
   *   - `done(null, user)` if authentication was successful and a user object was retrieved/created.
   * @returns {Promise<void>} A promise that resolves when the `done` callback is invoked.
   */
  async (req, accessToken, refreshToken, profile, done) => {
    // SECURITY_FIX: Removed console.log of the user profile to prevent leaking sensitive information in production logs.
    try {
      // INTEGRATION_FIX: Extract tenant/invitation context from the session.
      // This context should be set in the initial authentication route (e.g., /auth-social/microsoft)
      // to handle scenarios like user invitations to a specific workspace.
      const { invitationToken, workspaceId } = req.session || {};

      // SECURITY_FIX: Clean up session data after use to prevent context leakage across different login attempts.
      if (req.session) {
        delete req.session.invitationToken;
        delete req.session.workspaceId;
      }

      // BUGFIX: Normalize the profile object to create a consistent data structure for the application's user model.
      // This decouples the application from the specific format of a provider's profile and handles missing data gracefully.
      const socialProfile = {
        provider: 'microsoft',
        id: profile.id,
        displayName: profile.displayName,
        email: profile.emails && profile.emails[0] ? profile.emails[0].value : null,
      };

      // BUGFIX: Add explicit check for email, as it's a required field for user creation.
      if (!socialProfile.email) {
        return done(new Error('Microsoft profile did not return an email address. This is required for registration.'), null);
      }

      /**
       * Finds an existing user or creates a new one based on the Microsoft profile.
       * INTEGRATION_FIX: Pass the normalized profile and any tenant context to the model handler.
       * This enables the handler to correctly associate the user with a workspace/role,
       * fulfilling the multi-tenancy and role-based access control requirements.
       * @type {object}
       */
      const user = await findOrCreateUserModel({
        profile: socialProfile,
        invitationToken,
        workspaceId,
      });

      /**
       * Calls the Passport `done` callback with the authenticated user.
       */
      return done(null, user);
    } catch (err) {
      /**
       * Calls the Passport `done` callback with an error if user handling fails.
       * BUGFIX: Enhance error message for better traceability.
       */
      err.message = `Error during Microsoft authentication strategy: ${err.message}`;
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