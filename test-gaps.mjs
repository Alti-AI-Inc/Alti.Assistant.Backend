import { restClient } from '@massive.com/client-js';
const rest = restClient('gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3', 'https://api.massive.com');

async function t(label, fn) {
  try {
    const r = await fn();
    console.log(`✅ ${label}:`, JSON.stringify(r, null, 2).slice(0, 300));
  } catch (e) { console.error(`❌ ${label}: ${e.message?.slice(0,100)}`); }
}

// 1. Fed macro with ORDER DESC to get LATEST not 1947
await t('Inflation LATEST (desc)', () => rest.getFedV1Inflation({ limit: 3, order: 'desc' }));
await t('Treasury Yields LATEST (desc)', () => rest.getFedV1TreasuryYields({ limit: 3, order: 'desc' }));
await t('Labor Market LATEST (desc)', () => rest.getFedV1LaborMarket({ limit: 3, order: 'desc' }));
await t('Inflation Expectations LATEST (desc)', () => rest.getFedV1InflationExpectations({ limit: 3, order: 'desc' }));

// 2. Indices — try different approaches
await t('Indices Snapshot I:SPX', () => rest.getIndicesSnapshot({ tickers: 'I:SPX' }));
await t('Indices SPX via getSnapshots', () => rest.getSnapshots({ 'ticker.any_of': 'I:SPX,I:DJI,I:NDX,I:VIX,I:RUT', limit: 5 }));
await t('Indices SPX via Aggregates', () => rest.getIndicesAggregates({ indicesTicker: 'I:SPX', multiplier: 1, timespan: 'day', from: '2026-05-01', to: '2026-05-21', limit: 3 }));
await t('Indices open close', () => rest.getIndicesOpenClose({ indicesTicker: 'I:SPX', date: '2026-05-20' }));
await t('Indices Previous', () => rest.getPreviousIndicesAggregates({ indicesTicker: 'I:SPX' }));

// 3. GBP forex 
await t('Forex Snapshot GBP/USD', () => rest.getForexSnapshotTickers({ tickers: 'C:GBPUSD' }));
await t('Currency conversion GBP->USD', () => rest.getCurrencyConversion({ from: 'GBP', to: 'USD', amount: 1 }));

// 4. Gold / commodities
await t('Gold via GLD snapshot', () => rest.getStocksSnapshotTickers({ tickers: 'GLD,IAU,GDX' }));
await t('Crude oil via USO snapshot', () => rest.getStocksSnapshotTickers({ tickers: 'USO,UNG,XLE' }));

// 5. MACD + EMA for stocks
await t('AAPL MACD', () => rest.getStocksMACD({ stockTicker: 'AAPL', short_window: 12, long_window: 26, signal_window: 9, timespan: 'day', adjusted: true, limit: 1 }));
await t('AAPL EMA-50', () => rest.getStocksEMA({ stockTicker: 'AAPL', window: 50, timespan: 'day', adjusted: true, limit: 1 }));
await t('AAPL EMA-200', () => rest.getStocksEMA({ stockTicker: 'AAPL', window: 200, timespan: 'day', adjusted: true, limit: 1 }));
await t('AAPL SMA-50', () => rest.getStocksSMA({ stockTicker: 'AAPL', window: 50, timespan: 'day', adjusted: true, limit: 1 }));

// 6. ETF via stock snapshot (ETF Global is 403 but stocks snapshot works for ETFs)
await t('SPY as stock snapshot', () => rest.getStocksSnapshotTickers({ tickers: 'SPY,QQQ,IWM,DIA,GLD' }));
await t('SPY ETF previous aggregates', () => rest.getPreviousStocksAggregates({ stocksTicker: 'SPY' }));

// 7. Futures (check entitlement)
await t('Futures snapshot', () => rest.getFuturesV1Snapshot({ tickers: 'ESZ24' }));
await t('Futures products', () => rest.getFuturesV1Products({ limit: 5 }));

// 8. Universal snapshot for indices
await t('Universal snapshot SPX', () => rest.getSnapshotSummary({ ticker: 'SPY', limit: 1 }));
