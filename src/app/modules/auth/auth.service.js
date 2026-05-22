import bcrypt from 'bcryptjs';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { jwtHelpers } from '../../helpers/jwtHelpers.js';
import { sendMailWithNodeMailer } from '../../middlewares/sendEmail/sendMailWithMailGun.js';
import UserModel from './auth.model.js';
import { registrationOtpTemplate } from './auth.utils.js';
import Token from './token.model.js';
import crypto from 'crypto';
import { createCustomerService } from '../stripe/customer/stripe.service.js';
import TenantInvitation from '../tenant/tenantInvitation.model.js';
import TenantMember from '../tenant/tenantMember.model.js';
import Tenant from '../tenant/tenant.model.js';
import subscriptionService from '../subscription/subscription.service.js';

const deleteUserAccountService = async (userId) => {
  const result = await UserModel.deleteOne({ _id: userId });
  return result;
};
const registerService = async (req) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { password, email, tenantId, invitationToken } = req.body;

    const existingEmail = await UserModel.findOne({ email }).session(session);
    if (existingEmail) {
      await session.abortTransaction();
      throw new ApiError(httpStatus.CONFLICT, 'Email already exists!');
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);

      const userData = { email, password: hashedPassword };

      // If tenantId provided (from invitation), add it to user data
      if (tenantId) {
        userData.activeTenantId = tenantId;
      }

      const user = await UserModel.create([userData], { session });

      let invitationAccepted = false;

      // Auto-accept invitation if token provided
      if (invitationToken) {
        // Pre-check seat limit to block registration if seat usage is at maximum capacity
        const invitation = await TenantInvitation.findOne({
          token: invitationToken,
        });

        if (invitation && invitation.email.toLowerCase() === email.toLowerCase()) {
          if (!invitation.isExpired() && invitation.status === 'pending') {
            const subscription = await subscriptionService.getTenantSubscription(
              invitation.tenantId
            );
            if (
              subscription &&
              !subscription.limits.unlimitedSeats &&
              subscription.seats.used >= subscription.seats.total
            ) {
              throw new ApiError(
                httpStatus.FORBIDDEN,
                'Seat limit reached. This workspace cannot accept more members. Please ask the owner to purchase more seats.'
              );
            }
          }
        }

        try {
          const invitation = await TenantInvitation.findOne({
            token: invitationToken,
          });

          if (
            invitation &&
            invitation.email.toLowerCase() === email.toLowerCase()
          ) {
            if (!invitation.isExpired() && invitation.status === 'pending') {
              // Create TenantMember record
              await TenantMember.create(
                [
                  {
                    userId: user[0]._id,
                    tenantId: invitation.tenantId,
                    role: invitation.role,
                    permissions:
                      invitation.role === 'admin'
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
              user[0].tenantId = invitation.tenantId;
              user[0].tenantRole = invitation.role;
              user[0].activeTenantId = invitation.tenantId;
              user[0].tenantPermissions =
                invitation.role === 'admin'
                  ? ['manage_members', 'manage_content']
                  : ['view_content'];
              user[0].role = 'user'; // Auto-verify user with invitation
              await user[0].save({ session });

              // Update tenant user count
              await Tenant.findByIdAndUpdate(
                invitation.tenantId,
                { $inc: { 'usage.usersCount': 1 } },
                { session }
              );

              // Mark invitation as accepted
              invitation.status = 'accepted';
              invitation.acceptedAt = new Date();
              invitation.acceptedBy = user[0]._id;
              await invitation.save({ session });

              // Add seat to subscription if paid plan
              try {
                const subscription =
                  await subscriptionService.getTenantSubscription(
                    invitation.tenantId
                  );
                if (
                  subscription &&
                  subscription.plan !== 'free' &&
                  subscription.status === 'active'
                ) {
                  await subscriptionService.addSeatToSubscription(
                    subscription._id,
                    user[0]._id
                  );
                  logger.info(
                    `Added seat to subscription ${subscription._id} for new user ${user[0]._id}`
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
            }
          }
        } catch (inviteError) {
          logger.error(
            'Error auto-accepting invitation during registration:',
            inviteError
          );
          // Don't fail registration if invitation accept fails
        }
      }

      // If invitation token provided, skip email verification and directly log in user
      if (invitationToken) {
        // Mark user as verified
        user[0].role = 'user';
        await user[0].save({ session });

        // Create free subscription for new users without tenant
        if (!tenantId) {
          try {
            await subscriptionService.createFreeSubscription(user[0]._id);
            logger.info(
              `Free subscription created for new user: ${user[0]._id}`
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
            _id: user[0]._id,
            email: user[0].email,
            role: user[0].role,
            tenantId: user[0].tenantId,
            activeTenantId: user[0].activeTenantId,
          },
          config.jwt.access_token,
          config.jwt.access_expires_in
        );

        const refreshToken = jwtHelpers.createToken(
          {
            _id: user[0]._id,
            email: user[0].email,
            role: user[0].role,
            tenantId: user[0].tenantId,
            activeTenantId: user[0].activeTenantId,
          },
          config.jwt.refresh_token,
          config.jwt.refresh_expires_in
        );

        logger.info(
          `User registered and auto-logged in with invitation: ${user[0]._id}`
        );

        return {
          user: {
            _id: user[0]._id,
            email: user[0].email,
            role: user[0].role,
            tenantId: user[0].tenantId,
            activeTenantId: user[0].activeTenantId,
            tenantRole: user[0].tenantRole,
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
          userId: user[0]._id,
          token: token,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
          type: 'emailVerification',
        });

        await newToken.save({ newToken });

        const mailData = await registrationOtpTemplate(email, token);
        await sendMailWithNodeMailer(mailData);
      }

      // Create free subscription for new users without tenant
      if (!tenantId) {
        try {
          await subscriptionService.createFreeSubscription(user[0]._id);
          logger.info(`Free subscription created for new user: ${user[0]._id}`);
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

      // ✅ Return appropriate message based on invitation status
      return {
        message: invitationAccepted
          ? 'Registration successful. You can now login.'
          : 'Please verify your E-mail.',
        statusCode: httpStatus.CREATED,
        autoVerified: invitationAccepted,
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
    console.error('Registration Error:', error);

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Couldn't register successfully"
    );
  }
};

const resendEmailConfirmationService = async (email) => {
  const user = await UserModel.findOne({ email });
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
  await newToken.save({ newToken });

  const mailData = await registrationOtpTemplate(email, token);
  await sendMailWithNodeMailer(mailData);
  return { message: 'Verification email resent successfully' };
};

const confirmEmailService = async (confirmationCode) => {
  const token = await Token.findOne({
    token: confirmationCode,
    type: 'emailVerification',
  });
  if (!token) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invalid or expired token');
  }
  console.log(token, 'token');

  const user = await UserModel.findById(token.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  console.log(user, 'user');

  const expired = new Date() > new Date(token.expiresAt);

  if (expired) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Token expired, please register again'
    );
  }

  user.role = 'user';
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
    const tenant = await Tenant.findOne({ subdomain: subdomain.toLowerCase() });
    if (tenant) {
      tenantId = tenant._id.toString();
      logger.info(`Tenant found for subdomain ${subdomain}: ${tenantId}`);
    } else {
      logger.warn(`No tenant found for subdomain: ${subdomain}`);
    }
  }

  const user = await UserModel.findOne({ email }).select('+password');

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
    // Pre-check seat limit to block login auto-acceptance if seat usage is at maximum capacity
    const invitation = await TenantInvitation.findOne({
      token: invitationToken,
    });

    if (invitation && invitation.email.toLowerCase() === email.toLowerCase()) {
      if (!invitation.isExpired() && invitation.status === 'pending') {
        const subscription = await subscriptionService.getTenantSubscription(
          invitation.tenantId
        );
        if (
          subscription &&
          !subscription.limits.unlimitedSeats &&
          subscription.seats.used >= subscription.seats.total
        ) {
          throw new ApiError(
            httpStatus.FORBIDDEN,
            'Seat limit reached. This workspace cannot accept more members. Please ask the owner to purchase more seats.'
          );
        }
      }
    }

    try {
      const invitation = await TenantInvitation.findOne({
        token: invitationToken,
      });

      if (
        invitation &&
        invitation.email.toLowerCase() === email.toLowerCase()
      ) {
        if (!invitation.isExpired() && invitation.status === 'pending') {
          // Check if user is already a member
          const existingMember = await TenantMember.findOne({
            userId: user._id,
            tenantId: invitation.tenantId,
          });

          if (!existingMember) {
            // Create TenantMember record
            await TenantMember.create({
              userId: user._id,
              tenantId: invitation.tenantId,
              role: invitation.role,
              permissions:
                invitation.role === 'admin'
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
              invitation.role === 'admin'
                ? ['manage_members', 'manage_content']
                : ['view_content'];
            await user.save();

            // Update tenant user count
            await Tenant.findByIdAndUpdate(invitation.tenantId, {
              $inc: { 'usage.usersCount': 1 },
            });

            // Add seat to subscription if paid plan
            try {
              const subscription =
                await subscriptionService.getTenantSubscription(
                  invitation.tenantId
                );
              if (
                subscription &&
                subscription.plan !== 'free' &&
                subscription.status === 'active'
              ) {
                await subscriptionService.addSeatToSubscription(
                  subscription._id,
                  user._id
                );
                logger.info(
                  `Added seat to subscription ${subscription._id} for user ${user._id}`
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
        }
      }
    } catch (inviteError) {
      logger.error(
        'Error auto-accepting invitation during login:',
        inviteError
      );
      // Don't fail login if invitation accept fails
    }
  }

  // Fetch all tenantIds for the user from TenantMember collection
  const tenantMemberships = await TenantMember.find({
    userId: user._id,
    status: 'active',
  }).select('tenantId role');

  const tenantIds = tenantMemberships.map((membership) => ({
    tenantId: membership.tenantId,
    role: membership.role,
  }));

  // Include tenants in JWT token payload
  const tokenPayload = {
    _id: user._id,
    role: user.role,
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
        name: user.username || 'No Name',
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

const refreshToken = async (token) => {
  let verifiedToken;
  try {
    // verifiedToken = jwt.verify(token, config.jwt.refresh_secret);
    verifiedToken = jwtHelpers.verifyToken(token, config.jwt.refresh_token);
  } catch (err) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid Refresh Token');
  }

  console.log(verifiedToken, 'verifiedToken');
  const { _id, role } = verifiedToken;
  const isUserExist = await UserModel.isUserExist(_id);
  if (!isUserExist) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User does not exist');
  }

  // Fetch all tenantIds for the user from TenantMember collection
  const tenantMemberships = await TenantMember.find({
    userId: isUserExist._id,
    status: 'active',
  }).select('tenantId role');

  const tenantIds = tenantMemberships.map((membership) => ({
    tenantId: membership.tenantId,
    role: membership.role,
  }));

  //generate new token;
  const newAccessToken = jwtHelpers.createToken(
    {
      id: isUserExist._id,
      role: isUserExist.role,
      tenants: tenantIds,
    },
    config.jwt.access_token,
    config.jwt.access_expires_in
  );
  return {
    accessToken: newAccessToken,
    tenants: tenantIds,
  };
};

const updateUserService = async (userId, data) => {
  const user = UserModel.findOne({ _id: userId });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
  }

  const { email, password, ...updateData } = data; // Avoid updating email/password

  if (Object.keys(updateData).length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No valid fields to update.');
  }

  // Update the data
  const result = await UserModel.updateOne({ _id: userId }, updateData);
  logger.info(result, 'result');
  return result;
};

const getUserService = async (userId) => {
  const user = await UserModel.findOne({ _id: userId });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
  }
  return user;
};

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
