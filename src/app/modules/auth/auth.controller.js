import bcrypt from 'bcryptjs';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { sendMailWithMailGun } from '../../middlewares/sendEmail/sendMail.js';
import UserModel from './auth.model.js';
import { authService } from './auth.service.js';
import {
  deleteUserOtpTemplate,
  forgetPassOtpTemplate,
  generateOTP,
} from './auth.utils.js';
import TenantInvitation from '../tenant/tenantInvitation.model.js';
import managerController from '../manager/manager.controller.js';

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: User authentication and authorization operations
 */

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Registers a new user with email, password, and other details.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 description: User's full name.
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address. Must be unique.
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 description: User's password.
 *                 example: password123
 *               role:
 *                 type: string
 *                 enum: [user, admin, super_admin]
 *                 description: User's role. Defaults to 'user'.
 *                 example: user
 *               tenantId:
 *                 type: string
 *                 description: Optional tenant ID if registering within a specific tenant.
 *                 example: 60d0fe4f5b867d001c8f1a92
 *               invitationToken:
 *                 type: string
 *                 description: Optional invitation token if registering via an invitation.
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *             example:
 *               name: John Doe
 *               email: john.doe@example.com
 *               password: password123
 *               role: user
 *     responses:
 *       200:
 *         description: User registered successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User registered successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     accessToken:
 *                       type: string
 *                       description: JWT access token.
 *                     refreshToken:
 *                       type: string
 *                       description: JWT refresh token.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const register = catchAsync(async (req, res) => {
  const result = await authService.registerService(req);
  logger.info('User registration completed');
  sendResponse(res, {
    statusCode: result.statusCode || httpStatus.OK,
    success: true,
    message: result.message,
    data: result.accessToken
      ? {
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        }
      : null,
  });
});

