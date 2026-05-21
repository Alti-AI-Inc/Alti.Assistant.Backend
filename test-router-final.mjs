/**
 * Final smoke test — tests the complete massiveSmartRouter end-to-end
 * with the real API key against live Massive.com endpoints
 */
process.env.MASSIVE_API_KEY = 'gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3';

// Mock Redis so it doesn't fail in test env
const mockRedis = {
  get: async () => null,
  set: async () => null,
};

// Patch the import before loading router
const { massiveSmartRouter } = await import('./src/app/helpers/massiveSmartRouter.js');

const tests = [
  { label: 'Stock: AAPL price', query: 'What is the current price of AAPL?' },
  { label: 'Stock: TSLA with financials', query: 'Show me TSLA stock data and P/E ratio' },
  { label: 'Stock comparison', query: 'Compare AAPL vs MSFT stock' },
  { label: 'Options: AAPL calls', query: 'Show me AAPL call options' },
  { label: 'Crypto: BTC price', query: 'What is Bitcoin price right now?' },
  { label: 'Crypto: ETH vs BTC', query: 'Compare ETH vs BTC today' },
  { label: 'Forex: EUR/USD', query: 'What is the EUR/USD exchange rate?' },
  { label: 'Forex: GBP/USD', query: 'GBP to USD rate today' },
  { label: 'Macro: Fed rates', query: 'What is the current inflation rate and Fed yields?' },
  { label: 'Market status', query: 'Is the stock market open right now?' },
  { label: 'News: NVDA', query: 'Latest news for NVIDIA stock' },
  { label: 'Earnings: AAPL', query: 'When does Apple report earnings? What is their EPS?' },
  { label: 'No financial intent', query: 'What is the weather in New York?' },
];

console.log('\n🧪 Massive Smart Router — Full End-to-End Smoke Test\n');
console.log('='.repeat(70));

for (const test of tests) {
  console.log(`\n🔍 ${test.label}`);
  console.log(`   Query: "${test.query}"`);
  const start = Date.now();
  try {
    const result = await massiveSmartRouter.routeAndEnhancePrompt(test.query);
    const ms = Date.now() - start;
    const enhanced = result !== test.query;
    if (enhanced) {
      // Show just first 400 chars of the data block
      const preview = result.slice(0, 500).replace(/\n/g, '\n   ');
      console.log(`   ✅ ENHANCED (${ms}ms) — ${result.length} chars injected`);
      console.log(`   PREVIEW:\n   ${preview}...`);
    } else {
      console.log(`   ⚪ NOT FINANCIAL — passed through unchanged (${ms}ms)`);
    }
  } catch (e) {
    console.error(`   ❌ ERROR: ${e.message}`);
  }
}

console.log('\n' + '='.repeat(70));
console.log('✅ Smoke test complete\n');
