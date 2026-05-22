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

// ── Automated DNS SRV Fallback for MongoDB Atlas ────────────────────────────
// In some networks or ISP environments, resolving MongoDB SRV records fails.
// We try resolving the Atlas host, and if it fails, fallback to Google DNS.
const dns = require('dns');

function checkDnsResolution() {
  const host = 'cluster0.piwgo1l.mongodb.net';
  dns.resolveSrv('_mongodb._tcp.' + host, (err) => {
    if (err) {
      console.warn(`[preload] DNS SRV resolution failed for ${host}: ${err.message}. Applying Google DNS fallback...`);
      try {
        dns.setServers(['8.8.8.8', '8.8.4.4']);
        console.log('[preload] Successfully configured Google DNS fallback servers.');
      } catch (dnsErr) {
        console.error('[preload] Failed to set fallback DNS servers:', dnsErr.message);
      }
    } else {
      console.log(`[preload] DNS SRV resolution for ${host} is healthy.`);
    }
  });
}

// Run the check asynchronously at startup
checkDnsResolution();

