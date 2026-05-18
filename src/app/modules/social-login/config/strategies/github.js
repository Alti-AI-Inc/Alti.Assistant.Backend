import { Strategy as GithubStrategy } from 'passport-github2';
import { findOrCreateUserModel } from '../../social-login.utils.js';

const strategy = new GithubStrategy(
  {
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: '/api/v1/auth-social/github/callback',
    scope: ['profile', 'email'],
  },
  async (accessToken, refreshToken, profile, done) => {
    console.log('profile: github: ', profile);
    try {
      const user = await findOrCreateUserModel(profile, 'github');
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
);

export default strategy;
