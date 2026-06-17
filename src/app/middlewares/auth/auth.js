import httpStatus from 'http-status';
import config from '../../../../config/index.js';
import ApiError from '../../../errors/ApiError.js';
import { jwtHelpers } from '../../helpers/jwtHelpers.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';

const roleHierarchy = {
  [ENUM_USER_ROLE.SUPER_ADMIN]: [
    ENUM_USER_ROLE.SUPER_ADMIN,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.USER,
  ],
  [ENUM_USER_ROLE.ADMIN]: [ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER],
  [ENUM_USER_ROLE.USER]: [ENUM_USER_ROLE.USER],
};

const auth = (...requiredRoles) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'You are not authorized');
      }

      const token = authHeader.split(' ')[1];

      const verifiedUser = jwtHelpers.verifyToken(
        token,
        config.jwt.access_token
      );

      // 👇 Assign user to request object
      req.user = verifiedUser;

      if (requiredRoles.length) {
        const userAllowedRoles = roleHierarchy[verifiedUser.role] || [];
        const isAuthorized = requiredRoles.some((role) =>
          userAllowedRoles.includes(role)
        );
        if (!isAuthorized) {
          throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden');
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default auth;

