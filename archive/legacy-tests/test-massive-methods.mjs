import { restClient } from '@massive.com/client-js';

const rest = restClient('gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3', 'https://api.massive.com');

// Print all available methods on the rest client
const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(rest))
  .filter(m => m !== 'constructor' && typeof rest[m] === 'function')
  .sort();

const allMethods = [
  ...methods,
  ...Object.keys(rest).filter(k => typeof rest[k] === 'function')
].sort();

console.log('ALL AVAILABLE METHODS (' + allMethods.length + '):\n');
allMethods.forEach(m => console.log('  rest.' + m + '()'));

// Also check stock-specific methods
console.log('\n\nSTOCK-RELATED methods:');
allMethods.filter(m => m.toLowerCase().includes('stock') || m.toLowerCase().includes('ticker') || m.toLowerCase().includes('snap')).forEach(m => console.log('  rest.' + m + '()'));

console.log('\n\nCRYPTO-RELATED methods:');
allMethods.filter(m => m.toLowerCase().includes('crypto') || m.toLowerCase().includes('coin')).forEach(m => console.log('  rest.' + m + '()'));

console.log('\n\nFOREX-RELATED methods:');
allMethods.filter(m => m.toLowerCase().includes('forex') || m.toLowerCase().includes('currency') || m.toLowerCase().includes('fx')).forEach(m => console.log('  rest.' + m + '()'));

console.log('\n\nNEWS/RATINGS methods:');
allMethods.filter(m => m.toLowerCase().includes('news') || m.toLowerCase().includes('rating') || m.toLowerCase().includes('benzinga') || m.toLowerCase().includes('analyst')).forEach(m => console.log('  rest.' + m + '()'));

console.log('\n\nEARNINGS/ETF methods:');
allMethods.filter(m => m.toLowerCase().includes('earn') || m.toLowerCase().includes('etf')).forEach(m => console.log('  rest.' + m + '()'));

console.log('\n\nINDICES methods:');
allMethods.filter(m => m.toLowerCase().includes('ind') || m.toLowerCase().includes('index')).forEach(m => console.log('  rest.' + m + '()'));

console.log('\n\nOPTIONS methods:');
allMethods.filter(m => m.toLowerCase().includes('option')).forEach(m => console.log('  rest.' + m + '()'));
