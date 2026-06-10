import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';

/**
 * Middleware to enforce role-based access
 * @param {...string} allowedRoles - The roles allowed to access the route
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'Unauthorized'));
    }
    if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
      return next(new ApiError(httpStatus.FORBIDDEN, 'Forbidden'));
    }
    next();
  };
};

export default requireRole;
