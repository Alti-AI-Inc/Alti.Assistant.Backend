import { Strategy as FacebookStrategy } from 'passport-facebook';
import { findOrCreateUserModel } from '../../social-login.utils.js';
import { logger } from '../../../../../shared/logger.js';

/**
 * Configures and initializes the Passport.js Facebook authentication strategy.
 *
 * This strategy uses Facebook's OAuth 2.0 for authentication. It retrieves user
 * profile information (ID, display name, photos, email) and attempts to find
 * or create a user in the application's database based on the Facebook profile.
 *
 * The strategy requires `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, and `FACEBOOK_CALLBACK_URL`
 * environment variables to be set for proper configuration.
 *
 * @type {FacebookStrategy}
 */
const strategy = new FacebookStrategy(
  {
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: process.env.FACEBOOK_CALLBACK_URL || '/api/v1/auth-social/facebook/callback',
    profileFields: ['id', 'displayName', 'photos', 'email'],
    proxy: true,
  },
  /**
   * The verify callback function for the Passport Facebook strategy.
   * This function is called after Facebook has authenticated the user and
   * provided their profile information.
   *
   * It logs the Facebook profile, then attempts to find an existing user
   * or create a new one in the application's database using `findOrCreateUserModel`.
   *
   * @param {string} accessToken - The access token provided by Facebook.
   * @param {string} refreshToken - The refresh token provided by Facebook (may be undefined).
   * @param {object} profile - The user's profile information provided by Facebook.
   * @param {function(Error|null, object|null)} done - The Passport callback function to signal
   *   completion. It should be called with an error (if any) and the user object.
   * @returns {Promise<void>} A promise that resolves when the `done` callback is called.
   */
  async (accessToken, refreshToken, profile, done) => {
    logger.info('profile: facebook: ', profile);
    try {
      // Attempt to find or create a user based on the Facebook profile
      const user = await findOrCreateUserModel(profile, 'facebook');
      // If successful, pass the user to Passport
      return done(null, user);
    } catch (err) {
      // If an error occurs, pass the error to Passport
      return done(err, null);
    }
  }
);

export default strategy;