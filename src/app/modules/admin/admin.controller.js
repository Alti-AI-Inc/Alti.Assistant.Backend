// const pick = require('../../middlewares/other/pick');
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import pick from '../../middlewares/other/pick.js';
import { paginationFields } from './admin.constant.js';
import { AdminService } from './admin.service.js';

const getAllBuyer = catchAsync(async (req, res) => {
  // const buyers = await UserModel.findOne({ role: 'buyer' })
  const buyers = await AdminService.getAllBuyerServices();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get All Paid User',
    data: result,
  });
});

const deleteUser = catchAsync(async (req, res) => {
  const objectId = req.params?.objectId;
  const result = await AdminService.deleteUserService(objectId);

  if (!result.deletedCount) {
    return res.status(400).json({
      status: 'fail',
      error: "Could't delete the user",
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User Delete Successfully',
    data: result,
  });
});

const getAllUsers = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'searchTerm',
    'email',
    'firstName',
    'lastName',
  ]);

  const paginationOptions = pick(req.query, paginationFields);

  const users = await AdminService.getAllUsersService(
    filters,
    paginationOptions
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Users find Successfully',
    data: users,
  });
});

const updateUserRole = catchAsync(async (req, res) => {
  const { id } = req.params;

  const result = await AdminService.makeAdminService(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Update Role successfully',
    data: result,
  });
});

const getAdmin = catchAsync(async (req, res) => {
  const { email } = req.params;
  const admin = await AdminService.getAdminServices(email);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Admin get Successfully',
    data: admin,
  });
});

const getUserStatisticsByMonth = catchAsync(async (req, res) => {
  const result = await AdminService.getUserStatisticsByMonthService();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get User Statistics Successfully',
    data: result,
  });
});

const getAllPayment = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'searchTerm',
    'price',
    'plan_name',
    'duration',
  ]);

  const paginationOptions = pick(req.query, paginationFields);

  const result = await AdminService.getAllPaymentService(
    filters,
    paginationOptions
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Get All Paid User',
    data: result,
  });
});

/**
 * Get all tenants
 */
const getAllTenants = catchAsync(async (req, res) => {
  const filters = pick(req.query, ['searchTerm', 'status', 'plan']);
  const paginationOptions = pick(req.query, paginationFields);

  const result = await AdminService.getAllTenantsService(
    filters,
    paginationOptions
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenants retrieved successfully',
    data: result,
  });
});

/**
 * Get tenant details
 */
const getTenantDetails = catchAsync(async (req, res) => {
  const { tenantId } = req.params;

  const result = await AdminService.getTenantDetailsService(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant details retrieved successfully',
    data: result,
  });
});

/**
 * Update tenant status
 */
const updateTenantStatus = catchAsync(async (req, res) => {
  const { tenantId } = req.params;
  const { status } = req.body;

  const result = await AdminService.updateTenantStatusService(tenantId, status);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant status updated successfully',
    data: result,
  });
});

/**
 * Get tenant usage
 */
const getTenantUsageAdmin = catchAsync(async (req, res) => {
  const { tenantId } = req.params;

  const result = await AdminService.getTenantUsageService(tenantId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant usage retrieved successfully',
    data: result,
  });
});

/**
 * Extend tenant trial
 */
const extendTenantTrial = catchAsync(async (req, res) => {
  const { tenantId } = req.params;
  const { days } = req.body;

  const result = await AdminService.extendTenantTrialService(tenantId, days);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant trial extended successfully',
    data: result,
  });
});

export const AdminController = {
  getAllBuyer,
  deleteUser,
  getAllUsers,
  updateUserRole,
  getAdmin,
  getUserStatisticsByMonth,
  getAllPayment,
  getAllTenants,
  getTenantDetails,
  updateTenantStatus,
  getTenantUsageAdmin,
  extendTenantTrial,
};
