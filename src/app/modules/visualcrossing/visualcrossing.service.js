import axios from 'axios';
import withRetry from '../../../shared/axiosRetry.js';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * Visual Crossing — Complete Weather Data REST Client
 *
 * Timeline Base:  https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline
 * Maps Base:      https://maps.visualcrossing.com/VisualCrossingWebServices/rest/api/v1/map
 * Auth:           ?key=API_KEY query param
 *
 * ┌──────────────────────────┬──────────────────────────────────────────────────────┐
 * │ Service                  │ Endpoint Pattern                                     │
 * ├──────────────────────────┼──────────────────────────────────────────────────────┤
 * │ Forecast (15-day)        │ /timeline/{location}                                 │
 * │ Historical + Forecast    │ /timeline/{location}/{date1}/{date2}                 │
 * │ Single Day               │ /timeline/{location}/{date}                          │
 * │ Current Conditions       │ /timeline/{location}?include=current                 │
 * │ Hourly Data              │ /timeline/{location}?include=hours                   │
 * │ Weather Alerts           │ /timeline/{location}?include=alerts                  │
 * │ Weather Events           │ /timeline/{location}?include=events                  │
 * │ Dynamic Dates            │ /timeline/{location}/today, /yesterday, /last30days  │
 * │ Weather Maps             │ /map/tile/{layer}/{z}/{x}/{y}                        │
 * └──────────────────────────┴──────────────────────────────────────────────────────┘
 *
 * Units: us | metric | uk | base
 * Include: days, hours, current, alerts, events
 * Elements: temp, humidity, windspeed, precip, cloudcover, etc.
 */

const API_KEY = config.visualcrossing?.apiKey || process.env.VISUAL_CROSSING_KEY || '';
const TIMELINE_BASE = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';
const MAPS_BASE = 'https://maps.visualcrossing.com/VisualCrossingWebServices/rest/api/v1/map';

const vcApi = withRetry(axios.create({
  baseURL: TIMELINE_BASE,
  timeout: 30000,
  params: { key: API_KEY, contentType: 'json' },
}), 'visualcrossing');

export const VisualCrossingService = {

  // ═══════════════════════════════════════════════════════════════════════
  // TIMELINE — Unified Weather Data (Forecast + Historical + Current)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /timeline/{location} — 15-day forecast with current conditions
   * @param {string} location — address, city, lat,lng, or zip code
   * @param {Object} params — unitGroup, include, elements, lang, etc.
   */
  async getForecast(location, params = {}) {
    const { data } = await vcApi.get(`/${encodeURIComponent(location)}`, {
      params: { unitGroup: 'metric', include: 'days,hours,current,alerts', ...params },
    });
    return data;
  },

  /**
   * GET /timeline/{location}/{date1}/{date2} — Historical or date range weather
   * @param {string} location
   * @param {string} date1 — ISO date or dynamic (today, yesterday, last30days)
   * @param {string} [date2] — end date (optional)
   */
  async getTimeline(location, date1, date2, params = {}) {
    const path = date2
      ? `/${encodeURIComponent(location)}/${date1}/${date2}`
      : `/${encodeURIComponent(location)}/${date1}`;
    const { data } = await vcApi.get(path, {
      params: { unitGroup: 'metric', include: 'days,hours,current,alerts', ...params },
    });
    return data;
  },

  /**
   * Current conditions only
   */
  async getCurrentConditions(location, params = {}) {
    const { data } = await vcApi.get(`/${encodeURIComponent(location)}`, {
      params: { unitGroup: 'metric', include: 'current', ...params },
    });
    return data;
  },

  /**
   * Weather alerts only
   */
  async getAlerts(location, params = {}) {
    const { data } = await vcApi.get(`/${encodeURIComponent(location)}`, {
      params: { unitGroup: 'metric', include: 'alerts', ...params },
    });
    return data;
  },

  /**
   * Hourly breakdown
   */
  async getHourly(location, date1, date2, params = {}) {
    const path = date2
      ? `/${encodeURIComponent(location)}/${date1}/${date2}`
      : date1
        ? `/${encodeURIComponent(location)}/${date1}`
        : `/${encodeURIComponent(location)}`;
    const { data } = await vcApi.get(path, {
      params: { unitGroup: 'metric', include: 'hours', ...params },
    });
    return data;
  },

  /**
   * Historical weather for a specific date
   */
  async getHistoricalDay(location, date, params = {}) {
    const { data } = await vcApi.get(`/${encodeURIComponent(location)}/${date}`, {
      params: { unitGroup: 'metric', include: 'days,hours', ...params },
    });
    return data;
  },

  /**
   * Dynamic date shortcuts: today, yesterday, last7days, last30days, lastyear, etc.
   */
  async getDynamic(location, dynamic = 'today', params = {}) {
    const { data } = await vcApi.get(`/${encodeURIComponent(location)}/${dynamic}`, {
      params: { unitGroup: 'metric', include: 'days,hours,current,alerts', ...params },
    });
    return data;
  },

  /**
   * Weather events (severe weather, tropical storms, etc.)
   */
  async getEvents(location, params = {}) {
    const { data } = await vcApi.get(`/${encodeURIComponent(location)}`, {
      params: { unitGroup: 'metric', include: 'events', ...params },
    });
    return data;
  },

  /**
   * Specific elements only (e.g. just temp and humidity)
   * @param {string} location
   * @param {string[]} elements — ['temp','humidity','windspeed','precip']
   */
  async getElements(location, elements, params = {}) {
    const { data } = await vcApi.get(`/${encodeURIComponent(location)}`, {
      params: { unitGroup: 'metric', elements: elements.join(','), ...params },
    });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // WEATHER MAPS — Map tile layer
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get weather map tile URL
   * @param {string} layer — temp, precip, wind, pressure, clouds, etc.
   * @param {number} z — zoom level
   * @param {number} x — tile x
   * @param {number} y — tile y
   */
  getMapTileUrl(layer, z, x, y) {
    return `${MAPS_BASE}/tile/${layer}/${z}/${x}/${y}?key=${API_KEY}`;
  },

  /** Fetch map tile as image buffer */
  async getMapTile(layer, z, x, y) {
    const url = this.getMapTileUrl(layer, z, x, y);
    const { data } = await axios.get(url, { responseType: 'arraybuffer' });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // RAW PROXY
  // ═══════════════════════════════════════════════════════════════════════

  async rawGet(path, params = {}) {
    const { data } = await vcApi.get(path, { params });
    return data;
  },
};

export default VisualCrossingService;
