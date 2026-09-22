import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { ExploriumService } from './explorium.service.js';

// ── Businesses ────────────────────────────────────────────────────────

const matchBusinesses = catchAsync(async (req, res) => {
  const result = await ExploriumService.matchBusinesses(req.body.records || req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Business match', data: result });
});

const enrichBusinesses = catchAsync(async (req, res) => {
  const result = await ExploriumService.enrichBusinesses(req.body.records || req.body, req.body.bundles);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Business enrichment', data: result });
});

const searchBusinesses = catchAsync(async (req, res) => {
  const result = await ExploriumService.searchBusinesses(req.body.filters || req.body, req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Business search', data: result });
});

const researchBusiness = catchAsync(async (req, res) => {
  const result = await ExploriumService.researchBusiness(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Business research', data: result });
});

const getBusiness = catchAsync(async (req, res) => {
  const result = await ExploriumService.getBusiness(req.params.businessId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Business', data: result });
});

// ── Prospects ─────────────────────────────────────────────────────────

const matchProspects = catchAsync(async (req, res) => {
  const result = await ExploriumService.matchProspects(req.body.records || req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Prospect match', data: result });
});

const enrichProspects = catchAsync(async (req, res) => {
  const result = await ExploriumService.enrichProspects(req.body.records || req.body, req.body.bundles);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Prospect enrichment', data: result });
});

const searchProspects = catchAsync(async (req, res) => {
  const result = await ExploriumService.searchProspects(req.body.filters || req.body, req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Prospect search', data: result });
});

const getProspect = catchAsync(async (req, res) => {
  const result = await ExploriumService.getProspect(req.params.prospectId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Prospect', data: result });
});

// ── Events / Signals ──────────────────────────────────────────────────

const getEvents = catchAsync(async (req, res) => {
  const result = await ExploriumService.getEvents(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Events', data: result });
});

// ── Autocomplete ──────────────────────────────────────────────────────

const autocomplete = catchAsync(async (req, res) => {
  const result = await ExploriumService.autocomplete(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Autocomplete', data: result });
});

// ── Audience Stats ────────────────────────────────────────────────────

const getAudienceStats = catchAsync(async (req, res) => {
  const result = await ExploriumService.getAudienceStats(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Audience stats', data: result });
});

// ── Jobs ──────────────────────────────────────────────────────────────

const createJob = catchAsync(async (req, res) => {
  const result = await ExploriumService.createJob(req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Job created', data: result });
});

const getJobStatus = catchAsync(async (req, res) => {
  const result = await ExploriumService.getJobStatus(req.params.jobId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Job status', data: result });
});

const listJobs = catchAsync(async (req, res) => {
  const result = await ExploriumService.listJobs(req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Jobs', data: result });
});

// ── Credits ───────────────────────────────────────────────────────────

const getCreditBalance = catchAsync(async (req, res) => {
  const result = await ExploriumService.getCreditBalance();
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Credit balance', data: result });
});

// ── Raw Proxy ─────────────────────────────────────────────────────────

const rawProxy = catchAsync(async (req, res) => {
  const path = '/' + req.params[0];
  let result;
  if (req.method === 'POST') {
    result = await ExploriumService.rawPost(path, req.body);
  } else {
    result = await ExploriumService.rawGet(path, req.query);
  }
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Proxy: ${path}`, data: result });
});

export const ExploriumController = {
  matchBusinesses, enrichBusinesses, searchBusinesses, researchBusiness, getBusiness,
  matchProspects, enrichProspects, searchProspects, getProspect,
  getEvents, autocomplete, getAudienceStats,
  createJob, getJobStatus, listJobs,
  getCreditBalance,
  rawProxy,
};

export default ExploriumController;
