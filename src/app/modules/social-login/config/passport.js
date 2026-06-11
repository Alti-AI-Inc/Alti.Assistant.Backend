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

import UserModel from '../../auth/auth.model.js';

// Configuration for all supported OAuth strategies.
// This data-driven approach simplifies adding, removing, or disabling strategies.
const strategyConfigs = [
  {
    name: 'Google',
    path: './strategies/google.js',
    credentials: [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET],
  },
  {
    name: 'Facebook',
    path: './strategies/facebook.js',
    credentials: [process.env.FACEBOOK_APP_ID, process.env.FACEBOOK_APP_SECRET],
  },
  {
    name: 'Twitter',
    path: './strategies/twitter.js',
    credentials: [process.env.TWITTER_CLIENT_ID, process.env.TWITTER_CLIENT_SECRET],
  },
  {
    name: 'Github',
    path: './strategies/github.js',
    credentials: [process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET],
  },
  {
    name: 'Microsoft',
    path: './strategies/microsoft.js',
    credentials: [process.env.MICROSOFT_CLIENT_ID, process.env.MICROSOFT_CLIENT_SECRET],
  },
  {
    name: 'Apple',
    path: './strategies/apple.js',
    credentials: [
      process.env.APPLE_CLIENT_ID,
      process.env.APPLE_TEAM_ID,
      process.env.APPLE_KEY_ID,
      process.env.APPLE_PRIVATE_KEY,
    ],
  },
  {
    name: 'Discord',
    path: './strategies/discord.js',
    credentials: [process.env.DISCORD_CLIENT_ID, process.env.DISCORD_CLIENT_SECRET],
  },
];

// Dynamically load and prepare strategies that have valid credentials.
// Using Promise.all allows strategies to be loaded in parallel for faster startup.
const loadedStrategies = (
  await Promise.all(
    strategyConfigs.map(async (config) => {
      if (isReal(...config.credentials)) {
        try {
          const { default: Strategy } = await import(config.path);
          console.log(`[Auth] OAuth Strategy Enabled: ${config.name}`);
          return Strategy;
        } catch (error) {
          console.error(`[Auth] Failed to load ${config.name} OAuth strategy from ${config.path}:`, error);
          return null;
        }
      }
      return null;
    })
  )
).filter(Boolean); // Filter out nulls for strategies that were not loaded or failed to load.

/**
 * Configures and initializes Passport.js with various OAuth strategies and session management.
 * It dynamically registers strategies only if their corresponding credentials are provided
 * in the environment variables. It also sets up user serialization and deserialization
 * for session persistence.
 * @param {import('passport').PassportStatic} passport - The Passport.js instance to configure.
 */
export default (passport) => {
  // Register all successfully loaded strategies with Passport.
  if (loadedStrategies.length > 0) {
    loadedStrategies.forEach((strategy) => passport.use(strategy));
  } else {
    console.warn('[Auth] No OAuth strategies were enabled. Check your environment variables.');
  }

  /**
   * Serializes the user object to the session.
   * Stores only the user's unique ID in the session to keep the session data small.
   * @param {object} user - The user object from the database.
   * @param {Function} done - The callback to complete serialization.
   */
  passport.serializeUser((user, done) => done(null, user.id || user._id));

  /**
   * Deserializes the user from the session.
   * Retrieves the user object from the database using the ID stored in the session.
   * This user object is then attached to `req.user` for all subsequent requests.
   * @param {string} id - The user ID stored in the session.
   * @param {Function} done - The callback to complete deserialization.
   */
  passport.deserializeUser(async (id, done) => {
    try {
      // OPTIMIZATION & SECURITY:
      // - Use .lean() for performance by returning a plain JS object instead of a Mongoose document.
      //   This significantly reduces CPU usage and memory footprint for authenticated routes.
      // - Use .select() to explicitly exclude sensitive or unnecessary fields like password hashes
      //   or billing information from the user object attached to the request session.
      //   This enhances security by minimizing data exposure and is crucial for manager roles
      //   to ensure they cannot access billing data, aligning with the principle of least privilege.
      const user = await UserModel.findById(id)
        .select('-password -billingInfo -__v') // Adjust field names to match your User schema.
        .lean();

      // If the user is not found (e.g., deleted while session is active), clear the session.
      if (!user) {
        return done(null, false);
      }

      done(null, user);
    } catch (err) {
      console.error(`[Auth] Error deserializing user with ID ${id}:`, err);
      done(err, null);
    }
  });
};