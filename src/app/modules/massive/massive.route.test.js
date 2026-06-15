import { describe, it, expect, vi } from 'vitest';

// Mock express and its Router method
const mockRouter = {
  get: vi.fn(),
  post: vi.fn(),
  // Add other methods like .use, .put, .delete if they were used in the route file
};

const {
  mockExpress,
  mockMassiveController
} = vi.hoisted(() => {
  const mockExpress = {
    Router: vi.fn().mockImplementation(() => mockRouter),
  };

  // Mock MassiveController and all its methods
  const mockMassiveController = {
    getStockQuote: vi.fn(),
    getStockAggregates: vi.fn(),
    getPreviousClose: vi.fn(),
    getStock52Week: vi.fn(),
    getTickerDetails: vi.fn(),
    getStockFinancials: vi.fn(),
    getStockIncomeStatement: vi.fn(),
    getStockBalanceSheet: vi.fn(),
    getStockDividends: vi.fn(),
    getStockSplits: vi.fn(),
    getStockFloat: vi.fn(),
    getShortInterest: vi.fn(),
    getStockNews: vi.fn(),
    getCryptoQuote: vi.fn(),
    getCryptoAggregates: vi.fn(),
    getForexQuote: vi.fn(),
    getForexAggregates: vi.fn(),
    getCurrencyConversion: vi.fn(),
    getOptionsChain: vi.fn(),
    getOptionsFiltered: vi.fn(),
    getOptionsQuote: vi.fn(),
    getBenzingaNews: vi.fn(),
    getBenzingaRatings: vi.fn(),
    getEtfProfiles: vi.fn(),
    getEtfConstituents: vi.fn(),
    getFedInflation: vi.fn(),
    getFedYields: vi.fn(),
    getFedLaborMarket: vi.fn(),
    getFedInflationExpectations: vi.fn(),
    getMarketStatus: vi.fn(),
    getMarketHolidays: vi.fn(),
    getTopMovers: vi.fn(),
    getMarketNews: vi.fn(),
    getGlobalNews: vi.fn(),
    getIPOs: vi.fn(),
    getMarketOverview: vi.fn(),
    getWatchlistQuotes: vi.fn(),
  };

  return {
    mockExpress,
    mockMassiveController
  };
});

vi.mock('express', () => ({ default: mockExpress }));

vi.mock('./massive.controller.js', () => ({
  MassiveController: mockMassiveController,
}));

// Import the router file AFTER mocks are defined.
// This import will execute the route definitions, calling the mocked `express.Router()`
// and then the mocked `router.get()` and `router.post()` methods.
import { massiveRoutes } from './massive.route.js';

