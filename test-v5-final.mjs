process.env.MASSIVE_API_KEY = 'gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3';
const { massiveSmartRouter } = await import('./src/app/helpers/massiveSmartRouter.js');

const tests = [
  // Previously passing
  ['how are markets doing today', true],
  ['show me FAANG stocks', true],
  ['show me major forex pairs', true],
  ['crypto market overview', true],
  ['MACD for AAPL', true],
  ['Gold price today', true],
  ['Apple stock price', true],
  ['Bitcoin price', true],
  ['EUR/USD rate', true],
  // New v5 intents
  ['top gainers today', true],
  ['biggest losers in the stock market', true],
  ['most active stocks today', true],
  ['latest market news', true],
  ['financial news today', true],
  ['52 week high for TSLA', true],
  ['show me AAPL 52-week range', true],
  ['AAPL dividend yield', true],
  ['does Apple pay a dividend', true],
  ['GME short interest', true],
  ['most shorted stocks today', true],
  ['convert 1000 EUR to USD', true],
  ['convert 500 GBP to JPY', true],
  ['bitcoin technical analysis', true],
  ['ethereum RSI', true],
  ['BTC MACD signal', true],
  // Non-financial (should NOT be enhanced)
  ['What is the weather in New York?', false],
  ['who won the Super Bowl', false],
];

let pass = 0, fail = 0;
for (const [q, shouldEnhance] of tests) {
  const r = await massiveSmartRouter.routeAndEnhancePrompt(q);
  const enhanced = r !== q;
  const correct = enhanced === shouldEnhance;
  if (correct) pass++; else fail++;
  const icon = correct ? '✅' : '❌';
  const result = enhanced ? 'ENHANCED' : 'pass-through';
  console.log(icon, q.padEnd(45), '→', result);
}
console.log(`\nRESULT: ${pass}/${tests.length} correct`);
