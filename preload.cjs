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
