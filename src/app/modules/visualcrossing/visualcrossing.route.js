import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { VisualCrossingController } from './visualcrossing.controller.js';

const router = express.Router();

router.use(auth());

// ═══════════════════════════════════════════════════════════════════════
// TIMELINE — Forecast (15-day default)
// ═══════════════════════════════════════════════════════════════════════

router.get('/forecast/:location', VisualCrossingController.getForecast);

// ═══════════════════════════════════════════════════════════════════════
// TIMELINE — Date range (historical + forecast)
// ═══════════════════════════════════════════════════════════════════════

router.get('/timeline/:location/:date1/:date2', VisualCrossingController.getTimeline);
router.get('/timeline/:location/:date1', VisualCrossingController.getTimeline);

// ═══════════════════════════════════════════════════════════════════════
// CURRENT CONDITIONS
// ═══════════════════════════════════════════════════════════════════════

router.get('/current/:location', VisualCrossingController.getCurrentConditions);

// ═══════════════════════════════════════════════════════════════════════
// WEATHER ALERTS
// ═══════════════════════════════════════════════════════════════════════

router.get('/alerts/:location', VisualCrossingController.getAlerts);

// ═══════════════════════════════════════════════════════════════════════
// HOURLY DATA
// ═══════════════════════════════════════════════════════════════════════

router.get('/hourly/:location/:date1/:date2', VisualCrossingController.getHourly);
router.get('/hourly/:location/:date1', VisualCrossingController.getHourly);
router.get('/hourly/:location', VisualCrossingController.getHourly);

// ═══════════════════════════════════════════════════════════════════════
// HISTORICAL — Single day
// ═══════════════════════════════════════════════════════════════════════

router.get('/history/:location/:date', VisualCrossingController.getHistoricalDay);

// ═══════════════════════════════════════════════════════════════════════
// DYNAMIC DATES — today, yesterday, last7days, last30days, lastyear
// ═══════════════════════════════════════════════════════════════════════

router.get('/dynamic/:location/:dynamic', VisualCrossingController.getDynamic);

// ═══════════════════════════════════════════════════════════════════════
// WEATHER EVENTS — Severe weather, storms
// ═══════════════════════════════════════════════════════════════════════

router.get('/events/:location', VisualCrossingController.getEvents);

// ═══════════════════════════════════════════════════════════════════════
// SPECIFIC ELEMENTS — ?elements=temp,humidity,windspeed
// ═══════════════════════════════════════════════════════════════════════

router.get('/elements/:location', VisualCrossingController.getElements);

// ═══════════════════════════════════════════════════════════════════════
// WEATHER MAPS — Tile layer
// ═══════════════════════════════════════════════════════════════════════

router.get('/map/tile/:layer/:z/:x/:y', VisualCrossingController.getMapTileUrl);

// ═══════════════════════════════════════════════════════════════════════
// RAW PROXY
// ═══════════════════════════════════════════════════════════════════════

router.get('/proxy/*', VisualCrossingController.rawProxy);

export const VisualCrossingRoutes = router;
export default VisualCrossingRoutes;
