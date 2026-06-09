import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { aviationStackRoutes } from './aviationstack.route.js';

// Mock the entire aviationstack.service.js module
vi.mock('./aviationstack.service.js', () => ({
  getFlightsService: vi.fn(),
  getRoutesService: vi.fn(),
  getAirportsService: vi.fn(),
  getAirlinesService: vi.fn(),
  getAirplanesService: vi.fn(),
}));

// Import the mocked functions
import {
  getFlightsService,
  getRoutesService,
  getAirportsService,
  getAirlinesService,
  getAirplanesService,
} from './aviationstack.service.js';

describe('AviationStack Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json()); // For parsing application/json
    // Mount the router under a base path, e.g., '/api/aviationstack'
    app.use('/api/aviationstack', aviationStackRoutes);
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  // Test /flights endpoint
  describe('GET /api/aviationstack/flights', () => {
    it('should return 200 and flight data on successful service call', async () => {
      const mockFlightData = [{ flight_iata: 'BA2490', status: 'active' }];
      getFlightsService.mockResolvedValue(mockFlightData);

      const queryParams = { flight_iata: 'BA2490', limit: '1' };
      const res = await request(app)
        .get('/api/aviationstack/flights')
        .query(queryParams);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({ success: true, data: mockFlightData });
      expect(getFlightsService).toHaveBeenCalledTimes(1);
      expect(getFlightsService).toHaveBeenCalledWith(queryParams);
    });

    it('should return 500 and an error message on service failure', async () => {
      const errorMessage = 'Failed to fetch flight data from external API.';
      getFlightsService.mockRejectedValue(new Error(errorMessage));

      const queryParams = { flight_iata: 'BA2490' };
      const res = await request(app)
        .get('/api/aviationstack/flights')
        .query(queryParams);

      expect(res.statusCode).toEqual(500);
      expect(res.body).toEqual({ success: false, error: errorMessage });
      expect(getFlightsService).toHaveBeenCalledTimes(1);
      expect(getFlightsService).toHaveBeenCalledWith(queryParams);
    });
  });

  // Test /routes endpoint
  describe('GET /api/aviationstack/routes', () => {
    it('should return 200 and route data on successful service call', async () => {
      const mockRouteData = [{ airline_iata: 'BA', dep_iata: 'LHR', arr_iata: 'JFK' }];
      getRoutesService.mockResolvedValue(mockRouteData);

      const queryParams = { dep_iata: 'LHR', arr_iata: 'JFK' };
      const res = await request(app)
        .get('/api/aviationstack/routes')
        .query(queryParams);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({ success: true, data: mockRouteData });
      expect(getRoutesService).toHaveBeenCalledTimes(1);
      expect(getRoutesService).toHaveBeenCalledWith(queryParams);
    });

    it('should return 500 and an error message on service failure', async () => {
      const errorMessage = 'Failed to fetch route data from external API.';
      getRoutesService.mockRejectedValue(new Error(errorMessage));

      const queryParams = { dep_iata: 'LHR' };
      const res = await request(app)
        .get('/api/aviationstack/routes')
        .query(queryParams);

      expect(res.statusCode).toEqual(500);
      expect(res.body).toEqual({ success: false, error: errorMessage });
      expect(getRoutesService).toHaveBeenCalledTimes(1);
      expect(getRoutesService).toHaveBeenCalledWith(queryParams);
    });
  });

  // Test /airports endpoint
  describe('GET /api/aviationstack/airports', () => {
    it('should return 200 and airport data on successful service call', async () => {
      const mockAirportData = [{ airport_name: 'Heathrow Airport', iata_code: 'LHR' }];
      getAirportsService.mockResolvedValue(mockAirportData);

      const queryParams = { iata_code: 'LHR' };
      const res = await request(app)
        .get('/api/aviationstack/airports')
        .query(queryParams);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({ success: true, data: mockAirportData });
      expect(getAirportsService).toHaveBeenCalledTimes(1);
      expect(getAirportsService).toHaveBeenCalledWith(queryParams);
    });

    it('should return 500 and an error message on service failure', async () => {
      const errorMessage = 'Failed to fetch airport data from external API.';
      getAirportsService.mockRejectedValue(new Error(errorMessage));

      const queryParams = { city_name: 'London' };
      const res = await request(app)
        .get('/api/aviationstack/airports')
        .query(queryParams);

      expect(res.statusCode).toEqual(500);
      expect(res.body).toEqual({ success: false, error: errorMessage });
      expect(getAirportsService).toHaveBeenCalledTimes(1);
      expect(getAirportsService).toHaveBeenCalledWith(queryParams);
    });
  });

  // Test /airlines endpoint
  describe('GET /api/aviationstack/airlines', () => {
    it('should return 200 and airline data on successful service call', async () => {
      const mockAirlineData = [{ airline_name: 'British Airways', iata_code: 'BA' }];
      getAirlinesService.mockResolvedValue(mockAirlineData);

      const queryParams = { iata_code: 'BA' };
      const res = await request(app)
        .get('/api/aviationstack/airlines')
        .query(queryParams);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({ success: true, data: mockAirlineData });
      expect(getAirlinesService).toHaveBeenCalledTimes(1);
      expect(getAirlinesService).toHaveBeenCalledWith(queryParams);
    });

    it('should return 500 and an error message on service failure', async () => {
      const errorMessage = 'Failed to fetch airline data from external API.';
      getAirlinesService.mockRejectedValue(new Error(errorMessage));

      const queryParams = { airline_name: 'British Airways' };
      const res = await request(app)
        .get('/api/aviationstack/airlines')
        .query(queryParams);

      expect(res.statusCode).toEqual(500);
      expect(res.body).toEqual({ success: false, error: errorMessage });
      expect(getAirlinesService).toHaveBeenCalledTimes(1);
      expect(getAirlinesService).toHaveBeenCalledWith(queryParams);
    });
  });

  // Test /airplanes endpoint
  describe('GET /api/aviationstack/airplanes', () => {
    it('should return 200 and airplane data on successful service call', async () => {
      const mockAirplaneData = [{ registration_number: 'G-EUPJ', plane_model: 'Boeing 747-400' }];
      getAirplanesService.mockResolvedValue(mockAirplaneData);

      const queryParams = { registration_number: 'G-EUPJ' };
      const res = await request(app)
        .get('/api/aviationstack/airplanes')
        .query(queryParams);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({ success: true, data: mockAirplaneData });
      expect(getAirplanesService).toHaveBeenCalledTimes(1);
      expect(getAirplanesService).toHaveBeenCalledWith(queryParams);
    });

    it('should return 500 and an error message on service failure', async () => {
      const errorMessage = 'Failed to fetch airplane data from external API.';
      getAirplanesService.mockRejectedValue(new Error(errorMessage));

      const queryParams = { model_code: 'B744' };
      const res = await request(app)
        .get('/api/aviationstack/airplanes')
        .query(queryParams);

      expect(res.statusCode).toEqual(500);
      expect(res.body).toEqual({ success: false, error: errorMessage });
      expect(getAirplanesService).toHaveBeenCalledTimes(1);
      expect(getAirplanesService).toHaveBeenCalledWith(queryParams);
    });
  });
});