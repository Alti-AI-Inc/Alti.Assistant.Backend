import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import paginationHelpers from '../../helpers/paginationHelpers.js';
import UserModel from '../auth/auth.model.js';
import SubscriptionModel from '../payment/payment.model.js';
import mongoose from 'mongoose';

// ===========================================
//                  All Users
//============================================

/**
 * @typedef {object} UserFilterOptions
 * @property {string} [searchTerm] - A search term to filter users by email, first name, or last name.
 */

/**
 * @typedef {object} PaginationOptions
 * @property {number} [page=1] - The page number for pagination.
 * @property {number} [limit=10] - The number of items per page.
 * @property {string} [sortBy] - The field to sort the results by.
 * @property {'asc'|'desc'} [sortOrder] - The sort order ('asc' for ascending, 'desc' for descending).
 */

/**
 * Retrieves a paginated list of all users with filtering capabilities.
 * It also provides statistics on paid, free, and unverified users.
 *
 * @param {UserFilterOptions} filters - An object containing filter criteria.
 * @param {PaginationOptions} paginationOptions - Options for pagination and sorting.
 * @returns {Promise<object>} An object containing user data and pagination metadata.
 * @returns {object} .meta - Pagination and user statistics metadata.
 * @returns {number} .meta.page - The current page number.
 * @returns {number} .meta.limit - The limit of items per page.
 * @returns {number} .meta.total - The total number of users matching the criteria.
 * @returns {number} .meta.paidUser - The total number of subscribed users.
 * @returns {number} .meta.freeUser - The total number of non-subscribed users.
 * @returns {number} .meta.unverifyUsers - The total number of unauthorized users.
 * @returns {Array<object>} .data - An array of user objects, each containing email, isSubscribed, role, and subscription details.
 */
const getAllUsersService = async (filters, paginationOptions) => {
  const { searchTerm } = filters;

  const productsSearchAbleFields = ['email', 'firstName', 'lastName'];
  const andConditions = [];

  // Add a default condition if andConditions is empty
  if (andConditions.length === 0) {
    andConditions.push({});
  }

  if (searchTerm) {
    andConditions.push({
      $or: productsSearchAbleFields.map((field) => ({
        [field]: { $regex: searchTerm, $options: 'i' },
      })),
    });
  }

  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  const sortConditions = {};
  if (sortBy && sortOrder) {
    sortConditions[sortBy] = sortOrder;
  }

  const users = await UserModel.find({ $and: andConditions })
    .select('email isSubscribed role subscription')
    .sort(sortConditions)
    .skip(skip)
    .limit(limit);

  const total = await UserModel.countDocuments({ $and: andConditions });
  const paidUser = await UserModel.countDocuments({
    isSubscribed: true,
  });
  const freeUser = await UserModel.countDocuments({
    isSubscribed: { $ne: true },
  });
  const unverifyUsers = await UserModel.countDocuments({
    role: 'unauthorized',
  });

  return {
    meta: {
      page,
      limit,
      total,
      paidUser,
      freeUser,
      unverifyUsers,
    },
    data: users,
  };
};

// const updateUserRoleService = async (id, userRole) => {
//   const filter = { _id: id };
//   const updateDoc = {
//     $set: { role: userRole },
//   };
//   const result = await UserModel.updateOne(filter, updateDoc, {
//     runValidators: true,
//   });
//   return result;
// };

//===================  Buyer =========================
/**
 * Retrieves a list of all users with the 'buyer' role.
 *
 * @returns {Promise<Array<object>>} An array of user objects with the 'buyer' role.
 */
const getAllBuyerServices = async () => {
  const result = await UserModel.find({ role: 'buyer' });
  return result;
};

//====================  Admin ========================

/**
 * Retrieves a single user by their ID.
 *
 * @param {string} id - The ID of the user to retrieve.
 * @returns {Promise<object|null>} The user object if found, otherwise null.
 */
const getSellerServiceById = async (id) => {
  const result = await UserModel.findOne({ _id: id });
  logger.info(result);
  return result;
};

/**
 * Updates the role of a specific user.
 *
 * @param {string} userId - The ID of the user to update.
 * @param {string} targetRole - The new role to assign to the user (e.g., 'admin', 'buyer', 'super_admin').
 * @returns {Promise<object>} The result of the Mongoose update operation, indicating success or failure.
 */
