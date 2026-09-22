import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Mapbox — Complete Location Intelligence REST Client
 *
 * Base: https://api.mapbox.com
 * Auth: ?access_token=... query param on every request
 * MCP:  https://mcp.mapbox.com/mcp (hosted MCP server — @mapbox/mcp-server)
 *
 * ┌──────────────────┬──────────────────────────────────────────────────────────┐
 * │ Service          │ Endpoint                                                 │
 * ├──────────────────┼──────────────────────────────────────────────────────────┤
 * │ Geocoding (v6)   │ /search/geocode/v6/forward, /reverse                    │
 * │ Search Places    │ /search/searchbox/v1/suggest, /retrieve, /category       │
 * │ Directions       │ /directions/v5/mapbox/{profile}/{coords}                 │
 * │ Matrix           │ /directions-matrix/v1/mapbox/{profile}/{coords}          │
 * │ Optimization     │ /optimized-trips/v1/mapbox/{profile}/{coords}            │
 * │ Isochrone        │ /isochrone/v1/mapbox/{profile}/{lng},{lat}               │
 * │ Map Matching     │ /matching/v5/mapbox/{profile}/{coords}                   │
 * │ Tilequery        │ /v4/{tileset}/tilequery/{lng},{lat}.json                 │
 * │ Static Images    │ /styles/v1/{user}/{style}/static/{overlay}/{pos}/{size}  │
 * │ Styles           │ /styles/v1/{username}                                    │
 * │ Tilesets         │ /tilesets/v1/{username}                                  │
 * │ Datasets         │ /datasets/v1/{username}                                  │
 * │ Uploads          │ /uploads/v1/{username}                                   │
 * │ Tokens           │ /tokens/v2/{username}                                    │
 * │ Fonts            │ /fonts/v1/{username}                                     │
 * └──────────────────┴──────────────────────────────────────────────────────────┘
 *
 * Profiles: driving, driving-traffic, walking, cycling
 */

const ACCESS_TOKEN = config.mapbox?.accessToken || process.env.MAPBOX_ACCESS_TOKEN || '';
const BASE_URL = 'https://api.mapbox.com';

const mbApi = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  params: { access_token: ACCESS_TOKEN },
});

