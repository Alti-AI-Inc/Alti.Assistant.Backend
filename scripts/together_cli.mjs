#!/usr/bin/env node
/**
 * Together AI / Aphura Sovereign Command-Line Interface (CLI)
 * Direct executable matching official `together` and `tg` binary behaviors across all 13 reference domains.
 * 
 * Usage:
 *   node scripts/together_cli.mjs --help
 *   node scripts/together_cli.mjs models list
 *   node scripts/together_cli.mjs telemetry status
 *   node scripts/together_cli.mjs whoami
 *   node scripts/together_cli.mjs beta clusters list
 *   node scripts/together_cli.mjs beta jig init
 * 
 * License: MIT
 */

import { executeTogetherCliCommand } from '../src/app/services/together.cli.js';

async function main() {
  const args = process.argv.slice(2);
  const result = await executeTogetherCliCommand(args.length > 0 ? args : ['--help']);

  if (result.success) {
    console.log(result.output);
    process.exit(0);
  } else {
    console.error(result.output || result.error);
    process.exit(result.code || 1);
  }
}

main().catch(err => {
  console.error('Fatal CLI Error:', err.message);
  process.exit(1);
});
