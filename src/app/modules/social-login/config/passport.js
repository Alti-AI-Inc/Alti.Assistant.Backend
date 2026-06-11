// Guards every OAuth strategy registration so placeholder / missing credentials
// don't crash the server at startup. Strategies with real credentials are registered
// normally; strategies with placeholder values are silently skipped.

/**
 * Checks if a set of values are "real" and not empty, undefined, or placeholder strings
 * like 'your_...'. This is used to conditionally register OAuth strategies only when
 * valid credentials are provided in environment variables.
 * @param {...(string|undefined)} values - The configuration values to check.
 * @returns {boolean} True if all values are considered real, false otherwise.
 */
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

/**
 * Configures and initializes Passport.js with various OAuth strategies and session management.
 * It dynamically registers strategies only if their corresponding credentials are provided
 * in the environment variables. It also sets up user serialization and deserialization
 * for session persistence.
 * @param {import('passport').PassportStatic} passport - The Passport.js instance to configure.
 */
export default (passport) => {
  if (GoogleStrategy)    passport.use(GoogleStrategy);
  if (FacebookStrategy)  passport.use(FacebookStrategy);
  if (TwitterStrategy)   passport.use(TwitterStrategy);
  if (GithubStrategy)    passport.use(GithubStrategy);
  if (MicrosoftStrategy) passport.use(MicrosoftStrategy);
  if (AppleStrategy)     passport.use(AppleStrategy);
  if (DiscordStrategy)   passport.use(DiscordStrategy);

  /**
   * Serializes the user object to the session.
   * Stores only the user's unique ID in the session to keep the session data small.
   * @param {object} user - The user object from the database.
   * @param {Function} done - The callback to complete serialization.
   */
  passport.serializeUser((user, done) => done(null, user.id || user._id));

  /**
   * Deserializes the user from the session.
   * Retrieves the full user object from the database using the ID stored in the session.
   * This user object is then attached to `req.user` for all subsequent requests.
   * @param {string} id - The user ID stored in the session.
   * @param {Function} done - The callback to complete deserialization.
   */
  passport.deserializeUser(async (id, done) => {
    try {
      // OPTIMIZATION: Added .lean() to prevent Mongoose document hydration overhead on every single request.
      // This significantly reduces CPU usage and memory footprint for authenticated routes.
      // If your application relies on Mongoose document methods (e.g., user.save()) directly on req.user,
      // you may need to remove .lean() or manually save via UserModel.updateOne.
      const user = await UserModel.findById(id).lean();
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};