const updateUserRoleService = async (userId, targetRole) => {
  const filter = { _id: userId };
  const updateDoc = {
    $set: { role: targetRole },
  };
  const result = await UserModel.updateOne(filter, updateDoc, {
    runValidators: true,
  });
  return result;
};

/**
 * Deletes a user by their ID, with role-based restrictions.
 * Super admins cannot be deleted. Admins can only be deleted by super admins.
 *
 * @param {string} objectId - The ID of the user to delete.
 * @param {string} [requesterRole='admin'] - The role of the user performing the deletion. Used for permission checks.
 * @returns {Promise<object>} The result of the Mongoose delete operation.
 * @throws {Error} If the user ID format is invalid.
 * @throws {Error} If the user is not found.
 * @throws {Error} If attempting to delete a 'super_admin' user.
 * @throws {Error} If an 'admin' attempts to delete another 'admin' without 'super_admin' privileges.
 */
const deleteUserService = async (objectId, requesterRole = 'admin') => {
  if (!mongoose.Types.ObjectId.isValid(objectId)) {
    throw new Error('Invalid user ID format');
  }

  const mongoId = new mongoose.Types.ObjectId(objectId); // <-- convert explicitly

  const user = await UserModel.findOne({ _id: mongoId });
  logger.info('User found:', user);

  if (!user) {
    throw new Error('User not found');
  }

  if (user.role === 'super_admin') {
    throw new Error('Cannot delete a super_admin user');
  }

  if (user.role === 'admin' && requesterRole !== 'super_admin') {
    throw new Error('Only a super_admin can delete an admin user');
  }

  const result = await UserModel.deleteOne({ _id: mongoId });
  return result;
};

//==================== Sup Admin ========================

/**
 * Checks if a given email belongs to an admin or super_admin.
 * This includes checking against a configured super admin email.
 *
 * @param {string} email - The email address to check.
 * @returns {Promise<boolean>} True if the email belongs to an admin or super_admin, false otherwise.
 */
const getAdminServices = async (email) => {
  const emailLower = email ? email.toLowerCase() : '';
  const superAdminEmail = (config.superAdminEmail || '').toLowerCase();
  if (superAdminEmail && emailLower === superAdminEmail) {
    return true;
  }
  const admin = await UserModel.findOne({ email: email });
  if (admin && (admin.role === 'admin' || admin.role === 'super_admin')) {
    return true;
  } else {
    return false;
  }
};

/**
 * Retrieves user registration statistics grouped by month and year.
 * Aggregates user creation dates to provide counts per month within each year.
 *
 * @returns {Promise<object>} An object containing user statistics, grouped by year and month.
 * @returns {number} .statusCode - HTTP status code.
 * @returns {boolean} .success - Indicates if the operation was successful.
 * @returns {string} .message - A descriptive message.
 * @returns {Array<object>} .data - An array of aggregated user statistics.
 * @returns {number} .data[].count - Total users registered in the given year (sum of all months in that year).
 * @returns {number} .data[].year - The year of registration.
 * @returns {number} .data[].totalMonth - The number of months with registrations in that year.
 * @returns {object} .data[].month - An object where keys are month names (e.g., 'January') and values are user counts for that month.
 */
const getUserStatisticsByMonthService = async () => {
  const aggregationResult = await UserModel.aggregate([
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 },
    },
  ]);

  const result = aggregationResult.reduce((acc, item) => {
    const year = item._id.year;
    const month = item._id.month;
    const count = item.count;
    const monthName = new Date(year, month - 1).toLocaleString('default', {
      month: 'long',
    });

    if (!acc[year]) {
      acc[year] = {
        year,
        totalMonth: 0,
        months: {},
      };
    }

    acc[year].months[monthName] = count;
    acc[year].totalMonth += 1;

    return acc;
  }, {});

  const data = Object.values(result).map((item) => ({
    count: Object.values(item.months).reduce((sum, count) => sum + count, 0),
    year: item.year,
    totalMonth: item.totalMonth,
    month: item.months,
  }));

  return {
    statusCode: 200,
    success: true,
    message: 'Get User Statistics Successfully',
    data: data,
  };
};

