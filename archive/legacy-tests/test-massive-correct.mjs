import { restClient } from '@massive.com/client-js';

const rest = restClient('gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3', 'https://api.massive.com');

async function test(label, fn) {
  try {
    const r = await fn();
    console.log(`✅ ${label}:`, JSON.stringify(r, null, 2).slice(0, 400));
    return r;
  } catch (e) {
    console.error(`❌ ${label}: ${e.message?.slice(0,120)}`);
    return null;
  }
}

// STOCKS - correct methods
await test('getStocksSnapshotTicker(AAPL)', () => rest.getStocksSnapshotTicker({ stocksTicker: 'AAPL' }));
await test('getStocksSnapshotTickers(AAPL,MSFT)', () => rest.getStocksSnapshotTickers({ tickers: 'AAPL,MSFT' }));
await test('getPreviousStocksAggregates(AAPL)', () => rest.getPreviousStocksAggregates({ stocksTicker: 'AAPL' }));
await test('getTicker(AAPL)', () => rest.getTicker({ ticker: 'AAPL' }));
await test('getRelatedCompanies(AAPL)', () => rest.getRelatedCompanies({ stocksTicker: 'AAPL' }));
await test('getStocksV1Dividends(AAPL)', () => rest.getStocksV1Dividends({ ticker: 'AAPL', limit: 3 }));
await test('getStocksV1Splits(AAPL)', () => rest.getStocksV1Splits({ ticker: 'AAPL', limit: 3 }));
await test('getStocksFinancialsV1IncomeStatements(AAPL)', () => rest.getStocksFinancialsV1IncomeStatements({ ticker: 'AAPL', limit: 2 }));
await test('getStocksFinancialsV1Ratios(AAPL)', () => rest.getStocksFinancialsV1Ratios({ ticker: 'AAPL', limit: 2 }));
await test('getStocksV1ShortInterest(AAPL)', () => rest.getStocksV1ShortInterest({ ticker: 'AAPL', limit: 3 }));
await test('getSnapshotSummary(AAPL)', () => rest.getSnapshotSummary({ ticker: 'AAPL', limit: 1 }));
await test('getSnapshots(type:stocks)', () => rest.getSnapshots({ 'ticker.any_of': 'AAPL,MSFT,GOOGL', limit: 3 }));

// CRYPTO
await test('getCryptoSnapshotTicker(X:BTCUSD)', () => rest.getCryptoSnapshotTicker({ cryptoTicker: 'X:BTCUSD' }));
await test('getCryptoSnapshotTickers(BTC,ETH)', () => rest.getCryptoSnapshotTickers({ tickers: 'X:BTCUSD,X:ETHUSD' }));
await test('getCryptoTrades(X:BTCUSD)', () => rest.getCryptoTrades({ cryptoTicker: 'X:BTCUSD', limit: 2 }));

// FOREX  
await test('getForexSnapshotTicker(EURUSD)', () => rest.getForexSnapshotTicker({ forexTicker: 'C:EURUSD' }));
await test('getForexSnapshotTickers(EUR,GBP)', () => rest.getForexSnapshotTickers({ tickers: 'C:EURUSD,C:GBPUSD,C:USDJPY' }));
await test('getLastCurrencyQuote(EURUSD)', () => rest.getLastCurrencyQuote({ currencyPair: 'EURUSD' }));
await test('getCurrencyConversion(EUR->USD)', () => rest.getCurrencyConversion({ from: 'EUR', to: 'USD', amount: 1 }));

// INDICES
await test('getIndicesSnapshot(SPX)', () => rest.getIndicesSnapshot({ tickers: 'I:SPX,I:DJI,I:NDX,I:VIX,I:RUT' }));

// BENZINGA / NEWS / RATINGS  
await test('getBenzingaV2News(AAPL)', () => rest.getBenzingaV2News({ ticker: 'AAPL', limit: 3 }));
await test('getBenzingaV1Ratings(AAPL)', () => rest.getBenzingaV1Ratings({ ticker: 'AAPL', limit: 3 }));
await test('getBenzingaV1Earnings(AAPL)', () => rest.getBenzingaV1Earnings({ ticker: 'AAPL', limit: 3 }));
await test('listNews(AAPL)', () => rest.listNews({ ticker: 'AAPL', limit: 3 }));
await test('getBenzingaV1ConsensusRatings(AAPL)', () => rest.getBenzingaV1ConsensusRatings({ ticker: 'AAPL', limit: 3 }));
await test('getBenzingaV1AnalystInsights(AAPL)', () => rest.getBenzingaV1AnalystInsights({ ticker: 'AAPL', limit: 3 }));

// ETF
await test('getEtfGlobalV1Profiles(SPY)', () => rest.getEtfGlobalV1Profiles({ tickers: 'SPY' }));
await test('getEtfGlobalV1Constituents(SPY)', () => rest.getEtfGlobalV1Constituents({ ticker: 'SPY', limit: 5 }));
await test('getEtfGlobalV1FundFlows(SPY)', () => rest.getEtfGlobalV1FundFlows({ ticker: 'SPY', limit: 3 }));

// MACRO EXTRAS
await test('getFedV1LaborMarket', () => rest.getFedV1LaborMarket({ limit: 3 }));
await test('getFedV1InflationExpectations', () => rest.getFedV1InflationExpectations({ limit: 3 }));
