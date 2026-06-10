import auth from './auth.js';

// authenticate is simply the auth middleware with no role restrictions
export const authenticate = auth();

export default authenticate;
