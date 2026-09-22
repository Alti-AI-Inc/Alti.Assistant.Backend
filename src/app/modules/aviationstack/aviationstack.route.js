import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { AviationStackController } from './aviationstack.controller.js';

const router = express.Router();

router.use(auth());

// ═══════════════════════════════════════════════════════════════════════
// FLIGHTS — Real-time tracking
// ═══════════════════════════════════════════════════════════════════════

router.get('/flights', AviationStackController.getFlights);
router.get('/flights/live', AviationStackController.getLiveFlights);
router.get('/flights/departure/:iata', AviationStackController.getFlightsByDeparture);
router.get('/flights/arrival/:iata', AviationStackController.getFlightsByArrival);
router.get('/flights/track/:flightIata', AviationStackController.getFlightByNumber);

// ═══════════════════════════════════════════════════════════════════════
// FUTURE FLIGHTS — Scheduled future flights
// ═══════════════════════════════════════════════════════════════════════

router.get('/flights-future', AviationStackController.getFutureFlights);

// ═══════════════════════════════════════════════════════════════════════
// TIMETABLE — Airport timetables
// ═══════════════════════════════════════════════════════════════════════

router.get('/timetable', AviationStackController.getTimetable);

// ═══════════════════════════════════════════════════════════════════════
// AIRPORTS — Global airport database
// ═══════════════════════════════════════════════════════════════════════

router.get('/airports', AviationStackController.getAirports);

// ═══════════════════════════════════════════════════════════════════════
// AIRLINES — Global airline database
// ═══════════════════════════════════════════════════════════════════════

router.get('/airlines', AviationStackController.getAirlines);

// ═══════════════════════════════════════════════════════════════════════
// AIRPLANES — Aircraft registrations
// ═══════════════════════════════════════════════════════════════════════

router.get('/airplanes', AviationStackController.getAirplanes);

// ═══════════════════════════════════════════════════════════════════════
// AIRCRAFT TYPES — Aircraft categories
// ═══════════════════════════════════════════════════════════════════════

router.get('/aircraft-types', AviationStackController.getAircraftTypes);

// ═══════════════════════════════════════════════════════════════════════
// CITIES — Global city database
// ═══════════════════════════════════════════════════════════════════════

router.get('/cities', AviationStackController.getCities);

// ═══════════════════════════════════════════════════════════════════════
// COUNTRIES — Global country database
// ═══════════════════════════════════════════════════════════════════════

router.get('/countries', AviationStackController.getCountries);

// ═══════════════════════════════════════════════════════════════════════
// ROUTES — Airline route data
// ═══════════════════════════════════════════════════════════════════════

router.get('/routes', AviationStackController.getRoutes);

// ═══════════════════════════════════════════════════════════════════════
// AVIATION TAXES
// ═══════════════════════════════════════════════════════════════════════

router.get('/taxes', AviationStackController.getAviationTaxes);

// ═══════════════════════════════════════════════════════════════════════
// RAW PROXY
// ═══════════════════════════════════════════════════════════════════════

router.get('/proxy/*', AviationStackController.rawProxy);

export const AviationStackRoutes = router;
export default AviationStackRoutes;
