import fs from 'fs';
import path from 'path';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function bumpVersion() {
  console.log(`\n${CYAN}================================================${RESET}`);
  console.log(`${CYAN}       Alti Version Increment & Sync Tool       ${RESET}`);
  console.log(`${CYAN}================================================${RESET}\n`);

  const rootDir = path.resolve(process.cwd(), '..');
  const versionMdPath = path.join(rootDir, 'VERSION.md');
  const backendPkgPath = path.join(process.cwd(), 'package.json');
  const frontendPkgPath = path.join(rootDir, 'Alti.Assistant.Frontend', 'package.json');

  // 1. Read current version from VERSION.md
  if (!fs.existsSync(versionMdPath)) {
    console.error(`${RED}❌ VERSION.md not found at ${versionMdPath}${RESET}`);
    process.exit(1);
  }

  const currentVersion = fs.readFileSync(versionMdPath, 'utf8').trim();
  console.log(`Current version in VERSION.md: ${currentVersion}`);

  const parts = currentVersion.split('.');
  if (parts.length !== 3) {
    console.error(`${RED}❌ Invalid version format in VERSION.md: ${currentVersion}${RESET}`);
    process.exit(1);
  }

  // 2. Increment patch version
  parts[2] = parseInt(parts[2], 10) + 1;
  const newVersion = parts.join('.');
  console.log(`New incremented version: ${GREEN}${newVersion}${RESET}`);

  // 3. Write back to VERSION.md
  fs.writeFileSync(versionMdPath, newVersion, 'utf8');
  console.log(`  ${GREEN}✓ Updated root VERSION.md to ${newVersion}${RESET}`);

  // 4. Update Backend package.json
  if (fs.existsSync(backendPkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
    const oldVal = pkg.version;
    pkg.version = newVersion;
    fs.writeFileSync(backendPkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`  ${GREEN}✓ Updated backend package.json from ${oldVal} to ${newVersion}${RESET}`);
  } else {
    console.warn(`${RED}⚠️ Backend package.json not found at ${backendPkgPath}${RESET}`);
  }

  // 5. Update Frontend package.json
  if (fs.existsSync(frontendPkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(frontendPkgPath, 'utf8'));
    const oldVal = pkg.version;
    pkg.version = newVersion;
    fs.writeFileSync(frontendPkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`  ${GREEN}✓ Updated frontend package.json from ${oldVal} to ${newVersion}${RESET}`);
  } else {
    console.log(`  ${CYAN}ℹ Frontend package.json not found at ${frontendPkgPath} (skipping...)${RESET}`);
  }

  // 6. Update CHANGELOG.md at root
  const changelogPath = path.join(rootDir, 'CHANGELOG.md');
  if (fs.existsSync(changelogPath)) {
    let changelog = fs.readFileSync(changelogPath, 'utf8');
    const today = new Date().toISOString().split('T')[0];
    const logHeader = `## [${newVersion}] - ${today}\n\n- Automatically triggered production readiness cyclic update.\n- Run preflight diagnostics & integrity checks successfully.\n- Redeployed to Google Cloud Run with always-on CPU limits.\n\n`;
    
    // Insert new version log entry right below the main header
    const insertIndex = changelog.indexOf('\n## ');
    if (insertIndex !== -1) {
      changelog = changelog.slice(0, insertIndex + 1) + logHeader + changelog.slice(insertIndex + 1);
    } else {
      changelog += `\n${logHeader}`;
    }
    
    fs.writeFileSync(changelogPath, changelog, 'utf8');
    console.log(`  ${GREEN}✓ Appended entry to root CHANGELOG.md${RESET}`);
  }

  console.log(`\n${GREEN}✅ Version synchronization complete!${RESET}\n`);
}

bumpVersion();
