import { Strategy as SamlStrategy } from 'passport-saml';
import passport from 'passport';
import UserModel from '../../auth/auth.model.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

if (process.env.SAML_ENTRY_POINT) {
  logger.info('[SAML] Configuring Enterprise SAML 2.0 Strategy');
  
  passport.use(
    'saml',
    new SamlStrategy(
      {
        path: '/api/v1/auth-saml/callback',
        entryPoint: process.env.SAML_ENTRY_POINT,
        issuer: process.env.SAML_ISSUER || 'aphura-ai',
        cert: process.env.SAML_IDP_CERT, 
        // options for Active Directory, Okta, etc.
        identifierFormat: null, 
        acceptedClockSkewMs: -1,
      },
      async (profile, done) => {
        try {
          const email = profile.email || profile.nameID;
          
          let user = await UserModel.findOne({ email });
          if (!user) {
            user = await UserModel.create({
              email,
              name: profile.displayName || profile.givenName || email.split('@')[0],
              role: 'user',
              authSource: 'saml',
            });
            logger.info(`[SAML] Created new enterprise user: ${email}`);
          }
          
          return done(null, user);
        } catch (error) {
          logger.error(`[SAML] Strategy Error: ${error.message}`);
          return done(error);
        }
      }
    )
  );
} else {
  logger.info('[SAML] SAML_ENTRY_POINT not provided. Skipping Enterprise SAML config.');
}
