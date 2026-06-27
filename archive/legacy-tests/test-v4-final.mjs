process.env.MASSIVE_API_KEY = 'gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3';
const { massiveSmartRouter } = await import('./src/app/helpers/massiveSmartRouter.js');

const tests = [
  'how are markets doing today',
  'market overview',
  'what is the market doing',
  'show me tech sector performance',
  'energy sector today',
  'what sectors are up today',
  'show me FAANG stocks',
  'magnificent seven stocks',
  'mag 7 stocks',
  'show me major forex pairs',
  'crypto market overview',
  'top cryptocurrencies today',
  'GBP to USD rate today',
  'What is the S&P 500 index level?',
  'MACD for AAPL',
  'Gold price today',
  'Crude oil price',
  'Apple stock price',
  'Show me AAPL put options expiring June 20',
  'Bitcoin price',
  'EUR/USD rate',
  'show me big bank stocks',
  'chip stocks today',
  'What is the weather in New York?',
];

let pass = 0, fail = 0;
for (const q of tests) {
  const r = await massiveSmartRouter.routeAndEnhancePrompt(q);
  const enhanced = r !== q;
  if (enhanced) pass++; else fail++;
  console.log(enhanced ? '✅' : '❌', q);
}
console.log(`\nRESULT: ${pass}/${tests.length} passing`);
