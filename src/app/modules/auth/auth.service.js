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

const deleteUserAccountService = async userId => {
  const result = await UserModel.deleteOne({ _id: userId });
  return result;
};
const registerService = async req => {
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

      const user = await UserModel.create(
        [userData],
        { session },
      );

      // Auto-accept invitation if token provided
      if (invitationToken) {
        try {
          const invitation = await TenantInvitation.findOne({ token: invitationToken });

          if (invitation && invitation.email.toLowerCase() === email.toLowerCase()) {
            if (!invitation.isExpired() && invitation.status === 'pending') {
              // Create TenantMember record
              await TenantMember.create([{
                userId: user[0]._id,
                tenantId: invitation.tenantId,
                role: invitation.role,
                permissions: invitation.role === 'admin' ? ['manage_members', 'manage_content'] : ['view_content'],
                status: 'active',
                invitedBy: invitation.invitedBy,
                joinedAt: new Date(),
              }], { session });

              // Update user with tenant info
              user[0].tenantId = invitation.tenantId;
              user[0].tenantRole = invitation.role;
              user[0].activeTenantId = invitation.tenantId;
              user[0].tenantPermissions = invitation.role === 'admin' ? ['manage_members', 'manage_content'] : ['view_content'];
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

              logger.info(`Invitation auto-accepted during registration: ${invitation._id}`);
            }
          }
        } catch (inviteError) {
          logger.error('Error auto-accepting invitation during registration:', inviteError);
          // Don't fail registration if invitation accept fails
        }
      }

      //Generate 6 digit token only numbers
      const token = crypto.randomInt(100000, 999999).toString();

      const newToken = new Token({
        userId: user[0]._id,
        token: token,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        type: 'emailVerification',
      })

      await newToken.save({ newToken });

      const mailData = await registrationOtpTemplate(email, token);
      await sendMailWithNodeMailer(mailData);

      await session.commitTransaction();
      session.endSession();

      // ✅ Instead of throwing, return a success response
      return {
        message: 'Please verify your E-mail.',
        statusCode: httpStatus.CREATED,
      };
    }

    // fallback if no password provided (this shouldn't usually happen)
    await session.abortTransaction();
    session.endSession();
    throw new ApiError(httpStatus.BAD_REQUEST, 'Password is required.');
  } catch (error) {
    await session.abortTransaction().catch(() => { });
    session.endSession();

    // Only rethrow if it's already an ApiError
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Registration Error:', error);

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Couldn't register successfully",
    );
  }
};

const resendEmailConfirmationService = async email => {
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
  })
  await newToken.save({ newToken });

  const mailData = await registrationOtpTemplate(email, token);
  await sendMailWithNodeMailer(mailData);
  return { message: 'Verification email resent successfully' };
}

const confirmEmailService = async confirmationCode => {
  const token = await Token.findOne({ token: confirmationCode, type: 'emailVerification' });
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
      'Token expired, please register again',
    );
  }

  user.role = 'user';
  user.confirmationToken = undefined;
  user.confirmationTokenExpires = undefined;

  await user.save({ validateBeforeSave: false });
  await Token.deleteOne({ _id: token._id });

  return { success: true };
};

const loginService = async (email, password, tenantId = null, invitationToken = null) => {
  if (!email || !password) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Email and password are required',
    );
  }
  const user = await UserModel.findOne({ email }).select('+password');

  if (!user) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'User not found, please register first',
    );
  }
  if (user.role === 'unauthorized') {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Please verify your email first',
    );
  }

  if (user && !user?.password) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This account was created using social login. Please log in using your social provider.',
    );
  }

  const passwordCheck = await bcrypt.compare(password, user.password);

  if (!passwordCheck) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid credentials');
  }

  // Auto-accept invitation if token provided
  if (invitationToken) {
    try {
      const invitation = await TenantInvitation.findOne({ token: invitationToken });

      if (invitation && invitation.email.toLowerCase() === email.toLowerCase()) {
        if (!invitation.isExpired() && invitation.status === 'pending') {
          // Check if user is already a member
          const existingMember = await TenantMember.findOne({
            userId: user._id,
            tenantId: invitation.tenantId
          });

          if (!existingMember) {
            // Create TenantMember record
            await TenantMember.create({
              userId: user._id,
              tenantId: invitation.tenantId,
              role: invitation.role,
              permissions: invitation.role === 'admin' ? ['manage_members', 'manage_content'] : ['view_content'],
              status: 'active',
              invitedBy: invitation.invitedBy,
              joinedAt: new Date(),
            });

            // Update user with tenant info
            user.tenantId = invitation.tenantId;
            user.tenantRole = invitation.role;
            user.activeTenantId = invitation.tenantId;
            user.tenantPermissions = invitation.role === 'admin' ? ['manage_members', 'manage_content'] : ['view_content'];
            await user.save();

            // Update tenant user count
            await Tenant.findByIdAndUpdate(
              invitation.tenantId,
              { $inc: { 'usage.usersCount': 1 } }
            );

            logger.info(`Invitation auto-accepted during login: ${invitation._id}`);
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

          // Override tenantId for token generation
          tenantId = invitation.tenantId;
        }
      }
    } catch (inviteError) {
      logger.error('Error auto-accepting invitation during login:', inviteError);
      // Don't fail login if invitation accept fails
    }
  }

  // If tenantId provided during login (from invitation), update user's active tenant
  if (tenantId && !invitationToken) {
    user.activeTenantId = tenantId;
    await user.save();
  }

  // Include tenantId in JWT if user has active tenant
  const tokenPayload = {
    _id: user._id,
    role: user.role,
  };

  if (user.activeTenantId || tenantId) {
    tokenPayload.tenantId = tenantId || user.activeTenantId;
  }

  const accessToken = jwtHelpers.createToken(
    tokenPayload,
    config.jwt.access_token,
    config.jwt.access_expires_in,
  );
  const refreshToken = jwtHelpers.createToken(
    tokenPayload,
    config.jwt.refresh_token,
    config.jwt.refresh_expires_in,
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
  };
};

const refreshToken = async token => {
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
  //generate new token;
  const newAccessToken = jwtHelpers.createToken(
    {
      id: isUserExist._id,
      role: isUserExist.role,
    },
    config.jwt.access_token,
    config.jwt.access_expires_in,
  );
  return {
    accessToken: newAccessToken,
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

const getUserService = async userId => {
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