export const MapboxService = {

  // ═══════════════════════════════════════════════════════════════════════
  // GEOCODING v6 — Forward & Reverse
  // ═══════════════════════════════════════════════════════════════════════

  /** Forward geocode — address/place name → coordinates */
  async geocodeForward(query, params = {}) {
    const { data } = await mbApi.get('/search/geocode/v6/forward', { params: { q: query, ...params } });
    return data;
  },

  /** Reverse geocode — coordinates → address/place */
  async geocodeReverse(lng, lat, params = {}) {
    const { data } = await mbApi.get('/search/geocode/v6/reverse', { params: { longitude: lng, latitude: lat, ...params } });
    return data;
  },

  /** Batch geocode — multiple forward lookups */
  async geocodeBatch(queries = []) {
    const results = await Promise.all(queries.map(q => this.geocodeForward(q)));
    return results;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SEARCH / PLACES — Searchbox v1
  // ═══════════════════════════════════════════════════════════════════════

  /** Suggest places — autocomplete search */
  async searchSuggest(query, params = {}) {
    const { data } = await mbApi.get('/search/searchbox/v1/suggest', { params: { q: query, ...params } });
    return data;
  },

  /** Retrieve full place details by mapbox_id */
  async searchRetrieve(mapboxId, params = {}) {
    const { data } = await mbApi.get(`/search/searchbox/v1/retrieve/${mapboxId}`, { params });
    return data;
  },

  /** Category search — POIs by category near a location */
  async searchCategory(category, params = {}) {
    const { data } = await mbApi.get('/search/searchbox/v1/category/' + category, { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DIRECTIONS v5
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get driving/walking/cycling directions.
   * @param {string} profile — driving | driving-traffic | walking | cycling
   * @param {string} coordinates — semicolon-separated lng,lat pairs
   * @param {Object} params — geometries, steps, overview, alternatives, etc.
   */
  async getDirections(profile, coordinates, params = {}) {
    const { data } = await mbApi.get(`/directions/v5/mapbox/${profile}/${coordinates}`, { params });
    return data;
  },

  /** Convenience: driving directions with traffic */
  async getDrivingDirections(coordinates, params = {}) {
    return this.getDirections('driving-traffic', coordinates, { geometries: 'geojson', steps: true, overview: 'full', ...params });
  },

  /** Convenience: walking directions */
  async getWalkingDirections(coordinates, params = {}) {
    return this.getDirections('walking', coordinates, { geometries: 'geojson', steps: true, overview: 'full', ...params });
  },

  /** Convenience: cycling directions */
  async getCyclingDirections(coordinates, params = {}) {
    return this.getDirections('cycling', coordinates, { geometries: 'geojson', steps: true, overview: 'full', ...params });
  },

  // ═══════════════════════════════════════════════════════════════════════
  // MATRIX v1 — Travel time/distance between multiple points
  // ═══════════════════════════════════════════════════════════════════════

  async getMatrix(profile, coordinates, params = {}) {
    const { data } = await mbApi.get(`/directions-matrix/v1/mapbox/${profile}/${coordinates}`, { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // OPTIMIZATION v1 — Optimal route (traveling salesman)
  // ═══════════════════════════════════════════════════════════════════════

  async getOptimizedTrip(profile, coordinates, params = {}) {
    const { data } = await mbApi.get(`/optimized-trips/v1/mapbox/${profile}/${coordinates}`, { params: { geometries: 'geojson', ...params } });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ISOCHRONE v1 — Reachability polygons
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * @param {string} profile — driving | walking | cycling
   * @param {number} lng
   * @param {number} lat
   * @param {Object} params — contours_minutes, contours_colors, polygons
   */
  async getIsochrone(profile, lng, lat, params = {}) {
    const { data } = await mbApi.get(`/isochrone/v1/mapbox/${profile}/${lng},${lat}`, { params: { polygons: true, ...params } });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // MAP MATCHING v5 — Snap GPS traces to road network
  // ═══════════════════════════════════════════════════════════════════════

  async matchRoute(profile, coordinates, params = {}) {
    const { data } = await mbApi.get(`/matching/v5/mapbox/${profile}/${coordinates}`, { params: { geometries: 'geojson', ...params } });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TILEQUERY v4 — Query features near a point
  // ═══════════════════════════════════════════════════════════════════════

  async tilequery(tileset, lng, lat, params = {}) {
    const { data } = await mbApi.get(`/v4/${tileset}/tilequery/${lng},${lat}.json`, { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // STATIC IMAGES — Generate map images
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Generate a static map image URL.
   * @param {string} username — mapbox account (default 'mapbox')
   * @param {string} styleId — streets-v12, satellite-v9, dark-v11, etc.
   * @param {string} overlay — marker/path overlay or 'auto'
   * @param {number} lng — center longitude
   * @param {number} lat — center latitude
   * @param {number} zoom
   * @param {string} size — WxH (e.g. '600x400')
   * @returns {string} Full static image URL
   */
  getStaticImageUrl(username = 'mapbox', styleId = 'streets-v12', overlay, lng, lat, zoom, size = '600x400') {
    const pos = `${lng},${lat},${zoom}`;
    const overlayPath = overlay ? `${overlay}/` : '';
    return `${BASE_URL}/styles/v1/${username}/${styleId}/static/${overlayPath}${pos}/${size}?access_token=${ACCESS_TOKEN}`;
  },

  /** Fetch static image as buffer */
  async getStaticImage(username = 'mapbox', styleId = 'streets-v12', overlay, lng, lat, zoom, size = '600x400') {
    const url = this.getStaticImageUrl(username, styleId, overlay, lng, lat, zoom, size);
    const { data } = await axios.get(url, { responseType: 'arraybuffer' });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // STYLES v1 — Manage map styles
  // ═══════════════════════════════════════════════════════════════════════

  async listStyles(username, params = {}) {
    const { data } = await mbApi.get(`/styles/v1/${username}`, { params });
    return data;
  },

  async getStyle(username, styleId) {
    const { data } = await mbApi.get(`/styles/v1/${username}/${styleId}`);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TILESETS v1 — Manage tilesets
  // ═══════════════════════════════════════════════════════════════════════

  async listTilesets(username, params = {}) {
    const { data } = await mbApi.get(`/tilesets/v1/${username}`, { params });
    return data;
  },

  async getTilesetMetadata(tilesetId) {
    const { data } = await mbApi.get(`/tilesets/v1/${tilesetId}`);
    return data;
  },

  async getTileJSON(tilesetId) {
    const { data } = await mbApi.get(`/v4/${tilesetId}.json`);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DATASETS v1 — Manage geospatial datasets
  // ═══════════════════════════════════════════════════════════════════════

  async listDatasets(username) {
    const { data } = await mbApi.get(`/datasets/v1/${username}`);
    return data;
  },

  async getDataset(username, datasetId) {
    const { data } = await mbApi.get(`/datasets/v1/${username}/${datasetId}`);
    return data;
  },

  async listDatasetFeatures(username, datasetId, params = {}) {
    const { data } = await mbApi.get(`/datasets/v1/${username}/${datasetId}/features`, { params });
    return data;
  },

  async getDatasetFeature(username, datasetId, featureId) {
    const { data } = await mbApi.get(`/datasets/v1/${username}/${datasetId}/features/${featureId}`);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // UPLOADS v1 — Upload data to create tilesets
  // ═══════════════════════════════════════════════════════════════════════

  async listUploads(username) {
    const { data } = await mbApi.get(`/uploads/v1/${username}`);
    return data;
  },

  async getUploadStatus(username, uploadId) {
    const { data } = await mbApi.get(`/uploads/v1/${username}/${uploadId}`);
    return data;
  },

  async getUploadCredentials(username) {
    const { data } = await mbApi.post(`/uploads/v1/${username}/credentials`);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TOKENS v2 — Manage access tokens
  // ═══════════════════════════════════════════════════════════════════════

  async listTokens(username) {
    const { data } = await mbApi.get(`/tokens/v2/${username}`);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FONTS v1
  // ═══════════════════════════════════════════════════════════════════════

  async listFonts(username) {
    const { data } = await mbApi.get(`/fonts/v1/${username}`);
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // RAW PROXY
  // ═══════════════════════════════════════════════════════════════════════

  async rawGet(path, params = {}) {
    const { data } = await mbApi.get(path, { params });
    return data;
  },
};

export default MapboxService;
