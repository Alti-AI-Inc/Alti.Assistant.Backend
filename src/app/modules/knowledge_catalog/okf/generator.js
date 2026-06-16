import yaml from 'js-yaml';

/**
 * Format a concept document with frontmatter and body.
 *
 * @param {object} frontmatter - YAML frontmatter fields
 * @param {string} body - Markdown body
 * @returns {string} - Formatted file content
 */
export function generateOKFContent(frontmatter, body = '') {
  const yamlString = yaml.dump(frontmatter, { skipInvalid: true }).trim();
  return `---\n${yamlString}\n---\n\n${body.trim()}\n`;
}

/**
 * Generate an index.md file content for a directory.
 *
 * @param {string} title - Directory title
 * @param {string} description - Directory description
 * @param {Array<{id: string, title: string, type: string}>} items - Concepts/subdirectories under this directory
 * @returns {string} - File content of index.md
 */
export function generateIndexContent(title, description, items = []) {
  const frontmatter = {
    type: 'index',
    title,
    description,
    timestamp: new Date().toISOString()
  };

  let body = `# ${title}\n\n${description}\n\n## Contents\n\n`;
  if (items.length === 0) {
    body += '_Empty directory_\n';
  } else {
    items.forEach(item => {
      // Use relative paths for markdown links.
      const target = item.id.endsWith('.md') ? item.id : `${item.id}.md`;
      body += `- [${item.title || item.id}](${target}) - *${item.type || 'concept'}*\n`;
    });
  }

  return generateOKFContent(frontmatter, body);
}

/**
 * Generate a log.md file content.
 *
 * @param {string} title - Log title
 * @param {Array<{timestamp: string, event: string, user?: string, details?: string}>} entries - Change entries
 * @returns {string} - File content of log.md
 */
export function generateLogContent(title, entries = []) {
  const frontmatter = {
    type: 'log',
    title,
    timestamp: new Date().toISOString()
  };

  let body = `# ${title}\n\n## Change History\n\n`;
  if (entries.length === 0) {
    body += '_No changes recorded_\n';
  } else {
    // Sort entries newest first
    const sorted = [...entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    sorted.forEach(entry => {
      const dateStr = new Date(entry.timestamp).toISOString();
      body += `### ${dateStr} - ${entry.event}\n`;
      if (entry.user) {
        body += `* **Actor:** ${entry.user}\n`;
      }
      if (entry.details) {
        body += `\n${entry.details.trim()}\n\n`;
      }
      body += `---\n\n`;
    });
  }

  return generateOKFContent(frontmatter, body);
}

export default {
  generateOKFContent,
  generateIndexContent,
  generateLogContent
};
