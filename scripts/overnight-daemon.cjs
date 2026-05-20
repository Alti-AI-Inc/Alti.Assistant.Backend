const { execSync } = require('child_process');
const path = require('path');

console.log(`\n======================================================================`);
  console.log(`🌙 ALTI ASSISTANT - OVERNIGHT DAEMON LOOP INITIALIZED`);
console.log(`======================================================================`);
console.log(`The optimization suite will execute continuously once every hour.`);
console.log(`You can safely leave; this process will run in the background overnight.`);
console.log(`======================================================================\n`);

const optimizeScriptPath = path.join(__dirname, 'overnight-optimize.cjs');

function runCycle() {
  try {
    console.log(`\n======================================================`);
    console.log(`[${new Date().toLocaleString()}] Starting optimization cycle...`);
    console.log(`======================================================`);
    execSync(`node "${optimizeScriptPath}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`[ERROR] Optimization cycle failed at ${new Date().toLocaleTimeString()}:`, err.message);
  }
  console.log(`\n[DAEMON] Next cycle scheduled in 1 hour. Sleeping...\n`);
}

// Run the first cycle immediately
runCycle();

// Repeat every 1 hour (3,600,000 milliseconds)
setInterval(runCycle, 3600000);
