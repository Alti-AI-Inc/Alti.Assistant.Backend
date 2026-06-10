/**
 * @file Defines the routes for the "Massive" module.
 * @module massive/routes
 * @description This module centralizes all routes that provide access to a wide range of financial market data,
 * including stocks, crypto, forex, options, and macroeconomic indicators. It acts as a gateway to an
 * underlying financial data provider API.
 * @requires express
 * @requires massive/controller
 */

import express from 'express';
import { MassiveController } from './massive.controller.js';

const router = express.Router();

// ─── Stock Quotes & Aggregates ────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/massive/stocks/{ticker}:
 *   get:
 *     summary: Get a real-time stock quote
 *     description: Fetches the latest real-time trade, quote, and volume data for a specified stock ticker.
 *     tags:
 *       - Massive - Stocks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., AAPL).
 *     responses:
 *       200:
 *         description: Successful response with the stock quote.
 *       404:
 *         description: Ticker not found.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/stocks/:ticker',             MassiveController.getStockQuote);

/**
 * @openapi
 * /api/v1/massive/stocks/{ticker}/chart:
 *   get:
 *     summary: Get stock chart data (aggregates/bars)
 *     description: Fetches aggregate bars (candlesticks) for a stock over a given date range in custom time window sizes.
 *     tags:
 *       - Massive - Stocks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., AAPL).
 *       - in: query
 *         name: multiplier
 *         schema:
 *           type: integer
 *           default: 1
 *         description: The size of the time window multiplier.
 *       - in: query
 *         name: timespan
 *         schema:
 *           type: string
 *           enum: [minute, hour, day, week, month, quarter, year]
 *           default: day
 *         description: The size of the time window.
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: The start of the aggregate time window (YYYY-MM-DD).
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: The end of the aggregate time window (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: Successful response with an array of aggregate bars.
 *       400:
 *         description: Invalid query parameters.
 *       404:
 *         description: Ticker not found.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/stocks/:ticker/chart',       MassiveController.getStockAggregates);

/**
 * @openapi
 * /api/v1/massive/stocks/{ticker}/prev:
 *   get:
 *     summary: Get previous day's stock close
 *     description: Fetches the previous trading day's open, high, low, and close (OHLC) for a stock.
 *     tags:
 *       - Massive - Stocks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., AAPL).
 *     responses:
 *       200:
 *         description: Successful response with the previous day's OHLC data.
 *       404:
 *         description: Ticker not found.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/stocks/:ticker/prev',        MassiveController.getPreviousClose);

/**
 * @openapi
 * /api/v1/massive/stocks/{ticker}/52week:
 *   get:
 *     summary: Get 52-week high/low for a stock
 *     description: Fetches the 52-week high and low prices for a specified stock ticker.
 *     tags:
 *       - Massive - Stocks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., AAPL).
 *     responses:
 *       200:
 *         description: Successful response with the 52-week high and low.
 *       404:
 *         description: Ticker not found.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/stocks/:ticker/52week',      MassiveController.getStock52Week);

/**
 * @openapi
 * /api/v1/massive/stocks/{ticker}/details:
 *   get:
 *     summary: Get ticker details
 *     description: Fetches detailed information about a company, including its description, industry, sector, CEO, and other metadata.
 *     tags:
 *       - Massive - Stocks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., AAPL).
 *     responses:
 *       200:
 *         description: Successful response with the company's details.
 *       404:
 *         description: Ticker not found.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/stocks/:ticker/details',     MassiveController.getTickerDetails);

// ─── Stock Fundamentals ───────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/massive/stocks/{ticker}/financials:
 *   get:
 *     summary: Get stock financials
 *     description: Fetches historical financial data from the income statement, balance sheet, and cash flow statement for a company.
 *     tags:
 *       - Massive - Stock Fundamentals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., AAPL).
 *     responses:
 *       200:
 *         description: Successful response with financial statements.
 *       404:
 *         description: Ticker not found or no financial data available.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/stocks/:ticker/financials',  MassiveController.getStockFinancials);

/**
 * @openapi
 * /api/v1/massive/stocks/{ticker}/income:
 *   get:
 *     summary: Get stock income statement
 *     description: Fetches historical income statement data for a company.
 *     tags:
 *       - Massive - Stock Fundamentals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., AAPL).
 *     responses:
 *       200:
 *         description: Successful response with income statement data.
 *       404:
 *         description: Ticker not found or no data available.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/stocks/:ticker/income',      MassiveController.getStockIncomeStatement);

/**
 * @openapi
 * /api/v1/massive/stocks/{ticker}/balance:
 *   get:
 *     summary: Get stock balance sheet
 *     description: Fetches historical balance sheet data for a company.
 *     tags:
 *       - Massive - Stock Fundamentals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., AAPL).
 *     responses:
 *       200:
 *         description: Successful response with balance sheet data.
 *       404:
 *         description: Ticker not found or no data available.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/stocks/:ticker/balance',     MassiveController.getStockBalanceSheet);

/**
 * @openapi
 * /api/v1/massive/stocks/{ticker}/dividends:
 *   get:
 *     summary: Get stock dividends
 *     description: Fetches historical dividend data for a company.
 *     tags:
 *       - Massive - Stock Fundamentals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., AAPL).
 *     responses:
 *       200:
 *         description: Successful response with a list of historical dividends.
 *       404:
 *         description: Ticker not found or no dividend history.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/stocks/:ticker/dividends',   MassiveController.getStockDividends);

/**
 * @openapi
 * /api/v1/massive/stocks/{ticker}/splits:
 *   get:
 *     summary: Get stock splits
 *     description: Fetches historical stock split data for a company.
 *     tags:
 *       - Massive - Stock Fundamentals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., AAPL).
 *     responses:
 *       200:
 *         description: Successful response with a list of historical stock splits.
 *       404:
 *         description: Ticker not found or no split history.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/stocks/:ticker/splits',      MassiveController.getStockSplits);

/**
 * @openapi
 * /api/v1/massive/stocks/{ticker}/float:
 *   get:
 *     summary: Get stock float
 *     description: Fetches the number of shares available for public trading (float) for a company.
 *     tags:
 *       - Massive - Stock Fundamentals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., AAPL).
 *     responses:
 *       200:
 *         description: Successful response with the stock float data.
 *       404:
 *         description: Ticker not found or data not available.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/stocks/:ticker/float',       MassiveController.getStockFloat);

/**
 * @openapi
 * /api/v1/massive/stocks/{ticker}/short:
 *   get:
 *     summary: Get short interest data
 *     description: Fetches short interest data for a stock, typically updated twice a month.
 *     tags:
 *       - Massive - Stock Fundamentals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., GME).
 *     responses:
 *       200:
 *         description: Successful response with short interest data.
 *       404:
 *         description: Ticker not found or data not available.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/stocks/:ticker/short',       MassiveController.getShortInterest);

/**
 * @openapi
 * /api/v1/massive/stocks/{ticker}/news:
 *   get:
 *     summary: Get stock-specific news
 *     description: Fetches recent news articles related to a specific stock ticker.
 *     tags:
 *       - Massive - Stock Fundamentals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., AAPL).
 *     responses:
 *       200:
 *         description: Successful response with a list of news articles.
 *       404:
 *         description: Ticker not found.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/stocks/:ticker/news',        MassiveController.getStockNews);

// ─── Crypto ───────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/massive/crypto/{ticker}:
 *   get:
 *     summary: Get a real-time crypto quote
 *     description: Fetches the latest real-time quote for a specified cryptocurrency pair.
 *     tags:
 *       - Massive - Crypto
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The crypto ticker symbol (e.g., BTC-USD).
 *     responses:
 *       200:
 *         description: Successful response with the crypto quote.
 *       404:
 *         description: Ticker not found.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/crypto/:ticker',             MassiveController.getCryptoQuote);

/**
 * @openapi
 * /api/v1/massive/crypto/{ticker}/chart:
 *   get:
 *     summary: Get crypto chart data (aggregates/bars)
 *     description: Fetches aggregate bars (candlesticks) for a crypto pair over a given date range.
 *     tags:
 *       - Massive - Crypto
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The crypto ticker symbol (e.g., BTC-USD).
 *       - in: query
 *         name: multiplier
 *         schema:
 *           type: integer
 *           default: 1
 *         description: The size of the time window multiplier.
 *       - in: query
 *         name: timespan
 *         schema:
 *           type: string
 *           enum: [minute, hour, day, week, month, quarter, year]
 *           default: day
 *         description: The size of the time window.
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: The start of the aggregate time window (YYYY-MM-DD).
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: The end of the aggregate time window (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: Successful response with an array of aggregate bars.
 *       400:
 *         description: Invalid query parameters.
 *       404:
 *         description: Ticker not found.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/crypto/:ticker/chart',       MassiveController.getCryptoAggregates);

// ─── Forex & Currency ─────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/massive/forex/{ticker}:
 *   get:
 *     summary: Get a real-time forex quote
 *     description: Fetches the latest real-time quote for a specified forex currency pair.
 *     tags:
 *       - Massive - Forex & Currency
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The forex ticker symbol (e.g., EUR-USD).
 *     responses:
 *       200:
 *         description: Successful response with the forex quote.
 *       404:
 *         description: Ticker not found.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/forex/:ticker',                    MassiveController.getForexQuote);

/**
 * @openapi
 * /api/v1/massive/forex/{ticker}/chart:
 *   get:
 *     summary: Get forex chart data (aggregates/bars)
 *     description: Fetches aggregate bars (candlesticks) for a forex pair over a given date range.
 *     tags:
 *       - Massive - Forex & Currency
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The forex ticker symbol (e.g., EUR-USD).
 *       - in: query
 *         name: multiplier
 *         schema:
 *           type: integer
 *           default: 1
 *         description: The size of the time window multiplier.
 *       - in: query
 *         name: timespan
 *         schema:
 *           type: string
 *           enum: [minute, hour, day, week, month, quarter, year]
 *           default: day
 *         description: The size of the time window.
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: The start of the aggregate time window (YYYY-MM-DD).
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: The end of the aggregate time window (YYYY-MM-DD).
 *     responses:
 *       200:
 *         description: Successful response with an array of aggregate bars.
 *       400:
 *         description: Invalid query parameters.
 *       404:
 *         description: Ticker not found.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/forex/:ticker/chart',              MassiveController.getForexAggregates);

/**
 * @openapi
 * /api/v1/massive/forex/convert/{from}/{to}:
 *   get:
 *     summary: Get real-time currency conversion
 *     description: Fetches the real-time conversion rate between two currencies.
 *     tags:
 *       - Massive - Forex & Currency
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *         description: The currency to convert from (e.g., USD).
 *       - in: path
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *         description: The currency to convert to (e.g., EUR).
 *     responses:
 *       200:
 *         description: Successful response with the conversion rate.
 *       404:
 *         description: One or both currency symbols are invalid.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/forex/convert/:from/:to',          MassiveController.getCurrencyConversion);

// ─── Options ──────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/massive/options/chain/{underlyingTicker}:
 *   get:
 *     summary: Get the full options chain
 *     description: Fetches the entire options chain (all puts and calls for all expirations) for an underlying stock ticker.
 *     tags:
 *       - Massive - Options
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: underlyingTicker
 *         required: true
 *         schema:
 *           type: string
 *         description: The underlying stock ticker symbol (e.g., SPY).
 *     responses:
 *       200:
 *         description: Successful response with the full options chain.
 *       404:
 *         description: Underlying ticker not found or has no options.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/options/chain/:underlyingTicker',          MassiveController.getOptionsChain);

/**
 * @openapi
 * /api/v1/massive/options/chain/{underlyingTicker}/filter:
 *   get:
 *     summary: Get a filtered options chain
 *     description: Fetches a filtered subset of the options chain based on query parameters like expiration date and strike price range.
 *     tags:
 *       - Massive - Options
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: underlyingTicker
 *         required: true
 *         schema:
 *           type: string
 *         description: The underlying stock ticker symbol (e.g., SPY).
 *       - in: query
 *         name: expiration_date
 *         schema:
 *           type: string
 *           format: date
 *         description: The exact expiration date to query (YYYY-MM-DD).
 *       - in: query
 *         name: strike_price.gte
 *         schema:
 *           type: number
 *         description: Strike price greater than or equal to this value.
 *       - in: query
 *         name: strike_price.lte
 *         schema:
 *           type: number
 *         description: Strike price less than or equal to this value.
 *     responses:
 *       200:
 *         description: Successful response with the filtered options chain.
 *       400:
 *         description: Invalid query parameters.
 *       404:
 *         description: Underlying ticker not found or has no options matching the filter.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/options/chain/:underlyingTicker/filter',   MassiveController.getOptionsFiltered);

/**
 * @openapi
 * /api/v1/massive/options/{contractTicker}:
 *   get:
 *     summary: Get a specific options contract quote
 *     description: Fetches a real-time quote for a single, specific options contract.
 *     tags:
 *       - Massive - Options
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contractTicker
 *         required: true
 *         schema:
 *           type: string
 *         description: The full options contract ticker symbol (e.g., O:SPY240119C00475000).
 *     responses:
 *       200:
 *         description: Successful response with the options contract quote.
 *       404:
 *         description: Options contract not found.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/options/:contractTicker',                  MassiveController.getOptionsQuote);

// ─── Benzinga (Institutional) ─────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/massive/benzinga/news/{ticker}:
 *   get:
 *     summary: Get Benzinga news for a ticker
 *     description: Fetches high-quality, institutional-grade news from Benzinga for a specific ticker.
 *     tags:
 *       - Massive - Benzinga
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., TSLA). Use 'general' for market-wide news.
 *     responses:
 *       200:
 *         description: Successful response with a list of Benzinga news articles.
 *       404:
 *         description: Ticker not found.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/benzinga/news/:ticker',      MassiveController.getBenzingaNews);

/**
 * @openapi
 * /api/v1/massive/benzinga/ratings/{ticker}:
 *   get:
 *     summary: Get Benzinga analyst ratings
 *     description: Fetches analyst ratings and price target changes from Benzinga for a specific ticker.
 *     tags:
 *       - Massive - Benzinga
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The stock ticker symbol (e.g., NVDA).
 *     responses:
 *       200:
 *         description: Successful response with a list of analyst ratings.
 *       404:
 *         description: Ticker not found or no ratings available.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/benzinga/ratings/:ticker',   MassiveController.getBenzingaRatings);

// ─── ETF ──────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/massive/etf/profile/{ticker}:
 *   get:
 *     summary: Get ETF profile
 *     description: Fetches the profile and summary information for a specific Exchange Traded Fund (ETF).
 *     tags:
 *       - Massive - ETF
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The ETF ticker symbol (e.g., VOO).
 *     responses:
 *       200:
 *         description: Successful response with the ETF profile.
 *       404:
 *         description: ETF ticker not found.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/etf/profile/:ticker',        MassiveController.getEtfProfiles);

/**
 * @openapi
 * /api/v1/massive/etf/constituents/{ticker}:
 *   get:
 *     summary: Get ETF constituents
 *     description: Fetches the underlying holdings (constituents) of a specific ETF.
 *     tags:
 *       - Massive - ETF
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticker
 *         required: true
 *         schema:
 *           type: string
 *         description: The ETF ticker symbol (e.g., ARKK).
 *     responses:
 *       200:
 *         description: Successful response with a list of the ETF's constituents.
 *       404:
 *         description: ETF ticker not found or constituents data not available.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/etf/constituents/:ticker',   MassiveController.getEtfConstituents);

// ─── Federal Reserve / Macro ──────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/massive/fed/inflation:
 *   get:
 *     summary: Get Federal Reserve inflation data
 *     description: Fetches key inflation indicators like the Consumer Price Index (CPI).
 *     tags:
 *       - Massive - Macro
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response with inflation data.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/fed/inflation',              MassiveController.getFedInflation);

/**
 * @openapi
 * /api/v1/massive/fed/yields:
 *   get:
 *     summary: Get Federal Reserve yield curve data
 *     description: Fetches current and historical US Treasury yield curve data.
 *     tags:
 *       - Massive - Macro
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response with yield curve data.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/fed/yields',                 MassiveController.getFedYields);

/**
 * @openapi
 * /api/v1/massive/fed/labor:
 *   get:
 *     summary: Get Federal Reserve labor market data
 *     description: Fetches key labor market indicators like unemployment rates and non-farm payrolls.
 *     tags:
 *       - Massive - Macro
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response with labor market data.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/fed/labor',                  MassiveController.getFedLaborMarket);

/**
 * @openapi
 * /api/v1/massive/fed/inflation-expectations:
 *   get:
 *     summary: Get Federal Reserve inflation expectations
 *     description: Fetches data on consumer and market-based inflation expectations.
 *     tags:
 *       - Massive - Macro
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response with inflation expectations data.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/fed/inflation-expectations', MassiveController.getFedInflationExpectations);

// ─── Market-wide ──────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/massive/market/status:
 *   get:
 *     summary: Get market status
 *     description: Fetches the current status of the US stock market (e.g., open, closed, pre-market, post-market).
 *     tags:
 *       - Massive - Market-wide
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response with the current market status.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/market/status',              MassiveController.getMarketStatus);

/**
 * @openapi
 * /api/v1/massive/market/holidays:
 *   get:
 *     summary: Get market holidays
 *     description: Fetches a list of upcoming US stock market holidays.
 *     tags:
 *       - Massive - Market-wide
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response with a list of market holidays.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/market/holidays',            MassiveController.getMarketHolidays);

/**
 * @openapi
 * /api/v1/massive/market/movers:
 *   get:
 *     summary: Get top market movers
 *     description: Fetches the top gaining, top losing, and most active stocks for the current trading day.
 *     tags:
 *       - Massive - Market-wide
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response with lists of top movers.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/market/movers',              MassiveController.getTopMovers);

/**
 * @openapi
 * /api/v1/massive/market/news:
 *   get:
 *     summary: Get general market news
 *     description: Fetches recent news articles related to the overall US market.
 *     tags:
 *       - Massive - Market-wide
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response with a list of market news articles.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/market/news',                MassiveController.getMarketNews);

/**
 * @openapi
 * /api/v1/massive/market/news/global:
 *   get:
 *     summary: Get global financial news
 *     description: Fetches recent news articles with a global financial perspective.
 *     tags:
 *       - Massive - Market-wide
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response with a list of global news articles.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/market/news/global',         MassiveController.getGlobalNews);

/**
 * @openapi
 * /api/v1/massive/market/ipos:
 *   get:
 *     summary: Get upcoming and recent IPOs
 *     description: Fetches a list of Initial Public Offerings (IPOs) for a given date range.
 *     tags:
 *       - Massive - Market-wide
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response with a list of IPOs.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/market/ipos',                MassiveController.getIPOs);

// ─── Dashboard & Watchlist ────────────────────────────────────────────────────

/**
 * @openapi
 * /api/v1/massive/market/overview:
 *   get:
 *     summary: Get a broad market overview
 *     description: A composite endpoint that fetches a snapshot of key market indicators in parallel. This includes major indices (SPY, QQQ, DIA, IWM), commodities (BTC, Gold, Oil), volatility (VIX), top movers, and the current market status. Designed for a dashboard view.
 *     tags:
 *       - Massive - Dashboard & Watchlist
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response with a composite object of market overview data.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.get('/market/overview',            MassiveController.getMarketOverview);

/**
 * @openapi
 * /api/v1/massive/watchlist/quotes:
 *   post:
 *     summary: Get quotes for a watchlist
 *     description: Fetches real-time snapshot quotes for a list of up to 50 mixed-asset tickers (stocks, crypto, etc.) in a single batch call.
 *     tags:
 *       - Massive - Dashboard & Watchlist
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tickers
 *             properties:
 *               tickers:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: An array of ticker symbols.
 *                 example: ["AAPL", "MSFT", "BTC-USD", "EUR-USD"]
 *     responses:
 *       200:
 *         description: Successful response with a list of quotes corresponding to the requested tickers.
 *       400:
 *         description: Invalid request body, such as missing 'tickers' array or too many tickers requested.
 *       500:
 *         description: Internal server error or error from the data provider.
 */
router.post('/watchlist/quotes',          MassiveController.getWatchlistQuotes);

/**
 * The exported Express router for the massive module.
 * @type {express.Router}
 */
export const massiveRoutes = router;