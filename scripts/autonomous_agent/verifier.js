import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execPromise = util.promisify(exec);

/**
 * Runs vitest on the backend codebase.
 * @returns {Promise<{success: boolean, output: string}>}
 */
export async function runTests() {
  const backendPath = path.resolve(__dirname, '../../');
  console.log(`Running tests in ${backendPath}...`);
  try {
    const { stdout, stderr } = await execPromise('npx vitest run --passWithNoTests', { cwd: backendPath });
    return {
      success: true,
      output: stdout,
    };
  } catch (error) {
    // If exit code > 0, it means tests failed
    console.warn('Tests failed!');
    return {
      success: false,
      output: error.stdout || error.stderr || error.message,
    };
  }
}

/**
 * Runs ESLint on a specific file.
 * @param {string} filePath - Path to the file.
 * @returns {Promise<{success: boolean, output: string}>}
 */
export async function runLinter(filePath) {
  const backendPath = path.resolve(__dirname, '../../');
  console.log(`Running linter on ${filePath}...`);
  try {
    const { stdout } = await execPromise(`npx eslint "${filePath}"`, { cwd: backendPath });
    return {
      success: true,
      output: stdout,
    };
  } catch (error) {
    console.warn(`Linter failed on ${filePath}`);
    return {
      success: false,
      output: error.stdout || error.stderr || error.message,
    };
  }
}
