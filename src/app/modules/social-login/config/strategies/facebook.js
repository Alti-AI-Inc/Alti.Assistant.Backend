import { Strategy as FacebookStrategy } from 'passport-facebook';
import { findOrCreateUserModel } from '../../social-login.utils.js';
import { logger } from '../../../../../shared/logger.js';

const strategy = new FacebookStrategy(
  {
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: '/api/v1/auth-social/facebook/callback',
    profileFields: ['id', 'displayName', 'photos', 'email'],
  },
  async (accessToken, refreshToken, profile, done) => {
    logger.info('profile: facebook: ', profile);
    try {
      const user = await findOrCreateUserModel(profile, 'facebook');
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
);

export default strategy;
