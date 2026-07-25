import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import config from '../../../../config/index.js';

/**
 * Express router to handle social authentication routes.
 * @type {import('express').Router}
 */
const router = Router();

/**
 * The frontend application URL used for redirection after authentication.
 * Defaults to 'https://www.insohq.com' if not specified in the configuration.
 * @type {string}
 */
const FRONTEND_URL = config.client_url || 'https://www.insohq.com';

/**
 * The URL to redirect to in case of authentication failure or cancellation.
 * @type {string}
 */
const FAILURE_REDIRECT_URL = `${FRONTEND_URL}?showLogin=true&error=authentication_cancelled`;

/**
 * Generates a JWT access token for the authenticated user and redirects them to the frontend application.
 * Resolves the user's role (e.g., checking for super_admin privileges) and appends the token to the redirect URL.
 *
 * @param {Object} user - The authenticated user object.
 * @param {string} user._id - The unique identifier of the user.
 * @param {string} [user.email] - The email address of the user.
 * @param {string} user.role - The role assigned to the user.
 * @param {import('express').Response} res - Express response object.
 * @returns {void} Redirects the client to the frontend callback URL with the token or an error query parameter.
 */
function sendTokenResponse(user, res) {
  if (!user || !user._id) {
    console.error(
      'Token generation error: Invalid user object received.',
      user
    );
    const errorRedirectUrl = `${FRONTEND_URL}/?showLogin=true&error=invalid_user_data`;
    return res.redirect(errorRedirectUrl);
  }

  try {
    const userEmail = user.email ? user.email.toLowerCase() : '';
    const superAdminEmail = (config.superAdminEmail || '').toLowerCase();
    const resolvedRole =
      superAdminEmail && userEmail === superAdminEmail
        ? 'super_admin'
        : user.role;

    const payload = {
      role: resolvedRole,
      _id: user._id,
    };

    // GCP AUDIT: Prioritize JWT secret from environment variables (injected by Cloud Run from Secret Manager).
    // This prevents reading secrets from local files in production environments.
    const secret = process.env.JWT_ACCESS_TOKEN_SECRET || config.jwt.access_token;
    if (!secret) {
      console.error(
        'JWT secret is not configured. Set JWT_ACCESS_TOKEN_SECRET environment variable or jwt.access_token in config.'
      );
      const errorRedirectUrl = `${FRONTEND_URL}/?showLogin=true&error=server_configuration_error`;
      return res.redirect(errorRedirectUrl);
    }

    const options = {
      expiresIn: config.jwt.access_expires_in || '7d',
    };

    const token = jwt.sign(payload, secret, options);

    const redirectUrl = `${FRONTEND_URL}/auth/social-callback?token=${token}`;
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error('Token generation error:', error);
    const errorRedirectUrl = `${FRONTEND_URL}/?showLogin=true&error=token_generation_failed`;
    return res.redirect(errorRedirectUrl);
  }
}

// // Google
// router.get(
//   '/google',
//   passport.authenticate('google', { scope: ['profile', 'email'], session: false })
// );
// router.get(
//   '/google/callback',
//   passport.authenticate('google', { session: false, failureRedirect: FAILURE_REDIRECT_URL }),
//   (req, res) => sendTokenResponse(req.user.user, res) // Use req.user.user
// );

/**
 * Higher-order function that returns an Express middleware to handle Passport social authentication callbacks.
 * Manages specific error scenarios such as email conflicts (e.g., email registered with password or another provider).
 *
 * @param {string} strategy - The Passport strategy name (e.g., 'google', 'apple', 'microsoft', 'facebook', 'twitter', 'discord', 'github').
 * @returns {import('express').RequestHandler} Express middleware function.
 */
function handleSocialAuthCallback(strategy) {
  return (req, res, next) => {
    passport.authenticate(strategy, { session: false }, (err, user, info) => {
      // ✅ ADD THIS CHECK for your new password error rule
      if (
        err &&
        err.message &&
        err.message.includes('This email is registered with a password')
      ) {
        const errorRedirectUrl = `${FRONTEND_URL}/?showLogin=true&error=email_has_password`;
        return res.redirect(errorRedirectUrl);
      }

      // This is the existing check for social-vs-social conflicts
      if (
        err &&
        err.message &&
        err.message.includes('This email is already linked to a')
      ) {
        const providerInError = err.message.split('a ')[1].split(' account')[0];
        const errorCode = `email_exists_${providerInError}`;
        const errorRedirectUrl = `${FRONTEND_URL}/?showLogin=true&error=${errorCode}`;
        return res.redirect(errorRedirectUrl);
      }

      // ... The rest of the function remains the same ...
      if (err) {
        console.error('PASSPORT AUTHENTICATION ERROR:', err);
        const errorRedirectUrl = `${FRONTEND_URL}/?showLogin=true&error=server_error`;
        return res.redirect(errorRedirectUrl);
      }
      if (!user) {
        return res.redirect(FAILURE_REDIRECT_URL);
      }
      return sendTokenResponse(user.user, res);
    })(req, res, next);
  };
}

