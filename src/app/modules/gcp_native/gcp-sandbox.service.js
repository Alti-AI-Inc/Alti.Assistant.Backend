import { Client } from 'ssh2';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';

const basePath = config.sandbox?.basePath || '/workspace/tenants';
const dockerImage = process.env.SANDBOX_DOCKER_IMAGE || 'python:3.10-slim';

/**
 * Establishes an SSH connection using the configured credentials.
 * @returns {Promise<Client>} A promise resolving to the connected SSH Client.
 */
const connectSsh = () => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      resolve(conn);
    }).on('error', (err) => {
      reject(err);
    }).connect({
      host: config.sandbox.host,
      port: config.sandbox.port || 22,
      username: config.sandbox.username || 'sandbox',
      privateKey: config.sandbox.privateKey,
    });
  });
};

/**
 * Promisified execution of an SSH command on a client connection.
 * @param {Client} sshClient - Active SSH Client connection.
 * @param {string} cmd - Command string to execute.
 * @returns {Promise<{code: number, stdout: string, stderr: string}>} Result of command.
 */
const runSshCommand = (sshClient, cmd) => {
  return new Promise((resolve, reject) => {
    sshClient.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code, signal) => {
        resolve({ code, stdout, stderr });
      }).on('data', (data) => {
        stdout += data.toString();
      }).stderr.on('data', (data) => {
        stderr += data.toString();
      });
    });
  });
};

/**
 * Promisified SFTP wrapper.
 * @param {Client} sshClient - Active SSH Client connection.
 * @returns {Promise<object>} Promisified SFTP wrapper.
 */
const getSftp = (sshClient) => {
  return new Promise((resolve, reject) => {
    sshClient.sftp((err, sftp) => {
      if (err) reject(err);
      else resolve(sftp);
    });
  });
};

const sftpWriteFile = (sftp, remotePath, content) => {
  return new Promise((resolve, reject) => {
    sftp.writeFile(remotePath, content, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const sftpReadFile = (sftp, remotePath) => {
  return new Promise((resolve, reject) => {
    sftp.readFile(remotePath, (err, buffer) => {
      if (err) reject(err);
      else resolve(buffer);
    });
  });
};

const sftpReaddir = (sftp, remotePath) => {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) reject(err);
      else resolve(list);
    });
  });
};

/**
 * Executes a bash command inside a containerized sandbox inside the GCP VM.
 * Falls back to local execution if sandbox.enabled is false (for testing/development).
 *
 * @param {string} tenantId - Tenant workspace identifier.
 * @param {string} command - Shell command to execute.
 * @returns {Promise<{success: boolean, stdout: string, stderr: string, code: number}>} Execution result.
 */
