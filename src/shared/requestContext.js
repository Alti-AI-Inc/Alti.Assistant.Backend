import { AsyncLocalStorage } from 'async_hooks';

export const requestContextStore = new AsyncLocalStorage();

/**
 * Returns the current request context store.
 */
export const getRequestContext = () => {
  return requestContextStore.getStore() || {};
};

/**
 * Returns the current active user ID from the request context.
 */
export const getUserIdFromContext = () => {
  const context = getRequestContext();
  const req = context.req;
  return req?.user?.userId || req?.user?._id || 'global_default_user';
};
