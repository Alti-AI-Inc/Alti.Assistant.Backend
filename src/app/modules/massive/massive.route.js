import express from 'express';
import { MassiveController } from './massive.controller.js';

const router = express.Router();

// Stock Quote & Aggregate Routes
router.route('/stocks/:ticker').get(MassiveController.getStockQuote);
router.route('/stocks/:ticker/chart').get(MassiveController.getStockAggregates);

// Crypto Quote & Aggregate Routes
router.route('/crypto/:ticker').get(MassiveController.getCryptoQuote);
router
  .route('/crypto/:ticker/chart')
  .get(MassiveController.getCryptoAggregates);

// Forex Quote Routes
router.route('/forex/:ticker').get(MassiveController.getForexQuote);

// Options Chain & Quote Routes
router
  .route('/options/chain/:underlyingTicker')
  .get(MassiveController.getOptionsChain);
router.route('/options/:contractTicker').get(MassiveController.getOptionsQuote);

// Benzinga Institutional News & Analyst Ratings
router.route('/benzinga/news/:ticker').get(MassiveController.getBenzingaNews);
router
  .route('/benzinga/ratings/:ticker')
  .get(MassiveController.getBenzingaRatings);

// ETF Holdings & Profile Details
router.route('/etf/profile/:ticker').get(MassiveController.getEtfProfiles);
router
  .route('/etf/constituents/:ticker')
  .get(MassiveController.getEtfConstituents);

// Federal Reserve Macro-Economic Statistics
router.route('/fed/inflation').get(MassiveController.getFedInflation);
router.route('/fed/yields').get(MassiveController.getFedYields);

// Global Market Status & Holidays
router.route('/market/status').get(MassiveController.getMarketStatus);
router.route('/market/holidays').get(MassiveController.getMarketHolidays);

export const massiveRoutes = router;
