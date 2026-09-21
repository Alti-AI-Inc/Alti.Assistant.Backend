// preload.cjs — runs before ANY ES module is evaluated
// Strips Unicode BOM (\uFEFF) from process.env values that may contain leading BOM characters.
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
// We configure Cloudflare DNS servers synchronously before any mongoose connections are initiated.
const dns = require('dns');
try {
  dns.setServers(['1.1.1.1', '1.0.0.1']);
  console.log('[preload] Configured Cloudflare DNS servers synchronously for MongoDB resolution.');
} catch (dnsErr) {
  console.error('[preload] Failed to set fallback DNS servers:', dnsErr.message);
}

 
// Polyfill for SlowBuffer which was removed in Node.js 26 to fix mongoose-encryption
const buffer = require('buffer');
if (!buffer.SlowBuffer) {
  buffer.SlowBuffer = buffer.Buffer;
}
