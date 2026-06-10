/**
 * @fileoverview Utility functions for handling social login logic.
 * This module provides the core functionality for finding or creating users
 * during a social authentication flow (e.g., Google, Facebook).
 * @module modules/social-login/social-login.utils
 */

import UserModel from '../auth/auth.model.js';

/**
 * Finds an existing user based on their social provider profile or creates a new one.
 * This function handles the core logic for social login by:
 * 1. Finding a user by their unique provider ID.
 * 2. If not found, finding a user by their email address and linking the new provider,
 *    with a critical security check to prevent linking to password-protected accounts.
 * 3. If no user is found by either method, creating a new user with the profile information.
 *
 * @async
 * @function findOrCreateUserModel
 * @param {object} profile - The user profile object returned by the social provider (e.g., from Passport.js).
 * @param {string} profile.id - The unique identifier for the user from the social provider.
 * @param {Array<{value: string}>} [profile.emails] - An array of email objects. The first email is used.
 * @param {string} [profile.displayName] - The user's display name.
 * @param {string} [profile.username] - The user's username.
 * @param {Array<{value: string}>} [profile.photos] - An array of photo objects. The first photo is used as the avatar.
 * @param {string} provider - The name of the social login provider (e.g., 'google', 'facebook').
 * @returns {Promise<{user: import('../auth/auth.model.js').User, status: 'existing'|'linked'|'created', message: string}>} A promise that resolves to an object containing the user document and the status of the operation ('existing', 'linked', or 'created').
 * @throws {Error} Throws an error if the user's email is already registered with a password, preventing account takeover.
 * @throws {Error} Throws an error if the user's email is already linked to a different social provider.
 */
export async function findOrCreateUserModel(profile, provider) {
  try {
    // --- Step 1: Find the user by their unique provider ID ---
    let user = await UserModel.findOne({
      provider: provider,
      providerId: profile.id,
    });

    if (user) {
      // The user has logged in with this social account before. Welcome back.
      return { user, status: 'existing', message: 'Logged in successfully.' };
    }

    // --- Step 2: If no user is found, check for an account with the same email ---
    const email = profile.emails?.[0]?.value;

    if (email) {
      // Explicitly select the password field to check if the user has a password set.
      // This is crucial if the password field is marked as 'select: false' in the Mongoose schema,
      // which is a common and recommended security practice.
      user = await UserModel.findOne({ email: email }).select('+password');

      if (user) {
        // A user with this email already exists.

        // ✅ YOUR NEW SECURITY RULE IS IMPLEMENTED HERE:
        // Check if the existing user has a password.
        if (user.password) {
          // This account was created with a password. BLOCK the social login attempt.
          // Throw a new, specific error that we will handle in the routes file.
          throw new Error(
            'This email is registered with a password. Please sign in using your email and password.'
          );
        }

        // --- If there is NO password, then it's a social account. ---
        // The rest of the logic handles conflicts between different social providers.
        if (user.provider && user.provider !== provider) {
          throw new Error(
            `This email is already linked to a ${user.provider} account. Please sign in using ${user.provider}.`
          );
        }

        // This is an edge case for linking, which is now prevented by the password check above for credential-based users.
        user.provider = provider;
        user.providerId = profile.id;
        if (!user.avatar) {
          user.avatar = profile.photos?.[0]?.value || '';
        }
        await user.save();
        return {
          user,
          status: 'linked',
          message: `Successfully linked ${provider} to your existing account.`,
        };
      }
    }

    // --- Step 3: If no user exists by providerId or email, create a new user ---
    const newUser = await UserModel.create({
      provider: provider,
      providerId: profile.id,
      email: email ?? `${provider}_${profile.id}@noemail.social`,
      // Assign a default 'user' role for new social logins.
      // Hardcoding 'admin' is a critical security vulnerability as it grants elevated privileges
      // to all new users created via social login.
      role: 'user',
      name: profile.displayName ?? profile.username ?? 'Unnamed User',
      avatar: profile.photos?.[0]?.value ?? '',
    });

    return {
      user: newUser,
      status: 'created',
      message: 'User created and logged in successfully.',
    };
  } catch (err) {
    console.error(
      `[Social Auth Error] Provider: ${provider}, Profile ID: ${profile.id} - ${err.message}`
    );
    throw err;
  }
}