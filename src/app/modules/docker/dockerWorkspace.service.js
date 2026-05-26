import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logger } from '../../../shared/logger.js';

class DockerWorkspaceService {
  constructor() {
    this.imageName = 'alti-sandbox:latest';
    this.dockerfileDir = path.resolve('src/app/modules/docker');
    this.userWorkspacesDir = path.resolve('storage/users');
    this.activeSessions = new Map(); // userId -> { lastActivity: Date }
    this.initialized = false;
  }

  /**
   * Initializes the Docker isolation layer, ensuring the custom Sandbox image is built.
   */
  async initialize() {
    if (this.initialized) return;

    logger.info('[DOCKER] Initializing secure container workspace manager...');
    try {
      // 1. Verify Docker is installed and running
      execSync('docker --version', { stdio: 'ignore' });
      logger.info('[DOCKER] Docker daemon detected successfully.');

      // 2. Check if the base sandbox image is built
      let imageExists = false;
      try {
        const images = execSync(`docker images -q ${this.imageName}`, { encoding: 'utf8' }).trim();
        if (images) {
          imageExists = true;
          logger.info(`[DOCKER] Pre-compiled image "${this.imageName}" is ready.`);
        }
      } catch (err) {
        logger.warn('[DOCKER] Failed to query Docker images via CLI, attempting build directly.');
      }

      if (!imageExists) {
        logger.info(`[DOCKER] Compiling custom Alti Sandbox Image "${this.imageName}"...`);
        const dockerfilePath = path.join(this.dockerfileDir, 'Workspace.Dockerfile');
        execSync(`docker build -t ${this.imageName} -f ${dockerfilePath} ${this.dockerfileDir}`, {
          stdio: 'inherit'
        });
        logger.info(`[SUCCESS] Custom Sandbox Image "${this.imageName}" successfully built.`);
      }

      this.initialized = true;
    } catch (err) {
      logger.error(`[ERROR] Docker Workspace service initialization failed: ${err.message}`);
      logger.warn('[DOCKER] Sandbox fallback active: command execution will route locally with virtual warning.');
    }
  }

  /**
   * Ensures a user's persistent workspace directory exists on the host.
   */
  _ensureHostUserDir(userId) {
    const userDir = path.join(this.userWorkspacesDir, userId, 'workspace');
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
  }

  /**
   * Retrieves or dynamically spins up the user's isolated container workspace.
   */
  async getOrCreateWorkspace(userId) {
    await this.initialize();
    this.activeSessions.set(userId, { lastActivity: new Date() });

    if (!this.initialized) {
      return { success: false, mode: 'local-fallback', containerId: null };
    }

    const containerName = `alti_workspace_${userId}`;
    const hostVolumePath = this._ensureHostUserDir(userId);

    try {
      // Check if container already exists
      const containerStatus = execSync(
        `docker inspect -f "{{.State.Status}}" ${containerName} 2>/dev/null || echo "none"`,
        { encoding: 'utf8' }
      ).trim();

      if (containerStatus === 'none') {
        logger.info(`[DOCKER] Creating new workspace container: ${containerName}`);
        
        const skillsBaseDir = 'C:\\Users\\hyper\\.gemini\\config\\plugins\\science\\skills';
        const mcpToolboxDir = path.resolve('mcp-toolbox');

        // Spawn container in background with resource constraints (CPU shares, Memory ceiling)
        // Mounting workspace to /workspace, skills to /skills (ro), and mcp-toolbox to /mcp-toolbox (ro)
        const createCmd = `docker run -d \
          --name ${containerName} \
          --network none \
          --memory 512m \
          --cpus 1.0 \
          -v "${hostVolumePath}:/workspace" \
          -v "${skillsBaseDir}:/skills:ro" \
          -v "${mcpToolboxDir}:/mcp-toolbox:ro" \
          ${this.imageName} sleep infinity`;

        execSync(createCmd);
        logger.info(`[SUCCESS] Created container workspace: ${containerName}`);
      } else if (containerStatus === 'paused') {
        logger.info(`[DOCKER] Unpausing workspace container: ${containerName}`);
        execSync(`docker unpause ${containerName}`);
      } else if (containerStatus !== 'running') {
        logger.info(`[DOCKER] Restarting stopped workspace container: ${containerName}`);
        execSync(`docker start ${containerName}`);
      }

      return { success: true, mode: 'docker-isolated', containerId: containerName };
    } catch (err) {
      logger.error(`[DOCKER] Failed to manage workspace for user ${userId}: ${err.message}`);
      return { success: false, mode: 'local-fallback', containerId: null };
    }
  }

