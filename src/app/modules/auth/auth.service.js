import bcrypt from 'bcryptjs';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { jwtHelpers } from '../../helpers/jwtHelpers.js';
import { sendMailWithMailGun } from '../../middlewares/sendEmail/sendMailWithMailGun.js';
import UserModel from './auth.model.js';
import { registrationOtpTemplate } from './auth.utils.js';

const deleteUserAccountService = async userId => {
  const result = await UserModel.deleteOne({ _id: userId });
  return result;
};
const registerService = async req => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { password, email } = req.body;

    const existingEmail = await UserModel.findOne({ email }).session(session);
    if (existingEmail) {
      await session.abortTransaction();
      throw new ApiError(httpStatus.CONFLICT, 'Email already exists!');
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await UserModel.create(
        [{ email, password: hashedPassword }],
        { session },
      );

      const token = user[0].generateConfirmationToken();
      await user[0].save({ session, validateBeforeSave: false });

      const mailData = await registrationOtpTemplate(email, token);
      await sendMailWithMailGun(mailData);

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
    await session.abortTransaction().catch(() => {});
    session.endSession();

    // Only rethrow if it's already an ApiError
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Couldn't register successfully",
    );
  }
};

const confirmEmailService = async token => {
  const user = await UserModel.findOne({ confirmationToken: token });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const expired = new Date() > new Date(user.confirmationTokenExpires);

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

  return { success: true };
};

const loginService = async (email, password) => {
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

  const accessToken = jwtHelpers.createToken(
    {
      _id: user._id,
      role: user.role,
    },
    config.jwt.access_token,
    config.jwt.access_expires_in,
  );
  const refreshToken = jwtHelpers.createToken(
    {
      _id: user._id,
      role: user.role,
    },
    config.jwt.refresh_token,
    config.jwt.refresh_expires_in,
  );

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
  loginService,
  refreshToken,
  updateUserService,
  getUserService,
};
