import { logger } from '../../../shared/logger.js';
import paginationHelpers from '../../helpers/paginationHelpers.js';
import UserModel from '../auth/auth.model.js';
import SubscriptionModel from '../payment/payment.model.js';
import mongoose from 'mongoose';

// ===========================================
//                  All Users
//============================================

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

  const total = await UserModel.estimatedDocumentCount();
  const paidUser = await UserModel.countDocuments({
    'subscription.status': 'paid',
  });
  const freeUser = await UserModel.countDocuments({ plan: 'free' });
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
const getAllBuyerServices = async () => {
  const result = await UserModel.find({ role: 'buyer' });
  return result;
};

//====================  Admin ========================

const getSellerServiceById = async (id) => {
  const result = await UserModel.findOne({ _id: id });
  logger.info(result);
  return result;
};

const makeAdminService = async (userId) => {
  const filter = { _id: userId };
  const updateDoc = {
    $set: { role: 'admin' },
  };
  const result = await UserModel.updateOne(filter, updateDoc, {
    runValidators: true,
  });
  return result;
};

const deleteUserService = async (objectId) => {
  if (!mongoose.Types.ObjectId.isValid(objectId)) {
    throw new Error('Invalid user ID format');
  }

  const mongoId = new mongoose.Types.ObjectId(objectId); // <-- convert explicitly

  const user = await UserModel.findOne({ _id: mongoId });
  logger.info('User found:', user);

  if (!user) {
    throw new Error('User not found');
  }

  if (user.role === 'admin') {
    throw new Error('Cannot delete an admin user');
  }

  const result = await UserModel.deleteOne({ _id: mongoId });
  return result;
};

//==================== Sup Admin ========================

const getAdminServices = async (email) => {
  // const admin = await UserModel.find({ email: email })
  // const isAdmin = admin.role === "admin"
  // return isAdmin;
  const admin = await UserModel.findOne({ email: email });
  if (admin && admin.role === 'admin') {
    return true;
  } else {
    return false;
  }
};

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

  const total = await SubscriptionModel.estimatedDocumentCount();
  const paidUser = await SubscriptionModel.countDocuments({
    paymentStatus: 'paid',
  });
  const freeUser = await SubscriptionModel.countDocuments({ plan: 'free' });
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
 * Get all tenants (admin)
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
 * Get tenant details (admin)
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
 * Update tenant status (admin)
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
 * Get tenant usage (admin)
 */
const getTenantUsageService = async (tenantId) => {
  const tenantService = (await import('../tenant/tenant.service.js'))
    .tenantService;
  return await tenantService.getTenantUsage(tenantId);
};

/**
 * Extend tenant trial (admin)
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

export const AdminService = {
  getAllUsersService,
  getAllBuyerServices,
  getSellerServiceById,
  makeAdminService,
  deleteUserService,
  getAdminServices,
  getUserStatisticsByMonthService,
  getAllPaymentService,
  getAllTenantsService,
  getTenantDetailsService,
  updateTenantStatusService,
  getTenantUsageService,
  extendTenantTrialService,
};
