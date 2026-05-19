import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATALOG_PATH = path.join(__dirname, '../../../../output/gcp-license-catalog.json');
const ROOT_DIR = path.join(__dirname, '../../../../..');

/**
 * Searches the local scanned GCP license catalog for repositories.
 * Supports filtering by keyword, license type, programming language, and sorting.
 */
const searchGcpCatalog = async (query = '', options = {}) => {
  if (!fs.existsSync(CATALOG_PATH)) {
    return {
      success: false,
      message: 'GCP Repository Catalog has not been generated yet. Scanner is currently compiling it in the background.',
      results: []
    };
  }

  try {
    const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    let results = catalog;

    // Filter by keyword (searches name and description)
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(
        repo =>
          repo.name.toLowerCase().includes(lowerQuery) ||
          repo.description.toLowerCase().includes(lowerQuery)
      );
    }

    // Filter by License (MIT or Apache 2.0)
    if (options.license) {
      const lowerLicense = options.license.toLowerCase();
      results = results.filter(repo => repo.license.toLowerCase() === lowerLicense);
    }

    // Filter by Language
    if (options.language) {
      const lowerLang = options.language.toLowerCase();
      results = results.filter(
        repo => repo.language && repo.language.toLowerCase() === lowerLang
      );
    }

    // Sort by Stars (default) or Forks
    const sortBy = options.sortBy || 'stars';
    results.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

    // Pagination
    const limit = options.limit ? parseInt(options.limit) : 20;
    const page = options.page ? parseInt(options.page) : 1;
    const startIndex = (page - 1) * limit;
    const paginatedResults = results.slice(startIndex, startIndex + limit);

    return {
      success: true,
      total: results.length,
      page,
      limit,
      results: paginatedResults
    };
  } catch (err) {
    throw new Error(`Failed to read GCP catalog: ${err.message}`);
  }
};

/**
 * Programmatically triggers the Git submodule import command to register a GCP repo.
 */
const importGcpSubmodule = async (repoName) => {
  if (!repoName) {
    throw new Error('Repository name is required for import.');
  }

  const catalogResult = await searchGcpCatalog(repoName);
  if (!catalogResult.success || catalogResult.results.length === 0) {
    return {
      success: false,
      message: `Repository "${repoName}" was not found in the scanned GCP catalog.`
    };
  }

  // Exact match search
  const match = catalogResult.results.find(
    r => r.name.toLowerCase() === repoName.toLowerCase()
  );

  if (!match) {
    return {
      success: false,
      message: `Repository "${repoName}" did not match exactly.`,
      suggestions: catalogResult.results.map(r => r.name)
    };
  }

  const submodulePath = `external/gcp/${match.name}`;
  const localGcpPath = path.join(ROOT_DIR, 'external/gcp');

  return new Promise((resolve) => {
    if (!fs.existsSync(localGcpPath)) {
      fs.mkdirSync(localGcpPath, { recursive: true });
    }

    console.log(`Programmatic import: git submodule add ${match.clone_url} ${submodulePath}`);
    exec(
      `git submodule add ${match.clone_url} ${submodulePath}`,
      { cwd: ROOT_DIR },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            message: `Git command failed: ${error.message}`,
            details: stderr
          });
        } else {
          resolve({
            success: true,
            message: `Successfully imported GCP repository "${match.name}" as a submodule!`,
            path: submodulePath,
            clone_url: match.clone_url,
            output: stdout
          });
        }
      }
    );
  });
};

export const GcpNativeService = {
  searchGcpCatalog,
  importGcpSubmodule
};
