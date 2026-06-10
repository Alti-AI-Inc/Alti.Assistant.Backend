import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';

export const authorize = (allowedRoles = []) => {
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

export default authorize;