const executeCommand = async (tenantId, command) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant ID is required for sandbox operations');
  }

  if (!config.sandbox.enabled) {
    logger.warn(`GCP Sandbox is disabled. Executing command locally for tenant ${tenantId}.`);
    return new Promise((resolve) => {
      exec(command, { cwd: path.resolve(`storage/users/${tenantId}/workspace`) }, (err, stdout, stderr) => {
        resolve({
          success: !err,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          code: err ? err.code || 1 : 0,
        });
      });
    });
  }

  let client;
  const requestId = Math.random().toString(36).substring(7);
  const scriptName = `.run_${requestId}.sh`;
  const remoteTenantDir = `${basePath}/${tenantId}`;
  const remoteScriptPath = `${remoteTenantDir}/${scriptName}`;

  try {
    client = await connectSsh();
    
    // Ensure tenant directory exists on the VM
    await runSshCommand(client, `mkdir -p "${remoteTenantDir}"`);

    // Write command script via SFTP
    const sftp = await getSftp(client);
    await sftpWriteFile(sftp, remoteScriptPath, command);

    // Run the shell script inside the Docker container
    // We mount the tenant's workspace folder onto /app inside the container
    const dockerCmd = `docker run --rm -v "${remoteTenantDir}":/app -w /app ${dockerImage} bash "${scriptName}"`;
    const result = await runSshCommand(client, dockerCmd);

    // Cleanup the script file
    await runSshCommand(client, `rm -f "${remoteScriptPath}"`);

    return {
      success: result.code === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code,
    };
  } catch (err) {
    logger.error('GCP Sandbox: Command execution failed', {
      tenantId,
      error: err.message,
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Sandbox Execution Error: ${err.message}`);
  } finally {
    if (client) client.end();
  }
};

/**
 * Writes content to a file inside the tenant's sandbox workspace.
 *
 * @param {string} tenantId - Tenant workspace identifier.
 * @param {string} filePath - Target file path relative to workspace root.
 * @param {string|Buffer} content - Content to write.
 * @returns {Promise<void>}
 */
const writeFile = async (tenantId, filePath, content) => {
  if (!tenantId || !filePath) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant ID and File Path are required');
  }

  if (!config.sandbox.enabled) {
    const localPath = path.resolve(`storage/users/${tenantId}/workspace`, filePath);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, content);
    return;
  }

  let client;
  const remoteTenantDir = `${basePath}/${tenantId}`;
  const remoteFilePath = `${remoteTenantDir}/${filePath}`;

  try {
    client = await connectSsh();

    // Ensure parent directories exist
    const remoteParentDir = path.dirname(remoteFilePath).replace(/\\/g, '/');
    await runSshCommand(client, `mkdir -p "${remoteParentDir}"`);

    const sftp = await getSftp(client);
    await sftpWriteFile(sftp, remoteFilePath, content);
  } catch (err) {
    logger.error('GCP Sandbox: SFTP writeFile failed', {
      tenantId,
      filePath,
      error: err.message,
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Sandbox File Write Error: ${err.message}`);
  } finally {
    if (client) client.end();
  }
};

/**
 * Reads a file's content from the tenant's sandbox workspace.
 *
 * @param {string} tenantId - Tenant workspace identifier.
 * @param {string} filePath - Source file path relative to workspace root.
 * @returns {Promise<string>} Content of the file.
 */
const readFile = async (tenantId, filePath) => {
  if (!tenantId || !filePath) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant ID and File Path are required');
  }

  if (!config.sandbox.enabled) {
    const localPath = path.resolve(`storage/users/${tenantId}/workspace`, filePath);
    if (!fs.existsSync(localPath)) {
      throw new ApiError(httpStatus.NOT_FOUND, 'File not found locally');
    }
    return fs.readFileSync(localPath, 'utf-8');
  }

  let client;
  const remoteFilePath = `${basePath}/${tenantId}/${filePath}`;

  try {
    client = await connectSsh();
    const sftp = await getSftp(client);
    const buffer = await sftpReadFile(sftp, remoteFilePath);
    return buffer.toString('utf-8');
  } catch (err) {
    logger.error('GCP Sandbox: SFTP readFile failed', {
      tenantId,
      filePath,
      error: err.message,
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Sandbox File Read Error: ${err.message}`);
  } finally {
    if (client) client.end();
  }
};

/**
 * Lists the contents of a directory in the tenant's sandbox workspace.
 *
 * @param {string} tenantId - Tenant workspace identifier.
 * @param {string} dirPath - Directory path relative to workspace root.
 * @returns {Promise<string[]>} List of file and directory names.
 */
const listDirectory = async (tenantId, dirPath = '') => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant ID is required');
  }

  if (!config.sandbox.enabled) {
    const localDir = path.resolve(`storage/users/${tenantId}/workspace`, dirPath);
    if (!fs.existsSync(localDir)) {
      return [];
    }
    return fs.readdirSync(localDir);
  }

  let client;
  const remoteDirPath = `${basePath}/${tenantId}/${dirPath}`.replace(/\/$/, '');

  try {
    client = await connectSsh();
    const sftp = await getSftp(client);
    const list = await sftpReaddir(sftp, remoteDirPath);
    return list.map(item => item.filename);
  } catch (err) {
    logger.error('GCP Sandbox: SFTP listDirectory failed', {
      tenantId,
      dirPath,
      error: err.message,
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Sandbox Directory List Error: ${err.message}`);
  } finally {
    if (client) client.end();
  }
};

export const gcpSandboxService = {
  executeCommand,
  writeFile,
  readFile,
  listDirectory,
};
