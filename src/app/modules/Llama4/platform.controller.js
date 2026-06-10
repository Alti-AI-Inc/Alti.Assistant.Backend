import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import Tenant from '../tenant/tenant.model.js';
import PlatformConfig from '../platform/platformConfig.model.js';

const getAllTenants = catchAsync(async (req, res) => {
  const result = await Tenant.find({}).lean();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenants retrieved successfully',
    data: result,
  });
});

const suspendTenant = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await Tenant.findByIdAndUpdate(
    id,
    { status: 'suspended' },
    { new: true }
  ).lean();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant suspended successfully',
    data: result,
  });
});

const unsuspendTenant = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await Tenant.findByIdAndUpdate(
    id,
    { status: 'active' },
    { new: true }
  ).lean();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant unsuspended successfully',
    data: result,
  });
});

const overrideTenantLimits = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const result = await Tenant.findByIdAndUpdate(
    id,
    { limits: updateData },
    { new: true }
  ).lean();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Tenant limits updated successfully',
    data: result,
  });
});

const getSystemConfig = catchAsync(async (req, res) => {
  let result = await PlatformConfig.findOne({}).lean();
  if (!result) {
    result = await PlatformConfig.create({});
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'System configuration retrieved successfully',
    data: result,
  });
});

const updateSystemConfig = catchAsync(async (req, res) => {
  const newConfig = req.body;
  const result = await PlatformConfig.findOneAndUpdate(
    {},
    newConfig,
    { new: true, upsert: true }
  ).lean();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'System configuration updated successfully',
    data: result,
  });
});

const getGlobalLogs = catchAsync(async (req, res) => {
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Logs retrieved successfully',
    data: [],
  });
});

const getGlobalStats = catchAsync(async (req, res) => {
  const totalTenants = await Tenant.countDocuments();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Global statistics retrieved successfully',
    data: {
      totalTenants,
      systemHealth: 'OK',
    },
  });
});

export const PlatformController = {
  getAllTenants,
  suspendTenant,
  unsuspendTenant,
  overrideTenantLimits,
  getSystemConfig,
  updateSystemConfig,
  getGlobalLogs,
  getGlobalStats,
};
