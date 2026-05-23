import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { findOrCreateUserModel } from '../../social-login.utils.js';

const strategy = new MicrosoftStrategy(
  {
    clientID: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    callbackURL: process.env.MICROSOFT_CALLBACK_URL || '/api/v1/auth-social/microsoft/callback',
    scope: ['profile', 'email'],
    proxy: true,
  },
  async (accessToken, refreshToken, profile, done) => {
    console.log('profile: microsoft: ', profile);
    try {
      const user = await findOrCreateUserModel(profile, 'microsoft');
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
);

export default strategy;
