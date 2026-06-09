import bcrypt from 'bcryptjs';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { jwtHelpers } from '../../helpers/jwtHelpers.js';
import { sendMailWithNodeMailer } from '../../middlewares/sendEmail/sendMail.js';
import UserModel from './auth.model.js';
import { registrationOtpTemplate } from './auth.utils.js';
import Token from './token.model.js';
import crypto from 'crypto';
import { createCustomerService } from '../stripe/customer/stripe.service.js';
import TenantInvitation from '../tenant/tenantInvitation.model.js';
import TenantMember from '../tenant/tenantMember.model.js';
import Tenant from '../tenant/tenant.model.js';
import subscriptionService from '../subscription/subscription.service.js';

// Recommendation: Add unique index to UserModel.email for faster lookups and to enforce uniqueness.
// Example: UserModel.schema.index({ email: 1 }, { unique: true });

// Recommendation: Add index to Token.token and Token.userId for faster lookups.
// Recommendation: Add compound index to Token.token and Token.type for confirmEmailService.
// Example: Token.schema.index({ token: 1, type: 1 });

// Recommendation: Add unique index to TenantInvitation.token for faster lookups.
// Example: TenantInvitation.schema.index({ token: 1 }, { unique: true });

// Recommendation: Add compound index to TenantMember.userId and TenantMember.tenantId for faster lookups.
// Recommendation: Add compound index to TenantMember.userId and TenantMember.status for faster lookups.
// Example: TenantMember.schema.index({ userId: 1, tenantId: 1 });
// Example: TenantMember.schema.index({ userId: 1, status: 1 });

// Recommendation: Add unique index to Tenant.subdomain for faster lookups and to enforce uniqueness.
// Example: Tenant.schema.index({ subdomain: 1 }, { unique: true });

/**
 * Deletes a user account from the database.
 *
 * @param {string} userId - The ID of the user to delete.
 * @returns {Promise<object>} A promise that resolves to the result of the delete operation.
 */
const deleteUserAccountService = async (userId) => {
  const result = await UserModel.deleteOne({ _id: userId });
  return result;
};

/**
 * Handles user registration, including email verification, tenant invitation acceptance,
 * and initial subscription creation.
 *
 * If an `invitationToken` is provided and valid, the user is automatically added to the tenant,
 * marked as verified, and logged in directly. Otherwise, an email verification OTP is sent.
 * A free subscription is created for new users if they don't have one.
 *
 * @param {object} req - The Express request object.
 * @param {object} req.body - The request body containing user registration details.
 * @param {string} req.body.email - The user's email address.
 * @param {string} req.body.password - The user's password.
 * @param {string} [req.body.tenantId] - Optional ID of the tenant if registering via an invitation link.
 * @param {string} [req.body.invitationToken] - Optional invitation token for auto-accepting tenant invitations.
 * @returns {Promise<object>} A promise that resolves to an object containing a message, status code,
 *   and optionally user data, access token, and refresh token if auto-logged in.
 * @throws {ApiError} If the email already exists (CONFLICT), password is not provided (BAD_REQUEST),
 *   seat limit is reached (FORBIDDEN), or an unexpected error occurs (INTERNAL_SERVER_ERROR).
 */
