import fs from 'fs';
import path from 'path';
import os from 'os';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function runIntegritySelfTest() {
  console.log(`\n${CYAN}================================================${RESET}`);
  console.log(`${CYAN}   Alti Production Container Integrity Test    ${RESET}`);
  console.log(`${CYAN}================================================${RESET}\n`);

  let failed = false;

  // ── 1. FILE SYSTEM READ/WRITE ACCESSIBILITY ──────────────────────────────
  console.log(`${CYAN}[1/4] Checking file system write permissions...${RESET}`);
  const requiredDirs = ['uploads', 'logs', 'storage', 'output'];
  
  for (const dirName of requiredDirs) {
    const dirPath = path.join(process.cwd(), dirName);
    
    // Create directory if not exists
    if (!fs.existsSync(dirPath)) {
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`  ${GREEN}✓ Created directory: ${dirName}${RESET}`);
      } catch (err) {
        console.log(`  ${RED}❌ Failed to create directory ${dirName}: ${err.message}${RESET}`);
        failed = true;
        continue;
      }
    }

    // Write a temporary file to test accessibility
    const tempFile = path.join(dirPath, '.integrity_test_temp');
    try {
      fs.writeFileSync(tempFile, 'integrity_check', 'utf8');
      fs.unlinkSync(tempFile);
      console.log(`  ${GREEN}✓ Write & Delete permissions verified for: ${dirName}${RESET}`);
    } catch (err) {
      console.log(`  ${RED}❌ Write access denied in ${dirName}: ${err.message}${RESET}`);
      failed = true;
    }
  }

  // ── 2. SYSTEM RESOURCES & MEMORY BOUNDARY AUDIT ─────────────────────────
  console.log(`\n${CYAN}[2/4] Auditing memory and CPU resource boundaries...${RESET}`);
  try {
    const totalMemoryBytes = os.totalmem();
    const totalMemoryGB = (totalMemoryBytes / (1024 * 1024 * 1024)).toFixed(2);
    const freeMemoryGB = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    const cpuCount = os.cpus().length;

    console.log(`  System CPUs Available: ${cpuCount}`);
    console.log(`  Total System Memory  : ${totalMemoryGB} GB`);
    console.log(`  Free System Memory   : ${freeMemoryGB} GB`);

    // In production RAG/deep research workflows require at least 2GB of RAM
    if (parseFloat(totalMemoryGB) < 2.0) {
      console.log(`  ${RED}❌ Resource Warning: Container allocated under 2GB RAM (${totalMemoryGB}GB).${RESET}`);
      console.log(`     LlamaIndex indexing or heavy crawler workflows may crash with OOM!${RESET}`);
      failed = true;
    } else {
      console.log(`  ${GREEN}✓ RAM allocation boundaries look healthy.${RESET}`);
    }

    if (cpuCount < 2) {
      console.log(`  ${YELLOW}⚠️  CPU Allocation Warning: Single-core container detected. Concurrent agent operations may lag.${RESET}`);
    } else {
      console.log(`  ${GREEN}✓ CPU allocation looks healthy.${RESET}`);
    }
  } catch (err) {
    console.log(`  ${RED}❌ Resource boundary audit failed: ${err.message}${RESET}`);
    failed = true;
  }

  // ── 3. NODE_ENV & CRITICAL PATH SEED CHECKS ──────────────────────────────
  console.log(`\n${CYAN}[3/4] Validating runtime node configurations...${RESET}`);
  console.log(`  Active NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  
  if (process.env.NODE_ENV === 'production') {
    console.log(`  ${GREEN}✓ Server is running in production-optimized environment.${RESET}`);
  } else {
    console.log(`  ${YELLOW}⚠️  NODE_ENV is not set to production (Active: ${process.env.NODE_ENV || 'none'}).${RESET}`);
    console.log(`     Ensure this is updated before deployment to optimize performance limits.${RESET}`);
  }

  // Check passport config exists
  const passportConfigPath = path.join(process.cwd(), 'src/app/modules/social-login/config/passport.js');
  if (fs.existsSync(passportConfigPath)) {
    console.log(`  ${GREEN}✓ Passport configuration file located.${RESET}`);
  } else {
    console.log(`  ${RED}❌ Passport configuration file missing: ${passportConfigPath}${RESET}`);
    failed = true;
  }

  // ── 4. DEPLOY DEPENDENCY INTEGRITY CHECKS ────────────────────────────────
  console.log(`\n${CYAN}[4/4] Auditing Node dependency manifest files...${RESET}`);
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    const criticalDeps = ['@google-cloud/storage', '@google/genai', 'llamaindex', 'mongoose'];
    for (const dep of criticalDeps) {
      if (pkg.dependencies && pkg.dependencies[dep]) {
        console.log(`  ${GREEN}✓ Dependency registered: ${dep} (${pkg.dependencies[dep]})${RESET}`);
      } else {
        console.log(`  ${RED}❌ Critical dependency missing in package.json: ${dep}${RESET}`);
        failed = true;
      }
    }
  } catch (err) {
    console.log(`  ${RED}❌ Dependency audit failed: ${err.message}${RESET}`);
    failed = true;
  }

  console.log(`\n${CYAN}================================================${RESET}`);
  if (failed) {
    console.log(`${RED}❌ CONTAINER INTEGRITY SELF-TEST FAILED! Please resolve issues before launch.${RESET}`);
    process.exit(1);
  } else {
    console.log(`${GREEN}✅ ALL CONTAINER INTEGRITY SELF-TESTS PASSED SUCCESSFULLY!${RESET}`);
    process.exit(0);
  }
}

runIntegritySelfTest();
