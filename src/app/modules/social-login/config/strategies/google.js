import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { findOrCreateUserModel } from '../../social-login.utils.js';

const strategy = new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/v1/auth-social/google/callback',
    scope: ['profile', 'email'],
  },
  async (accessToken, refreshToken, profile, done) => {
    console.log('profile: google: ', profile);
    try {
      const user = await findOrCreateUserModel(profile, 'google');
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  },
);

export default strategy;
