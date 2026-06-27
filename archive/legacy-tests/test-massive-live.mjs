import { restClient } from '@massive.com/client-js';

const API_KEY = 'gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3';
const rest = restClient(API_KEY, 'https://api.massive.com');

console.log('\n🔑 Testing Massive.com API — Key:', API_KEY.slice(0, 8) + '...\n');

async function test(label, fn) {
  try {
    const start = Date.now();
    const result = await fn();
    const ms = Date.now() - start;
    console.log(`✅ ${label} (${ms}ms):\n`, JSON.stringify(result, null, 2).slice(0, 600), '\n');
    return result;
  } catch (e) {
    console.error(`❌ ${label}: ${e.message}`, e.response?.data || '');
    return null;
  }
}

// --- STOCKS ---
await test('Stock Quote AAPL', () => rest.getLastStocksQuote({ stocksTicker: 'AAPL' }));
await test('Stock Trade AAPL', () => rest.getLastStocksTrade({ stocksTicker: 'AAPL' }));
await test('Ticker Details AAPL', () => rest.getTickerDetails({ ticker: 'AAPL' }));
await test('Previous Close AAPL', () => rest.getPreviousClose({ stocksTicker: 'AAPL' }));

// --- SNAPSHOT ALL ---
await test('Snapshot MSFT,TSLA', () => rest.getSnapshotAllTickers({ tickers: 'MSFT,TSLA' }));

// --- CRYPTO ---
await test('Crypto Trade BTC/USD', () => rest.getLastCryptoTrade({ cryptoTicker: 'X:BTCUSD' }));
await test('Crypto Snapshot BTC', () => rest.getSnapshotCryptoTicker({ cryptoTicker: 'X:BTCUSD' }));

// --- FOREX ---
await test('Forex Quote EUR/USD', () => rest.getRealTimeCurrencyConversion({ from: 'EUR', to: 'USD', amount: 1, precision: 5 }));
await test('Forex Last Quote EUR/USD', () => rest.getLastForexQuote({ currencyPair: 'EURUSD' }));

// --- INDICES ---
await test('Indices Snapshot', () => rest.getIndicesSnapshot({ tickers: 'I:SPX,I:DJI,I:NDX,I:VIX,I:RUT' }));

// --- MARKET STATUS ---
await test('Market Status', () => rest.getMarketStatus());
await test('Market Holidays', () => rest.getMarketHolidays());

// --- OPTIONS ---
await test('Options Chain AAPL', () => rest.getOptionsChain({ underlyingAsset: 'AAPL', limit: 5 }));

// --- NEWS / BENZINGA ---
await test('Benzinga News AAPL', () => rest.getBenzingaNewsBulls({ ticker: 'AAPL', limit: 3 }));
await test('Benzinga Ratings AAPL', () => rest.getBenzingaAnalystRatings({ ticker: 'AAPL', limit: 3 }));

// --- FED / MACRO ---
await test('Fed Inflation', () => rest.getFedV1Inflation({ limit: 3 }));
await test('Fed Treasury Yields', () => rest.getFedV1TreasuryYields({ limit: 3 }));

// --- EARNINGS ---
await test('Earnings Calendar', () => rest.getEarnings({ limit: 5 }));

// --- ETF ---
await test('ETF Profiles SPY', () => rest.getEtfProfiles({ tickers: 'SPY' }));

console.log('\n🏁 Massive.com API test complete.\n');
