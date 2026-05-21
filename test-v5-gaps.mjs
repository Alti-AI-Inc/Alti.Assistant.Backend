import { restClient } from '@massive.com/client-js';
const rest = restClient('gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3', 'https://api.massive.com');

async function t(label, fn) {
  try {
    const r = await fn();
    console.log(`✅ ${label}:`, JSON.stringify(r).slice(0, 300));
  } catch (e) { console.error(`❌ ${label}: ${e.message?.slice(0,80)}`); }
}

// 1. Gainers / Losers - market movers
await t('Gainers', () => rest.getStocksSnapshotGainersLosers({ direction: 'gainers', include_otc: false }));
await t('Losers', () => rest.getStocksSnapshotGainersLosers({ direction: 'losers', include_otc: false }));

// 2. Most active
await t('Most active via snapshot (sorted volume)', 
  () => rest.getStocksSnapshotTickers({ tickers: 'NVDA,TSLA,AAPL,AMZN,SPY,QQQ,AMD,META,MSFT,GOOGL' }));

// 3. Stock aggregates for 52-week high/low
const today = new Date().toISOString().slice(0,10);
const yearAgo = new Date(Date.now() - 365*24*60*60*1000).toISOString().slice(0,10);
await t('AAPL 52-week aggregates', 
  () => rest.getStocksAggregates({ stocksTicker: 'AAPL', multiplier: 1, timespan: 'week', from: yearAgo, to: today, limit: 52, sort: 'desc' }));

// 4. Dividends format
await t('AAPL dividends', () => rest.getStocksV1Dividends({ ticker: 'AAPL', limit: 4 }));

// 5. Short interest format check
await t('GME short interest', () => rest.getStocksV1ShortInterest({ ticker: 'GME', limit: 1 }));

// 6. Currency conversion  
await t('EUR to USD 1000', () => rest.getCurrencyConversion({ from: 'EUR', to: 'USD', amount: 1000 }));
await t('GBP to JPY', () => rest.getCurrencyConversion({ from: 'GBP', to: 'JPY', amount: 1 }));

// 7. Options open interest / volume filter
await t('SPY options high OI', () => rest.getOptionsChain({
  underlyingAsset: 'SPY', 
  limit: 5,
  'open_interest.gte': 10000,
  sort: 'expiration_date',
}));

// 8. Crypto MACD
await t('BTC MACD', () => rest.getCryptoMACD({ 
  cryptoTicker: 'X:BTCUSD', short_window: 12, long_window: 26, signal_window: 9, timespan: 'day', limit: 1 
}));

// 9. Earnings calendar - check what's available
await t('Earnings calendar/events', () => rest.getStocksV1FinancialsSummary({ ticker: 'AAPL' }));

// 10. Crypto EMA
await t('BTC EMA-50', () => rest.getCryptoEMA({ 
  cryptoTicker: 'X:BTCUSD', window: 50, timespan: 'day', adjusted: true, limit: 1 
}));

// 11. Stock news search (market-wide)
await t('Market news (no ticker)', () => rest.listNews({ limit: 5 }));

// 12. Options unusual activity - high volume
await t('SPY unusual options (high volume)', () => rest.getOptionsChain({
  underlyingAsset: 'SPY',
  limit: 10,
  contract_type: 'call',
  sort: 'expiration_date',
  order: 'asc',
}));

// 13. AAPL ticker details (for 52wk high/low)
await t('AAPL ticker details (snapshot)', () => rest.getStocksSnapshotTicker({ stocksTicker: 'AAPL' }));

// 14. Previous close aggregates for multiple
await t('AAPL prev close', () => rest.getPreviousStocksAggregates({ stocksTicker: 'AAPL' }));
