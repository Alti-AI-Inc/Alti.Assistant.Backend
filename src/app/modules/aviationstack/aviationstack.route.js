/**
 * @module aviationstack.route
 * @fileoverview AviationStack REST API Router
 *
 * Exposes API routes for real-time tracking, flight routes schedules,
 * airport information, airline profiles, and airplane registrations.
 * This module defines the API endpoints for interacting with the AviationStack service.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
import {
  /**
   * @function getFlightsService
   * @description Fetches live flight tracking data from the AviationStack API.
   * @param {object} queryParams - Query parameters for filtering flights.
   * @returns {Promise<object>} A promise that resolves to the flight data.
   */
  getFlightsService,
  /**
   * @function getRoutesService
   * @description Fetches flight schedules and routes data from the AviationStack API.
   * @param {object} queryParams - Query parameters for filtering routes.
   * @returns {Promise<object>} A promise that resolves to the route data.
   */
  getRoutesService,
  /**
   * @function getAirportsService
   * @description Fetches airport directory data from the AviationStack API.
   * @param {object} queryParams - Query parameters for filtering airports.
   * @returns {Promise<object>} A promise that resolves to the airport data.
   */
  getAirportsService,
  /**
   * @function getAirlinesService
   * @description Fetches airline directory data from the AviationStack API.
   * @param {object} queryParams - Query parameters for filtering airlines.
   * @returns {Promise<object>} A promise that resolves to the airline data.
   */
  getAirlinesService,
  /**
   * @function getAirplanesService
   * @description Fetches airplane directory data from the AviationStack API.
   * @param {object} queryParams - Query parameters for filtering airplanes.
   * @returns {Promise<object>} A promise that resolves to the airplane data.
   */
  getAirplanesService,
} from './aviationstack.service.js';

// Initialize Redis client for rate limiting.
// In a production environment, connection details should come from environment variables.
const redisClient = createClient({
  // url: 'redis://your-redis-host:6379' // Example connection string for production
});
redisClient.on('error', (err) => console.error('Redis Client Error for Rate Limiter', err));
await redisClient.connect();

// Create a Redis store for the rate limiter.
const redisStore = new RedisStore({
  sendCommand: (...args) => redisClient.sendCommand(args),
});

// Define a rate limiter for the AviationStack API endpoints.
// This helps prevent DDOS attacks, API abuse, and excessive costs from the external API provider.
// The limit is set to 100 requests per 15 minutes per IP address.
const aviationStackApiLimiter = rateLimit({
  store: redisStore,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `windowMs`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after 15 minutes.',
  },
});

/**
 * @constant {express.Router} router
 * @description Express router for AviationStack API endpoints.
 */
const router = express.Router();

/**
 * @swagger
 * /flights:
 *   get:
 *     summary: Live flight tracking
 *     description: Retrieves real-time flight information based on various criteria such as flight IATA/ICAO codes, departure/arrival airports, flight status, or airline name.
 *     tags:
 *       - AviationStack
 *       - Flights
 *     parameters:
 *       - in: query
 *         name: flight_iata
 *         schema:
 *           type: string
 *         description: Filter by flight IATA code (e.g., BA2490).
 *         required: false
 *       - in: query
 *         name: flight_icao
 *         schema:
 *           type: string
 *         description: Filter by flight ICAO code (e.g., BAW2490).
 *         required: false
 *       - in: query
 *         name: dep_iata
 *         schema:
 *           type: string
 *         description: Filter by departure airport IATA code (e.g., LHR).
 *         required: false
 *       - in: query
 *         name: arr_iata
 *         schema:
 *           type: string
 *         description: Filter by arrival airport IATA code (e.g., JFK).
 *         required: false
 *       - in: query
 *         name: flight_status
 *         schema:
 *           type: string
 *           enum: [scheduled, active, landed, cancelled, incident, diverted]
 *         description: Filter by flight status.
 *         required: false
 *       - in: query
 *         name: airline_name
 *         schema:
 *           type: string
 *         description: Filter by airline name (e.g., British Airways).
 *         required: false
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Limit the number of results returned. Default is 100.
 *         required: false
 *     responses:
 *       200:
 *         description: Successful retrieval of flight data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       flight_date: { type: string, example: "2023-10-27" }
 *                       flight_status: { type: string, example: "active" }
 *                       departure: { type: object, description: "Departure airport details" }
 *                       arrival: { type: object, description: "Arrival airport details" }
 *                       airline: { type: object, description: "Airline details" }
 *                       flight: { type: object, description: "Flight details" }
 *       429:
 *         description: Too many requests.
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch flight data from external API."
 */