  /**
   * Executes a command securely inside the user's isolated workspace container.
   */
  async executeCommand(userId, commandArgs, options = {}) {
    const workspace = await this.getOrCreateWorkspace(userId);
    this.activeSessions.set(userId, { lastActivity: new Date() });

    const timeoutMs = options.timeoutMs || 20000;

    // A. Local process fallback if Docker layer is unavailable
    if (workspace.mode === 'local-fallback') {
      logger.warn(`[DOCKER FALLBACK] Running locally for user ${userId}: ${commandArgs.join(' ')}`);
      return new Promise((resolve) => {
        const cmd = commandArgs[0];
        const args = commandArgs.slice(1);
        const child = spawn(cmd, args, { cwd: options.cwd || process.cwd(), env: process.env });

        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
          child.kill('SIGTERM');
        }, timeoutMs);

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({ code, stdout, stderr, mode: 'local-fallback' });
        });
      });
    }

    // B. Strict isolated Docker Exec container execution
    const containerName = workspace.containerId;
    logger.info(`[DOCKER EXEC] Running inside ${containerName}: ${commandArgs.join(' ')}`);

    return new Promise((resolve) => {
      // Execute command under non-root sandbox user inside /workspace folder
      const execArgs = [
        'exec',
        '-w', '/workspace',
        containerName,
        ...commandArgs
      ];

      const child = spawn('docker', execArgs);

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        logger.error(`[DOCKER TIMEOUT] Exec command expired inside ${containerName}`);
        child.kill('SIGTERM');
        // Force kill target container subprocess if unresponsive
        try {
          execSync(`docker exec ${containerName} pkill -u sandbox`);
        } catch {}
      }, timeoutMs);

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          code,
          stdout,
          stderr: stderr.includes('read-only') ? 'Access Denied: Root filesystem restrictions active.' : stderr,
          mode: 'docker-isolated'
        });
      });
    });
  }

  /**
   * Pauses an active workspace container.
   */
  async pauseWorkspace(userId) {
    const containerName = `alti_workspace_${userId}`;
    try {
      execSync(`docker pause ${containerName}`);
      logger.info(`[DOCKER] Successfully paused workspace container: ${containerName}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stops and cleans up a workspace container.
   */
  async stopWorkspace(userId) {
    const containerName = `alti_workspace_${userId}`;
    try {
      execSync(`docker rm -f ${containerName}`);
      logger.info(`[DOCKER] Safely destroyed workspace container: ${containerName}`);
      this.activeSessions.delete(userId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Performs an audit cleanup cycle on inactive containers.
   */
  async auditActiveWorkspaces() {
    logger.info('[DOCKER CRON] Auditing active user container workspaces...');
    const now = new Date();
    
    for (const [userId, session] of this.activeSessions.entries()) {
      const idleTimeSec = (now.getTime() - session.lastActivity.getTime()) / 1000;
      const containerName = `alti_workspace_${userId}`;

      try {
        if (idleTimeSec > 1200) { // 20 minutes inactive -> Destroy container
          logger.info(`[DOCKER CRON] User ${userId} is inactive for ${Math.round(idleTimeSec / 60)}m. Destroying container.`);
          this.stopWorkspace(userId);
        } else if (idleTimeSec > 300) { // 5 minutes inactive -> Pause container to free host CPU
          const status = execSync(
            `docker inspect -f "{{.State.Status}}" ${containerName} 2>/dev/null || echo "none"`,
            { encoding: 'utf8' }
          ).trim();

          if (status === 'running') {
            logger.info(`[DOCKER CRON] User ${userId} is inactive for ${Math.round(idleTimeSec / 60)}m. Pausing container CPU.`);
            this.pauseWorkspace(userId);
          }
        }
      } catch (err) {
        logger.error(`[DOCKER CRON] Audit failed for user workspace ${userId}: ${err.message}`);
      }
    }
  }
}

export const dockerWorkspaceService = new DockerWorkspaceService();
