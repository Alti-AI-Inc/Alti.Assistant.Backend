import GoogleStrategy from './strategies/google.js';
import FacebookStrategy from './strategies/facebook.js';
import TwitterStrategy from './strategies/twitter.js';
import GithubStrategy from './strategies/github.js';
import MicrosoftStrategy from './strategies/microsoft.js';
import AppleStrategy from './strategies/apple.js';
import DiscordStrategy from './strategies/discord.js';
import UserModel from '../../auth/auth.model.js';

export default passport => {
  // Google Strategy
  passport.use(GoogleStrategy);

  // Facebook Strategy
  passport.use(FacebookStrategy);

  // Twitter Strategy
  passport.use(TwitterStrategy);

  // Github
  passport.use(GithubStrategy);

  // Microsoft
  passport.use(MicrosoftStrategy);

  // Apple
  passport.use(AppleStrategy);

  // DIscord
  passport.use(DiscordStrategy);

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await UserModel.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};

















