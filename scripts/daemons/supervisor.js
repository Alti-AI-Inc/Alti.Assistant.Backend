/**
 * ════════════════════════════════════════════════════════════════════════════════
 *  SOVEREIGN PROCESS SUPERVISOR — CONTINUOUS DAEMON RUNNER & HEALER
 * ════════════════════════════════════════════════════════════════════════════════
 *  Launches and manages every single sovereign integration partner daemon
 *  as an independent, continuous background worker process (like dedicated
 *  individual developers hired to do one thing).
 *
 *  Partners Managed:
 *    1. Liberty Center One (OpenStack + MinIO/Swift Object Storage)
 *    2. Together AI (70B & 8B Sovereign Turbo Inference)
 *    3. Exa.ai (Real-time Neural Web Grounding)
 *    4. Composio (250+ App Connectors & MCP Gateway)
 *    5. LangChain & LangGraph (Autonomous Agent Swarms & Tracing)
 *    6. Cloudflare (Global Edge Network, WAF & Workers AI)
 *    7. Stripe (Sovereign Billing & Subscriptions)
 *    8. Deep Data Moats (SEC EDGAR, NASA, World Bank, USGS, USDA, FRED)
 *    9. Sovereign Master Orchestrator (Cross-Platform Synchronizer)
 *
 *  Features:
 *    • Non-stop continuous execution
 *    • Auto-restart with backoff if any process ever exits
 *    • Unified stdout/stderr streams
 *    • Graceful SIGINT / SIGTERM teardown
 * ════════════════════════════════════════════════════════════════════════════════
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DAEMONS = [
  { name: 'Liberty Center One', script: 'daemon-liberty.js', color: '\x1b[36m' },
  { name: 'Together AI', script: 'daemon-together.js', color: '\x1b[35m' },
  { name: 'Exa.ai', script: 'daemon-exa.js', color: '\x1b[34m' },
  { name: 'Composio', script: 'daemon-composio.js', color: '\x1b[32m' },
  { name: 'LangChain / LangGraph', script: 'daemon-langchain.js', color: '\x1b[33m' },
  { name: 'Cloudflare', script: 'daemon-cloudflare.js', color: '\x1b[38;5;208m' },
  { name: 'Stripe', script: 'daemon-stripe.js', color: '\x1b[38;5;141m' },
  { name: 'Deep Data Moats', script: 'daemon-data-providers.js', color: '\x1b[38;5;45m' },
  { name: 'Sovereign Master Orchestrator', script: 'daemon-orchestrator.js', color: '\x1b[1m\x1b[38;5;196m' },
  { name: 'Autonomous Overnight Developer', script: 'daemon-autonomous-developer.js', color: '\x1b[1m\x1b[32m' },
  { name: 'Direct Data Moats Discovery', script: 'daemon-data-discovery.js', color: '\x1b[38;5;51m' },
];

const processes = new Map();
let isShuttingDown = false;

function startDaemon(daemon) {
  if (isShuttingDown) return;

  const scriptPath = path.join(__dirname, daemon.script);
  console.log(`\x1b[1m[SUPERVISOR]\x1b[0m Spawning dedicated developer worker: ${daemon.color}${daemon.name}\x1b[0m (${daemon.script})`);

  const child = spawn(process.execPath, [scriptPath], {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  processes.set(daemon.name, child);

  child.on('exit', (code, signal) => {
    processes.delete(daemon.name);
    if (!isShuttingDown) {
      console.warn(`\x1b[31m[SUPERVISOR WARN]\x1b[0m ${daemon.name} exited with code ${code} (signal ${signal}). Auto-restarting in 3s...`);
      setTimeout(() => startDaemon(daemon), 3000);
    }
  });

  child.on('error', (err) => {
    console.error(`\x1b[31m[SUPERVISOR ERROR]\x1b[0m Failed to spawn ${daemon.name}:`, err.message);
  });
}

function handleShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n\x1b[1m[SUPERVISOR]\x1b[0m Gracefully terminating all partner daemons...');

  for (const [name, child] of processes.entries()) {
    console.log(`\x1b[1m[SUPERVISOR]\x1b[0m Stopping ${name}...`);
    try {
      child.kill('SIGTERM');
    } catch {}
  }

  setTimeout(() => {
    console.log('\x1b[1m[SUPERVISOR]\x1b[0m All daemons stopped.');
    process.exit(0);
  }, 1500);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
console.log('║           APHURA SOVEREIGN MULTI-PARTNER CONTINUOUS DAEMON SWARM            ║');
console.log('║  Liberty Center One + Together AI + Exa + Composio + LangChain + Cloudflare ║');
console.log('║                + Stripe + Deep Data Moats + Sovereign Master                 ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

// Check CLI args if running a single partner
const targetArg = process.argv.find((a) => a.startsWith('--partner='));
if (targetArg) {
  const query = targetArg.split('=')[1].toLowerCase();
  const matched = DAEMONS.find((d) => d.name.toLowerCase().includes(query) || d.script.includes(query));
  if (matched) {
    console.log(`\x1b[1m[SUPERVISOR]\x1b[0m Targeted single daemon mode: ${matched.name}\n`);
    startDaemon(matched);
  } else {
    console.error(`[SUPERVISOR] Unknown partner "${query}". Available: ${DAEMONS.map((d) => d.script).join(', ')}`);
    process.exit(1);
  }
} else {
  // Launch all daemons
  console.log(`\x1b[1m[SUPERVISOR]\x1b[0m Launching all ${DAEMONS.length} partner daemons in parallel...\n`);
  for (const daemon of DAEMONS) {
    startDaemon(daemon);
  }
}