router.get('/flights', aviationStackApiLimiter, async (req, res) => {
  try {
    const data = await getFlightsService(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /routes:
 *   get:
 *     summary: Flight schedules / routes
 *     description: Fetches flight schedules and routes between airports or for specific airlines.
 *     tags:
 *       - AviationStack
 *       - Routes
 *     parameters:
 *       - in: query
 *         name: dep_iata
 *         schema:
 *           type: string
 *         description: Filter by departure airport IATA code (e.g., LHR).
 *         required: false
 *       - in: query
 *         name: arr_iata
 *         schema:
 *           type: string
 *         description: Filter by arrival airport IATA code (e.g., JFK).
 *         required: false
 *       - in: query
 *         name: airline_iata
 *         schema:
 *           type: string
 *         description: Filter by airline IATA code (e.g., BA).
 *         required: false
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Limit the number of results returned. Default is 100.
 *         required: false
 *     responses:
 *       200:
 *         description: Successful retrieval of flight route data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       airline_iata: { type: string, example: "BA" }
 *                       departure_iata: { type: string, example: "LHR" }
 *                       arrival_iata: { type: string, example: "JFK" }
 *                       flight_number: { type: string, example: "BA177" }
 *       429:
 *         description: Too many requests.
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch route data from external API."
 */
router.get('/routes', aviationStackApiLimiter, async (req, res) => {
  try {
    const data = await getRoutesService(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /airports:
 *   get:
 *     summary: Airports directory
 *     description: Provides information about airports worldwide, searchable by IATA/ICAO code, city, or country.
 *     tags:
 *       - AviationStack
 *       - Airports
 *     parameters:
 *       - in: query
 *         name: iata_code
 *         schema:
 *           type: string
 *         description: Filter by airport IATA code (e.g., LHR).
 *         required: false
 *       - in: query
 *         name: icao_code
 *         schema:
 *           type: string
 *         description: Filter by airport ICAO code (e.g., EGLL).
 *         required: false
 *       - in: query
 *         name: city_name
 *         schema:
 *           type: string
 *         description: Filter by city name (e.g., London).
 *         required: false
 *       - in: query
 *         name: country_name
 *         schema:
 *           type: string
 *         description: Filter by country name (e.g., United Kingdom).
 *         required: false
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Limit the number of results returned. Default is 100.
 *         required: false
 *     responses:
 *       200:
 *         description: Successful retrieval of airport data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       airport_name: { type: string, example: "Heathrow Airport" }
 *                       iata_code: { type: string, example: "LHR" }
 *                       icao_code: { type: string, example: "EGLL" }
 *                       city_iata_code: { type: string, example: "LON" }
 *                       country_name: { type: string, example: "United Kingdom" }
 *       429:
 *         description: Too many requests.
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch airport data from external API."
 */
router.get('/airports', aviationStackApiLimiter, async (req, res) => {
  try {
    const data = await getAirportsService(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /airlines:
 *   get:
 *     summary: Airlines directory
 *     description: Retrieves profiles and information for various airlines, searchable by IATA/ICAO code or airline name.
 *     tags:
 *       - AviationStack
 *       - Airlines
 *     parameters:
 *       - in: query
 *         name: iata_code
 *         schema:
 *           type: string
 *         description: Filter by airline IATA code (e.g., BA).
 *         required: false
 *       - in: query
 *         name: icao_code
 *         schema:
 *           type: string
 *         description: Filter by airline ICAO code (e.g., BAW).
 *         required: false
 *       - in: query
 *         name: airline_name
 *         schema:
 *           type: string
 *         description: Filter by airline name (e.g., British Airways).
 *         required: false
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Limit the number of results returned. Default is 100.
 *         required: false
 *     responses:
 *       200:
 *         description: Successful retrieval of airline data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       airline_name: { type: string, example: "British Airways" }
 *                       iata_code: { type: string, example: "BA" }
 *                       icao_code: { type: string, example: "BAW" }
 *                       country_name: { type: string, example: "United Kingdom" }
 *       429:
 *         description: Too many requests.
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch airline data from external API."
 */
router.get('/airlines', aviationStackApiLimiter, async (req, res) => {
  try {
    const data = await getAirlinesService(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /airplanes:
 *   get:
 *     summary: Airplanes directory
 *     description: Provides details about airplane registrations and models, searchable by registration number or model code.
 *     tags:
 *       - AviationStack
 *       - Airplanes
 *     parameters:
 *       - in: query
 *         name: registration_number
 *         schema:
 *           type: string
 *         description: Filter by airplane registration number (e.g., G-EUPJ).
 *         required: false
 *       - in: query
 *         name: model_code
 *         schema:
 *           type: string
 *         description: Filter by airplane model code (e.g., B744).
 *         required: false
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Limit the number of results returned. Default is 100.
 *         required: false
 *     responses:
 *       200:
 *         description: Successful retrieval of airplane data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       registration_number: { type: string, example: "G-EUPJ" }
 *                       plane_model: { type: string, example: "Boeing 747-400" }
 *                       plane_icao_code: { type: string, example: "B744" }
 *                       manufacturer: { type: string, example: "Boeing" }
 *       429:
 *         description: Too many requests.
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch airplane data from external API."
 */
router.get('/airplanes', aviationStackApiLimiter, async (req, res) => {
  try {
    const data = await getAirplanesService(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @exports aviationStackRoutes
 * @description The Express router instance containing all AviationStack API routes.
 * @type {express.Router}
 */
export const aviationStackRoutes = router;