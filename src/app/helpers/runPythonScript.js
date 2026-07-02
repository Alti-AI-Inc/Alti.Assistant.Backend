import { spawn, spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from '../../shared/logger.js';
import { getUserIdFromContext } from '../../shared/requestContext.js';
import { dockerWorkspaceService } from '../modules/docker/dockerWorkspace.service.js';

const SCRIPTS_BASE_DIR =
  'C:\\Users\\hyper\\.gemini\\config\\plugins\\science\\skills';

/**
 * Executes a python script from the science skills library safely inside a user's isolated Docker workspace.
 * Automatically falls back to local execution if the container layer is not initialized.
 *
 * @param {string} skillName - Name of the skill folder (e.g. 'clinical_trials_database')
 * @param {string} scriptName - Name of the python script file (e.g. 'clinical_trials_api.py')
 * @param {string[]} args - List of arguments to pass to the script
 * @param {number} timeoutMs - Timeout in milliseconds (default: 25000 to allow image warm-up)
 * @returns {Promise<any>} - Parsed JSON object from the script output, or null if failed
 */
export const runPythonScript = async (
  skillName,
  scriptName,
  args = [],
  timeoutMs = 25000
) => {
  const userId = getUserIdFromContext();
  const uniqueId = crypto.randomBytes(8).toString('hex');

  // 1. Get or create the workspace for context mapping
  const workspace = await dockerWorkspaceService.getOrCreateWorkspace(userId);

  // A. ISOLATED DOCKER CONTAINER EXECUTION PATHWAY
  if (workspace.mode === 'docker-isolated') {
    logger.info(
      `[DOCKER EXEC] Routing skill execution "${skillName}/${scriptName}" to sandbox for user: ${userId}`
    );

    // Map file storage dynamically through the mounted workspace
    const hostUserDir = path.resolve(`storage/users/${userId}/workspace`);
    if (!fs.existsSync(hostUserDir)) {
      fs.mkdirSync(hostUserDir, { recursive: true });
    }

    const hostOutputFile = path.join(hostUserDir, `output_${uniqueId}.json`);
    const containerOutputFile = `/workspace/output_${uniqueId}.json`;

    // Script path inside the container's read-only /skills mount
    const containerScriptPath = `/skills/${skillName}/scripts/${scriptName}`;
    const containerArgs = [
      'uv',
      'run',
      containerScriptPath,
      ...args,
      '--output',
      containerOutputFile,
    ];

    const result = await dockerWorkspaceService.executeCommand(
      userId,
      containerArgs,
      { timeoutMs }
    );

    if (result.code !== 0) {
      logger.error(
        `[DOCKER EXEC ERROR] Python script exited with code ${result.code}: ${scriptName}`
      );
      if (result.stderr.trim()) {
        logger.warn(`[DOCKER EXEC STDERR] ${result.stderr.trim()}`);
      }
      cleanupTempFile(hostOutputFile);
      return null;
    }

    // Parse the output file from host volume
    try {
      if (fs.existsSync(hostOutputFile)) {
        const fileContent = fs.readFileSync(hostOutputFile, 'utf8');
        const data = JSON.parse(fileContent);
        cleanupTempFile(hostOutputFile);
        return data;
      } else {
        logger.error(
          `[DOCKER EXEC] Output file was not created: ${hostOutputFile}`
        );
        // Fallback to stdout parsing
        try {
          const stdoutJson = JSON.parse(result.stdout.trim());
          return stdoutJson;
        } catch {
          return null;
        }
      }
    } catch (err) {
      logger.error(
        `[DOCKER EXEC ERROR] Error reading/parsing output: ${err.message}`
      );
      cleanupTempFile(hostOutputFile);
      return null;
    }
  }

  // B. LEGACY LOCAL SYSTEM FALLBACK PATHWAY (If Docker daemon is unavailable)
  logger.warn(
    `[DOCKER WARNING] Docker workspace not ready. Falling back to local execution for: ${scriptName}`
  );
  const scriptPath = path.join(
    SCRIPTS_BASE_DIR,
    skillName,
    'scripts',
    scriptName
  );

  const tempDir = path.join(process.cwd(), 'scratch');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const tempOutputFile = path.join(tempDir, `output_${uniqueId}.json`);

  const runner = resolvePythonRunner();
  if (!runner) {
    logger.error(
      `[PYTHON] No compatible Python runner available for ${scriptName} (tried uv/python3/python/py).`
    );
    cleanupTempFile(tempOutputFile);
    return null;
  }

  const finalArgs = runner.buildArgs(scriptPath, tempOutputFile, args);
  logger.info(
    `Running local Python subprocess: ${runner.command} ${finalArgs.join(' ')}`
  );

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(runner.command, finalArgs, {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONUNBUFFERED: '1', UV_NO_SYNC: '1' },
      });
    } catch (err) {
      logger.error(
        `Failed to start Python subprocess for ${scriptName}: ${err.message}`
      );
      cleanupTempFile(tempOutputFile);
      return resolve(null);
    }

    let stdoutData = '';
    let stderrData = '';
    let settled = false;

    const finalize = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };

    const timeout = setTimeout(() => {
      logger.error(
        `Python subprocess timeout reached: ${scriptName} (${timeoutMs}ms)`
      );
      child.kill('SIGTERM');
      finalize(null);
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    child.on('error', (err) => {
      logger.error(
        `Python subprocess spawn error for ${scriptName}: ${err.message}`
      );
      cleanupTempFile(tempOutputFile);
      finalize(null);
    });

    child.on('close', (code) => {
      if (stderrData.trim()) {
        logger.warn(`Python script stderr: ${stderrData.trim()}`);
      }

      if (code !== 0) {
        logger.error(
          `Python subprocess exited with non-zero code ${code}: ${scriptName}`
        );
        cleanupTempFile(tempOutputFile);
        return finalize(null);
      }

      try {
        if (fs.existsSync(tempOutputFile)) {
          const fileContent = fs.readFileSync(tempOutputFile, 'utf8');
          const data = JSON.parse(fileContent);
          cleanupTempFile(tempOutputFile);
          return finalize(data);
        } else {
          logger.error(`Python output file was not created: ${tempOutputFile}`);
          try {
            const stdoutJson = JSON.parse(stdoutData.trim());
            return finalize(stdoutJson);
          } catch {
            return finalize(null);
          }
        }
      } catch (err) {
        logger.error(
          `Error reading/parsing output of ${scriptName}: ${err.message}`
        );
        cleanupTempFile(tempOutputFile);
        return finalize(null);
      }
    });
  });
};

const resolvePythonRunner = () => {
  const uvCheck = spawnSync('uv', ['--version'], { stdio: 'ignore' });
  if (!uvCheck.error) {
    return {
      command: 'uv',
      buildArgs: (scriptPath, outputFile, args) => [
        'run',
        scriptPath,
        ...args,
        '--output',
        outputFile,
      ],
    };
  }

  const fallbackCommands = [
    {
      command: 'python3',
      args: ['--version'],
    },
    {
      command: 'python',
      args: ['--version'],
    },
    {
      command: 'py',
      args: ['-3', '--version'],
    },
  ];

  for (const candidate of fallbackCommands) {
    const check = spawnSync(candidate.command, candidate.args, {
      stdio: 'ignore',
    });
    if (!check.error) {
      return {
        command: candidate.command,
        buildArgs: (scriptPath, outputFile, args) => {
          if (candidate.command === 'py') {
            return ['-3', scriptPath, ...args, '--output', outputFile];
          }
          return [scriptPath, ...args, '--output', outputFile];
        },
      };
    }
  }

  return null;
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
