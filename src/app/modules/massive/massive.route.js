import express from 'express';
import { MassiveController } from './massive.controller.js';

const router = express.Router();

// ─── Stock Quotes & Aggregates ────────────────────────────────────────────────
router.get('/stocks/:ticker',             MassiveController.getStockQuote);
router.get('/stocks/:ticker/chart',       MassiveController.getStockAggregates);
router.get('/stocks/:ticker/prev',        MassiveController.getPreviousClose);
router.get('/stocks/:ticker/52week',      MassiveController.getStock52Week);
router.get('/stocks/:ticker/details',     MassiveController.getTickerDetails);

// ─── Stock Fundamentals ───────────────────────────────────────────────────────
router.get('/stocks/:ticker/financials',  MassiveController.getStockFinancials);
router.get('/stocks/:ticker/income',      MassiveController.getStockIncomeStatement);
router.get('/stocks/:ticker/balance',     MassiveController.getStockBalanceSheet);
router.get('/stocks/:ticker/dividends',   MassiveController.getStockDividends);
router.get('/stocks/:ticker/splits',      MassiveController.getStockSplits);
router.get('/stocks/:ticker/float',       MassiveController.getStockFloat);
router.get('/stocks/:ticker/short',       MassiveController.getShortInterest);
router.get('/stocks/:ticker/news',        MassiveController.getStockNews);

// ─── Crypto ───────────────────────────────────────────────────────────────────
router.get('/crypto/:ticker',             MassiveController.getCryptoQuote);
router.get('/crypto/:ticker/chart',       MassiveController.getCryptoAggregates);

// ─── Forex & Currency ─────────────────────────────────────────────────────────
router.get('/forex/:ticker',                    MassiveController.getForexQuote);
router.get('/forex/:ticker/chart',              MassiveController.getForexAggregates);
router.get('/forex/convert/:from/:to',          MassiveController.getCurrencyConversion);

// ─── Options ──────────────────────────────────────────────────────────────────
router.get('/options/chain/:underlyingTicker',          MassiveController.getOptionsChain);
router.get('/options/chain/:underlyingTicker/filter',   MassiveController.getOptionsFiltered);
router.get('/options/:contractTicker',                  MassiveController.getOptionsQuote);

// ─── Benzinga (Institutional) ─────────────────────────────────────────────────
router.get('/benzinga/news/:ticker',      MassiveController.getBenzingaNews);
router.get('/benzinga/ratings/:ticker',   MassiveController.getBenzingaRatings);

// ─── ETF ──────────────────────────────────────────────────────────────────────
router.get('/etf/profile/:ticker',        MassiveController.getEtfProfiles);
router.get('/etf/constituents/:ticker',   MassiveController.getEtfConstituents);

// ─── Federal Reserve / Macro ──────────────────────────────────────────────────
router.get('/fed/inflation',              MassiveController.getFedInflation);
router.get('/fed/yields',                 MassiveController.getFedYields);
router.get('/fed/labor',                  MassiveController.getFedLaborMarket);
router.get('/fed/inflation-expectations', MassiveController.getFedInflationExpectations);

// ─── Market-wide ──────────────────────────────────────────────────────────────
router.get('/market/status',              MassiveController.getMarketStatus);
router.get('/market/holidays',            MassiveController.getMarketHolidays);
router.get('/market/movers',              MassiveController.getTopMovers);
router.get('/market/news',                MassiveController.getMarketNews);
router.get('/market/news/global',         MassiveController.getGlobalNews);
router.get('/market/ipos',                MassiveController.getIPOs);

// ─── Dashboard & Watchlist ────────────────────────────────────────────────────
// GET  /market/overview  → SPY + QQQ + DIA + IWM + BTC + Gold + Oil + VIX +
//                          top movers + market status (all parallel, one response)
router.get('/market/overview',            MassiveController.getMarketOverview);

// POST /watchlist/quotes  body: { tickers: ['AAPL','MSFT','BTC-USD',...] }
// Returns live snapshots for up to 50 mixed tickers in a single batch call
router.post('/watchlist/quotes',          MassiveController.getWatchlistQuotes);

export const massiveRoutes = router;
