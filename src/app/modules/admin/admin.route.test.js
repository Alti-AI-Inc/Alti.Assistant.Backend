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
      expect.any(Array),    // validation array
      expect.any(Function), // validateRequest middleware
      mockAdminController.updateUserRole
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /delete-user/:objectId DELETE route with SUPER_ADMIN auth', () => {
    expect(mockRouter.delete).toHaveBeenCalledWith(
      '/delete-user/:objectId',
      expect.any(Function), // auth middleware
      expect.any(Array),    // validation array
      expect.any(Function), // validateRequest middleware
      mockAdminController.deleteUser
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /buyer/all-user GET route with SUPER_ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/buyer/all-user',
      expect.any(Function), // auth middleware
      expect.any(Array),    // validation array
      expect.any(Function), // validateRequest middleware
      mockAdminController.getAllBuyer
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /all-user GET route with SUPER_ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/all-user',
      expect.any(Function), // auth middleware
      expect.any(Array),    // validation array
      expect.any(Function), // validateRequest middleware
      mockAdminController.getAllUsers
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /all-payment GET route with SUPER_ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/all-payment',
      expect.any(Function), // auth middleware
      expect.any(Array),    // validation array
      expect.any(Function), // validateRequest middleware
      mockAdminController.getAllPayment
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /billing/audit-logs GET route with SUPER_ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/billing/audit-logs',
      expect.any(Function), // auth middleware
      expect.any(Array),    // validation array
      expect.any(Function), // validateRequest middleware
      mockAdminController.getBillingAuditLogs
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /swarm-audits GET route with SUPER_ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/swarm-audits',
      expect.any(Function), // auth middleware
      expect.any(Array),    // validation array
      expect.any(Function), // validateRequest middleware
      mockAdminController.getSwarmAudits
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /admin/:email GET route with SUPER_ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/admin/:email',
      expect.any(Function), // auth middleware
      expect.any(Array),    // validation array
      expect.any(Function), // validateRequest middleware
      mockAdminController.getAdmin
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /all-user/statistics GET route with SUPER_ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/all-user/statistics',
      expect.any(Function), // auth middleware
      mockAdminController.getUserStatisticsByMonth
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /tenants GET route with SUPER_ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/tenants',
      expect.any(Function), // auth middleware
      expect.any(Array),    // validation array
      expect.any(Function), // validateRequest middleware
      mockAdminController.getAllTenants
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /tenants/:tenantId GET route with SUPER_ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/tenants/:tenantId',
      expect.any(Function), // auth middleware
      expect.any(Array),    // validation array
      expect.any(Function), // validateRequest middleware
      mockAdminController.getTenantDetails
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /tenants/:tenantId/status PATCH route with SUPER_ADMIN auth', () => {
    expect(mockRouter.patch).toHaveBeenCalledWith(
      '/tenants/:tenantId/status',
      expect.any(Function), // auth middleware
      expect.any(Array),    // validation array
      expect.any(Function), // validateRequest middleware
      mockAdminController.updateTenantStatus
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /tenants/:tenantId/usage GET route with SUPER_ADMIN auth', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/tenants/:tenantId/usage',
      expect.any(Function), // auth middleware
      expect.any(Array),    // validation array
      expect.any(Function), // validateRequest middleware
      mockAdminController.getTenantUsageAdmin
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should define the /tenants/:tenantId/extend-trial POST route with SUPER_ADMIN auth', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/tenants/:tenantId/extend-trial',
      expect.any(Function), // auth middleware
      expect.any(Array),    // validation array
      expect.any(Function), // validateRequest middleware
      mockAdminController.extendTenantTrial
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(mockEnumUserRole.SUPER_ADMIN);
  });

  it('should call auth middleware with correct roles for all protected routes', () => {
    const expectedAuthCalls = [
      mockEnumUserRole.SUPER_ADMIN, // /update-user-role/:id
      mockEnumUserRole.SUPER_ADMIN, // /delete-user/:objectId
      mockEnumUserRole.SUPER_ADMIN, // /buyer/all-user
      mockEnumUserRole.SUPER_ADMIN, // /all-user
      mockEnumUserRole.SUPER_ADMIN, // /all-payment
      mockEnumUserRole.SUPER_ADMIN, // /billing/audit-logs
      mockEnumUserRole.SUPER_ADMIN, // /swarm-audits
      mockEnumUserRole.SUPER_ADMIN, // /admin/:email
      mockEnumUserRole.SUPER_ADMIN, // /all-user/statistics
      mockEnumUserRole.SUPER_ADMIN, // /tenants
      mockEnumUserRole.SUPER_ADMIN, // /tenants/:tenantId
      mockEnumUserRole.SUPER_ADMIN, // /tenants/:tenantId/status
      mockEnumUserRole.SUPER_ADMIN, // /tenants/:tenantId/usage
      mockEnumUserRole.SUPER_ADMIN, // /tenants/:tenantId/extend-trial
    ];

    expect(mockAuthMiddleware).toHaveBeenCalledTimes(expectedAuthCalls.length);
    expectedAuthCalls.forEach(role => {
      expect(mockAuthMiddleware).toHaveBeenCalledWith(role);
    });
  });
});