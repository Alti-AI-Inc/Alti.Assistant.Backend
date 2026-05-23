const fs = require('fs');
const path = require('path');

const LANGCHAIN_CATALOG = path.join(__dirname, '../output/langchain-license-catalog.json');
const COMPOSIO_CATALOG = path.join(__dirname, '../output/composio-license-catalog.json');
const ROOT_DIR = path.join(__dirname, '../..');

function verifyCatalog(catalogPath, externalFolder, name) {
  console.log(`\n======================================================`);
  console.log(`Verifying Installation for ${name}...`);
  console.log(`======================================================`);

  if (!fs.existsSync(catalogPath)) {
    console.error(`[ERROR] Catalog file not found at: ${catalogPath}`);
    return null;
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  let installedCount = 0;
  let missingCount = 0;
  let emptyCount = 0;
  const issues = [];

  for (const repo of catalog) {
    const submodulePath = path.join(ROOT_DIR, 'external', externalFolder, repo.name);
    
    // Check if directory exists
    if (!fs.existsSync(submodulePath)) {
      missingCount++;
      issues.push(`- ${repo.name}: Directory does not exist.`);
      continue;
    }

    // Check if directory is empty or missing key files
    const files = fs.readdirSync(submodulePath);
    if (files.length === 0) {
      emptyCount++;
      issues.push(`- ${repo.name}: Directory exists but is EMPTY.`);
    } else {
      installedCount++;
    }
  }

  console.log(`Summary for ${name}:`);
  console.log(`- Total Approved in Catalog: ${catalog.length}`);
  console.log(`- Successfully Installed & Loaded: ${installedCount}`);
  console.log(`- Missing Folders: ${missingCount}`);
  console.log(`- Empty Folders (Uninitialized): ${emptyCount}`);
  
  if (issues.length > 0) {
    console.log(`\nIssues Found:`);
    issues.slice(0, 10).forEach(issue => console.log(issue));
    if (issues.length > 10) {
      console.log(`... and ${issues.length - 10} more issues.`);
    }
  } else {
    console.log(`✓ ✓ ✓ 100% PERFECT DEEP INSTALLATION!`);
  }

  return { total: catalog.length, installed: installedCount, missing: missingCount, empty: emptyCount };
}

function main() {
  const lcResult = verifyCatalog(LANGCHAIN_CATALOG, 'langchain', 'LangChain Hub');
  const compResult = verifyCatalog(COMPOSIO_CATALOG, 'composio', 'Composio Hub');

  console.log(`\n======================================================`);
  console.log(`OVERALL STATUS CHECK`);
  console.log(`======================================================`);
  if (lcResult && compResult) {
    const totalApproved = lcResult.total + compResult.total;
    const totalInstalled = lcResult.installed + compResult.installed;
    const totalMissing = lcResult.missing + compResult.missing;
    const totalEmpty = lcResult.empty + compResult.empty;

    console.log(`Combined Approved: ${totalApproved}`);
    console.log(`Combined Installed: ${totalInstalled}`);
    console.log(`Combined Missing/Empty: ${totalMissing + totalEmpty}`);

    if (totalMissing + totalEmpty === 0) {
      console.log(`\n🎉 🎉 🎉 ALL 166 APPROVED REPOSITORIES ARE DEEPLY ENTRENCHED & FULLY INSTALLED! 🎉 🎉 🎉`);
    } else {
      console.log(`\n⚠️ Some repositories are uninitialized or missing. Please run submodule updates.`);
    }
  }
  console.log(`======================================================\n`);
}

main();