/**
 * @typedef {object} PaymentFilterOptions
 * @property {string} [searchTerm] - A search term to filter payments by price, plan name, duration, or expiry date.
 */

/**
 * Retrieves a paginated list of all payment subscriptions with filtering capabilities.
 * It also provides statistics on different payment statuses and plan types.
 *
 * @param {PaymentFilterOptions} filters - An object containing filter criteria.
 * @param {PaginationOptions} paginationOptions - Options for pagination and sorting.
 * @returns {Promise<object>} An object containing payment data and pagination metadata.
 * @returns {object} .meta - Pagination and payment statistics metadata.
 * @returns {number} .meta.page - The current page number.
 * @returns {number} .meta.limit - The limit of items per page.
 * @returns {number} .meta.total - The total number of subscriptions matching the criteria.
 * @returns {number} .meta.paidUser - The total number of paid subscriptions.
 * @returns {number} .meta.freeUser - The total number of free plan subscriptions.
 * @returns {number} .meta.professionalPlan - The total number of professional plan subscriptions.
 * @returns {number} .meta.personalPlan - The total number of personal plan subscriptions.
 * @returns {number} .meta.businessPlan - The total number of business plan subscriptions.
 * @returns {Array<object>} .data - An array of subscription objects, each containing transactionId, price, plan_name, duration, and expiresAt.
 */
const getAllPaymentService = async (filters, paginationOptions) => {
  const { searchTerm } = filters;

  const productsSearchAbleFields = [
    'price',
    'plan_name',
    'duration',
    'expiresAt',
  ];
  const andConditions = [];

  // Add a default condition if andConditions is empty
  if (andConditions.length === 0) {
    andConditions.push({});
  }

  if (searchTerm) {
    andConditions.push({
      $or: productsSearchAbleFields.map((field) => ({
        [field]: { $regex: searchTerm, $options: 'i' },
      })),
    });
  }

  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  const sortConditions = {};
  if (sortBy && sortOrder) {
    sortConditions[sortBy] = sortOrder;
  }

  const users = await SubscriptionModel.find({ $and: andConditions })
    .select('transactionId price plan_name duration expiresAt')
    .sort(sortConditions)
    .skip(skip)
    .limit(limit);

  const total = await SubscriptionModel.countDocuments({ $and: andConditions });
  const paidUser = await SubscriptionModel.countDocuments({
    paymentStatus: 'paid',
  });
  const freeUser = await SubscriptionModel.countDocuments({ plan_name: 'free' });
  const professionalPlan = await SubscriptionModel.countDocuments({
    plan_name: 'professional',
  });
  const personalPlan = await SubscriptionModel.countDocuments({
    plan_name: 'personal',
  });
  const businessPlan = await SubscriptionModel.countDocuments({
    plan_name: 'business',
  });

  return {
    meta: {
      page,
      limit,
      total,
      paidUser,
      freeUser,
      professionalPlan,
      personalPlan,
      businessPlan,
    },
    data: users,
  };
};

/**
 * @typedef {object} TenantFilterOptions
 * @property {string} [searchTerm] - A search term to filter tenants by name or slug.
 * @property {string} [status] - Filter tenants by their status (e.g., 'active', 'suspended').
 * @property {string} [ownerId] - Filter tenants by the ID of their owner.
 */

/**
 * Retrieves a paginated list of all tenants with search and filter capabilities for admin users.
 *
 * @param {TenantFilterOptions} filters - An object containing filter criteria.
 * @param {PaginationOptions} paginationOptions - Options for pagination and sorting.
 * @returns {Promise<object>} An object containing tenant data and pagination metadata.
 * @returns {object} .meta - Pagination metadata.
 * @returns {number} .meta.page - The current page number.
 * @returns {number} .meta.limit - The limit of items per page.
 * @returns {number} .meta.total - The total number of tenants matching the criteria.
 * @returns {Array<object>} .data - An array of tenant objects, populated with owner details (name, email).
 */
