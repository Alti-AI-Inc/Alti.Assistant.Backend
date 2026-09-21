import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { CloudflareService } from './cloudflare.service.js';

const getZoneDetails = catchAsync(async (req, res) => {
  const { zoneId } = req.query;
  const result = await CloudflareService.getZoneDetails(zoneId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Cloudflare zone details retrieved.',
    data: result,
  });
});

const purgeCache = catchAsync(async (req, res) => {
  const { purgeEverything, files, tags, zoneId } = req.body;
  const result = await CloudflareService.purgeCache({ purgeEverything, files, tags, zoneId });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Cloudflare cache purge executed.',
    data: result,
  });
});

const listDnsRecords = catchAsync(async (req, res) => {
  const { zoneId, type } = req.query;
  const result = await CloudflareService.listDnsRecords(zoneId, type);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Cloudflare DNS records listed.',
    data: result,
  });
});

const createDnsRecord = catchAsync(async (req, res) => {
  const result = await CloudflareService.createDnsRecord(req.body);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Cloudflare DNS record created.',
    data: result,
  });
});

const deleteDnsRecord = catchAsync(async (req, res) => {
  const { recordId } = req.params;
  const { zoneId } = req.query;
  const result = await CloudflareService.deleteDnsRecord(recordId, zoneId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Cloudflare DNS record deleted.',
    data: result,
  });
});

const verifyTurnstile = catchAsync(async (req, res) => {
  const { token } = req.body;
  const remoteIp = req.ip || req.connection.remoteAddress;
  const result = await CloudflareService.verifyTurnstile(token, remoteIp);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: result.success,
    message: result.success ? 'Turnstile verified.' : 'Turnstile verification failed.',
    data: result,
  });
});

const listWafRules = catchAsync(async (req, res) => {
  const { zoneId } = req.query;
  const result = await CloudflareService.listWafRules(zoneId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Cloudflare WAF rules listed.',
    data: result,
  });
});

export const CloudflareController = {
  getZoneDetails,
  purgeCache,
  listDnsRecords,
  createDnsRecord,
  deleteDnsRecord,
  verifyTurnstile,
  listWafRules,
};

export default CloudflareController;
