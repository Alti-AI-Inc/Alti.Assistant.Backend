import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { logger } from '../../shared/logger.js';

const SCRIPTS_BASE_DIR = 'C:\\Users\\hyper\\.gemini\\config\\plugins\\science\\skills';

/**
 * Executes a python script from the science skills library safely.
 * 
 * @param {string} skillName - Name of the skill folder (e.g. 'clinical_trials_database')
 * @param {string} scriptName - Name of the python script file (e.g. 'clinical_trials_api.py')
 * @param {string[]} args - List of arguments to pass to the script
 * @param {number} timeoutMs - Timeout in milliseconds (default: 15000)
 * @returns {Promise<any>} - Parsed JSON object from the script output, or null if failed
 */
export const runPythonScript = async (skillName, scriptName, args = [], timeoutMs = 15000) => {
  const scriptPath = path.join(SCRIPTS_BASE_DIR, skillName, 'scripts', scriptName);
  
  // 1. Create a unique scratch file for output
  const tempDir = path.join(process.cwd(), 'scratch');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const tempOutputFile = path.join(tempDir, `output_${uniqueId}.json`);
  
  // 2. Add output argument
  const finalArgs = [scriptPath, ...args, '--output', tempOutputFile];
  
  logger.info(`Running Python subprocess: python -m uv run ${finalArgs.join(' ')}`);
  
  return new Promise((resolve) => {
    const child = spawn('python', ['-m', 'uv', 'run', ...finalArgs], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    
    let stdoutData = '';
    let stderrData = '';
    
    const timeout = setTimeout(() => {
      logger.error(`Python subprocess timeout reached: ${scriptName} (${timeoutMs}ms)`);
      child.kill('SIGTERM');
    }, timeoutMs);
    
    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    child.on('close', async (code) => {
      clearTimeout(timeout);
      
      if (stderrData.trim()) {
        logger.warn(`Python script stderr: ${stderrData.trim()}`);
      }
      
      if (code !== 0) {
        logger.error(`Python subprocess exited with non-zero code ${code}: ${scriptName}`);
        cleanupTempFile(tempOutputFile);
        return resolve(null);
      }
      
      // Parse the output file
      try {
        if (fs.existsSync(tempOutputFile)) {
          const fileContent = fs.readFileSync(tempOutputFile, 'utf8');
          const data = JSON.parse(fileContent);
          cleanupTempFile(tempOutputFile);
          return resolve(data);
        } else {
          logger.error(`Python output file was not created: ${tempOutputFile}`);
          // Try to fallback to stdout if it was printed directly
          try {
            const stdoutJson = JSON.parse(stdoutData.trim());
            return resolve(stdoutJson);
          } catch {
            return resolve(null);
          }
        }
      } catch (err) {
        logger.error(`Error reading/parsing output of ${scriptName}: ${err.message}`);
        cleanupTempFile(tempOutputFile);
        return resolve(null);
      }
    });
  });
};

const cleanupTempFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    logger.warn(`Failed to cleanup temp file ${filePath}: ${err.message}`);
  }
};