const registerService = async (req) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { password, email, tenantId, invitationToken } = req.body;

    // Optimization: Use .lean() as we only check for existence and don't modify the document.
    const existingEmail = await UserModel.findOne({ email }).session(session).lean();
    if (existingEmail) {
      await session.abortTransaction();
      throw new ApiError(httpStatus.CONFLICT, 'Email already exists!');
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 12);

      const userData = { email, password: hashedPassword };

      // If tenantId provided (from invitation), add it to user data
      if (tenantId) {
        userData.activeTenantId = tenantId;
      }

      const user = await UserModel.create([userData], { session });
      const newUser = user[0]; // Get the created user document

      // Renamed for clarity: indicates if email verification was bypassed/auto-verified
      let emailAutoVerified = false;

      // Auto-accept invitation if token provided
      if (invitationToken) {
        // Fetch invitation once and reuse
        const invitation = await TenantInvitation.findOne({
          token: invitationToken,
        });

        if (invitation && invitation.email.toLowerCase() === email.toLowerCase()) {
          if (!invitation.isExpired() && invitation.status === 'pending') {
            // Optimization: Fetch subscription once and reuse
            const tenantSubscription = await subscriptionService.getTenantSubscription(
              invitation.tenantId
            );
            if (
              tenantSubscription &&
              !tenantSubscription.limits.unlimitedSeats &&
              tenantSubscription.seats.used >= tenantSubscription.seats.total
            ) {
              throw new ApiError(
                httpStatus.FORBIDDEN,
                'Seat limit reached. This workspace cannot accept more members. Please ask the owner to purchase more seats.'
              );
            }

            try {
              // Create TenantMember record
              await TenantMember.create(
                [
                  {
                    userId: newUser._id,
                    tenantId: invitation.tenantId,
                    role: invitation.role,
                    permissions:
                      invitation.role === 'admin' || invitation.role === 'manager'
                        ? ['manage_members', 'manage_content']
                        : ['view_content'],
                    status: 'active',
                    invitedBy: invitation.invitedBy,
                    joinedAt: new Date(),
                  },
                ],
                { session }
              );

              // Update user with tenant info and auto-verify
              newUser.tenantId = invitation.tenantId;
              newUser.tenantRole = invitation.role;
              newUser.activeTenantId = invitation.tenantId;
              newUser.tenantPermissions =
                invitation.role === 'admin' || invitation.role === 'manager'
                  ? ['manage_members', 'manage_content']
                  : ['view_content'];
              newUser.role = 'user'; // Auto-verify user with invitation

              // Update tenant user count
              await Tenant.findByIdAndUpdate(
                invitation.tenantId,
                { $inc: { 'usage.usersCount': 1 } },
                { session }
              );

              // Mark invitation as accepted
              invitation.status = 'accepted';
              invitation.acceptedAt = new Date();
              invitation.acceptedBy = newUser._id;
              await invitation.save({ session });

              // Add seat to subscription if paid plan
              try {
                if (
                  tenantSubscription && // Use the already fetched subscription
                  tenantSubscription.plan !== 'free' &&
                  tenantSubscription.status === 'active'
                ) {
                  await subscriptionService.addSeatToSubscription(
                    tenantSubscription._id,
                    newUser._id
                  );
                  logger.info(
                    `Added seat to subscription ${tenantSubscription._id} for new user ${newUser._id}`
                  );
                }
              } catch (seatError) {
                logger.error(
                  'Error adding seat during registration:',
                  seatError
                );
                // Don't fail registration if seat addition fails
              }

              logger.info(
                `Invitation auto-accepted during registration: ${invitation._id}`
              );
            } catch (inviteError) {
              logger.error(
                'Error auto-accepting invitation during registration:',
                inviteError
              );
              // Don't fail registration if invitation accept fails
            }
          }
        }

        // If invitation token provided, skip email verification and directly log in user
        // Mark user as verified (this was already set in the block above if invitation was valid,
        // but ensure it's set if invitation was invalid/expired but token was present)
        newUser.role = 'user';
        // Optimization: Consolidate user save. This save will include all updates from the invitation block.
        await newUser.save({ session });

        // Create free subscription for new users without tenant
        // Optimization: This block is duplicated. Consolidate it to happen once at the end if needed.
        // For now, keep it here as it's part of the auto-login flow.
        if (!tenantId && !newUser.subscriptionId) { // Check if subscriptionId is already set
          try {
            await subscriptionService.createFreeSubscription(newUser._id);
            logger.info(
              `Free subscription created for new user: ${newUser._id}`
            );
          } catch (subError) {
            logger.error(
              'Error creating free subscription during registration:',
              subError
            );
          }
        }

        await session.commitTransaction();
        session.endSession();

        // Generate tokens and return login response
        const accessToken = jwtHelpers.createToken(
          {
            _id: newUser._id,
            email: newUser.email,
            role: newUser.role,
            tenantId: newUser.tenantId,
            activeTenantId: newUser.activeTenantId,
          },
          config.jwt.access_token,
          config.jwt.access_expires_in
        );

        const refreshToken = jwtHelpers.createToken(
          {
            _id: newUser._id,
            email: newUser.email,
            role: newUser.role,
            tenantId: newUser.tenantId,
            activeTenantId: newUser.activeTenantId,
          },
          config.jwt.refresh_token,
          config.jwt.refresh_expires_in
        );

        logger.info(
          `User registered and auto-logged in with invitation: ${newUser._id}`
        );

        return {
          user: {
            _id: newUser._id,
            email: newUser.email,
            role: newUser.role,
            tenantId: newUser.tenantId,
            activeTenantId: newUser.activeTenantId,
            tenantRole: newUser.tenantRole,
          },
          accessToken,
          refreshToken,
          message: 'Registration successful. You are now logged in.',
          statusCode: httpStatus.CREATED,
        };
      } else {
        //Generate 6 digit token only numbers
        const token = crypto.randomInt(100000, 999999).toString();

        const newToken = new Token({
          userId: newUser._id,
          token: token,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
          type: 'emailVerification',
        });

        await newToken.save({ session });

        logger.info(`[Verification OTP] Verification code for ${email}: ${token}`);

        try {
          const mailData = await registrationOtpTemplate(email, token);
          await sendMailWithNodeMailer(mailData);
          logger.info(`Verification email sent successfully to ${email}`);
        } catch (mailError) {
          logger.error(`Failed to send verification email to ${email}:`, mailError);
          // Auto-verify if bypass flag is set, or if we are not in production
          if (process.env.BYPASS_EMAIL_VERIFICATION === 'true' || process.env.NODE_ENV !== 'production') {
            logger.info(`Bypassing email verification for ${email} due to mail error - auto-verifying user.`);
            newUser.role = 'user';
            await newUser.save({ session });
            emailAutoVerified = true; // Set flag for return message
          }
        }
      }

      // Create free subscription for new users without tenant (if not already handled by invitation flow)
      // Optimization: Consolidate this logic to avoid duplication.
      // This block will only run if invitationToken was NOT provided.
      if (!tenantId && !newUser.subscriptionId) { // Check if subscriptionId is already set
        try {
          await subscriptionService.createFreeSubscription(newUser._id);
          logger.info(`Free subscription created for new user: ${newUser._id}`);
        } catch (subError) {
          logger.error(
            'Error creating free subscription during registration:',
            subError
          );
          // Don't fail registration if subscription creation fails
        }
      }

      await session.commitTransaction();
      session.endSession();

      // ✅ Return appropriate message based on email verification status
      return {
        message: emailAutoVerified
          ? 'Registration successful. You can now login.'
          : 'Please verify your E-mail.',
        statusCode: httpStatus.CREATED,
        autoVerified: emailAutoVerified,
      };
    }

    // fallback if no password provided (this shouldn't usually happen)
    await session.abortTransaction();
    session.endSession();
    throw new ApiError(httpStatus.BAD_REQUEST, 'Password is required.');
  } catch (error) {
    await session.abortTransaction().catch(() => {});
    session.endSession();

    // Only rethrow if it's already an ApiError
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Registration Error:', error);

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Couldn't register successfully"
    );
  }
};

