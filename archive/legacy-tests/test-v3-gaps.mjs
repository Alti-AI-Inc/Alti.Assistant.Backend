import { restClient } from '@massive.com/client-js';
const rest = restClient('gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3', 'https://api.massive.com');

async function t(label, fn) {
  try {
    const r = await fn();
    console.log(`✅ ${label}:`, JSON.stringify(r).slice(0, 250));
  } catch (e) { console.error(`❌ ${label}: ${e.message?.slice(0,80)}`); }
}

// 1. Market overview batch - fetch all major benchmarks in ONE call
await t('Market overview batch (SPY QQQ DIA IWM VIXY GLD USO TLT)', 
  () => rest.getStocksSnapshotTickers({ tickers: 'SPY,QQQ,DIA,IWM,VIXY,GLD,USO,TLT' }));

// 2. Sectors batch
await t('Sector ETFs batch', 
  () => rest.getStocksSnapshotTickers({ tickers: 'XLK,XLF,XLV,XLE,XLI,XLC,XLP,XLY,XLB,XLRE,XLU' }));

// 3. FAANG / Magnificent 7
await t('Mag 7 batch (AAPL MSFT GOOGL AMZN NVDA META TSLA)',
  () => rest.getStocksSnapshotTickers({ tickers: 'AAPL,MSFT,GOOGL,AMZN,NVDA,META,TSLA' }));

// 4. Crypto top coins batch
await t('Crypto top coins batch',
  () => rest.getCryptoSnapshotTickers({ tickers: 'X:BTCUSD,X:ETHUSD,X:SOLUSD,X:XRPUSD,X:BNBUSD,X:DOGEUSD,X:ADAUSD' }));

// 5. Major forex pairs batch
await t('Major forex pairs batch',
  () => rest.getForexSnapshotTickers({ tickers: 'C:EURUSD,C:GBPUSD,C:USDJPY,C:USDCHF,C:AUDUSD,C:USDCAD,C:NZDUSD' }));

// 6. Universal snapshot (check if can do mixed asset batch)
await t('Universal getSnapshots mixed',
  () => rest.getSnapshots({ 'ticker.any_of': 'AAPL,MSFT,X:BTCUSD,C:EURUSD', limit: 4 }));

// 7. Options unusual activity detection - getOptionsChain with volume/OI sort
await t('Options unusual activity - sorted by OI',
  () => rest.getOptionsChain({ underlyingAsset: 'SPY', limit: 5, sort: 'open_interest', order: 'desc' }));

// 8. Short interest - check format of data returned
await t('NVDA short interest', () => rest.getStocksV1ShortInterest({ ticker: 'NVDA', limit: 1 }));

// 9. Dividends for AAPL
await t('AAPL dividends recent', () => rest.getStocksV1Dividends({ ticker: 'AAPL', limit: 4 }));

// 10. Float for TSLA
await t('TSLA float', () => rest.getStocksVXFloat({ ticker: 'TSLA' }));

// 11. Crypto RSI for top coins
await t('BTC RSI', () => rest.getCryptoRSI({ cryptoTicker: 'X:BTCUSD', window: 14, timespan: 'day', limit: 1 }));
await t('ETH RSI', () => rest.getCryptoRSI({ cryptoTicker: 'X:ETHUSD', window: 14, timespan: 'day', limit: 1 }));

// 12. Universal snapshot for FAANG — check which asset types it supports
await t('getSnapshots AAPL only', () => rest.getSnapshots({ 'ticker.any_of': 'AAPL', limit: 1 }));
