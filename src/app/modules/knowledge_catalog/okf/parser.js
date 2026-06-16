/**
 * Open Knowledge Format (OKF) v0.1 — Parser
 *
 * Parses OKF-compliant markdown files: YAML frontmatter + markdown body.
 * Validates required fields, extracts concept metadata, and resolves
 * inter-concept markdown links.
 *
 * @see https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
 */

import matter from 'gray-matter';
import path from 'path';

/**
 * Reserved filenames that have defined meaning in OKF and are NOT concept documents.
 */
export const RESERVED_FILENAMES = ['index.md', 'log.md'];

/**
 * Required frontmatter fields per OKF v0.1 spec §4.1.
 */
export const REQUIRED_FIELDS = ['type'];

/**
 * Recommended frontmatter fields per OKF v0.1 spec §4.1 (in priority order).
 */
export const RECOMMENDED_FIELDS = ['title', 'description', 'resource', 'tags', 'timestamp'];

/**
 * Parse a single OKF markdown file into a structured concept object.
 *
 * @param {string} content   — Raw UTF-8 content of the .md file
 * @param {string} filePath  — Path of the file relative to the bundle root (e.g. "tables/users.md")
 * @returns {{ conceptId: string, frontmatter: object, body: string, links: string[], isIndex: boolean, isLog: boolean, errors: string[], warnings: string[] }}
 */
export function parseOKFFile(content, filePath = '') {
  const errors = [];
  const warnings = [];

  // --- Parse frontmatter + body ------------------------------------------------
  let parsed;
  try {
    parsed = matter(content);
  } catch (err) {
    return {
      conceptId: deriveConceptId(filePath),
      frontmatter: {},
      body: content,
      links: [],
      isIndex: false,
      isLog: false,
      errors: [`Failed to parse frontmatter: ${err.message}`],
      warnings: [],
    };
  }

  const { data: frontmatter, content: body } = parsed;

  // --- Derive concept ID -------------------------------------------------------
  const conceptId = deriveConceptId(filePath);
  const basename = path.basename(filePath);
  const isIndex = basename === 'index.md';
  const isLog = basename === 'log.md';

  // --- Validate required fields ------------------------------------------------
  if (!isIndex && !isLog) {
    for (const field of REQUIRED_FIELDS) {
      if (!frontmatter[field]) {
        errors.push(`Missing required frontmatter field: "${field}"`);
      }
    }
  }

  // --- Check recommended fields ------------------------------------------------
  for (const field of RECOMMENDED_FIELDS) {
    if (!frontmatter[field] && !isIndex && !isLog) {
      warnings.push(`Missing recommended frontmatter field: "${field}"`);
    }
  }

  // --- Validate tags -----------------------------------------------------------
  if (frontmatter.tags && !Array.isArray(frontmatter.tags)) {
    errors.push('"tags" must be an array');
  }

  // --- Validate timestamp ------------------------------------------------------
  if (frontmatter.timestamp) {
    const ts = new Date(frontmatter.timestamp);
    if (isNaN(ts.getTime())) {
      errors.push(`"timestamp" is not a valid ISO 8601 date: "${frontmatter.timestamp}"`);
    }
  }

  // --- Extract inter-concept markdown links ------------------------------------
  const links = extractMarkdownLinks(body);

  return {
    conceptId,
    frontmatter,
    body,
    links,
    isIndex,
    isLog,
    errors,
    warnings,
  };
}

/**
 * Derive the concept ID from a file path per OKF v0.1 spec §2.
 * The concept ID is the file path with the `.md` suffix removed.
 *
 * @param {string} filePath — e.g. "tables/users.md"
 * @returns {string}        — e.g. "tables/users"
 */
export function deriveConceptId(filePath) {
  if (!filePath) return '';
  // Normalize to forward slashes and strip .md
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.replace(/\.md$/, '');
}

/**
 * Extract all relative markdown links from a body.
 * These represent inter-concept relationships in the knowledge graph.
 *
 * @param {string} body — Markdown body text
 * @returns {string[]}  — Array of link targets (relative paths, .md stripped)
 */
export function extractMarkdownLinks(body) {
  if (!body) return [];
  // Match [text](target) but exclude external URLs (http://, https://, mailto:)
  const linkRegex = /\[([^\]]*)\]\((?!https?:\/\/|mailto:)([^)]+)\)/g;
  const links = [];
  let match;
  while ((match = linkRegex.exec(body)) !== null) {
    const target = match[2].split('#')[0]; // strip fragment anchors
    if (target) {
      links.push(target.replace(/\.md$/, ''));
    }
  }
  return [...new Set(links)]; // deduplicate
}

/**
 * Validate a parsed concept for OKF compliance.
 *
 * @param {{ frontmatter: object, errors: string[] }} concept
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateConcept(concept) {
  return {
    valid: concept.errors.length === 0,
    errors: [...concept.errors],
    warnings: [...(concept.warnings || [])],
  };
}

export default {
  parseOKFFile,
  deriveConceptId,
  extractMarkdownLinks,
  validateConcept,
  RESERVED_FILENAMES,
  REQUIRED_FIELDS,
  RECOMMENDED_FIELDS,
};
