// Guards every OAuth strategy registration so placeholder / missing credentials
// don't crash the server at startup. Strategies with real credentials are registered
// normally; strategies with placeholder values are silently skipped.

const isReal = (...values) =>
  values.every(
    (v) => v && !v.startsWith('your_') && v !== '' && v !== 'undefined'
  );

let GoogleStrategy, FacebookStrategy, TwitterStrategy, GithubStrategy,
    MicrosoftStrategy, AppleStrategy, DiscordStrategy;

// Load each strategy file only if its credentials look real.
// Using dynamic import() so a crash inside a strategy file doesn't propagate.

if (isReal(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)) {
  GoogleStrategy = (await import('./strategies/google.js')).default;
}

if (isReal(process.env.FACEBOOK_APP_ID, process.env.FACEBOOK_APP_SECRET)) {
  FacebookStrategy = (await import('./strategies/facebook.js')).default;
}

if (isReal(process.env.TWITTER_CLIENT_ID, process.env.TWITTER_CLIENT_SECRET)) {
  TwitterStrategy = (await import('./strategies/twitter.js')).default;
}

if (isReal(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET)) {
  GithubStrategy = (await import('./strategies/github.js')).default;
}

if (isReal(process.env.MICROSOFT_CLIENT_ID, process.env.MICROSOFT_CLIENT_SECRET)) {
  MicrosoftStrategy = (await import('./strategies/microsoft.js')).default;
}

if (
  isReal(
    process.env.APPLE_CLIENT_ID,
    process.env.APPLE_TEAM_ID,
    process.env.APPLE_KEY_ID,
    process.env.APPLE_PRIVATE_KEY
  )
) {
  AppleStrategy = (await import('./strategies/apple.js')).default;
}

if (isReal(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_CLIENT_SECRET)) {
  DiscordStrategy = (await import('./strategies/discord.js')).default;
}

import UserModel from '../../auth/auth.model.js';

export default (passport) => {
  if (GoogleStrategy)    passport.use(GoogleStrategy);
  if (FacebookStrategy)  passport.use(FacebookStrategy);
  if (TwitterStrategy)   passport.use(TwitterStrategy);
  if (GithubStrategy)    passport.use(GithubStrategy);
  if (MicrosoftStrategy) passport.use(MicrosoftStrategy);
  if (AppleStrategy)     passport.use(AppleStrategy);
  if (DiscordStrategy)   passport.use(DiscordStrategy);

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
