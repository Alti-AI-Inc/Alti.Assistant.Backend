import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { authController } from './auth.controller.js';
import { AuthValidation } from './auth.validation.js';
// import validateRequest from '../../middlewares/validateRequest/validateRequest.js';

/**
 * @constant {express.Router} router - Express router for authentication routes.
 */
const router = express.Router();

// =================================================================
//                 Public Authentication Routes
// =================================================================

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Register a new user with email, password, and other details.
 *     tags:
 *       - Auth Management
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
 *                 example: "newuser@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: "password123"
 *               name:
 *                 type: string
 *                 example: "New User"
 *     responses:
 *       201:
 *         description: User registered successfully. A confirmation email is sent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 message:
 *                   type: string
 *                   example: User registered successfully. Please check your email for confirmation.
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       409:
 *         description: User with this email already exists.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 409
 *                 message:
 *                   type: string
 *                   example: User with this email already exists.
 *       429:
 *         $ref: '#/components/responses/TooManyRequestsError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.route('/register').post(
  // createRateLimiter(5, 2),
  validateRequest(AuthValidation.UserValidationSchema),
  // SECURITY: Removed 'role' from swagger schema to prevent privilege escalation.
  // The controller MUST ignore any 'role' field in the request body and assign a default role (e.g., 'user').
  // Admin/Manager accounts should be created via a separate, secure endpoint or invitation.
  authController.register
);

/**
 * @swagger
 * /api/v1/auth/register/resend-confirmation:
 *   post:
 *     summary: Resend email confirmation
 *     description: Resend the email confirmation link to a user who has not yet confirmed their email.
 *     tags:
 *       - Auth Management
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
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Confirmation email resent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Confirmation email resent successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       404:
 *         description: User not found or email already confirmed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 message:
 *                   type: string
 *                   example: User not found or email already confirmed.
 *       429:
 *         $ref: '#/components/responses/TooManyRequestsError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router
  .route('/register/resend-confirmation')
  .post(createRateLimiter(5, 2), authController.resendEmailConfirmation);

/**
 * @swagger
 * /api/v1/auth/register/confirmation:
 *   post:
 *     summary: Confirm user email
 *     description: Confirm a user's email address using a verification token received via email.
 *     tags:
 *       - Auth Management
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
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Email confirmed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Email confirmed successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         description: Invalid or expired confirmation token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: Invalid or expired confirmation token.
 *       429:
 *         $ref: '#/components/responses/TooManyRequestsError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router
  .route('/register/confirmation')
  .post(createRateLimiter(5, 5), authController.confirmEmail); // verify mail

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate a user and issue access and refresh tokens.
 *     tags:
 *       - Auth Management
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
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: User logged in successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: User logged in successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     refreshToken:
 *                       type: string
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         description: Invalid credentials or email not confirmed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: Invalid credentials or email not confirmed.
 *       429:
 *         $ref: '#/components/responses/TooManyRequestsError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.route('/login').post(createRateLimiter(5, 5), authController.login); // login in app

// =================================================================
//           Passwordless OTP Auth (Liberty Center One SMTP)
// =================================================================

/**
 * @swagger
 * /api/v1/auth/otp/send:
 *   post:
 *     summary: Send OTP for passwordless login/register
 *     description: |
 *       Send a 6-digit OTP code to the user's email.
 *       If the user doesn't exist, they'll be created on verification.
 *       Code expires in 5 minutes. Rate limited to 1 per 60 seconds.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       429:
 *         description: Rate limited — wait 60 seconds
 */
router.post('/otp/send', createRateLimiter(1, 5), authController.sendOtp);

/**
 * @swagger
 * /api/v1/auth/otp/verify:
 *   post:
 *     summary: Verify OTP and get JWT tokens
 *     description: |
 *       Verify the 6-digit OTP code. Returns JWT access + refresh tokens.
 *       If the user doesn't exist, a new account is created automatically.
 *       New users get a free subscription with 25 prompts/month.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               otp:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 6
 *                 example: "482901"
 *               name:
 *                 type: string
 *                 description: Optional name for new user registration
 *                 example: "John Doe"
 *     responses:
 *       200:
 *         description: Login/register successful. Returns user, accessToken, refreshToken.
 *       400:
 *         description: Code expired or not found
 *       401:
 *         description: Invalid code
 */
router.post('/otp/verify', createRateLimiter(1, 10), authController.verifyOtp);

/**
 * @swagger
 * /api/v1/auth/otp/resend:
 *   post:
 *     summary: Resend OTP code
 *     description: Resend the OTP code. Rate limited to 1 per 60 seconds.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: OTP resent
 *       429:
 *         description: Rate limited — wait 60 seconds
 */
router.post('/otp/resend', createRateLimiter(1, 3), authController.resendOtp);


