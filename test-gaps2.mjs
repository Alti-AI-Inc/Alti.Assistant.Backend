import { restClient } from '@massive.com/client-js';
const rest = restClient('gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3', 'https://api.massive.com');

// Test correct sort parameter name for Fed data  
async function t(label, fn) {
  try {
    const r = await fn();
    const d = r?.results?.[0]?.date || r?.results?.date || 'N/A';
    console.log(`✅ ${label}: first date=${d}`);
  } catch (e) { console.error(`❌ ${label}: ${e.message?.slice(0,80)}`); }
}

await t('Inflation sort=desc', () => rest.getFedV1Inflation({ limit: 2, sort: 'desc' }));
await t('Inflation timestamp.gte=2026', () => rest.getFedV1Inflation({ limit: 2, timestamp: '2026-01-01' }));
await t('Inflation timestamp.gte query', () => rest.getFedV1Inflation({ limit: 2, 'timestamp.gte': '2025-01-01' }));
await t('Inflation date.gte', () => rest.getFedV1Inflation({ limit: 2, date: '2025-01-01' }));
await t('Inflation date.gte query', () => rest.getFedV1Inflation({ limit: 2, 'date.gte': '2025-01-01' }));
await t('Yields sort=desc', () => rest.getFedV1TreasuryYields({ limit: 2, sort: 'desc' }));
await t('Yields date.gte=2025', () => rest.getFedV1TreasuryYields({ limit: 2, 'date.gte': '2025-01-01' }));
await t('Labor sort=desc', () => rest.getFedV1LaborMarket({ limit: 2, sort: 'desc' }));
await t('Labor date.gte=2025', () => rest.getFedV1LaborMarket({ limit: 2, 'date.gte': '2025-01-01' }));

// Test SPY/QQQ/DIA/IWM as index proxies
const { tickers } = await rest.getStocksSnapshotTickers({ tickers: 'SPY,QQQ,DIA,IWM,GLD,USO,TLT' });
console.log('\nINDEX PROXIES:');
(tickers || []).forEach(t => {
  const s = t.session || {};
  console.log(`  ${t.ticker}: close=${t.day?.c} change=${s.change?.toFixed(2)} (${s.change_percent?.toFixed(2)}%)`);
});

// Test MACD format
const macd = await rest.getStocksMACD({ stockTicker: 'AAPL', short_window: 12, long_window: 26, signal_window: 9, timespan: 'day', adjusted: true, limit: 1 });
console.log('\nMACDformat:', JSON.stringify(macd?.results?.values?.[0]));

// Test EMA format
const ema = await rest.getStocksEMA({ stockTicker: 'AAPL', window: 50, timespan: 'day', adjusted: true, limit: 1 });
console.log('EMA-50 format:', JSON.stringify(ema?.results?.values?.[0]));

// Forex detection tests - what ticker formats does the API need
const fx = await rest.getForexSnapshotTickers({ tickers: 'C:GBPUSD,C:USDJPY,C:USDMXN,C:AUDUSD,C:USDCAD' });
console.log('\nFOREX MULTI:');
(fx?.tickers || []).forEach(t => {
  console.log(`  ${t.ticker}: close=${t.day?.c} change=${t.todaysChangePerc?.toFixed(4)}%`);
});
