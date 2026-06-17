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
export async function findOrCreateUserModel(profile, provider, contextOrReq) {
  try {
    // Extract invitation token from context or request object
    let invitationToken;
    if (contextOrReq) {
      if (typeof contextOrReq === 'string') {
        invitationToken = contextOrReq;
      } else if (typeof contextOrReq === 'object') {
        invitationToken =
          contextOrReq.invitationToken ||
          contextOrReq.session?.invitationToken ||
          contextOrReq.query?.inviteToken ||
          contextOrReq.body?.inviteToken ||
          contextOrReq.body?.invitationToken;
      }
    }

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

    // --- Step 3: If no user exists, create a new user and join/create a workspace ---
    // HIERARCHY & INTEGRATION FIX: A new user signing up via social login should not be left in a "limbo" state.
    // They are made the 'admin' of a new, personal workspace or join an invited workspace.
    // This entire operation is performed in a transaction to ensure atomicity.
    const session = await UserModel.startSession();
    let newUser;

    try {
      await session.withTransaction(async (session) => {
        // Find invitation if token provided
        let invitation = null;
        if (invitationToken) {
          const { default: TenantInvitation } = await import('../tenant/tenantInvitation.model.js');
          invitation = await TenantInvitation.findOne({
            token: invitationToken,
            status: 'pending',
          }).session(session);

          // Verify email matches if invitation is found
          if (invitation && email && invitation.email.toLowerCase() !== email.toLowerCase()) {
            invitation = null;
          }
        }

        if (invitation) {
          // ─── USER REGISTRATION VIA INVITATION LINK ───
          const userToCreate = new UserModel({
            provider: provider,
            providerId: profile.id,
            email: email ?? `${provider}_${profile.id}@noemail.social`,
            role: 'user', // Global role is 'user' for invited members
            name: profile.displayName ?? profile.username ?? 'Unnamed User',
            avatar: profile.photos?.[0]?.value ?? '',
            workspaces: [{
              workspaceId: invitation.tenantId,
              role: invitation.role === 'admin' ? 'admin' : invitation.role === 'manager' ? 'manager' : 'member',
            }],
            tenantId: invitation.tenantId,
            tenantRole: invitation.role,
            tenantPermissions:
              invitation.role === 'admin' || invitation.role === 'manager'
                ? ['manage_members', 'manage_content']
                : ['view_content'],
            activeTenantId: invitation.tenantId,
          });

          // Create TenantMember record
          const { default: TenantMember } = await import('../tenant/tenantMember.model.js');
          const newMember = new TenantMember({
            userId: userToCreate._id,
            tenantId: invitation.tenantId,
            role: invitation.role,
            permissions:
              invitation.role === 'admin' || invitation.role === 'manager'
                ? ['manage_members', 'manage_content']
                : ['view_content'],
            status: 'active',
            invitedBy: invitation.invitedBy,
            joinedAt: new Date(),
          });

          // Update tenant user count
          await WorkspaceModel.findByIdAndUpdate(
            invitation.tenantId,
            { $inc: { 'usage.usersCount': 1 } },
            { session }
          );

          // Mark invitation as accepted
          invitation.status = 'accepted';
          invitation.acceptedAt = new Date();
          invitation.acceptedBy = userToCreate._id;
          await invitation.save({ session });

          await newMember.save({ session });
          await userToCreate.save({ session });

          newUser = userToCreate.toObject();
          // Populate workspace details for consistency
          const ws = await WorkspaceModel.findById(invitation.tenantId).session(session).lean();
          newUser.workspaces = [{
            ...ws,
            role: invitation.role === 'admin' ? 'admin' : invitation.role === 'manager' ? 'manager' : 'member',
          }];
        } else {
          // ─── INDEPENDENT USER SIGNUP (CREATE DEFAULT WORKSPACE) ───
          const userToCreate = new UserModel({
            provider: provider,
            providerId: profile.id,
            email: email ?? `${provider}_${profile.id}@noemail.social`,
            role: 'admin',
            name: profile.displayName ?? profile.username ?? 'Unnamed User',
            avatar: profile.photos?.[0]?.value ?? '',
            workspaces: [], // Will be populated below
          });

          // Create a new workspace/tenant for this user.
          const newWorkspace = new WorkspaceModel({
            name: `${userToCreate.name}'s Workspace`,
            owner: userToCreate._id,
            members: [{ user: userToCreate._id, role: 'admin' }],
          });

          // Link the workspace using the correct subdocument structure
          userToCreate.workspaces.push({
            workspaceId: newWorkspace._id,
            role: 'admin',
          });
          userToCreate.tenantId = newWorkspace._id;
          userToCreate.tenantRole = 'admin';
          userToCreate.tenantPermissions = ['*'];
          userToCreate.activeTenantId = newWorkspace._id;

          // Create TenantMember record for consistency
          const { default: TenantMember } = await import('../tenant/tenantMember.model.js');
          const newMember = new TenantMember({
            userId: userToCreate._id,
            tenantId: newWorkspace._id,
            role: 'admin',
            permissions: ['*'],
            status: 'active',
            joinedAt: new Date(),
          });

          // Save both documents within the transaction.
          await newWorkspace.save({ session });
          await newMember.save({ session });
          await userToCreate.save({ session });

          newUser = userToCreate.toObject(); // Use toObject() for a plain object, consistent with .lean()
          newUser.workspaces = [{
            ...newWorkspace.toObject(),
            role: 'admin',
          }];
        }
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