/**
 * Resends the email verification OTP to a user.
 *
 * @param {string} email - The email address of the user.
 * @returns {Promise<object>} A promise that resolves to an object with a success message.
 * @throws {ApiError} If the user is not found (NOT_FOUND) or the email is already verified (BAD_REQUEST).
 */
const resendEmailConfirmationService = async (email) => {
  // Optimization: Use .lean() as we only read user properties and don't modify the document.
  const user = await UserModel.findOne({ email }).lean();
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (user.role !== 'unauthorized') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email is already verified');
  }
  const token = crypto.randomInt(100000, 999999).toString();

  const newToken = new Token({
    userId: user._id,
    token: token,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    type: 'emailVerification',
  });
  // BUG FIX: Corrected newToken.save() call
  await newToken.save();

  const mailData = await registrationOtpTemplate(email, token);
  await sendMailWithNodeMailer(mailData);
  return { message: 'Verification email resent successfully' };
};

/**
 * Confirms a user's email address using a verification code.
 * Upon successful confirmation, the user's role is updated, and a free subscription is created if they don't have one.
 *
 * @param {string} confirmationCode - The 6-digit OTP received by the user.
 * @returns {Promise<object>} A promise that resolves to an object indicating success.
 * @throws {ApiError} If the token is invalid or expired (NOT_FOUND, UNAUTHORIZED), or user is not found (NOT_FOUND).
 */
