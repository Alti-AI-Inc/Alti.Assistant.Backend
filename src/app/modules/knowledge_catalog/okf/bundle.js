import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import archiver from 'archiver';
import { parseOKFFile } from './parser.js';

/**
 * Scan a directory recursively and parse all OKF files into a bundle object.
 *
 * @param {string} bundleDir - Absolute path to the bundle directory
 * @returns {Promise<{ name: string, concepts: object, graph: { nodes: Array, edges: Array }, errors: Array, warnings: Array }>}
 */
export async function loadBundleFromDir(bundleDir) {
  const concepts = new Map();
  const errors = [];
  const warnings = [];

  const walk = async (dir, relativeDir = '') => {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = await fs.readFile(fullPath, 'utf8');
          const parsed = parseOKFFile(content, relPath);
          concepts.set(parsed.conceptId, parsed);

          if (parsed.errors.length > 0) {
            errors.push({ file: relPath, errors: parsed.errors });
          }
          if (parsed.warnings.length > 0) {
            warnings.push({ file: relPath, warnings: parsed.warnings });
          }
        } catch (err) {
          errors.push({ file: relPath, errors: [`Failed to read/parse: ${err.message}`] });
        }
      }
    }
  };

  await walk(bundleDir);

  // Build the graph
  const nodes = [];
  const edges = [];

  for (const [id, concept] of concepts.entries()) {
    if (concept.isIndex || concept.isLog) continue;

    nodes.push({
      id,
      title: concept.frontmatter.title || id,
      type: concept.frontmatter.type,
      tags: concept.frontmatter.tags || []
    });

    concept.links.forEach(linkTarget => {
      // Resolve link target relative to current concept's directory
      const dirOfConcept = path.dirname(concept.conceptId);
      
      let targetId = linkTarget;
      if (linkTarget.startsWith('./') || linkTarget.startsWith('../')) {
        targetId = path.normalize(path.join(dirOfConcept, linkTarget)).replace(/\\/g, '/');
      }

      // Check if target exists in concepts map (or target + "/index")
      let resolvedTarget = targetId;
      if (!concepts.has(resolvedTarget)) {
        if (concepts.has(`${resolvedTarget}/index`)) {
          resolvedTarget = `${resolvedTarget}/index`;
        }
      }

      edges.push({
        source: id,
        target: resolvedTarget,
        exists: concepts.has(resolvedTarget)
      });
    });
  }

  return {
    name: path.basename(bundleDir),
    concepts: Object.fromEntries(concepts),
    graph: { nodes, edges },
    errors,
    warnings
  };
}

/**
 * Zip an OKF bundle directory to a writable stream or file path.
 *
 * @param {string} bundleDir - Absolute path to the bundle directory
 * @param {string} outputPath - Path to write the output zip file to
 * @returns {Promise<void>}
 */
export function zipBundle(bundleDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(bundleDir, false);
    archive.finalize();
  });
}

export default {
  loadBundleFromDir,
  zipBundle
};
