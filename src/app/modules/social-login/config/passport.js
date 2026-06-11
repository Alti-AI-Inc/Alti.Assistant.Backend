// Guards every OAuth strategy registration so placeholder / missing credentials
// don't crash the server at startup. Strategies with real credentials are registered
// normally; strategies with placeholder values are silently skipped.

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import UserModel from '../../auth/auth.model.js';

// --- GCP Secret Manager Integration ---
// In a GCP environment (like Cloud Run), GOOGLE_CLOUD_PROJECT is set automatically.
const GcpProjectId = process.env.GOOGLE_CLOUD_PROJECT;
const IsProduction = process.env.NODE_ENV === 'production';
// Initialize client only in production on GCP to avoid errors in other environments.
const secretClient =
  GcpProjectId && IsProduction ? new SecretManagerServiceClient() : null;
const secretCache = new Map();

/**
 * Asynchronously resolves a secret's value.
 * In production on GCP, it attempts to fetch the secret from GCP Secret Manager.
 * It falls back to environment variables for local development, or if the secret
 * isn't found in Secret Manager. This allows for flexible configuration.
 * Fetched secrets are cached in memory and populated into process.env to ensure
 * they are available to other modules (like strategy files) without modification.
 * @param {string} secretName The name of the secret to resolve (e.g., 'GOOGLE_CLIENT_ID').
 * @returns {Promise<string|undefined>} The secret value.
 */
async function resolveSecret(secretName) {
  if (secretCache.has(secretName)) {
    return secretCache.get(secretName);
  }

  // If in production on GCP, try Secret Manager first.
  if (secretClient) {
    try {
      const name = `projects/${GcpProjectId}/secrets/${secretName}/versions/latest`;
      const [version] = await secretClient.accessSecretVersion({ name });
      const value = version.payload.data.toString('utf8');

      // Cache and populate process.env for other modules to use.
      secretCache.set(secretName, value);
      process.env[secretName] = value;
      return value;
    } catch (error) {
      // If secret is not in Secret Manager (e.g., NOT_FOUND), it might be a non-sensitive config
      // set directly as an env var. Log a warning and fall through to the env var check.
      if (error.code === 5) { // 5 = gRPC code for NOT_FOUND
        // This is an expected case, so a simple log is sufficient.
        console.log(
          `Secret '${secretName}' not found in Secret Manager, falling back to environment variable.`
        );
      } else {
        console.warn(
          `Could not fetch '${secretName}' from Secret Manager, falling back to environment variable. Error: ${error.message}`
        );
      }
    }
  }

  // Fallback to environment variable.
  const value = process.env[secretName];
  secretCache.set(secretName, value); // Cache the env var value (or undefined)
  return value;
}

/**
 * Resolves multiple secrets concurrently and populates process.env.
 * @param {string[]} secretNames - An array of secret names to resolve.
 * @returns {Promise<void>}
 */
async function resolveAllSecrets(secretNames) {
  await Promise.all(secretNames.map(resolveSecret));
}

// Resolve all required secrets at startup. This will populate process.env
// with values from Secret Manager if running in production on GCP.
await resolveAllSecrets([
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'FACEBOOK_APP_ID',
  'FACEBOOK_APP_SECRET',
  'TWITTER_CLIENT_ID',
  'TWITTER_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'MICROSOFT_CLIENT_ID',
  'MICROSOFT_CLIENT_SECRET',
  'APPLE_CLIENT_ID',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
]);
// --- End GCP Secret Manager Integration ---

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

let GoogleStrategy,
  FacebookStrategy,
  TwitterStrategy,
  GithubStrategy,
  MicrosoftStrategy,
  AppleStrategy,
  DiscordStrategy;

// Load each strategy file only if its credentials look real.
// The checks now use process.env, which has been populated by resolveAllSecrets.
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

if (
  isReal(process.env.MICROSOFT_CLIENT_ID, process.env.MICROSOFT_CLIENT_SECRET)
) {
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

/**
 * Configures and initializes Passport.js with various OAuth strategies and session management.
 * It dynamically registers strategies only if their corresponding credentials are provided
 * in the environment variables. It also sets up user serialization and deserialization
 * for session persistence.
 * @param {import('passport').PassportStatic} passport - The Passport.js instance to configure.
 */
export default (passport) => {
  if (GoogleStrategy) passport.use(GoogleStrategy);
  if (FacebookStrategy) passport.use(FacebookStrategy);
  if (TwitterStrategy) passport.use(TwitterStrategy);
  if (GithubStrategy) passport.use(GithubStrategy);
  if (MicrosoftStrategy) passport.use(MicrosoftStrategy);
  if (AppleStrategy) passport.use(AppleStrategy);
  if (DiscordStrategy) passport.use(DiscordStrategy);

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
      // you may need to remove .lean() or manually re-fetch the full document when mutation is needed.
      const user = await UserModel.findById(id).lean();
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};