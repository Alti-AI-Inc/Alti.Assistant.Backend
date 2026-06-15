/**
 * @fileoverview Utility functions for handling social login logic.
 * This module provides the core functionality for finding or creating users
 * during a social authentication flow (e.g., Google, Facebook).
 * @module modules/social-login/social-login.utils
 */

// PERFORMANCE RECOMMENDATION: For optimal query performance, ensure the following indexes exist on the 'users' collection in your auth.model.js file:
// 1. A compound index for social provider lookups:
//    UserModel.index({ provider: 1, providerId: 1 });
// 2. A unique index for email lookups:
//    UserModel.index({ email: 1 }, { unique: true, sparse: true }); // sparse: true allows multiple null emails if not required.

import UserModel from '../auth/auth.model.js';
// INTEGRATION FIX: Import WorkspaceModel to create a tenant context for new users.
import WorkspaceModel from '../workspace/workspace.model.js';

/**
 * Finds an existing user based on their social provider profile or creates a new one.
 * This function handles the core logic for social login by:
 * 1. Finding a user by their unique provider ID.
 * 2. If not found, finding a user by their email address and linking the new provider,
 *    with a critical security check to prevent linking to password-protected accounts.
 * 3. If no user is found by either method, creating a new user along with a new workspace,
 *    establishing the necessary tenant context and making the user an admin of that workspace.
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
 * @throws {Error} Throws an error if the user and workspace creation transaction fails.
 */
export async function findOrCreateUserModel(profile, provider) {
  try {
    // --- Step 1: Find the user by their unique provider ID ---
    // PERFORMANCE: Use .lean() for faster read-only queries. This converts the Mongoose document
    // to a plain JavaScript object, reducing memory overhead and improving query speed as the user
    // object is not modified in this branch.
    let user = await UserModel.findOne({
      provider: provider,
      providerId: profile.id,
    })
    // INTEGRATION FIX: Populate workspace details for the returning user.
    // This ensures the user object returned has all necessary context for downstream logic.
    .populate('workspaces')
    .lean();

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
      // NOTE: .lean() is intentionally not used here because the 'user' document is modified and saved below.
      user = await UserModel.findOne({ email: email })
        .select('+password')
        .populate('workspaces');

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

    // --- Step 3: If no user exists, create a new user and their own workspace ---
    // HIERARCHY & INTEGRATION FIX: A new user signing up via social login should not be left in a "limbo" state.
    // They are made the 'admin' of a new, personal workspace, establishing the correct tenant context from the start.
    // This entire operation is performed in a transaction to ensure atomicity.
    const session = await UserModel.startSession();
    let newUser;

    try {
      await session.withTransaction(async (session) => {
        // The user document is created first to get its _id.
        const userToCreate = new UserModel({
          provider: provider,
          providerId: profile.id,
          email: email ?? `${provider}_${profile.id}@noemail.social`,
          // New users signing up for the first time become an 'admin' of their own workspace.
          // This is the correct role for a workspace owner.
          role: 'admin',
          name: profile.displayName ?? profile.username ?? 'Unnamed User',
          avatar: profile.photos?.[0]?.value ?? '',
          workspaces: [], // Will be populated with the new workspace ID.
        });

        // Create a new workspace for this user.
        const newWorkspace = new WorkspaceModel({
          name: `${userToCreate.name}'s Workspace`,
          owner: userToCreate._id,
          // Add the user as the first member with an 'admin' role within the workspace context.
          members: [{ user: userToCreate._id, role: 'admin' }],
        });

        // Link the workspace to the user.
        userToCreate.workspaces.push(newWorkspace._id);

        // Save both documents within the transaction.
        await newWorkspace.save({ session });
        await userToCreate.save({ session });

        // Assign the created user to the outer scope variable to be returned.
        // We need to manually populate the workspace data for the returned object for consistency.
        newUser = userToCreate.toObject(); // Use toObject() for a plain object, consistent with .lean()
        newUser.workspaces = [newWorkspace.toObject()];
      });
    } finally {
      // End the session after the transaction is complete.
      await session.endSession();
    }

    if (!newUser) {
      // This would happen if the transaction failed for some reason.
      throw new Error('Failed to create user and workspace. Please try again.');
    }

    return {
      user: newUser,
      status: 'created',
      message: 'User and workspace created successfully.',
    };
  } catch (err) {
    console.error(
      `[Social Auth Error] Provider: ${provider}, Profile ID: ${profile.id} - ${err.message}`
    );
    throw err;
  }
}