/**
 * @swagger
 * /api/v1/auth/resend-email-confirmation:
 *   post:
 *     summary: Resend email confirmation
 *     description: Resends the email confirmation link to the provided email address.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email address to resend the confirmation to.
 *                 example: john.doe@example.com
 *     responses:
 *       200:
 *         description: Email confirmation resent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Email confirmation resent successfully
 *                 data:
 *                   type: object
 *                   nullable: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const resendEmailConfirmation = catchAsync(async (req, res) => {
  const { email } = req.body;
  const result = await authService.resendEmailConfirmationService(email);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

/**
 * @swagger
 * /api/v1/auth/confirm-email:
 *   post:
 *     summary: Confirm user email
 *     description: Confirms a user's email address using a verification token.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: The email confirmation token received by the user.
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Email confirmed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Email confirmed successfully
 *                 data:
 *                   type: object
 *                   nullable: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const confirmEmail = catchAsync(async (req, res) => {
  const { token } = req.body;
  const result = await authService.confirmEmailService(token);
  if (result instanceof ApiError) {
    // If an ApiError is returned, handle it as an error response
    return sendResponse(res, {
      statusCode: result.statusCode,
      success: false,
      message: result.message,
    });
  }

  // If no error, redirect to the URL
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Email confirmed successfully',
    data: null,
  });
});

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticates a user and provides access and refresh tokens.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address.
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User's password.
 *                 example: password123
 *               tenantId:
 *                 type: string
 *                 description: Optional tenant ID for tenant-specific login.
 *                 example: 60d0fe4f5b867d001c8f1a92
 *               invitationToken:
 *                 type: string
 *                 description: Optional invitation token if logging in after accepting an invitation.
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *               subdomain:
 *                 type: string
 *                 description: Optional subdomain for tenant-specific login.
 *                 example: mycompany
 *     responses:
 *       200:
 *         description: User logged in successfully.
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               example: refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; Path=/; HttpOnly; Secure; SameSite=None
 *             description: Refresh token set as an HTTP-only cookie.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Login Successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: JWT access token.
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     invitation:
 *                       $ref: '#/components/schemas/TenantInvitation'
 *                       nullable: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const login = catchAsync(async (req, res) => {
  // logger.info(req.body, 'data login');
  const { email, password, tenantId, invitationToken, subdomain } = req.body;
  const result = await authService.loginService(
    email,
    password,
    tenantId,
    invitationToken,
    subdomain
  );
  logger.info('User login completed');

  const { refreshToken, ...others } = result;

  // Set Refresh Token into cookie
  const cookieOption = {
    secure: config.env === 'production',
    httpOnly: true,
    sameSite: config.env === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds — matches JWT refresh expiry
  };
  const invitation = TenantInvitation.findByToken(invitationToken);
  res.cookie('refreshToken', refreshToken, cookieOption);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Login Successfully',
    data: {
      ...others,
      invitation: invitation || null,
    },
  });
});

/**
 * @swagger
 * /api/v1/auth/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     description: Refreshes the user's access token using a refresh token stored in cookies.
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Access token refreshed successfully.
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *               example: refreshToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; Path=/; HttpOnly; Secure; SameSite=None
 *             description: New refresh token set as an HTTP-only cookie (token rotation).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User logged in successfully !
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       description: New JWT access token.
 *                     newRefreshToken:
 *                       type: string
 *                       description: New JWT refresh token (for cookie).
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies;

  const result = await authService.refreshToken(refreshToken);

  // Set refresh token cookie with rotation — issue new refresh token
  const cookieOptions = {
    secure: config.env === 'production',
    httpOnly: true,
    sameSite: config.env === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  // Token rotation: set the NEW refresh token from the result
  res.cookie('refreshToken', result.newRefreshToken || refreshToken, cookieOptions);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User logged in successfully !',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/auth/forget-password:
 *   post:
 *     summary: Request password reset OTP
 *     description: Sends a One-Time Password (OTP) to the user's email for password reset.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email address of the user requesting a password reset.
 *                 example: john.doe@example.com
 *     responses:
 *       200:
 *         description: OTP sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: Success
 *                 message:
 *                   type: string
 *                   example: OTP sent successfully!
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: You entered the wrong email
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const forgetPassword = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email } = req.body;
    const user = await UserModel.findOne({ email: email }).session(session);

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ error: 'You entered the wrong email' });
    }

    const OTP = await generateOTP();
    const OTPExpiration = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes

    user.resetPasswordOTP = OTP;
    user.resetPasswordExpires = OTPExpiration;
    await user.save({ session });

    const mailData = await forgetPassOtpTemplate(email, user, OTP);
    await sendMailWithMailGun(mailData);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: 'Success',
      message: 'OTP sent successfully!',
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).send({ error: 'Something went wrong!' });
  }
};

/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset user password
 *     description: Resets the user's password using a valid OTP and email.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email address of the user.
 *                 example: john.doe@example.com
 *               otp:
 *                 type: string
 *                 description: The OTP received by the user.
 *                 example: 123456
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 description: The new password for the user.
 *                 example: newPassword123
 *     responses:
 *       200:
 *         description: Password updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password updated successfully
 *       400:
 *         description: Invalid or expired OTP.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid OTP
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: You entered the wrong email
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const resetPassword = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { email, otp, newPassword } = req.body;
    const user = await UserModel.findOne({ email: email }).session(session);

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send({ error: 'You entered the wrong email' });
    }

    if (user.resetPasswordOTP !== otp || !user.resetPasswordOTP) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).send({ error: 'Invalid OTP' });
    }

    if (Date.now() > user.resetPasswordExpires) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).send({ error: 'OTP expired' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    user.password = hashedPassword;
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).send({ message: 'Password updated successfully' });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).send({ error: 'An error occurred' });
  }
};

/**
 * @swagger
 * /api/v1/auth/delete-account-otp/{id}:
 *   post:
 *     summary: Request OTP for account deletion
 *     description: Sends a One-Time Password (OTP) to the user's email to confirm account deletion.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the user whose account is to be deleted.
 *         example: 60d0fe4f5b867d001c8f1a92
 *     responses:
 *       200:
 *         description: Delete account OTP sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: Success
 *                 message:
 *                   type: string
 *                   example: Delete account OTP sent successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const deleteUserAccountOTP = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.params?.id;

    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin' && req.user?._id?.toString() !== userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.FORBIDDEN).send({ error: 'You are not authorized to perform this action' });
    }

    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(httpStatus.NOT_FOUND)
        .send({ error: 'Invalid user ID' });
    }

    const user = await UserModel.findById(userId).session(session);

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.NOT_FOUND).send({ error: 'User not found' });
    }

    const OTP = await generateOTP();
    const OTPExpiration = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes

    user.deleteAccountOTP = OTP;
    user.deleteAccountExpires = OTPExpiration;
    await user.save({ session });

    const mailData = await deleteUserOtpTemplate(user, OTP);

    await sendMailWithMailGun(mailData);

    await session.commitTransaction();
    session.endSession();

    res.status(httpStatus.OK).json({
      status: 'Success',
      message: 'Delete account OTP sent successfully',
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'Fail',
      message: "Couldn't send delete account OTP",
    });
  }
};

/**
 * @swagger
 * /api/v1/auth/delete-account/{id}:
 *   delete:
 *     summary: Delete user account
 *     description: Deletes a user's account using a valid OTP. Requires authentication and authorization.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the user account to delete.
 *         example: 60d0fe4f5b867d001c8f1a92
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - otp
 *             properties:
 *               otp:
 *                 type: string
 *                 description: The OTP received for account deletion confirmation.
 *                 example: 654321
 *     responses:
 *       200:
 *         description: Account deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: Success
 *                 message:
 *                   type: string
 *                   example: Account deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: number
 *                       example: 1
 *       400:
 *         description: Invalid or expired OTP.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid OTP
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const deleteUserAccount = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.params?.id;
    const { otp } = req.body;

    if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin' && req.user?._id?.toString() !== userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.FORBIDDEN).send({ error: 'You are not authorized to perform this action' });
    }

    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(httpStatus.NOT_FOUND)
        .send({ error: 'Invalid user ID' });
    }

    const user = await UserModel.findById(userId).session(session);

    if (!userId) { // This condition should check `user` not `userId`
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.NOT_FOUND).send({ error: 'User not found' });
    }

    if (user.deleteAccountOTP !== otp || !user.deleteAccountOTP) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.BAD_REQUEST).send({ error: 'Invalid OTP' });
    }

    if (Date.now() > user.deleteAccountExpires) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.BAD_REQUEST).send({ error: 'OTP expired' });
    }

    // Proceed with deleting the user account
    const result = await UserModel.deleteOne({ _id: userId }).session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(httpStatus.OK).json({
      status: 'Success',
      message: 'Account deleted successfully',
      data: result,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'Fail',
      message: "Couldn't delete account",
    });
  }
};

/**
 * @swagger
 * /api/v1/auth/change-password:
 *   patch:
 *     summary: Change user password
 *     description: Allows an authenticated user to change their password by providing the old and new passwords.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 format: password
 *                 description: The user's current password.
 *                 example: oldPassword123
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 description: The user's new password.
 *                 example: newPassword456
 *     responses:
 *       200:
 *         description: Password changed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: Success
 *                 message:
 *                   type: string
 *                   example: Password changed successfully
 *       400:
 *         description: Bad request (e.g., missing passwords, old password mismatch).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: Fail
 *                 message:
 *                   type: string
 *                   example: Old password and new password are required
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const changePassword = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // const userId = req.params?.userId;
    const userId = req.user?._id;
    const { newPassword, oldPassword } = req.body;
    if (!oldPassword || !newPassword) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        status: 'Fail',
        message: 'Old password and new password are required',
      });
    }

    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(httpStatus.NOT_FOUND)
        .send({ error: 'Invalid user ID' });
    }

    const user = await UserModel.findById(userId)
      .select('+password')
      .session(session);

    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(httpStatus.NOT_FOUND).send({ error: 'User not found' });
    }

    // Compare old password with hashed password stored in the database
    const isMatch = await bcrypt.compare(oldPassword, user.password);

    if (!isMatch) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).send({ error: "Password didn't match" });
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update the password in the database
    user.password = hashedNewPassword;
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(httpStatus.OK).json({
      status: 'Success',
      message: 'Password changed successfully',
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'Fail',
      message: "Couldn't change password",
    });
  }
};

/**
 * @swagger
 * /api/v1/auth/user:
 *   get:
 *     summary: Get current user details
 *     description: Retrieves the details of the authenticated user.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Get User Successfully
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const getUser = catchAsync(async (req, res) => {
  // const userId = req.params?.userId;
  const userId = req.user?._id;

  const result = await authService.getUserService(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get User Successfully',
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/auth/user/{userId}:
 *   patch:
 *     summary: Update user details
 *     description: Updates the details of a specific user. Requires authentication and authorization (admin/super_admin or self).
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the user to update.
 *         example: 60d0fe4f5b867d001c8f1a92
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New name for the user.
 *                 example: Jane Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 description: New email for the user.
 *                 example: jane.doe@example.com
 *               profileImage:
 *                 type: string
 *                 description: URL to the user's new profile image.
 *                 example: https://example.com/profile.jpg
 *               role:
 *                 type: string
 *                 enum: [user, admin, super_admin]
 *                 description: New role for the user (requires appropriate permissions).
 *                 example: admin
 *             example:
 *               name: Jane Doe
 *               profileImage: https://example.com/jane.jpg
 *     responses:
 *       200:
 *         description: User updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Update Successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     acknowledged:
 *                       type: boolean
 *                       example: true
 *                     modifiedCount:
 *                       type: number
 *                       example: 1
 *                     upsertedId:
 *                       type: string
 *                       nullable: true
 *                     upsertedCount:
 *                       type: number
 *                       example: 0
 *                     matchedCount:
 *                       type: number
 *                       example: 1
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
const updateUser = catchAsync(async (req, res) => {
  const userId = req.params?.userId;
  const data = req.body;

  if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin' && req.user?._id?.toString() !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to update this user');
  }

  const result = await authService.updateUserService(userId, data);
  if (result.modifiedCount == !1) { // This condition should be `result.modifiedCount === 0`
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'User not found or no changes made'
    );
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Update Successfully',
    data: result,
  });
});

/**
 * @description Sends a test email using Mailgun. This is likely for internal testing or debugging.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the email is sent and response is sent.
 * @private
 */
const sendMailWithMailGunController = async (req, res) => {
  try {
    const result = await sendMailWithMailGun({
      sub: 'Verify Email',
      message: '<h1>Testing some Google SMTP NodeMailer awesomeness!</h1>',
      userEmail: 'anikh499@gmail.com',
    });
    res.status(201).send(result);
    logger.info(result); // logs response data
  } catch (error) {
    logger.error(error); // logs any error
    res.status(500).send({ error: error.message });
  }
};

/**
 * @description Controller for authentication-related operations.
 * @namespace authController
 */
export const authController = {
  register,
  login,
  refreshToken,
  confirmEmail,
  resendEmailConfirmation,
  getUser,
  updateUser,
  forgetPassword,
  resetPassword,
  deleteUserAccount,
  deleteUserAccountOTP,
  changePassword,
  sendMailWithMailGunController,
  inviteUser: managerController.inviteTeamMember,
  getTeamMembers: managerController.getTeamMembers,
  updateTeamMemberRole: managerController.updateTeamMemberRole,
  getWorkspaceMetrics: managerController.getWorkspaceMetrics,
};