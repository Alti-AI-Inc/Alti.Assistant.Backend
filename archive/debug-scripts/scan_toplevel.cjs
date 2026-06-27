// Find all top-level (module-scope) client initializations that use env vars or config
// These crash at import time if the value is bad
const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory() && !f.includes('node_modules') && !f.startsWith('.')) {
        results = results.concat(walk(full));
      } else if ((f.endsWith('.js') || f.endsWith('.mjs')) && !f.includes('node_modules')) {
        results.push(full);
      }
    }
  } catch(e) {}
  return results;
}

const BASE = __dirname;
const risks = [];

// Patterns that indicate top-level client creation with a key/secret
const dangerPatterns = [
  /^(?:const|let|var)\s+\w+\s*=\s*\w*[Cc]reate\w*\s*\(/m,
  /^(?:const|let|var)\s+\w+\s*=\s*new\s+\w+\s*\(/m,
  /^(?:const|let|var)\s+\w+\s*=\s*\w+\s*\(\s*\{/m,
];

for (const file of walk(path.join(BASE, 'src'))) {
  const rel = path.relative(BASE, file);
  try {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      // Skip comments, imports, exports of functions/classes
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import') || trimmed.startsWith('export')) return;
      // Skip lines inside functions (rough heuristic: no leading spaces for module-level)
      if (line.startsWith('  ') || line.startsWith('\t')) return;
      
      // Check for top-level instantiation using env vars or config keys
      if (
        (trimmed.includes('process.env.') || trimmed.includes('config.') || trimmed.includes('apiKey') || trimmed.includes('api_key') || trimmed.includes('secret')) &&
        (trimmed.includes('new ') || trimmed.match(/=\s*\w+\(/) || trimmed.match(/=\s*create\w*\(/i)) &&
        (trimmed.startsWith('const ') || trimmed.startsWith('let ') || trimmed.startsWith('var '))
      ) {
        risks.push({ file: rel, line: i + 1, code: trimmed.substring(0, 120) });
      }
    });
  } catch(e) {}
}

if (risks.length === 0) {
  console.log('No risky top-level initializations found');
} else {
  risks.forEach(r => console.log(`${r.file}:${r.line}\n  ${r.code}\n`));
}