/**
 * @openapi
 * /social-login/google:
 *   get:
 *     summary: Initiate Google OAuth2 authentication
 *     description: Redirects the user to Google's OAuth consent screen to authenticate.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to Google's login page.
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

/**
 * @openapi
 * /social-login/google/callback:
 *   get:
 *     summary: Google OAuth2 callback endpoint
 *     description: Handles the callback from Google, processes authentication, and redirects to the frontend with a JWT token.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to the frontend application with the JWT token or error query parameters.
 */
router.get('/google/callback', handleSocialAuthCallback('google'));

/**
 * @openapi
 * /social-login/apple:
 *   get:
 *     summary: Initiate Apple OAuth authentication
 *     description: Redirects the user to Apple's sign-in page to authenticate.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to Apple's login page.
 */
router.get(
  '/apple',
  passport.authenticate('apple', { session: false, scope: ['name', 'email'] })
);

/**
 * @openapi
 * /social-login/apple/callback:
 *   post:
 *     summary: Apple OAuth callback endpoint
 *     description: Handles the POST callback from Apple, processes authentication, and redirects to the frontend with a JWT token.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to the frontend application with the JWT token or error query parameters.
 */
router.post('/apple/callback', handleSocialAuthCallback('apple'));

/**
 * @openapi
 * /social-login/microsoft:
 *   get:
 *     summary: Initiate Microsoft OAuth authentication
 *     description: Redirects the user to Microsoft's login page to authenticate.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to Microsoft's login page.
 */
router.get(
  '/microsoft',
  passport.authenticate('microsoft', { scope: ['user.read'], session: false })
);

/**
 * @openapi
 * /social-login/microsoft/callback:
 *   get:
 *     summary: Microsoft OAuth callback endpoint
 *     description: Handles the callback from Microsoft, processes authentication, and redirects to the frontend with a JWT token.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to the frontend application with the JWT token or error query parameters.
 */
router.get('/microsoft/callback', handleSocialAuthCallback('microsoft'));

/**
 * @openapi
 * /social-login/facebook:
 *   get:
 *     summary: Initiate Facebook OAuth authentication
 *     description: Redirects the user to Facebook's login page to authenticate.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to Facebook's login page.
 */
router.get(
  '/facebook',
  passport.authenticate('facebook', { scope: ['email'], session: false })
);

/**
 * @openapi
 * /social-login/facebook/callback:
 *   get:
 *     summary: Facebook OAuth callback endpoint
 *     description: Handles the callback from Facebook, processes authentication, and redirects to the frontend with a JWT token.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to the frontend application with the JWT token or error query parameters.
 */
router.get('/facebook/callback', handleSocialAuthCallback('facebook'));

/**
 * @openapi
 * /social-login/twitter:
 *   get:
 *     summary: Initiate Twitter OAuth authentication
 *     description: Redirects the user to Twitter's login page to authenticate.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to Twitter's login page.
 */
router.get('/twitter', passport.authenticate('twitter', { session: false }));

/**
 * @openapi
 * /social-login/twitter/callback:
 *   get:
 *     summary: Twitter OAuth callback endpoint
 *     description: Handles the callback from Twitter, processes authentication, and redirects to the frontend with a JWT token.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to the frontend application with the JWT token or error query parameters.
 */
router.get('/twitter/callback', handleSocialAuthCallback('twitter'));

/**
 * @openapi
 * /social-login/discord:
 *   get:
 *     summary: Initiate Discord OAuth authentication
 *     description: Redirects the user to Discord's login page to authenticate.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to Discord's login page.
 */
router.get(
  '/discord',
  passport.authenticate('discord', {
    scope: ['identify', 'email'],
    session: false,
  })
);

/**
 * @openapi
 * /social-login/discord/callback:
 *   get:
 *     summary: Discord OAuth callback endpoint
 *     description: Handles the callback from Discord, processes authentication, and redirects to the frontend with a JWT token.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to the frontend application with the JWT token or error query parameters.
 */
router.get('/discord/callback', handleSocialAuthCallback('discord'));

/**
 * @openapi
 * /social-login/github:
 *   get:
 *     summary: Initiate GitHub OAuth authentication
 *     description: Redirects the user to GitHub's login page to authenticate.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to GitHub's login page.
 */
router.get(
  '/github',
  passport.authenticate('github', { scope: ['user:email'], session: false })
);

/**
 * @openapi
 * /social-login/github/callback:
 *   get:
 *     summary: GitHub OAuth callback endpoint
 *     description: Handles the callback from GitHub, processes authentication, and redirects to the frontend with a JWT token.
 *     tags:
 *       - Social Authentication
 *     responses:
 *       302:
 *         description: Redirects to the frontend application with the JWT token or error query parameters.
 */
router.get('/github/callback', handleSocialAuthCallback('github'));

/**
 * Exported Express router containing all social login routes.
 * @type {import('express').Router}
 */
export const socialLoginRotes = router;