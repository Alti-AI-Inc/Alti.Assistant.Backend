import { Strategy as DiscordStrategy } from 'passport-discord';
import { findOrCreateUserModel } from '../../social-login.utils.js';

const strategy = new DiscordStrategy(
  {
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL || '/api/v1/auth-social/discord/callback',
    scope: ['identify', 'email'],
    proxy: true,
  },
  async (accessToken, refreshToken, profile, done) => {
    console.log('profile: discord: ', profile);
    try {
      const user = await findOrCreateUserModel(profile, 'discord');
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
);

export default strategy;