const getAllTenantsService = async (filters, paginationOptions) => {
  const Tenant = (await import('../tenant/tenant.model.js')).default;
  const { searchTerm, ...filterData } = filters;
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  const andConditions = [];

  if (searchTerm) {
    andConditions.push({
      $or: ['name', 'slug'].map((field) => ({
        [field]: { $regex: searchTerm, $options: 'i' },
      })),
    });
  }

  if (Object.keys(filterData).length) {
    andConditions.push({
      $and: Object.entries(filterData).map(([field, value]) => ({
        [field]: value,
      })),
    });
  }

  const query = andConditions.length > 0 ? { $and: andConditions } : {};
  const sortConditions = {};
  if (sortBy && sortOrder) {
    sortConditions[sortBy] = sortOrder;
  }

  const tenants = await Tenant.find(query)
    .populate('ownerId', 'name email')
    .sort(sortConditions)
    .skip(skip)
    .limit(limit);

  const total = await Tenant.countDocuments(query);

  return {
    meta: { page, limit, total },
    data: tenants,
  };
};

/**
 * Retrieves detailed information for a specific tenant, including member count.
 *
 * @param {string} tenantId - The ID of the tenant to retrieve.
 * @returns {Promise<object>} The tenant object with additional memberCount, populated with owner details.
 * @throws {Error} If the tenant is not found.
 */
const getTenantDetailsService = async (tenantId) => {
  const Tenant = (await import('../tenant/tenant.model.js')).default;
  const UserModel = (await import('../auth/auth.model.js')).default;

  const tenant = await Tenant.findById(tenantId).populate(
    'ownerId',
    'name email'
  );

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  // Get member count
  const memberCount = await UserModel.countDocuments({ tenantId });

  return {
    ...tenant.toObject(),
    memberCount,
  };
};

/**
 * Updates the status of a specific tenant.
 *
 * @param {string} tenantId - The ID of the tenant to update.
 * @param {string} status - The new status for the tenant (e.g., 'active', 'suspended', 'trial').
 * @returns {Promise<object>} The updated tenant object.
 * @throws {Error} If the tenant is not found.
 */
const updateTenantStatusService = async (tenantId, status) => {
  const Tenant = (await import('../tenant/tenant.model.js')).default;

  const tenant = await Tenant.findByIdAndUpdate(
    tenantId,
    { status },
    { new: true, runValidators: true }
  );

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  return tenant;
};

/**
 * Retrieves usage statistics for a specific tenant.
 * This delegates to the tenant service's `getTenantUsage` function.
 *
 * @param {string} tenantId - The ID of the tenant to retrieve usage for.
 * @returns {Promise<object>} An object containing the tenant's usage statistics.
 */
const getTenantUsageService = async (tenantId) => {
  const tenantService = (await import('../tenant/tenant.service.js'))
    .tenantService;
  return await tenantService.getTenantUsage(tenantId);
};

/**
 * Extends the trial period for a specific tenant by a given number of days.
 *
 * @param {string} tenantId - The ID of the tenant whose trial period to extend.
 * @param {number} days - The number of days to add to the current trial period.
 * @returns {Promise<object>} The updated tenant object with the new trial end date.
 * @throws {Error} If the tenant is not found.
 */
const extendTenantTrialService = async (tenantId, days) => {
  const Tenant = (await import('../tenant/tenant.model.js')).default;

  const tenant = await Tenant.findById(tenantId);

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const currentTrialEnd = tenant.trialEndsAt || new Date();
  const newTrialEnd = new Date(currentTrialEnd);
  newTrialEnd.setDate(newTrialEnd.getDate() + parseInt(days));

  tenant.trialEndsAt = newTrialEnd;
  await tenant.save();

  return tenant;
};

/**
 * @typedef {object} BillingAuditLogFilterOptions
 * @property {string} [searchTerm] - A search term to filter logs by action or IP address.
 * @property {string} [action] - Filter logs by a specific action type (e.g., 'SUBSCRIPTION_CREATED', 'PAYMENT_FAILED').
 */

/**
 * Retrieves a paginated list of billing audit logs with search and filter capabilities for admin users.
 *
 * @param {BillingAuditLogFilterOptions} filters - An object containing filter criteria.
 * @param {PaginationOptions} paginationOptions - Options for pagination and sorting.
 * @returns {Promise<object>} An object containing billing audit log data and pagination metadata.
 * @returns {object} .meta - Pagination metadata.
 * @returns {number} .meta.page - The current page number.
 * @returns {number} .meta.limit - The limit of items per page.
 * @returns {number} .meta.total - The total number of logs matching the criteria.
 * @returns {Array<object>} .data - An array of billing audit log objects, populated with tenant and user details.
 */
