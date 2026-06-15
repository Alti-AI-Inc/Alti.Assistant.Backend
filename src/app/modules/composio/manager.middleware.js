import { roleMiddleware } from '../auth/auth.middleware.js';

// Export managerMiddleware reusing the auth.middleware's roleMiddleware function
export const managerMiddleware = roleMiddleware('manager', 'admin', 'owner');