/**
 * @swagger
 * /api/v1/auth/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     description: Use a refresh token to obtain a new access token.
 *     tags:
 *       - Auth Management
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Access token refreshed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Access token refreshed successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         description: Invalid or expired refresh token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: Invalid or expired refresh token.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/refresh-token',
  validateRequest(AuthValidation.refreshTokenZodSchema),
  authController.refreshToken
);

/**
 * @swagger
 * /api/v1/auth/forget-password:
 *   post:
 *     summary: Request password reset
 *     description: Send a password reset link to the user's email address.
 *     tags:
 *       - Auth Management
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
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Password reset link sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Password reset link sent successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       404:
 *         description: User with this email not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 message:
 *                   type: string
 *                   example: User with this email not found.
 *       429:
 *         $ref: '#/components/responses/TooManyRequestsError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router
  .route('/forget-password')
  .post(createRateLimiter(5, 2), authController.forgetPassword);

/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset user password
 *     description: Reset the user's password using a valid reset token and new password.
 *     tags:
 *       - Auth Management
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: "newStrongPassword123"
 *     responses:
 *       200:
 *         description: Password reset successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Password reset successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         description: Invalid or expired password reset token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: Invalid or expired password reset token.
 *       429:
 *         $ref: '#/components/responses/TooManyRequestsError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router
  .route('/reset-password')
  .post(createRateLimiter(5, 1), authController.resetPassword);

// =================================================================
//                 Authenticated User Routes
// =================================================================

/**
 * @swagger
 * /api/v1/auth/user/single-user:
 *   get:
 *     summary: Get current user's profile
 *     description: Retrieve the profile details of the authenticated user.
 *     tags:
 *       - User Management
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: User retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "user-uuid-123"
 *                     email:
 *                       type: string
 *                       example: "user@example.com"
 *                     role:
 *                       type: string
 *                       example: "user"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router
  .route('/user/single-user')
  // FIX: Expanded roles to include all authenticated user types.
  .get(
    auth(
      ENUM_USER_ROLE.SUPER_ADMIN,
      ENUM_USER_ROLE.ADMIN,
      ENUM_USER_ROLE.MANAGER,
      ENUM_USER_ROLE.USER
    ),
    authController.getUser
  );

/**
 * @swagger
 * /api/v1/auth/change-password:
 *   post:
 *     summary: Change user password
 *     description: Allow an authenticated user to change their password.
 *     tags:
 *       - User Management
 *     security:
 *       - BearerAuth: []
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
 *                 example: "currentPassword123"
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: "newStrongPassword123"
 *     responses:
 *       200:
 *         description: Password changed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Password changed successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         description: Invalid old password or unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: Invalid old password.
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.route('/change-password').post(
  // FIX: Expanded roles to include all authenticated user types.
  auth(
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.MANAGER,
    ENUM_USER_ROLE.USER
  ),
  // createRateLimiter(10, 1), // Commented out as in original code
  authController.changePassword
);

/**
 * @swagger
 * /api/v1/auth/update-user/{userId}:
 *   put:
 *     summary: Update user profile
 *     description: Update the profile information for a specific user. Accessible by the user themselves, their manager, or an admin.
 *     tags:
 *       - User Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the user to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Updated Name"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "updated@example.com"
 *               profileImage:
 *                 type: string
 *                 example: "http://example.com/new-image.jpg"
 *     responses:
 *       200:
 *         description: User profile updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: User updated successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "user-uuid-123"
 *                     name:
 *                       type: string
 *                       example: "Updated Name"
 *                     email:
 *                       type: string
 *                       example: "updated@example.com"
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 message:
 *                   type: string
 *                   example: User not found.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.route('/update-user/:userId').put(
  // FIX: Expanded roles to include all user types that may need to update profiles.
  auth(
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.MANAGER,
    ENUM_USER_ROLE.USER
  ),
  // SECURITY (IDOR): The controller MUST verify that a USER can only update their own profile (req.user.id === req.params.userId).
  // It must also verify that a MANAGER can only update users they manage, and an ADMIN only within their tenant.
  authController.updateUser
);

/**
 * @swagger
 * /api/v1/auth/delete-account-otp/{id}:
 *   delete:
 *     summary: Request OTP for account deletion
 *     description: Initiates the account deletion process by sending an OTP to the user's registered email.
 *     tags:
 *       - User Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the user whose account is to be deleted.
 *     responses:
 *       200:
 *         description: OTP for account deletion sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: OTP for account deletion sent successfully.
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 message:
 *                   type: string
 *                   example: User not found.
 *       429:
 *         $ref: '#/components/responses/TooManyRequestsError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.route('/delete-account-otp/:id').delete(
  // FIX: Updated roles. Managers typically should not delete accounts.
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  createRateLimiter(5, 2),
  // SECURITY (IDOR): The controller MUST verify that a USER can only request deletion for their own account (req.user.id === req.params.id).
  // Admins must be checked against their tenant/workspace boundaries.
  authController.deleteUserAccountOTP
);

/**
 * @swagger
 * /api/v1/auth/delete-account/{id}:
 *   delete:
 *     summary: Delete user account
 *     description: Permanently delete a user's account using a provided OTP.
 *     tags:
 *       - User Management
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the user whose account is to be deleted.
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
 *                 example: "123456"
 *                 description: The One-Time Password received via email.
 *     responses:
 *       200:
 *         description: User account deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: User account deleted successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         description: Invalid OTP or unauthorized.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 message:
 *                   type: string
 *                   example: Invalid OTP.
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 message:
 *                   type: string
 *                   example: User not found.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.route('/delete-account/:id').delete(
  // FIX: Updated roles. Managers typically should not delete accounts.
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  // SECURITY (IDOR): The controller MUST verify that a USER can only delete their own account (req.user.id === req.params.id).
  // Admins must be checked against their tenant/workspace boundaries.
  // INTEGRATION: Controller should ensure that deleting a user correctly de-allocates resources and updates usage/limits for the parent workspace/tenant.
  authController.deleteUserAccount
);

// =================================================================
//                 Manager & Admin Routes
// =================================================================

/**
 * @swagger
 * /api/v1/auth/team/invite:
 *   post:
 *     summary: Invite a new member to the workspace
 *     description: Allows Managers and Admins to invite a new user to their workspace by email.
 *     tags:
 *       - Manager Dashboard
 *     security:
 *       - BearerAuth: []
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
 *                 example: "new.teammate@example.com"
 *               planId:
 *                 type: string
 *                 enum: [free, monthly_5, monthly_10, monthly_20, monthly_50, monthly_100, monthly_200, monthly_500]
 *                 description: Plan to assign to the invited member (paid by you)
 *                 example: "monthly_10"
 *               role:
 *                 type: string
 *                 enum: [user, manager]
 *                 example: "user"
 *     responses:
 *       200:
 *         description: Invitation sent successfully.
 *       400:
 *         description: Invalid request body or user already in workspace.
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Forbidden. User does not have permission or workspace plan limit reached.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post(
  '/team/invite',
  auth(
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.MANAGER
  ),
  validateRequest(AuthValidation.inviteUserValidationSchema),
  // OPTIMIZATION: The controller must check the workspace's current user count against its plan limit before sending the invitation.
  // SECURITY: The controller must ensure a Manager cannot invite another user with a role higher than their own (e.g., Admin).
  authController.inviteUser
);

/**
 * @swagger
 * /api/v1/auth/team/members:
 *   get:
 *     summary: Get all members of the workspace
 *     description: Retrieves a list of all users belonging to the authenticated manager's or admin's workspace.
 *     tags:
 *       - Manager Dashboard
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: A list of team members.
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get(
  '/team/members',
  auth(
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.MANAGER
  ),
  // INTEGRATION: The controller must be scoped to only return users from the requester's workspace/tenant.
  authController.getTeamMembers
);

/**
 * @swagger
 * /api/v1/auth/team/members/{userId}/role:
 *   patch:
 *     summary: Update a team member's role
 *     description: Allows a Manager or Admin to change the role of another user within their workspace.
 *     tags:
 *       - Manager Dashboard
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The ID of the user whose role is to be updated.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [user, manager]
 *                 example: "manager"
 *     responses:
 *       200:
 *         description: User role updated successfully.
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Forbidden. Cannot update own role, update owner's role, or assign a role higher than self.
 *       404:
 *         description: User not found in the workspace.
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.patch(
  '/team/members/:userId/role',
  auth(
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.MANAGER
  ),
  validateRequest(AuthValidation.updateRoleValidationSchema),
  authController.updateTeamMemberRole
);

// ── Member Plan Management (Account Owner only) ─────────────────────────────

/**
 * @swagger
 * /api/v1/auth/team/members/{memberId}/plan:
 *   patch:
 *     summary: Update a team member's plan
 *     description: Change the subscription plan assigned to an invited member. Only the sponsoring account owner can change plans.
 *     tags: [Manager Dashboard]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId]
 *             properties:
 *               planId:
 *                 type: string
 *                 enum: [free, monthly_5, monthly_10, monthly_20, monthly_50, monthly_100, monthly_200, monthly_500]
 *                 example: "monthly_10"
 *     responses:
 *       200:
 *         description: Member plan updated
 *       400:
 *         description: Invalid planId
 *       404:
 *         description: Member not found or not sponsored by you
 */
router.patch(
  '/team/members/:memberId/plan',
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  authController.updateMemberPlan
);

/**
 * @swagger
 * /api/v1/auth/team/members/{memberId}:
 *   delete:
 *     summary: Remove a team member
 *     description: Remove a sponsored member from your team. Their subscription is downgraded to free tier.
 *     tags: [Manager Dashboard]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed and downgraded to free
 *       404:
 *         description: Member not found or not sponsored by you
 */
router.delete(
  '/team/members/:memberId',
  auth(ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
  authController.removeMember
);

/**
 * @exports {express.Router} authRoutes - The Express router containing authentication-related routes.
 */
export const authRoutes = router;
