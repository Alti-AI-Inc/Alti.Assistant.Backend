import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { authController } from './auth.controller.js';
import { AuthValidation } from './auth.validation.js';
// import validateRequest from '../../middlewares/validateRequest/validateRequest.js';

const router = express.Router();

router
  .route('/user/single-user')
  .get(auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER), authController.getUser); // user with id

router.route('/register').post(
  createRateLimiter(5, 2),
  // validateRequest(AuthValidation.UserValidationSchema),
  authController.register,
);
router.route('/register/confirmation/:token').get(authController.confirmEmail); // verify mail

router.route('/login').post(createRateLimiter(5, 5), authController.login); // login in app

router.post(
  '/refresh-token',
  validateRequest(AuthValidation.refreshTokenZodSchema),
  authController.refreshToken,
);

router
  .route('/forget-password')
  .post(createRateLimiter(5, 2), authController.forgetPassword);
router
  .route('/reset-password')
  .post(createRateLimiter(5, 1), authController.resetPassword);
router
  .route('/change-password')
  .post(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    // createRateLimiter(10, 1),
    authController.changePassword,
  );

router
  .route('/update-user/:userId')
  .put(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    authController.updateUser,
  ); // is to use update user profile
router
  .route('/delete-account-otp/:id')
  .delete(authController.deleteUserAccountOTP); // use to delete account
router
  .route('/delete-account/:id')
  .delete(
    auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
    authController.deleteUserAccount,
  ); // use to delete account

export const authRoutes = router;
