import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { MapboxService } from './mapbox.service.js';

// ── Geocoding ─────────────────────────────────────────────────────────

const geocodeForward = catchAsync(async (req, res) => {
  const result = await MapboxService.geocodeForward(req.query.q, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Geocode forward', data: result });
});

const geocodeReverse = catchAsync(async (req, res) => {
  const { lng, lat } = req.params;
  const result = await MapboxService.geocodeReverse(lng, lat, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Geocode reverse', data: result });
});

// ── Search / Places ───────────────────────────────────────────────────

const searchSuggest = catchAsync(async (req, res) => {
  const result = await MapboxService.searchSuggest(req.query.q, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Search suggest', data: result });
});

const searchRetrieve = catchAsync(async (req, res) => {
  const result = await MapboxService.searchRetrieve(req.params.mapboxId, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Place details', data: result });
});

const searchCategory = catchAsync(async (req, res) => {
  const result = await MapboxService.searchCategory(req.params.category, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Category search', data: result });
});

// ── Directions ────────────────────────────────────────────────────────

const getDirections = catchAsync(async (req, res) => {
  const { profile, coordinates } = req.params;
  const result = await MapboxService.getDirections(profile, coordinates, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Directions', data: result });
});

const getDrivingDirections = catchAsync(async (req, res) => {
  const result = await MapboxService.getDrivingDirections(req.params.coordinates, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Driving directions', data: result });
});

const getWalkingDirections = catchAsync(async (req, res) => {
  const result = await MapboxService.getWalkingDirections(req.params.coordinates, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Walking directions', data: result });
});

const getCyclingDirections = catchAsync(async (req, res) => {
  const result = await MapboxService.getCyclingDirections(req.params.coordinates, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Cycling directions', data: result });
});

// ── Matrix ────────────────────────────────────────────────────────────

const getMatrix = catchAsync(async (req, res) => {
  const { profile, coordinates } = req.params;
  const result = await MapboxService.getMatrix(profile, coordinates, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Matrix', data: result });
});

// ── Optimization ──────────────────────────────────────────────────────

const getOptimizedTrip = catchAsync(async (req, res) => {
  const { profile, coordinates } = req.params;
  const result = await MapboxService.getOptimizedTrip(profile, coordinates, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Optimized trip', data: result });
});

// ── Isochrone ─────────────────────────────────────────────────────────

const getIsochrone = catchAsync(async (req, res) => {
  const { profile, lng, lat } = req.params;
  const result = await MapboxService.getIsochrone(profile, lng, lat, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Isochrone', data: result });
});

// ── Map Matching ──────────────────────────────────────────────────────

const matchRoute = catchAsync(async (req, res) => {
  const { profile, coordinates } = req.params;
  const result = await MapboxService.matchRoute(profile, coordinates, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Map matching', data: result });
});

// ── Tilequery ─────────────────────────────────────────────────────────

const tilequery = catchAsync(async (req, res) => {
  const { tileset, lng, lat } = req.params;
  const result = await MapboxService.tilequery(tileset, lng, lat, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Tilequery', data: result });
});

// ── Static Images ─────────────────────────────────────────────────────

const getStaticImageUrl = catchAsync(async (req, res) => {
  const { username, styleId, lng, lat, zoom, size } = req.query;
  const url = MapboxService.getStaticImageUrl(username, styleId, req.query.overlay, lng, lat, zoom, size);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Static image URL', data: { url } });
});

// ── Styles ────────────────────────────────────────────────────────────

const listStyles = catchAsync(async (req, res) => {
  const result = await MapboxService.listStyles(req.params.username, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Styles', data: result });
});

const getStyle = catchAsync(async (req, res) => {
  const result = await MapboxService.getStyle(req.params.username, req.params.styleId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Style', data: result });
});

// ── Tilesets ──────────────────────────────────────────────────────────

const listTilesets = catchAsync(async (req, res) => {
  const result = await MapboxService.listTilesets(req.params.username, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Tilesets', data: result });
});

const getTileJSON = catchAsync(async (req, res) => {
  const result = await MapboxService.getTileJSON(req.params.tilesetId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'TileJSON', data: result });
});

// ── Datasets ──────────────────────────────────────────────────────────

const listDatasets = catchAsync(async (req, res) => {
  const result = await MapboxService.listDatasets(req.params.username);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Datasets', data: result });
});

const getDataset = catchAsync(async (req, res) => {
  const result = await MapboxService.getDataset(req.params.username, req.params.datasetId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Dataset', data: result });
});

const listDatasetFeatures = catchAsync(async (req, res) => {
  const result = await MapboxService.listDatasetFeatures(req.params.username, req.params.datasetId, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Dataset features', data: result });
});

// ── Uploads ───────────────────────────────────────────────────────────

const listUploads = catchAsync(async (req, res) => {
  const result = await MapboxService.listUploads(req.params.username);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Uploads', data: result });
});

const getUploadStatus = catchAsync(async (req, res) => {
  const result = await MapboxService.getUploadStatus(req.params.username, req.params.uploadId);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Upload status', data: result });
});

// ── Tokens ────────────────────────────────────────────────────────────

const listTokens = catchAsync(async (req, res) => {
  const result = await MapboxService.listTokens(req.params.username);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Tokens', data: result });
});

// ── Fonts ─────────────────────────────────────────────────────────────

const listFonts = catchAsync(async (req, res) => {
  const result = await MapboxService.listFonts(req.params.username);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: 'Fonts', data: result });
});

// ── Raw Proxy ─────────────────────────────────────────────────────────

const rawProxy = catchAsync(async (req, res) => {
  const path = '/' + req.params[0];
  const result = await MapboxService.rawGet(path, req.query);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, message: `Proxy: ${path}`, data: result });
});

export const MapboxController = {
  geocodeForward, geocodeReverse,
  searchSuggest, searchRetrieve, searchCategory,
  getDirections, getDrivingDirections, getWalkingDirections, getCyclingDirections,
  getMatrix, getOptimizedTrip, getIsochrone, matchRoute, tilequery,
  getStaticImageUrl,
  listStyles, getStyle, listTilesets, getTileJSON,
  listDatasets, getDataset, listDatasetFeatures,
  listUploads, getUploadStatus,
  listTokens, listFonts,
  rawProxy,
};

export default MapboxController;
