import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

const {
  mockAuthMiddleware,
  mockAdminController,
  mockEnumUserRole,
  mockRouter
} = vi.hoisted(() => {
  // Mock external dependencies
  const mockAuthMiddleware = vi.fn().mockImplementation((_roles) => vi.fn().mockImplementation((req, res, next) => next())); // Mock auth to just call next
  const mockAdminController = {
    updateUserRole: vi.fn(),
    deleteUser: vi.fn(),
    getAllBuyer: vi.fn(),
    getAllUsers: vi.fn(),
    getAllPayment: vi.fn(),
    getBillingAuditLogs: vi.fn(),
    getSwarmAudits: vi.fn(),
    getAdmin: vi.fn(),
    getUserStatisticsByMonth: vi.fn(),
    getAllTenants: vi.fn(),
    getTenantDetails: vi.fn(),
    updateTenantStatus: vi.fn(),
    getTenantUsageAdmin: vi.fn(),
    extendTenantTrial: vi.fn(),
  };
  const mockEnumUserRole = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    BUYER: 'buyer',
    SELLER: 'seller',
    USER: 'user',
  };

  // Mock express.Router and its methods
  const mockRouter = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  };

  return {
    mockAuthMiddleware,
    mockAdminController,
    mockEnumUserRole,
    mockRouter
  };
});

vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
}));

vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: mockEnumUserRole,
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuthMiddleware,
}));

vi.mock('./admin.controller.js', () => ({
  AdminController: mockAdminController,
}));

// Import the module after mocks are set up
import { adminRoutes } from './admin.route.js';

describe('Admin Routes', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    // vi.clearAllMocks(); // This clears mockRouter as well!
  });

  it('should export the router', () => {
    expect(adminRoutes).toBe(mockRouter);
  });

  it('should define the /update-user-role/:id PUT route with SUPER_ADMIN auth', () => {
    expect(mockRouter.put).toHaveBeenCalledWith(
      '/update-user-role/:id',
      expect.any(Function), // auth middleware
      mockAdminController.updateUserRole
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /delete-user/:objectId DELETE route with ADMIN auth', () => {
    expect(mockRouter.delete).toHaveBeenCalledWith(
      '/delete-user/:objectId',
      expect.any(Function), // auth middleware
      mockAdminController.deleteUser
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.ADMIN);
  });

  it('should define the /buyer/all-user GET route with ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/buyer/all-user',
      expect.any(Function), // auth middleware
      mockAdminController.getAllBuyer
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.ADMIN);
  });

  it('should define the /all-user GET route with ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/all-user',
      expect.any(Function), // auth middleware
      mockAdminController.getAllUsers
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.ADMIN);
  });

  it('should define the /all-payment GET route with ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/all-payment',
      expect.any(Function), // auth middleware
      mockAdminController.getAllPayment
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.ADMIN);
  });

  it('should define the /billing/audit-logs GET route with ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/billing/audit-logs',
      expect.any(Function), // auth middleware
      mockAdminController.getBillingAuditLogs
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.ADMIN);
  });

  it('should define the /swarm-audits GET route with ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/swarm-audits',
      expect.any(Function), // auth middleware
      mockAdminController.getSwarmAudits
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.ADMIN);
  });

  it('should define the /admin/:email GET route without auth middleware', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/admin/:email',
      mockAdminController.getAdmin
    );
    // Ensure auth was NOT called for this specific route
    // This is tricky because auth is called for other routes.
    // We can check the number of calls to auth, or ensure this specific call doesn't involve auth.
    // The previous tests already verified auth calls for other routes.
    // We can check the arguments passed to router.get for this specific route.
    const calls = mockRouter.get.mock.calls.filter(call => call[0] === '/admin/:email');
    expect(calls.length).toBe(1);
    expect(calls[0].length).toBe(2); // Only path and controller, no middleware
  });

  it('should define the /all-user/statistics GET route with ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/all-user/statistics',
      expect.any(Function), // auth middleware
      mockAdminController.getUserStatisticsByMonth
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.ADMIN);
  });

  it('should define the /tenants GET route with ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/tenants',
      expect.any(Function), // auth middleware
      mockAdminController.getAllTenants
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.ADMIN);
  });

  it('should define the /tenants/:tenantId GET route with ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/tenants/:tenantId',
      expect.any(Function), // auth middleware
      mockAdminController.getTenantDetails
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.ADMIN);
  });

  it('should define the /tenants/:tenantId/status PATCH route with ADMIN auth', () => {
    expect(mockRouter.patch).toHaveBeenCalledWith(
      '/tenants/:tenantId/status',
      expect.any(Function), // auth middleware
      mockAdminController.updateTenantStatus
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.ADMIN);
  });

  it('should define the /tenants/:tenantId/usage GET route with ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/tenants/:tenantId/usage',
      expect.any(Function), // auth middleware
      mockAdminController.getTenantUsageAdmin
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.ADMIN);
  });

  it('should define the /tenants/:tenantId/extend-trial POST route with ADMIN auth', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/tenants/:tenantId/extend-trial',
      expect.any(Function), // auth middleware
      mockAdminController.extendTenantTrial
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.ADMIN);
  });

  it('should call auth middleware with correct roles for all protected routes', () => {
    // This test ensures that auth was called for all routes that should have it
    // and with the correct roles.
    // We already checked individual calls, this is a summary check.
    const expectedAuthCalls = [
      mockEnumUserRole.SUPER_ADMIN, // /update-user-role/:id
      mockEnumUserRole.ADMIN,       // /delete-user/:objectId
      mockEnumUserRole.ADMIN,       // /buyer/all-user
      mockEnumUserRole.ADMIN,       // /all-user
      mockEnumUserRole.ADMIN,       // /all-payment
      mockEnumUserRole.ADMIN,       // /billing/audit-logs
      mockEnumUserRole.ADMIN,       // /swarm-audits
      // /admin/:email does NOT use auth
      mockEnumUserRole.ADMIN,       // /all-user/statistics
      mockEnumUserRole.ADMIN,       // /tenants
      mockEnumUserRole.ADMIN,       // /tenants/:tenantId
      mockEnumUserRole.ADMIN,       // /tenants/:tenantId/status
      mockEnumUserRole.ADMIN,       // /tenants/:tenantId/usage
      mockEnumUserRole.ADMIN,       // /tenants/:tenantId/extend-trial
    ];

    expect(mockAuthMiddleware).toHaveBeenCalledTimes(expectedAuthCalls.length);
    expectedAuthCalls.forEach(role => {
      expect(mockAuthMiddleware).toHaveBeenCalledWith(role);
    });
  });
});