import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';

/**
 * AviationStack — Complete Global Aviation Data REST Client
 *
 * Base: https://api.aviationstack.com/v1
 * Auth: access_key query parameter
 *
 * ┌──────────────────────┬──────────────────────────────────────────────┐
 * │ Service              │ Endpoint                                     │
 * ├──────────────────────┼──────────────────────────────────────────────┤
 * │ Real-Time Flights    │ GET /v1/flights                              │
 * │ Future Flights       │ GET /v1/flightsFuture                        │
 * │ Timetable            │ GET /v1/timetable                            │
 * │ Airports             │ GET /v1/airports                             │
 * │ Airlines             │ GET /v1/airlines                             │
 * │ Airplanes            │ GET /v1/airplanes                            │
 * │ Aircraft Types       │ GET /v1/aircraft_types                       │
 * │ Cities               │ GET /v1/cities                               │
 * │ Countries            │ GET /v1/countries                            │
 * │ Routes               │ GET /v1/routes                               │
 * │ Aviation Taxes       │ GET /v1/aviation_taxes                       │
 * └──────────────────────┴──────────────────────────────────────────────┘
 *
 * All endpoints support: offset, limit, and category-specific filters
 */

const ACCESS_KEY = config.aviationstack?.apiKey || process.env.AVIATIONSTACK_KEY || '';
const BASE_URL = 'https://api.aviationstack.com/v1';

const avApi = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  params: { access_key: ACCESS_KEY },
});

export const AviationStackService = {

  // ═══════════════════════════════════════════════════════════════════════
  // FLIGHTS — Real-time flight tracking
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/flights — Real-time and historical flight data
   * @param {Object} params — flight_status, airline_name, airline_iata, flight_iata,
   *   dep_iata, arr_iata, flight_number, flight_date, limit, offset
   */
  async getFlights(params = {}) {
    const { data } = await avApi.get('/flights', { params });
    return data;
  },

  /** Convenience: live flights by status */
  async getLiveFlights(status = 'active') {
    return this.getFlights({ flight_status: status });
  },

  /** Convenience: flights by departure airport */
  async getFlightsByDeparture(depIata, params = {}) {
    return this.getFlights({ dep_iata: depIata, ...params });
  },

  /** Convenience: flights by arrival airport */
  async getFlightsByArrival(arrIata, params = {}) {
    return this.getFlights({ arr_iata: arrIata, ...params });
  },

  /** Convenience: flights by airline */
  async getFlightsByAirline(airlineIata, params = {}) {
    return this.getFlights({ airline_iata: airlineIata, ...params });
  },

  /** Convenience: single flight by flight number */
  async getFlightByNumber(flightIata, params = {}) {
    return this.getFlights({ flight_iata: flightIata, ...params });
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FUTURE FLIGHTS — Scheduled future flights
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/flightsFuture — Future flight schedules
   * @param {Object} params — iata_code, type (departure|arrival), date, airline_iata
   */
  async getFutureFlights(params = {}) {
    const { data } = await avApi.get('/flightsFuture', { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TIMETABLE — Airport timetables
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/timetable — Flight timetable
   * @param {Object} params — iata_code, type, date
   */
  async getTimetable(params = {}) {
    const { data } = await avApi.get('/timetable', { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AIRPORTS — Global airport database
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/airports — Airport lookup
   * @param {Object} params — search, iata_code, country_iso2, limit, offset
   */
  async getAirports(params = {}) {
    const { data } = await avApi.get('/airports', { params });
    return data;
  },

  /** Search airports by name or code */
  async searchAirports(query) {
    return this.getAirports({ search: query });
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AIRLINES — Global airline database
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/airlines — Airline lookup
   * @param {Object} params — search, airline_name, iata_code, country_iso2, limit, offset
   */
  async getAirlines(params = {}) {
    const { data } = await avApi.get('/airlines', { params });
    return data;
  },

  /** Search airlines by name or code */
  async searchAirlines(query) {
    return this.getAirlines({ search: query });
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AIRPLANES — Aircraft registration database
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/airplanes — Airplane/aircraft lookup
   * @param {Object} params — search, iata_code_short, iata_code_long, registration_number,
   *   airline_iata_code, limit, offset
   */
  async getAirplanes(params = {}) {
    const { data } = await avApi.get('/airplanes', { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AIRCRAFT TYPES — Aircraft category database
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/aircraft_types — Aircraft type lookup
   * @param {Object} params — search, iata_code, limit, offset
   */
  async getAircraftTypes(params = {}) {
    const { data } = await avApi.get('/aircraft_types', { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CITIES — Global city database
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/cities — City lookup
   * @param {Object} params — search, iata_code, country_iso2, limit, offset
   */
  async getCities(params = {}) {
    const { data } = await avApi.get('/cities', { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // COUNTRIES — Global country database
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/countries — Country lookup
   * @param {Object} params — search, country_name, country_iso2, limit, offset
   */
  async getCountries(params = {}) {
    const { data } = await avApi.get('/countries', { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ROUTES — Airline route data
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/routes — Route lookup
   * @param {Object} params — dep_iata, arr_iata, airline_iata, flight_number, limit, offset
   */
  async getRoutes(params = {}) {
    const { data } = await avApi.get('/routes', { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AVIATION TAXES — Tax data
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /v1/aviation_taxes — Aviation tax lookup
   * @param {Object} params — search, tax_name, iata_code, limit, offset
   */
  async getAviationTaxes(params = {}) {
    const { data } = await avApi.get('/aviation_taxes', { params });
    return data;
  },

  // ═══════════════════════════════════════════════════════════════════════
  // RAW PROXY
  // ═══════════════════════════════════════════════════════════════════════

  async rawGet(path, params = {}) {
    const { data } = await avApi.get(path, { params });
    return data;
  },
};

export default AviationStackService;
