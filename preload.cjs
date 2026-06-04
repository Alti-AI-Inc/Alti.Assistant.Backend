// preload.cjs — runs before ANY ES module is evaluated
// Strips Unicode BOM (\uFEFF) from all process.env values injected by
// GCP Secret Manager via PowerShell pipes, which prepend a BOM character.
const BOM = '\uFEFF';
let stripped = 0;
for (const key of Object.keys(process.env)) {
  if (process.env[key] && process.env[key].charCodeAt(0) === 0xFEFF) {
    process.env[key] = process.env[key].replace(/^\uFEFF+/, '');
    stripped++;
  }
}
if (stripped > 0) {
  console.log(`[preload] Stripped BOM from ${stripped} environment variable(s)`);
}

// ── Configure DNS Servers Synchronously for MongoDB Atlas ───────────────────
// In some networks or ISP environments, resolving MongoDB SRV records fails.
// We configure Google DNS servers synchronously before any mongoose connections are initiated.
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
  console.log('[preload] Configured Google DNS servers synchronously for MongoDB resolution.');
} catch (dnsErr) {
  console.error('[preload] Failed to set fallback DNS servers:', dnsErr.message);
}