const confirmEmailService = async (confirmationCode) => {
  // Optimization: Use .lean() as we only read token properties and delete it later.
  const token = await Token.findOne({
    token: confirmationCode,
    type: 'emailVerification',
  }).lean();
  if (!token) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invalid or expired token');
  }

  const user = await UserModel.findById(token.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const expired = new Date() > new Date(token.expiresAt);

  if (expired) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Token expired, please register again'
    );
  }

  const emailLower = user.email ? user.email.toLowerCase() : '';
  const superAdminEmail = (config.superAdminEmail || '').toLowerCase();
  if (superAdminEmail && emailLower === superAdminEmail) {
    user.role = 'super_admin';
  } else if (!user.tenantId) {
    user.role = 'admin';
  } else {
    user.role = 'user';
  }
  // These fields are not typically part of the User model for OTP verification
  // and might be redundant if not defined in the schema.
  // Keeping them as they are harmless if not present.
  user.confirmationToken = undefined;
  user.confirmationTokenExpires = undefined;

  await user.save({ validateBeforeSave: false });
  await Token.deleteOne({ _id: token._id });

  // Create free subscription if user doesn't have one
  if (!user.subscriptionId) {
    try {
      await subscriptionService.createFreeSubscription(user._id, user.tenantId);
      logger.info(
        `Free subscription created for user after email confirmation: ${user._id}`
      );
    } catch (subError) {
      logger.error(
        'Error creating free subscription after email confirmation:',
        subError
      );
      // Don't fail email confirmation if subscription creation fails
    }
  }

  return { success: true };
};

/**
 * Handles user login, including password verification, tenant resolution (via subdomain or invitation),
 * auto-tenant creation for new users, and token generation.
 *
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password.
 * @param {string} [tenantId=null] - Optional ID of the tenant to log into.
 * @param {string} [invitationToken=null] - Optional invitation token for auto-accepting tenant invitations during login.
 * @param {string} [subdomain=null] - Optional subdomain to identify the tenant.
 * @returns {Promise<object>} A promise that resolves to an object containing user ID, access token,
 *   refresh token, and a list of tenant memberships.
 * @throws {ApiError} If email or password are not provided (BAD_REQUEST), user not found (NOT_FOUND),
 *   email not verified (UNAUTHORIZED), invalid credentials (UNAUTHORIZED), or seat limit reached (FORBIDDEN).
 */
