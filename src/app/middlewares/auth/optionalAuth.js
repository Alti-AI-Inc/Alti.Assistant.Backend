import config from '../../../../config/index.js';
import { jwtHelpers } from '../../helpers/jwtHelpers.js';
import { logger } from '../../../shared/logger.js';

/**
 * Optional authentication middleware
 * If token is provided and valid, sets req.user
 * If no token or invalid token, sets req.user as guest
 * Does not throw errors for missing/invalid tokens
 */
const optionalAuth = () => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];

        try {
          const verifiedUser = jwtHelpers.verifyToken(
            token,
            config.jwt.access_token
          );

          // Set authenticated user
          req.user = verifiedUser;
          req.isGuest = false;
        } catch (tokenError) {
          logger.warn(
            'Invalid token provided, treating as guest:',
            tokenError.message
          );
          // Set as guest user if token is invalid
          req.user = null;
          req.isGuest = true;
        }
      } else {
        // No token provided, set as guest
        req.user = null;
        req.isGuest = true;
      }

      next();
    } catch (error) {
      // Even if there's an error, continue as guest
      logger.warn('Error in optional auth, treating as guest:', error.message);
      req.user = null;
      req.isGuest = true;
      next();
    }
  };
};

export default optionalAuth;
