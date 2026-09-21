import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { LibertyService } from './liberty.service.js';

const getClusterStatus = catchAsync(async (req, res) => {
  const result = await LibertyService.getClusterStatus();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Liberty Center One cluster status retrieved.',
    data: result,
  });
});

const listBuckets = catchAsync(async (req, res) => {
  const result = await LibertyService.listBuckets();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Object storage buckets listed.',
    data: result,
  });
});

const createBucket = catchAsync(async (req, res) => {
  const { bucketName } = req.body;
  const result = await LibertyService.createBucket(bucketName);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Bucket created successfully.',
    data: result,
  });
});

const listObjects = catchAsync(async (req, res) => {
  const { bucket } = req.params;
  const { prefix } = req.query;
  const result = await LibertyService.listObjects(bucket, prefix);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Bucket objects listed.',
    data: result,
  });
});

const getPresignedUrl = catchAsync(async (req, res) => {
  const { bucket, key, action, expiresIn } = req.body;
  const result = await LibertyService.getPresignedUrl(bucket, key, action, expiresIn);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Presigned URL generated.',
    data: result,
  });
});

const deleteObject = catchAsync(async (req, res) => {
  const { bucket, key } = req.body;
  const result = await LibertyService.deleteObject(bucket, key);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Object deleted successfully.',
    data: result,
  });
});

const getStorageStats = catchAsync(async (req, res) => {
  const result = await LibertyService.getStorageStats();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Storage statistics retrieved.',
    data: result,
  });
});

const listInstances = catchAsync(async (req, res) => {
  const result = await LibertyService.listInstances();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Compute instances listed.',
    data: result,
  });
});

const getInstance = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await LibertyService.getInstance(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Compute instance retrieved.',
    data: result,
  });
});

const instanceAction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  const result = await LibertyService.instanceAction(id, action);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Instance action '${action}' accepted.`,
    data: result,
  });
});

const listVolumes = catchAsync(async (req, res) => {
  const result = await LibertyService.listVolumes();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Block storage volumes listed.',
    data: result,
  });
});

const createVolume = catchAsync(async (req, res) => {
  const { name, sizeGb } = req.body;
  const result = await LibertyService.createVolume(name, sizeGb);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Volume creation initiated.',
    data: result,
  });
});

const listNetworks = catchAsync(async (req, res) => {
  const result = await LibertyService.listNetworks();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Virtual networks listed.',
    data: result,
  });
});

export const LibertyController = {
  getClusterStatus,
  listBuckets,
  createBucket,
  listObjects,
  getPresignedUrl,
  deleteObject,
  getStorageStats,
  listInstances,
  getInstance,
  instanceAction,
  listVolumes,
  createVolume,
  listNetworks,
};

export default LibertyController;
