import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { AdminController } from './admin.controller.js';
const router = express.Router();

router.put(
  '/update-user-role/:id',
  auth(ENUM_USER_ROLE.SUPER_ADMIN),
  AdminController.updateUserRole,
);

router.delete(
  '/delete-user/:objectId',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.deleteUser,
);

router.get(
  '/buyer/all-user',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getAllBuyer,
);

router.get(
  '/all-user',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getAllUsers,
);

router.get(
  '/all-payment',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getAllPayment,
);

router.get('/admin/:email', AdminController.getAdmin);

router.get(
  '/all-user/statistics',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getUserStatisticsByMonth,
);

// ============= Tenant Management Routes (Admin) =============

/**
 * @route   GET /api/v1/admin/tenants
 * @desc    Get all tenants with pagination
 * @access  Private (Admin only)
 */
router.get(
  '/tenants',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getAllTenants,
);

/**
 * @route   GET /api/v1/admin/tenants/:tenantId
 * @desc    Get tenant details
 * @access  Private (Admin only)
 */
router.get(
  '/tenants/:tenantId',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getTenantDetails,
);

/**
 * @route   PATCH /api/v1/admin/tenants/:tenantId/status
 * @desc    Update tenant status (active/suspended/cancelled)
 * @access  Private (Admin only)
 */
router.patch(
  '/tenants/:tenantId/status',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.updateTenantStatus,
);

/**
 * @route   GET /api/v1/admin/tenants/:tenantId/usage
 * @desc    View tenant usage statistics
 * @access  Private (Admin only)
 */
router.get(
  '/tenants/:tenantId/usage',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.getTenantUsageAdmin,
);

/**
 * @route   POST /api/v1/admin/tenants/:tenantId/extend-trial
 * @desc    Extend tenant trial period
 * @access  Private (Admin only)
 */
router.post(
  '/tenants/:tenantId/extend-trial',
  auth(ENUM_USER_ROLE.ADMIN),
  AdminController.extendTenantTrial,
);

export const adminRoutes = router;
