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
    this.maxContainers = parseInt(process.env.DOCKER_MAX_CONTAINERS || '20', 10);
    this.concurrencyQueue = [];
    this.activeOperationsCount = 0;
    this.maxConcurrentOperations = parseInt(process.env.DOCKER_MAX_CONCURRENT_OPS || '3', 10);
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

      // 3. Ensure secure internal bridge network exists
      try {
        execSync('docker network inspect alti_sandbox_net', { stdio: 'ignore' });
      } catch {
        const isInternal = process.env.DOCKER_NETWORK_INTERNAL === 'true';
        logger.info(`[DOCKER] Creating secure sandbox network "alti_sandbox_net" (internal/offline: ${isInternal})...`);
        const internalFlag = isInternal ? '--internal' : '';
        execSync(`docker network create ${internalFlag} alti_sandbox_net`, { stdio: 'ignore' });
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
   * Performs LRU sandbox eviction if the total number of user containers exceeds the maximum limit.
   */
  async _reclaimContainerSlot(excludeUserId = null) {
    try {
      const containers = execSync(
        `docker ps -a --filter "name=alti_workspace_" --format "{{.Names}}"`,
        { encoding: 'utf8' }
      ).trim().split('\n').map(n => n.trim()).filter(Boolean);

      if (containers.length < this.maxContainers) {
        return; // Safe, under limit
      }

      logger.info(`[DOCKER LIMIT] Sandbox container ceiling reached (${containers.length}/${this.maxContainers}). Reclaiming slot...`);

      // 1. Evict any container not registered in activeSessions
      for (const name of containers) {
        const match = name.match(/^alti_workspace_(.+)$/);
        if (match) {
          const uId = match[1];
          if (uId === excludeUserId) continue;
          if (!this.activeSessions.has(uId)) {
            logger.info(`[DOCKER EVICT] Evicting unregistered/leaked container: ${name}`);
            await this.stopWorkspace(uId);
            return;
          }
        }
      }

      // 2. Evict the least recently active registered session
      let oldestUserId = null;
      let oldestTime = Infinity;

      for (const [uId, session] of this.activeSessions.entries()) {
        if (uId === excludeUserId) continue;
        const lastAct = session.lastActivity.getTime();
        if (lastAct < oldestTime) {
          oldestTime = lastAct;
          oldestUserId = uId;
        }
      }

      if (oldestUserId) {
        logger.info(`[DOCKER EVICT] Evicting LRU container for user ${oldestUserId} (inactive since ${new Date(oldestTime).toISOString()})`);
        await this.stopWorkspace(oldestUserId);
      } else {
        // 3. Fallback eviction if map is empty/unavailable
        for (const name of containers) {
          const match = name.match(/^alti_workspace_(.+)$/);
          if (match) {
            const uId = match[1];
            if (uId !== excludeUserId) {
              logger.info(`[DOCKER EVICT] Fallback evicting container: ${name}`);
              await this.stopWorkspace(uId);
              return;
            }
          }
        }
      }
    } catch (err) {
      logger.error(`[DOCKER EVICT ERROR] Failed to reclaim container slot: ${err.message}`);
    }
  }

  /**
   * Enqueues high-resource Docker operations to limit parallel concurrency and prevent host resource exhaustion.
   */
  async _enqueueDockerOperation(operationFn) {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this.activeOperationsCount++;
        try {
          const res = await operationFn();
          resolve(res);
        } catch (err) {
          reject(err);
        } finally {
          this.activeOperationsCount--;
          if (this.concurrencyQueue.length > 0) {
            const next = this.concurrencyQueue.shift();
            next();
          }
        }
      };

      if (this.activeOperationsCount < this.maxConcurrentOperations) {
        execute();
      } else {
        logger.info(`[DOCKER QUEUE] Queueing Docker operation due to concurrency limit (${this.activeOperationsCount}/${this.maxConcurrentOperations} active)`);
        this.concurrencyQueue.push(execute);
      }
    });
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

    return this._enqueueDockerOperation(async () => {
      // Reclaim slot if at or above container limit
      await this._reclaimContainerSlot(userId);

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
          // Connecting to secure internal network and setting up loopback database gateway support
          const createCmd = `docker run -d \
            --name ${containerName} \
            --network alti_sandbox_net \
            --add-host=host.docker.internal:host-gateway \
            --memory 512m \
            --cpus 1.0 \
            --pids-limit 100 \
            --cap-drop=ALL \
            --security-opt=no-new-privileges:true \
            --read-only \
            --tmpfs /tmp:rw,noexec,nosuid,size=64m \
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
    });
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
        '-u', 'sandbox',
        '-w', '/workspace',
        containerName,
        ...commandArgs
      ];

      const child = spawn('docker', execArgs);

      let stdout = '';
      let stderr = '';
      let aborted = false;
      let monitorInterval = null;

      const timer = setTimeout(() => {
        aborted = true;
        clearInterval(monitorInterval);
        logger.error(`[DOCKER TIMEOUT] Exec command expired inside ${containerName}`);
        child.kill('SIGTERM');
        // Force kill target container subprocess if unresponsive
        try {
          execSync(`docker exec ${containerName} pkill -u sandbox`);
        } catch (err) {
          logger.debug(`[DOCKER] Force-kill sandbox processes did not succeed or container is already stopped: ${err.message}`);
        }
      }, timeoutMs);

      // --- RESOURCE EXHAUSTION GUARD & OOM PREVENTION LOOP ---
      monitorInterval = setInterval(async () => {
        if (aborted) return;
        try {
          const metrics = await this.getWorkspaceMetrics(userId);
          if (metrics.connected && !aborted) {
            const cpu = parseFloat(String(metrics.cpuPercent || '0').replace('%', ''));
            const mem = parseFloat(String(metrics.memoryPercent || '0').replace('%', ''));

            if (mem > 90) {
              aborted = true;
              clearInterval(monitorInterval);
              clearTimeout(timer);
              logger.error(`[DOCKER RESOURCE CAP] Aborting execution inside ${containerName} due to Memory ceiling violation: ${mem}%`);
              
              child.kill('SIGKILL');
              try {
                execSync(`docker exec ${containerName} pkill -u sandbox`);
              } catch (err) {
                logger.debug(`[DOCKER] Failed to force-kill processes during resource cap abort: ${err.message}`);
              }
              
              resolve({
                code: 137, // Out-Of-Memory standard exit code
                stdout,
                stderr: `Execution Aborted: Sandbox memory limit exceeded (${mem}% >= 90%).`,
                mode: 'docker-isolated'
              });
            }
          }
        } catch (err) {
          logger.debug(`[DOCKER MONITOR] Error checking running container resource levels: ${err.message}`);
        }
      }, 3000);

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('close', (code) => {
        clearInterval(monitorInterval);
        clearTimeout(timer);
        if (!aborted) {
          resolve({
            code,
            stdout,
            stderr: stderr.includes('read-only') ? 'Access Denied: Root filesystem restrictions active.' : stderr,
            mode: 'docker-isolated'
          });
        }
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

  /**
   * Pre-warms the workspace for a user by creating it and placing it in a paused state.
   * This completely eliminates cold start latency during execution requests.
   */
  async prewarmWorkspace(userId) {
    if (!this.initialized) await this.initialize();
    if (!this.initialized) return;

    const containerName = `alti_workspace_${userId}`;
    return this._enqueueDockerOperation(async () => {
      // Reclaim slot if at or above container limit
      await this._reclaimContainerSlot(userId);

      try {
        const containerStatus = execSync(
          `docker inspect -f "{{.State.Status}}" ${containerName} 2>/dev/null || echo "none"`,
          { encoding: 'utf8' }
        ).trim();

        if (containerStatus === 'none') {
          logger.info(`[DOCKER PREWARM] Pre-warming new container for user: ${userId}`);
          const hostVolumePath = this._ensureHostUserDir(userId);
          const skillsBaseDir = 'C:\\Users\\hyper\\.gemini\\config\\plugins\\science\\skills';
          const mcpToolboxDir = path.resolve('mcp-toolbox');

          const createCmd = `docker run -d \
            --name ${containerName} \
            --network alti_sandbox_net \
            --add-host=host.docker.internal:host-gateway \
            --memory 512m \
            --cpus 1.0 \
            --pids-limit 100 \
            --cap-drop=ALL \
            --security-opt=no-new-privileges:true \
            --read-only \
            --tmpfs /tmp:rw,noexec,nosuid,size=64m \
            -v "${hostVolumePath}:/workspace" \
            -v "${skillsBaseDir}:/skills:ro" \
            -v "${mcpToolboxDir}:/mcp-toolbox:ro" \
            ${this.imageName} sleep infinity`;

          execSync(createCmd);
          execSync(`docker pause ${containerName}`);
          logger.info(`[SUCCESS] Pre-warmed container ${containerName} and placed in paused state.`);
        } else if (containerStatus === 'running') {
          logger.info(`[DOCKER PREWARM] Suspending active container ${containerName} to free host resources.`);
          execSync(`docker pause ${containerName}`);
        }
        this.activeSessions.set(userId, { lastActivity: new Date() });
      } catch (err) {
        logger.error(`[DOCKER PREWARM ERROR] Failed to pre-warm workspace: ${err.message}`);
      }
    });
  }

  /**
   * Scrapes real-time CPU, Memory, and I/O metrics for a user's isolated workspace container.
   */
  async getWorkspaceMetrics(userId) {
    if (!this.initialized) return { connected: false, userId };
    const containerName = `alti_workspace_${userId}`;

    try {
      const statsJson = execSync(
        `docker stats ${containerName} --no-stream --format "{{json .}}" 2>/dev/null || echo ""`,
        { encoding: 'utf8' }
      ).trim();

      if (!statsJson) {
        return { connected: false, userId };
      }

      const parsed = JSON.parse(statsJson);
      return {
        connected: true,
        userId,
        containerId: containerName,
        cpuPercent: parsed.CPUPerc,
        memoryUsage: parsed.MemUsage,
        memoryPercent: parsed.MemPerc,
        netIO: parsed.NetIO,
        blockIO: parsed.BlockIO,
        pids: parsed.PIDs
      };
    } catch (err) {
      return { connected: false, error: err.message, userId };
    }
  }

  /**
   * Scrapes metrics for all active workspaces.
   */
  async getAllActiveMetrics() {
    const list = [];
    for (const userId of this.activeSessions.keys()) {
      const metrics = await this.getWorkspaceMetrics(userId);
      list.push(metrics);
    }
    return list;
  }
}

export const dockerWorkspaceService = new DockerWorkspaceService();
