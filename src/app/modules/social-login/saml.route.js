import express from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import config from '../../../../config/index.js';

const FRONTEND_URL = config.client_url || 'https://www.aphurahq.com';

function sendTokenResponse(user, res) {
  if (!user || !user._id) {
    return res.redirect(`${FRONTEND_URL}/login?error=saml_failed`);
  }
  try {
    const payload = { role: user.role, _id: user._id };
    const secret = process.env.JWT_ACCESS_TOKEN_SECRET || config.jwt.access_token;
    const token = jwt.sign(payload, secret, { expiresIn: config.jwt.access_token_expires_in || '1h' });
    res.redirect(`${FRONTEND_URL}/callback?token=${token}`);
  } catch (error) {
    res.redirect(`${FRONTEND_URL}/login?error=saml_failed`);
  }
}

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
  (req, res) => sendTokenResponse(req.user, res)
);

export const samlRoutes = router;
