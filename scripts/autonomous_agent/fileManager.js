import fs from 'fs/promises';
import path from 'path';

/**
 * Reads a file from the file system.
 * @param {string} filePath - Path to the file.
 * @returns {Promise<string>} File content.
 */
export async function readFileContent(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error(`Failed to read file: ${filePath}`, error);
    throw error;
  }
}

/**
 * Writes content to a file.
 * @param {string} filePath - Path to the file.
 * @param {string} content - New content for the file.
 */
export async function writeFileContent(filePath, content) {
  try {
    // Ensure directory exists
    const dirname = path.dirname(filePath);
    await fs.mkdir(dirname, { recursive: true });
    
    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`Successfully updated: ${filePath}`);
  } catch (error) {
    console.error(`Failed to write file: ${filePath}`, error);
    throw error;
  }
}

/**
 * Gets a list of all JS files in a directory recursively.
 * @param {string} dirPath - Directory path to scan.
 * @returns {Promise<string[]>} Array of file paths.
 */
export async function getAllJSFiles(dirPath) {
  let results = [];
  try {
    const list = await fs.readdir(dirPath, { withFileTypes: true });
    for (const item of list) {
      const fullPath = path.resolve(dirPath, item.name);
      if (item.isDirectory()) {
        results = results.concat(await getAllJSFiles(fullPath));
      } else if (item.isFile() && fullPath.endsWith('.js')) {
        results.push(fullPath);
      }
    }
    return results;
  } catch (error) {
    console.error(`Failed to read directory: ${dirPath}`, error);
    return results;
  }
}
