// Comprehensive audit: find ALL relative imports that resolve outside src/app/
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, 'src');
const APP = path.join(__dirname, 'src', 'app');

function walk(dir) {
  let results = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) results = results.concat(walk(full));
    else if (f.endsWith('.js') || f.endsWith('.mjs')) results.push(full);
  }
  return results;
}

const bad = [];
const importRe = /^\s*import\s+.*?from\s+['"](\.[^'"]+)['"]/gm;

for (const file of walk(APP)) {
  const content = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const imp = m[1];
    const resolved = path.resolve(path.dirname(file), imp);
    // Flag if it resolves OUTSIDE src/app (i.e. to src/ root or above)
    if (!resolved.startsWith(APP) && resolved.startsWith(BASE)) {
      const line = content.substring(0, m.index).split('\n').length;
      bad.push({
        file: path.relative(__dirname, file),
        line,
        import: imp,
        resolved: path.relative(__dirname, resolved)
      });
    }
  }
}

if (bad.length === 0) {
  console.log('ALL CLEAR - no imports escaping src/app/');
} else {
  console.log(`Found ${bad.length} broken import(s):\n`);
  bad.forEach(b => console.log(`  ${b.file}:${b.line}\n    "${b.import}"\n    => ${b.resolved}\n`));
}
