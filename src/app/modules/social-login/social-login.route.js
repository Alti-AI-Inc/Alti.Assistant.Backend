import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import config from '../../../../config/index.js';

const router = Router();

const FRONTEND_URL = config.client_url || 'https://www.asonai.com';
const FAILURE_REDIRECT_URL = `${FRONTEND_URL}?showLogin=true&error=authentication_cancelled`;

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
    const payload = {
      role: user.role,
      _id: user._id,
    };

    const secret = config.jwt.access_token;
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

// Google
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);
router.get('/google/callback', handleSocialAuthCallback('google'));

// Apple (Note: Apple often uses POST for callbacks)
router.get(
  '/apple',
  passport.authenticate('apple', { session: false, scope: ['name', 'email'] })
);
router.post('/apple/callback', handleSocialAuthCallback('apple'));

// Microsoft
router.get(
  '/microsoft',
  passport.authenticate('microsoft', { scope: ['user.read'], session: false })
);
router.get('/microsoft/callback', handleSocialAuthCallback('microsoft'));

// Facebook
router.get(
  '/facebook',
  passport.authenticate('facebook', { scope: ['email'], session: false })
);
router.get('/facebook/callback', handleSocialAuthCallback('facebook'));

// Twitter
router.get('/twitter', passport.authenticate('twitter', { session: false }));
router.get('/twitter/callback', handleSocialAuthCallback('twitter'));

// Discord
router.get(
  '/discord',
  passport.authenticate('discord', {
    scope: ['identify', 'email'],
    session: false,
  })
);
router.get('/discord/callback', handleSocialAuthCallback('discord'));

// GitHub
router.get(
  '/github',
  passport.authenticate('github', { scope: ['user:email'], session: false })
);
router.get('/github/callback', handleSocialAuthCallback('github'));

export const socialLoginRotes = router;
