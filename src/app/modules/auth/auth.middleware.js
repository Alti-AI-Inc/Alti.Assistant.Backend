import auth from '../../middlewares/auth/auth.js';

export const authMiddleware = auth();

export const roleMiddleware = (...roles) => auth(...roles);