const loginService = async (
  email,
  password,
  tenantId = null,
  invitationToken = null,
  subdomain = null
) => {
  if (!email || !password) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Email and password are required'
    );
  }

  // If subdomain is provided, check if tenant exists
  if (subdomain) {
    // Optimization: Use .lean() as we only read tenant properties and don't modify the document.
    const tenant = await Tenant.findOne({ subdomain: subdomain.toLowerCase() }).lean();
    if (tenant) {
      tenantId = tenant._id.toString();
      logger.info(`Tenant found for subdomain ${subdomain}: ${tenantId}`);
    } else {
      logger.warn(`No tenant found for subdomain: ${subdomain}`);
    }
  }

  // BUG FIX: Ensure 'username' is selected for Stripe customer creation later
  const user = await UserModel.findOne({ email }).select('+password username');

  if (!user) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'User not found, please register first'
    );
  }
  if (user.role === 'unauthorized') {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Please verify your email first'
    );
  }

  if (user && !user?.password) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This account was created using social login. Please log in using your social provider.'
    );
  }

  const passwordCheck = await bcrypt.compare(password, user.password);

  if (!passwordCheck) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid credentials');
  }

  // Auto-accept invitation if token provided
  if (invitationToken) {
    // Fetch invitation once and reuse
    const invitation = await TenantInvitation.findOne({
      token: invitationToken,
    });

    if (invitation && invitation.email.toLowerCase() === email.toLowerCase()) {
      if (!invitation.isExpired() && invitation.status === 'pending') {
        // Optimization: Fetch subscription once and reuse
        const tenantSubscription = await subscriptionService.getTenantSubscription(
          invitation.tenantId
        );
        if (
          tenantSubscription &&
          !tenantSubscription.limits.unlimitedSeats &&
          tenantSubscription.seats.used >= tenantSubscription.seats.total
        ) {
          throw new ApiError(
            httpStatus.FORBIDDEN,
            'Seat limit reached. This workspace cannot accept more members. Please ask the owner to purchase more seats.'
          );
        }

        try {
          // Check if user is already a member
          // Optimization: Use .lean() as we only check for existence.
          const existingMember = await TenantMember.findOne({
            userId: user._id,
            tenantId: invitation.tenantId,
          }).lean();

          if (!existingMember) {
            // Create TenantMember record
            await TenantMember.create({
              userId: user._id,
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

            // Update user with tenant info
            user.tenantId = invitation.tenantId;
            user.tenantRole = invitation.role;
            user.activeTenantId = invitation.tenantId;
            user.tenantPermissions =
              invitation.role === 'admin' || invitation.role === 'manager'
                ? ['manage_members', 'manage_content']
                : ['view_content'];
            await user.save();

            // Update tenant user count
            await Tenant.findByIdAndUpdate(invitation.tenantId, {
              $inc: { 'usage.usersCount': 1 },
            });

            // Add seat to subscription if paid plan
            try {
              if (
                tenantSubscription && // Use the already fetched subscription
                tenantSubscription.plan !== 'free' &&
                tenantSubscription.status === 'active'
              ) {
                await subscriptionService.addSeatToSubscription(
                  tenantSubscription._id,
                  user._id
                );
                logger.info(
                  `Added seat to subscription ${tenantSubscription._id} for user ${user._id}`
                );
              }
            } catch (seatError) {
              logger.error(
                'Error adding seat during login invitation acceptance:',
                seatError
              );
              // Don't fail login if seat addition fails
            }

            logger.info(
              `Invitation auto-accepted during login: ${invitation._id}`
            );
          } else {
            // User already member, just set as active tenant
            user.activeTenantId = invitation.tenantId;
            await user.save();
          }

          // Mark invitation as accepted
          invitation.status = 'accepted';
          invitation.acceptedAt = new Date();
          invitation.acceptedBy = user._id;
          await invitation.save();
        } catch (inviteError) {
          logger.error(
            'Error auto-accepting invitation during login:',
            inviteError
          );
          // Don't fail login if invitation accept fails
        }
      }
    }
  }

  // Fetch all tenantIds for the user from TenantMember collection
  // Optimization: Use .lean() as we only map properties and don't modify the documents.
  let tenantMemberships = await TenantMember.find({
    userId: user._id,
    status: 'active',
  }).select('tenantId role').lean();

  if (tenantMemberships.length === 0) {
    const emailPrefix = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'workspace';
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    const uniqueSlug = `${emailPrefix}-${randomSuffix}`;
    const uniqueSubdomain = `${emailPrefix}-${randomSuffix}`;
    const workspaceName = `${user.username || user.email.split('@')[0]}'s Workspace`;

    logger.info(`Auto-creating tenant for user ${user._id}: slug=${uniqueSlug}, subdomain=${uniqueSubdomain}`);

    try {
      // 1. Create tenant
      const newTenant = await Tenant.create({
        name: workspaceName,
        slug: uniqueSlug,
        subdomain: uniqueSubdomain,
        ownerId: user._id,
        plan: 'free',
        status: 'trial',
      });

      // 2. Create TenantMember record for owner
      await TenantMember.create({
        userId: user._id,
        tenantId: newTenant._id,
        role: 'admin',
        permissions: ['*'],
        status: 'active',
        joinedAt: new Date(),
      });

      // 3. Update user profile to link activeTenantId
      user.tenantId = newTenant._id;
      user.tenantRole = 'admin';
      user.tenantPermissions = ['*'];
      user.activeTenantId = newTenant._id;
      await user.save();

      // 4. Create Stripe customer for the tenant
      try {
        const stripeCustomer = await createCustomerService({
          email: user.email,
          name: workspaceName,
          metadata: {
            tenantId: newTenant._id.toString(),
            tenantSlug: newTenant.slug,
            ownerId: user._id.toString(),
          },
        });
        newTenant.subscription = {
          ...newTenant.subscription,
          stripeCustomerId: stripeCustomer.id,
        };
        await newTenant.save();
      } catch (stripeError) {
        logger.error('Error creating Stripe customer for auto-created tenant:', stripeError);
      }

      // 5. Create free subscription for the tenant
      try {
        await subscriptionService.createFreeSubscription(user._id, newTenant._id);
      } catch (subError) {
        logger.error('Failed to create subscription for auto-created tenant:', subError);
      }

      // Refetch memberships
      // Optimization: Use .lean() as we only map properties and don't modify the documents.
      tenantMemberships = await TenantMember.find({
        userId: user._id,
        status: 'active',
      }).select('tenantId role').lean();
    } catch (createError) {
      logger.error('Failed to auto-create tenant on login:', createError);
    }
  }

  const tenantIds = tenantMemberships.map((membership) => ({
    tenantId: membership.tenantId,
    role: membership.role,
  }));

  const userEmail = user.email ? user.email.toLowerCase() : '';
  const superAdminEmail = (config.superAdminEmail || '').toLowerCase();
  const resolvedRole = (superAdminEmail && userEmail === superAdminEmail) ? 'super_admin' : user.role;

  // Include tenants in JWT token payload
  const tokenPayload = {
    _id: user._id,
    role: resolvedRole,
    tenants: tenantIds,
  };

  const accessToken = jwtHelpers.createToken(
    tokenPayload,
    config.jwt.access_token,
    config.jwt.access_expires_in
  );
  const refreshToken = jwtHelpers.createToken(
    tokenPayload,
    config.jwt.refresh_token,
    config.jwt.refresh_expires_in
  );
  const isStripeAccountConnected = user?.stripeAccountId;
  if (!isStripeAccountConnected) {
    try {
      const stripeAccountId = await createCustomerService({
        email: user.email,
        name: user.username || 'No Name', // 'username' is now selected
      });
      user.stripeAccountId = stripeAccountId.id;
      await user.save();
    } catch (error) {
      logger.error('Error creating Stripe customer:', error);
    }
  }
  return {
    _id: user._id,
    accessToken,
    refreshToken,
    tenants: tenantIds,
  };
};

/**
 * Generates a new access token and a new refresh token using an existing valid refresh token.
 * This process is often referred to as token rotation.
 *
 * @param {string} token - The existing refresh token.
 * @returns {Promise<object>} A promise that resolves to an object containing the new access token,
 *   the new refresh token, and the user's tenant memberships.
 * @throws {ApiError} If the refresh token is invalid (FORBIDDEN) or the user does not exist (NOT_FOUND).
 */
const refreshToken = async (token) => {
  let verifiedToken;
  try {
    verifiedToken = jwtHelpers.verifyToken(token, config.jwt.refresh_token);
  } catch (err) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid Refresh Token');
  }

  const { _id, role } = verifiedToken;
  // Optimization: Use .lean() as we only read user properties and don't modify the document.
  const user = await UserModel.findById(_id).lean();
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User does not exist');
  }

  // Fetch all tenantIds for the user from TenantMember collection
  // Optimization: Use .lean() as we only map properties and don't modify the documents.
  const tenantMemberships = await TenantMember.find({
    userId: user._id,
    status: 'active',
  }).select('tenantId role').lean();

  const tenantIds = tenantMemberships.map((membership) => ({
    tenantId: membership.tenantId,
    role: membership.role,
  }));

  const userEmail = user.email ? user.email.toLowerCase() : '';
  const superAdminEmail = (config.superAdminEmail || '').toLowerCase();
  const resolvedRole = (superAdminEmail && userEmail === superAdminEmail) ? 'super_admin' : user.role;

  // Token payload for both access and refresh tokens
  const tokenPayload = {
    _id: user._id,
    // BUG FIX: Removed redundant 'id' field from payload
    role: resolvedRole,
    tenants: tenantIds,
  };

  // Generate new access token
  const newAccessToken = jwtHelpers.createToken(
    tokenPayload,
    config.jwt.access_token,
    config.jwt.access_expires_in
  );

  // Token rotation: generate a NEW refresh token and invalidate the old one
  const newRefreshToken = jwtHelpers.createToken(
    tokenPayload,
    config.jwt.refresh_token,
    config.jwt.refresh_expires_in
  );

  return {
    accessToken: newAccessToken,
    newRefreshToken,
    tenants: tenantIds,
  };
};

