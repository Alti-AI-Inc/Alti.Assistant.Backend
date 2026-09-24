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

const publishOtaRelease = catchAsync(async (req, res) => {
  const { platform, version, bucketName = 'ota-releases' } = req.body;
  // This will assume the file is uploaded. In a real scenario, this would use a presigned URL or Multer.
  const result = await LibertyService.publishOtaRelease(bucketName, platform, version);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `OTA release ${version} mapped for ${platform}`,
    data: result,
  });
});

const getLatestOtaReleaseUrl = catchAsync(async (req, res) => {
  const { platform } = req.params;
  const result = await LibertyService.getLatestOtaReleaseUrl('ota-releases', platform);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Latest OTA URL for ${platform}`,
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

const listSecurityGroups = catchAsync(async (req, res) => {
  const result = await LibertyService.listSecurityGroups();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Security groups listed.',
    data: result,
  });
});

const listFloatingIps = catchAsync(async (req, res) => {
  const result = await LibertyService.listFloatingIps();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Floating IPs listed.',
    data: result,
  });
});

// ── Barbican ──
const listSecrets = catchAsync(async (req, res) => {
  const result = await LibertyService.listSecrets();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Barbican secrets listed.',
    data: result,
  });
});

const createSecret = catchAsync(async (req, res) => {
  const { name, payload, secretType, algorithm, bitLength } = req.body;
  const result = await LibertyService.createSecret(name, payload, secretType, algorithm, bitLength);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Secret created.',
    data: result,
  });
});

const getSecret = catchAsync(async (req, res) => {
  const result = await LibertyService.getSecret(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Secret retrieved.',
    data: result,
  });
});

const deleteSecret = catchAsync(async (req, res) => {
  const result = await LibertyService.deleteSecret(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Secret deleted.',
    data: result,
  });
});

// ── Glance ──
const listImages = catchAsync(async (req, res) => {
  const result = await LibertyService.listImages();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Glance images listed.',
    data: result,
  });
});

const getImage = catchAsync(async (req, res) => {
  const result = await LibertyService.getImage(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Image retrieved.',
    data: result,
  });
});

// ── Octavia ──
const listLoadBalancers = catchAsync(async (req, res) => {
  const result = await LibertyService.listLoadBalancers();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Load balancers listed.',
    data: result,
  });
});

const createLoadBalancer = catchAsync(async (req, res) => {
  const { name, vipSubnetId, description } = req.body;
  const result = await LibertyService.createLoadBalancer(name, vipSubnetId, description);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Load balancer creation initiated.',
    data: result,
  });
});

const getLoadBalancer = catchAsync(async (req, res) => {
  const result = await LibertyService.getLoadBalancer(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Load balancer retrieved.',
    data: result,
  });
});

const getLoadBalancerStats = catchAsync(async (req, res) => {
  const result = await LibertyService.getLoadBalancerStats(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Load balancer stats retrieved.',
    data: result,
  });
});

// ── Heat ──
const listStacks = catchAsync(async (req, res) => {
  const result = await LibertyService.listStacks();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Heat stacks listed.',
    data: result,
  });
});

const createStack = catchAsync(async (req, res) => {
  const { stackName, template, parameters } = req.body;
  const result = await LibertyService.createStack(stackName, template, parameters);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Stack creation initiated.',
    data: result,
  });
});

const getStack = catchAsync(async (req, res) => {
  const { name, id } = req.params;
  const result = await LibertyService.getStack(name, id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Stack retrieved.',
    data: result,
  });
});

const deleteStack = catchAsync(async (req, res) => {
  const { name, id } = req.params;
  const result = await LibertyService.deleteStack(name, id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Stack deletion initiated.',
    data: result,
  });
});

const validateTemplate = catchAsync(async (req, res) => {
  const { template } = req.body;
  const result = await LibertyService.validateTemplate(template);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Template validation complete.',
    data: result,
  });
});

const getFullClusterStatus = catchAsync(async (req, res) => {
  const result = await LibertyService.getFullClusterStatus();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Full cluster status retrieved.',
    data: result,
  });
});

export const LibertyController = {
  getClusterStatus,
  getFullClusterStatus,
  listBuckets,
  createBucket,
  listObjects,
  getPresignedUrl,
  deleteObject,
  getStorageStats,
  publishOtaRelease,
  getLatestOtaReleaseUrl,
  listInstances,
  getInstance,
  instanceAction,
  listVolumes,
  createVolume,
  listNetworks,
  listSecurityGroups,
  listFloatingIps,
  listSecrets,
  createSecret,
  getSecret,
  deleteSecret,
  listImages,
  getImage,
  listLoadBalancers,
  createLoadBalancer,
  getLoadBalancer,
  getLoadBalancerStats,
  listStacks,
  createStack,
  getStack,
  deleteStack,
  validateTemplate,
};

export default LibertyController;