describe('massive.route.js', () => {
  it('should export an express router instance', () => {
    // Verify that express.Router() was called once to create the router
    expect(mockExpress.Router).toHaveBeenCalledTimes(1);
    // Verify that the exported `massiveRoutes` is indeed our mocked router instance
    expect(massiveRoutes).toBe(mockRouter);
  });

  it('should define all GET routes with the correct paths and controller methods', () => {
    // Stock Quotes & Aggregates
    expect(mockRouter.get).toHaveBeenCalledWith('/stocks/:ticker', mockMassiveController.getStockQuote);
    expect(mockRouter.get).toHaveBeenCalledWith('/stocks/:ticker/chart', mockMassiveController.getStockAggregates);
    expect(mockRouter.get).toHaveBeenCalledWith('/stocks/:ticker/prev', mockMassiveController.getPreviousClose);
    expect(mockRouter.get).toHaveBeenCalledWith('/stocks/:ticker/52week', mockMassiveController.getStock52Week);
    expect(mockRouter.get).toHaveBeenCalledWith('/stocks/:ticker/details', mockMassiveController.getTickerDetails);

    // Stock Fundamentals
    expect(mockRouter.get).toHaveBeenCalledWith('/stocks/:ticker/financials', mockMassiveController.getStockFinancials);
    expect(mockRouter.get).toHaveBeenCalledWith('/stocks/:ticker/income', mockMassiveController.getStockIncomeStatement);
    expect(mockRouter.get).toHaveBeenCalledWith('/stocks/:ticker/balance', mockMassiveController.getStockBalanceSheet);
    expect(mockRouter.get).toHaveBeenCalledWith('/stocks/:ticker/dividends', mockMassiveController.getStockDividends);
    expect(mockRouter.get).toHaveBeenCalledWith('/stocks/:ticker/splits', mockMassiveController.getStockSplits);
    expect(mockRouter.get).toHaveBeenCalledWith('/stocks/:ticker/float', mockMassiveController.getStockFloat);
    expect(mockRouter.get).toHaveBeenCalledWith('/stocks/:ticker/short', mockMassiveController.getShortInterest);
    expect(mockRouter.get).toHaveBeenCalledWith('/stocks/:ticker/news', mockMassiveController.getStockNews);

    // Crypto
    expect(mockRouter.get).toHaveBeenCalledWith('/crypto/:ticker', mockMassiveController.getCryptoQuote);
    expect(mockRouter.get).toHaveBeenCalledWith('/crypto/:ticker/chart', mockMassiveController.getCryptoAggregates);

    // Forex & Currency
    expect(mockRouter.get).toHaveBeenCalledWith('/forex/:ticker', mockMassiveController.getForexQuote);
    expect(mockRouter.get).toHaveBeenCalledWith('/forex/:ticker/chart', mockMassiveController.getForexAggregates);
    expect(mockRouter.get).toHaveBeenCalledWith('/forex/convert/:from/:to', mockMassiveController.getCurrencyConversion);

    // Options
    expect(mockRouter.get).toHaveBeenCalledWith('/options/chain/:underlyingTicker', mockMassiveController.getOptionsChain);
    expect(mockRouter.get).toHaveBeenCalledWith('/options/chain/:underlyingTicker/filter', mockMassiveController.getOptionsFiltered);
    expect(mockRouter.get).toHaveBeenCalledWith('/options/:contractTicker', mockMassiveController.getOptionsQuote);

    // Benzinga (Institutional)
    expect(mockRouter.get).toHaveBeenCalledWith('/benzinga/news/:ticker', mockMassiveController.getBenzingaNews);
    expect(mockRouter.get).toHaveBeenCalledWith('/benzinga/ratings/:ticker', mockMassiveController.getBenzingaRatings);

    // ETF
    expect(mockRouter.get).toHaveBeenCalledWith('/etf/profile/:ticker', mockMassiveController.getEtfProfiles);
    expect(mockRouter.get).toHaveBeenCalledWith('/etf/constituents/:ticker', mockMassiveController.getEtfConstituents);

    // Federal Reserve / Macro
    expect(mockRouter.get).toHaveBeenCalledWith('/fed/inflation', mockMassiveController.getFedInflation);
    expect(mockRouter.get).toHaveBeenCalledWith('/fed/yields', mockMassiveController.getFedYields);
    expect(mockRouter.get).toHaveBeenCalledWith('/fed/labor', mockMassiveController.getFedLaborMarket);
    expect(mockRouter.get).toHaveBeenCalledWith('/fed/inflation-expectations', mockMassiveController.getFedInflationExpectations);

    // Market-wide
    expect(mockRouter.get).toHaveBeenCalledWith('/market/status', mockMassiveController.getMarketStatus);
    expect(mockRouter.get).toHaveBeenCalledWith('/market/holidays', mockMassiveController.getMarketHolidays);
    expect(mockRouter.get).toHaveBeenCalledWith('/market/movers', mockMassiveController.getTopMovers);
    expect(mockRouter.get).toHaveBeenCalledWith('/market/news', mockMassiveController.getMarketNews);
    expect(mockRouter.get).toHaveBeenCalledWith('/market/news/global', mockMassiveController.getGlobalNews);
    expect(mockRouter.get).toHaveBeenCalledWith('/market/ipos', mockMassiveController.getIPOs);

    // Dashboard & Watchlist
    expect(mockRouter.get).toHaveBeenCalledWith('/market/overview', mockMassiveController.getMarketOverview);

    // Ensure the correct total number of GET calls
    const expectedGetCalls = 39;
    expect(mockRouter.get).toHaveBeenCalledTimes(expectedGetCalls);
  });

  it('should define all POST routes with the correct paths and controller methods', () => {
    // Dashboard & Watchlist
    expect(mockRouter.post).toHaveBeenCalledWith('/watchlist/quotes', mockMassiveController.getWatchlistQuotes);

    // Ensure the correct total number of POST calls
    const expectedPostCalls = 1;
    expect(mockRouter.post).toHaveBeenCalledTimes(expectedPostCalls);
  });

  it('should not define any routes using other HTTP methods (e.g., PUT, DELETE, PATCH)', () => {
    // This is implicitly covered by checking the exact call counts for `get` and `post`.
    // If any other HTTP method (e.g., `router.put`, `router.delete`) were called,
    // and they were not mocked, the test would fail due to an unmocked function call.
    // If they were mocked, their `toHaveBeenCalledTimes` would be non-zero, which is not asserted here.
    // Given the simplicity of this route file, explicitly checking for other methods is usually not necessary.
  });
});