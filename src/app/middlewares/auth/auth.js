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
        // Resolve user role hierarchically
        let resolvedRole = verifiedUser.role;

        // If not super_admin, try resolving from active tenant context headers or query parameters
        if (resolvedRole !== ENUM_USER_ROLE.SUPER_ADMIN) {
          const tenantId = req.headers['x-tenant-id'] || req.headers['x-workspace-id'] || req.query.tenantId || req.query.workspaceId;
          if (tenantId && verifiedUser.tenants) {
            const tenantMembership = verifiedUser.tenants.find(
              (t) => String(t.tenantId) === String(tenantId)
            );
            if (tenantMembership) {
              resolvedRole = tenantMembership.role;
            }
          }
        }

        // If still unresolved or 'unauthorized', fall back to highest tenant role (handles old tokens and non-tenant-specific routes)
        if ((!resolvedRole || resolvedRole === 'unauthorized') && verifiedUser.tenants && verifiedUser.tenants.length > 0) {
          const roles = verifiedUser.tenants.map((t) => t.role);
          if (roles.includes('admin') || roles.includes('owner')) {
            resolvedRole = ENUM_USER_ROLE.ADMIN;
          } else if (roles.includes('manager') || roles.includes('member') || roles.includes('user')) {
            resolvedRole = ENUM_USER_ROLE.USER;
          }
        }

        // Standardize tenant/workspace role strings to global enum role equivalents
        if (resolvedRole === 'member' || resolvedRole === 'manager') {
          resolvedRole = ENUM_USER_ROLE.USER;
        } else if (resolvedRole === 'admin' || resolvedRole === 'owner') {
          resolvedRole = ENUM_USER_ROLE.ADMIN;
        }

        const userAllowedRoles = roleHierarchy[resolvedRole] || [];
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

