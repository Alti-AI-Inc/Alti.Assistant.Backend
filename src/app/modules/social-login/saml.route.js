import express from 'express';
import passport from 'passport';
import { SocialLoginController } from './social-login.controller.js';
import config from '../../../../config/index.js';

const router = express.Router();

/**
 * @swagger
 * /api/v1/auth-saml/login:
 *   get:
 *     summary: Initiate Enterprise SAML 2.0 Login
 *     description: Redirects the user to the configured Identity Provider (Okta, Azure AD, etc.) for authentication.
 *     tags:
 *       - Enterprise SSO
 */
router.get(
  '/login',
  passport.authenticate('saml', {
    failureRedirect: `${config.clientUrl}/login?error=saml_failed`,
  })
);

/**
 * @swagger
 * /api/v1/auth-saml/callback:
 *   post:
 *     summary: SAML Assertion Consumer Service (ACS)
 *     description: Receives the SAML assertion from the IdP.
 *     tags:
 *       - Enterprise SSO
 */
router.post(
  '/callback',
  passport.authenticate('saml', {
    failureRedirect: `${config.clientUrl}/login?error=saml_failed`,
  }),
  SocialLoginController.handleSocialLoginSuccess
);

export const samlRoutes = router;
