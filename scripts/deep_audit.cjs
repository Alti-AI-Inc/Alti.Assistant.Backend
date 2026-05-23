const fs = require('fs');
const path = require('path');

const LANGCHAIN_CATALOG = path.join(__dirname, '../output/langchain-license-catalog.json');
const COMPOSIO_CATALOG  = path.join(__dirname, '../output/composio-license-catalog.json');
const ROOT_DIR          = path.join(__dirname, '../..');

// Recursively count files (not dirs) up to maxDepth
function countFiles(dir, depth = 0, maxDepth = 2) {
  if (depth > maxDepth) return 0;
  let count = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (e.isFile()) count++;
    else if (e.isDirectory()) count += countFiles(path.join(dir, e.name), depth + 1, maxDepth);
  }
  return count;
}

function hasGitDir(repoPath) {
  // Submodules have a .git FILE (not dir) pointing to the parent .git/modules/...
  const gitPath = path.join(repoPath, '.git');
  return fs.existsSync(gitPath);
}

function auditCatalog(catalogPath, folder, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`DEEP AUDIT: ${label}`);
  console.log('='.repeat(60));

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  let perfect = 0, noGit = 0, thin = 0, missing = 0;
  const issues = [];

  for (const repo of catalog) {
    const repoPath = path.join(ROOT_DIR, 'external', folder, repo.name);

    if (!fs.existsSync(repoPath)) {
      missing++;
      issues.push(`[MISSING]  ${repo.name}`);
      continue;
    }

    const git = hasGitDir(repoPath);
    const files = countFiles(repoPath, 0, 2);

    if (!git) {
      noGit++;
      issues.push(`[NO .git]  ${repo.name}  (${files} files found)`);
    } else if (files < 3) {
      thin++;
      issues.push(`[THIN]     ${repo.name}  (only ${files} files — may be uninitialized)`);
    } else {
      perfect++;
    }
  }

  const total = catalog.length;
  console.log(`Catalog entries : ${total}`);
  console.log(`✓ Fully healthy : ${perfect}`);
  console.log(`✗ Missing dirs  : ${missing}`);
  console.log(`✗ No .git ref   : ${noGit}`);
  console.log(`⚠ Very thin     : ${thin}`);

  if (issues.length === 0) {
    console.log('\n✓ ✓ ✓  PERFECT — every single repo is deeply entrenched!');
  } else {
    console.log('\nIssues:');
    issues.forEach(i => console.log(' ', i));
  }

  return { total, perfect, missing, noGit, thin };
}

function main() {
  const lc   = auditCatalog(LANGCHAIN_CATALOG, 'langchain', 'LangChain-AI  (144 repos)');
  const comp = auditCatalog(COMPOSIO_CATALOG,  'composio',  'ComposioHQ    (22 repos)');

  const totalProblems = lc.missing + lc.noGit + lc.thin + comp.missing + comp.noGit + comp.thin;

  console.log(`\n${'='.repeat(60)}`);
  console.log('FINAL VERDICT');
  console.log('='.repeat(60));
  console.log(`Total approved repos : ${lc.total + comp.total}`);
  console.log(`Total healthy        : ${lc.perfect + comp.perfect}`);
  console.log(`Total problems       : ${totalProblems}`);

  if (totalProblems === 0) {
    console.log('\n🎉 🎉 🎉  ALL 166 REPOSITORIES ARE 100% DEEPLY ENTRENCHED! 🎉 🎉 🎉');
  } else {
    console.log('\n⚠  Some repos need attention — see issues above.');
  }
  console.log('='.repeat(60));
}

main();