/**
 * Updates a user's profile information.
 * Prevents direct updates to email and password through this service.
 *
 * @param {string} userId - The ID of the user to update.
 * @param {object} data - An object containing the fields to update.
 * @returns {Promise<object>} A promise that resolves to the result of the update operation.
 * @throws {ApiError} If the user is not found (NOT_FOUND) or no valid fields are provided for update (BAD_REQUEST).
 */
const updateUserService = async (userId, data) => {
  // Optimization: Use .lean() as we only check for existence and don't modify the document.
  const user = await UserModel.findOne({ _id: userId }).lean();

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
  }

  const { email, password, ...updateData } = data; // Avoid updating email/password

  if (Object.keys(updateData).length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No valid fields to update.');
  }

  // Update the data
  const result = await UserModel.updateOne({ _id: userId }, updateData);
  logger.info('User profile updated');
  return result;
};

/**
 * Retrieves a user's profile by their ID.
 *
 * @param {string} userId - The ID of the user to retrieve.
 * @returns {Promise<object>} A promise that resolves to the user document.
 * @throws {ApiError} If the user is not found (NOT_FOUND).
 */
const getUserService = async (userId) => {
  // Optimization: Use .lean() as the user document is likely just returned as JSON.
  const user = await UserModel.findOne({ _id: userId }).lean();
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
  }
  return user;
};

/**
 * @typedef {object} AuthService
 * @property {function(string): Promise<object>} deleteUserAccountService - Deletes a user account.
 * @property {function(object): Promise<object>} registerService - Handles user registration.
 * @property {function(string): Promise<object>} confirmEmailService - Confirms a user's email.
 * @property {function(string): Promise<object>} resendEmailConfirmationService - Resends email verification.
 * @property {function(string, string, string?, string?, string?): Promise<object>} loginService - Handles user login.
 * @property {function(string): Promise<object>} refreshToken - Generates new access and refresh tokens.
 * @property {function(string, object): Promise<object>} updateUserService - Updates a user's profile.
 * @property {function(string): Promise<object>} getUserService - Retrieves a user's profile.
 */

/**
 * Exported object containing all authentication-related service functions.
 * @type {AuthService}
 */
export const authService = {
  deleteUserAccountService,
  registerService,
  confirmEmailService,
  resendEmailConfirmationService,
  loginService,
  refreshToken,
  updateUserService,
  getUserService,
};