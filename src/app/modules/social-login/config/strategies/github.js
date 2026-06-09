import { Strategy as GithubStrategy } from 'passport-github2';
import { findOrCreateUserModel } from '../../social-login.utils.js';

const strategy = new GithubStrategy(
  {
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL || '/api/v1/auth-social/github/callback',
    scope: ['profile', 'email'],
    proxy: true,
  },
  async (accessToken, refreshToken, profile, done) => {
    // In a production environment, avoid logging sensitive profile data directly to the console
    // as it can pose a security risk if logs are not properly secured.
    // console.log('profile: github: ', profile);
    try {
      const user = await findOrCreateUserModel(profile, 'github');
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
);

export default strategy;