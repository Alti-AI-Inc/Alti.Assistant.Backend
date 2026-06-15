import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockAuth
} = vi.hoisted(() => {
  // Mock the core dependency. This mock will be used for all imports of this path.
  // We make it return a unique string based on args to test the return value.
  const mockAuth = vi.fn().mockImplementation((...args) => `mocked_middleware_for:[${args.join(',')}]`);

  return {
    mockAuth
  };
});

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuth,
}));

// Import the module under test AFTER the mock is set up.
// The code inside auth.middleware.js will execute here, calling mockAuth() once for authMiddleware.
import { authMiddleware, roleMiddleware } from './auth.middleware.js';

describe('auth.middleware', () => {
  // This block tests the side-effect of the module import itself.
  describe('Module Initialization', () => {
    it('should call the core auth function once with no arguments to create authMiddleware', () => {
      // Check that the mock was called exactly once during the initial module import.
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockAuth).toHaveBeenCalledWith();
    });

    it('should export authMiddleware as the result of the initial auth() call', () => {
      // Check that the exported variable holds the return value from the mock.
      expect(authMiddleware).toBe('mocked_middleware_for:[]');
    });
  });

  describe('roleMiddleware', () => {
    // Before each test in this block, clear the mock's history.
    // This is crucial to ignore the initial call from the module import
    // and focus only on the calls made within each test.
    beforeEach(() => {
      mockAuth.mockClear();
    });

    it('should be a function that returns a middleware', () => {
      expect(typeof roleMiddleware).toBe('function');
    });

    it('should call the core auth function with a single "super_admin" role', () => {
      const middleware = roleMiddleware('super_admin');
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockAuth).toHaveBeenCalledWith('super_admin');
      expect(middleware).toBe('mocked_middleware_for:[super_admin]');
    });

    it('should call the core auth function with a single "admin" role', () => {
      const middleware = roleMiddleware('admin');
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockAuth).toHaveBeenCalledWith('admin');
      expect(middleware).toBe('mocked_middleware_for:[admin]');
    });

    it('should call the core auth function with multiple roles including "manager" and "user"', () => {
      const middleware = roleMiddleware('manager', 'user');
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockAuth).toHaveBeenCalledWith('manager', 'user');
      expect(middleware).toBe('mocked_middleware_for:[manager,user]');
    });

    it('should call the core auth function with all specified roles', () => {
      const roles = ['super_admin', 'admin', 'manager', 'user'];
      const middleware = roleMiddleware(...roles);
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockAuth).toHaveBeenCalledWith('super_admin', 'admin', 'manager', 'user');
      expect(middleware).toBe('mocked_middleware_for:[super_admin,admin,manager,user]');
    });

    it('should call the core auth function with no arguments if none are provided', () => {
      const middleware = roleMiddleware();
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockAuth).toHaveBeenCalledWith();
      expect(middleware).toBe('mocked_middleware_for:[]');
    });

    it('should call the core auth function each time it is invoked', () => {
      roleMiddleware('admin');
      roleMiddleware('manager', 'user');

      expect(mockAuth).toHaveBeenCalledTimes(2);
      expect(mockAuth).toHaveBeenCalledWith('admin');
      expect(mockAuth).toHaveBeenCalledWith('manager', 'user');
    });
  });
});