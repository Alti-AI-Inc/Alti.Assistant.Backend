/**
 * aviationstack.route.js — AviationStack REST API Router
 *
 * Exposes API routes for real-time tracking, flight routes schedules,
 * airport information, airline profiles, and airplane registrations.
 */

import express from 'express';
import {
  getFlightsService,
  getRoutesService,
  getAirportsService,
  getAirlinesService,
  getAirplanesService,
} from './aviationstack.service.js';

const router = express.Router();

/**
 * GET /flights — Live flight tracking
 * Query params: flight_iata, flight_icao, dep_iata, arr_iata, flight_status, airline_name, limit
 */
router.get('/flights', async (req, res) => {
  try {
    const data = await getFlightsService(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /routes — Flight schedules / routes
 * Query params: dep_iata, arr_iata, airline_iata, limit
 */
router.get('/routes', async (req, res) => {
  try {
    const data = await getRoutesService(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /airports — Airports directory
 * Query params: iata_code, icao_code, city_name, country_name, limit
 */
router.get('/airports', async (req, res) => {
  try {
    const data = await getAirportsService(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /airlines — Airlines directory
 * Query params: iata_code, icao_code, airline_name, limit
 */
router.get('/airlines', async (req, res) => {
  try {
    const data = await getAirlinesService(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /airplanes — Airplanes directory
 * Query params: registration_number, model_code, limit
 */
router.get('/airplanes', async (req, res) => {
  try {
    const data = await getAirplanesService(req.query);
    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export const aviationStackRoutes = router;
