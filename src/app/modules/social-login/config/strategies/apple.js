import AppleStrategy from 'passport-apple';
import { findOrCreateUserModel } from '../../social-login.utils.js';

const strategy = new AppleStrategy(
  {
    clientID: process.env.APPLE_CLIENT_ID,
    teamID: process.env.APPLE_TEAM_ID,
    keyID: process.env.APPLE_KEY_ID,
    // Ensure newline characters are correctly parsed from the environment variable
    privateKeyString: process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    callbackURL: '/api/v1/auth-social/apple/callback',
    scope: ['name', 'email'],
  },
  async (accessToken, refreshToken, idToken, profile, done) => {
    try {
      const result = await findOrCreateUserModel(profile, 'apple');
      return done(null, result); // Pass the {user, status, message} object.
    } catch (err) {
      return done(err, null);
    }
  }
);

export default strategy;
