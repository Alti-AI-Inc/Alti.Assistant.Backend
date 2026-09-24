import { logger } from '../../../shared/logger.js';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = util.promisify(exec);

/**
 * Aphura Autonomous Engineering Engine (formerly SWE-agent ACI)
 * Provides a custom Agent-Computer Interface (ACI) for the MoE Router
 * to natively debug, edit, and navigate codebases without hallucinating syntax.
 */
export const SWEService = {
  // Sandbox boundary for the agent
  workspaceRoot: process.env.SWE_WORKSPACE_ROOT || '/tmp/aphura-swe-workspace',

  async initWorkspace() {
    await fs.mkdir(this.workspaceRoot, { recursive: true });
  },

  async executeCommand(command) {
    logger.info(`[Aphura SWE-Engine] 💻 Executing: ${command}`);
    try {
      await this.initWorkspace();
      const { stdout, stderr } = await execAsync(command, { cwd: this.workspaceRoot, timeout: 30000 });
      return { success: true, output: stdout || stderr || 'Command executed with no output.' };
    } catch (error) {
      logger.warn(`[Aphura SWE-Engine] ⚠️ Execution failed: ${error.message}`);
      return { success: false, output: `Error: ${error.message}\\nStderr: ${error.stderr || ''}` };
    }
  },

  async editFile(targetFile, searchString, replacementString) {
    logger.info(`[Aphura SWE-Engine] 📝 Editing file: ${targetFile}`);
    try {
      const fullPath = path.join(this.workspaceRoot, targetFile);
      
      // Ensure they don't escape the sandbox
      if (!fullPath.startsWith(this.workspaceRoot)) throw new Error('Path traversal blocked.');
      
      let content = await fs.readFile(fullPath, 'utf8');
      if (!content.includes(searchString)) {
        return { success: false, output: 'Search string not found in file.' };
      }
      
      content = content.replace(searchString, replacementString);
      await fs.writeFile(fullPath, content, 'utf8');
      
      return { success: true, output: `File ${targetFile} successfully edited.` };
    } catch (error) {
      logger.warn(`[Aphura SWE-Engine] ⚠️ Edit failed: ${error.message}`);
      return { success: false, output: `Error: ${error.message}` };
    }
  },

  async viewFile(targetFile, startLine = 1, endLine = 100) {
    logger.info(`[Aphura SWE-Engine] 👁️ Viewing file: ${targetFile} (Lines ${startLine}-${endLine})`);
    try {
      const fullPath = path.join(this.workspaceRoot, targetFile);
      if (!fullPath.startsWith(this.workspaceRoot)) throw new Error('Path traversal blocked.');

      const content = await fs.readFile(fullPath, 'utf8');
      const lines = content.split('\n');
      const snippet = lines.slice(Math.max(0, startLine - 1), endLine).join('\n');
      
      return { success: true, output: snippet, totalLines: lines.length };
    } catch (error) {
      return { success: false, output: `Error: ${error.message}` };
    }
  }
};
