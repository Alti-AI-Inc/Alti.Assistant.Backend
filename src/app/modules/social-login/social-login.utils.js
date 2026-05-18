import UserModel from '../auth/auth.model.js';

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
      user = await UserModel.findOne({ email: email });

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