const getBillingAuditLogsService = async (filters, paginationOptions) => {
  const BillingAuditLog = (await import('../subscription/billingAuditLog.model.js')).default;
  const { searchTerm, action } = filters;
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  const andConditions = [];

  if (searchTerm) {
    andConditions.push({
      $or: [
        { action: { $regex: searchTerm, $options: 'i' } },
        { ipAddress: { $regex: searchTerm, $options: 'i' } },
      ],
    });
  }

  if (action) {
    andConditions.push({ action });
  }

  const query = andConditions.length > 0 ? { $and: andConditions } : {};
  const sortConditions = {};
  if (sortBy && sortOrder) {
    sortConditions[sortBy] = sortOrder;
  } else {
    sortConditions['createdAt'] = -1; // Default to newest first
  }

  const logs = await BillingAuditLog.find(query)
    .populate('tenantId', 'name slug')
    .populate('userId', 'email role firstName lastName')
    .sort(sortConditions)
    .skip(skip)
    .limit(limit);

  const total = await BillingAuditLog.countDocuments(query);

  return {
    meta: { page, limit, total },
    data: logs,
  };
};

/**
 * @typedef {object} SwarmAuditFilterOptions
 * @property {string} [searchTerm] - A search term to filter logs by user ID, tool name, or error message.
 * @property {string} [status] - Filter logs by a specific status (e.g., 'success', 'failed', 'pending').
 * @property {string} [toolName] - Filter logs by a specific tool name (e.g., 'AI_ASSISTANT', 'CODE_GENERATOR').
 */

/**
 * Retrieves a paginated list of Swarm audit logs with search and filter capabilities for admin users.
 *
 * @param {SwarmAuditFilterOptions} filters - An object containing filter criteria.
 * @param {PaginationOptions} paginationOptions - Options for pagination and sorting.
 * @returns {Promise<object>} An object containing Swarm audit log data and pagination metadata.
 * @returns {object} .meta - Pagination metadata.
 * @returns {number} .meta.page - The current page number.
 * @returns {number} .meta.limit - The limit of items per page.
 * @returns {number} .meta.total - The total number of logs matching the criteria.
 * @returns {Array<object>} .data - An array of Swarm audit log objects.
 */
const getSwarmAuditsService = async (filters, paginationOptions) => {
  const SwarmAudit = (await import('../swarm/swarmAudit.model.js')).default;
  const { searchTerm, status, toolName } = filters;
  const { page, limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  const andConditions = [];

  if (searchTerm) {
    andConditions.push({
      $or: [
        { userId: { $regex: searchTerm, $options: 'i' } },
        { toolName: { $regex: searchTerm, $options: 'i' } },
        { errorMessage: { $regex: searchTerm, $options: 'i' } },
      ],
    });
  }

  if (status) {
    andConditions.push({ status });
  }

  if (toolName) {
    andConditions.push({ toolName });
  }

  const query = andConditions.length > 0 ? { $and: andConditions } : {};
  const sortConditions = {};
  if (sortBy && sortOrder) {
    sortConditions[sortBy] = sortOrder;
  } else {
    sortConditions['createdAt'] = -1; // Default to newest first
  }

  const audits = await SwarmAudit.find(query)
    .sort(sortConditions)
    .skip(skip)
    .limit(limit);

  const total = await SwarmAudit.countDocuments(query);

  return {
    meta: { page, limit, total },
    data: audits,
  };
};

/**
 * @description Provides a collection of service functions for administrative tasks related to user management, subscriptions, tenants, and auditing.
 * @namespace AdminService
 */
export const AdminService = {
  getAllUsersService,
  getAllBuyerServices,
  getSellerServiceById,
  updateUserRoleService,
  deleteUserService,
  getAdminServices,
  getUserStatisticsByMonthService,
  getAllPaymentService,
  getAllTenantsService,
  getTenantDetailsService,
  updateTenantStatusService,
  getTenantUsageService,
  extendTenantTrialService,
  getBillingAuditLogsService,
  getSwarmAuditsService,
};