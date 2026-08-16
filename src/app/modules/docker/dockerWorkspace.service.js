import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from '../../../shared/logger.js';

/**
 * @class DockerWorkspaceService
 * @description Manages the lifecycle of isolated Docker container workspaces for users.
 * This service handles building the custom sandbox image, creating/managing a secure network,
 * spinning up/down user containers, executing commands within them, and monitoring resource usage.
 * It implements concurrency limits and an LRU eviction strategy to manage host resources.
 */
class DockerWorkspaceService {
  /**
   * @constructor
   * @description Initializes the DockerWorkspaceService with configuration for image names,
   * directory paths, and operational limits.
   */
  constructor() {
    /**
     * @property {string} imageName - The name of the custom Docker image used for sandbox environments.
     */
    this.imageName = 'inso-sandbox:latest';
    /**
     * @property {string} dockerfileDir - The absolute path to the directory containing the Dockerfile for the sandbox image.
     */
    this.dockerfileDir = path.resolve('src/app/modules/docker');
    /**
     * @property {string} userWorkspacesDir - The absolute path to the base directory where user-specific workspace volumes are stored on the host.
     */
    this.userWorkspacesDir = path.resolve('storage/users');
    /**
     * @property {Map<string, { lastActivity: Date }>} activeSessions - A map to track active user sessions.
     * Keys are uniqueSessionIds (e.g., `userId_isolationId`), values are objects containing `lastActivity` timestamp.
     */
    this.activeSessions = new Map(); // uniqueSessionId (e.g., userId_isolationId) -> { lastActivity: Date }
    /**
     * @property {boolean} initialized - Flag indicating whether the Docker service has completed its initialization process.
     */
    this.initialized = false;
    /**
     * @property {number} maxContainers - The maximum number of Docker containers allowed to run concurrently.
     * Configurable via `DOCKER_MAX_CONTAINERS` environment variable.
     */
    this.maxContainers = parseInt(
      process.env.DOCKER_MAX_CONTAINERS || '20',
      10
    );
    /**
     * @property {Array<Function>} concurrencyQueue - A queue for Docker operations that exceed the `maxConcurrentOperations` limit.
     */
    this.concurrencyQueue = [];
    /**
     * @property {number} activeOperationsCount - The current number of Docker operations actively being processed.
     */
    this.activeOperationsCount = 0;
    /**
     * @property {number} maxConcurrentOperations - The maximum number of Docker operations that can run in parallel.
     * Configurable via `DOCKER_MAX_CONCURRENT_OPS` environment variable.
     */
    this.maxConcurrentOperations = parseInt(
      process.env.DOCKER_MAX_CONCURRENT_OPS || '3',
      10
    );
  }

  /**
   * Sanitizes an identifier (userId, isolationId, projectId) to prevent command injection and path traversal.
   * Allows alphanumeric characters, hyphens, and underscores.
   * @param {string} input The identifier to sanitize.
   * @returns {string} The sanitized identifier.
   */
  _sanitizeIdentifier(input) {
    return String(input).replace(/[^a-zA-Z0-9_-]/g, '');
  }

  /**
   * Initializes the Docker isolation layer, ensuring the custom Sandbox image is built
   * and a secure internal bridge network is configured. This method is idempotent.
   * @async
   * @returns {Promise<void>} A promise that resolves when initialization is complete, or rejects on failure.
   */
  async initialize() {
    if (this.initialized) return;

    logger.info('[DOCKER] Initializing secure container workspace manager...');
    try {
      // 1. Verify Docker CLI is installed
      execSync('docker --version', { stdio: 'ignore' });
      // 2. Verify Docker daemon is reachable (important on Windows named pipe setups)
      execSync('docker info', { stdio: 'ignore' });
      logger.info('[DOCKER] Docker daemon detected successfully.');

      // 3. Check if the base sandbox image is built
      let imageExists = false;
      try {
        const images = execSync(`docker images -q ${this.imageName}`, {
          encoding: 'utf8',
        }).trim();
        if (images) {
          imageExists = true;
          logger.info(
            `[DOCKER] Pre-compiled image "${this.imageName}" is ready.`
          );
        }
      } catch (err) {
        logger.warn(
          '[DOCKER] Failed to query Docker images via CLI, attempting build directly.'
        );
      }

      if (!imageExists) {
        logger.info(
          `[DOCKER] Compiling custom Inso AI Sandbox Image "${this.imageName}"...`
        );
        const dockerfilePath = path.join(
          this.dockerfileDir,
          'Workspace.Dockerfile'
        );
        execSync(
          `docker build -t ${this.imageName} -f ${dockerfilePath} ${this.dockerfileDir}`,
          {
            stdio: 'inherit',
          }
        );
        logger.info(
          `[SUCCESS] Custom Sandbox Image "${this.imageName}" successfully built.`
        );
      }

      // 4. Ensure secure internal bridge network exists with ICC disabled
      let networkNeedsRecreation = false;
      try {
        const netInspect = execSync(
          'docker network inspect inso_sandbox_net --format "{{json .Options}}"',
          { encoding: 'utf8' }
        );
        const options = JSON.parse(netInspect);
        if (options['com.docker.network.bridge.enable_icc'] !== 'false') {
          networkNeedsRecreation = true;
          logger.info(
            '[DOCKER] Existing sandbox network has ICC enabled. Recreating for secure isolation...'
          );
          execSync('docker network rm inso_sandbox_net', { stdio: 'ignore' });
        }
      } catch {
        networkNeedsRecreation = true;
      }

      if (networkNeedsRecreation) {
        const isInternal = process.env.DOCKER_NETWORK_INTERNAL === 'true';
        logger.info(
          `[DOCKER] Creating secure sandbox network "inso_sandbox_net" (internal/offline: ${isInternal}, ICC: false)...`
        );
        const internalFlag = isInternal ? '--internal' : '';
        execSync(
          `docker network create -o com.docker.network.bridge.enable_icc=false ${internalFlag} inso_sandbox_net`,
          { stdio: 'ignore' }
        );
      }

      this.initialized = true;
    } catch (err) {
      const message = err?.message || String(err);
      const daemonUnavailable =
        /dockerdesktoplinuxengine|is the docker daemon running|error during connect|cannot connect to the docker daemon/i.test(
          message
        );
      if (daemonUnavailable) {
        logger.warn(
          `[DOCKER] Docker daemon unavailable. Using local fallback mode. Details: ${message}`
        );
      } else {
        logger.error(
          `[ERROR] Docker Workspace service initialization failed: ${message}`
        );
      }
      logger.warn(
        '[DOCKER] Sandbox fallback active: command execution will route locally with virtual warning.'
      );
    }
  }

  /**
   * Ensures a user's persistent workspace directory exists on the host filesystem.
   * This directory will be mounted into the Docker container.
   * Sanitizes userId and isolationId to prevent path traversal vulnerabilities.
   * @param {string} userId - The ID of the user.
   * @param {string} isolationId - A unique identifier for the specific workspace instance (e.g., project ID, session ID).
   * @returns {string} The absolute path to the user's host workspace directory.
   */
  _ensureHostUserDir(userId, isolationId) {
    const sanitizedUserId = this._sanitizeIdentifier(userId);
    const sanitizedIsolationId = this._sanitizeIdentifier(isolationId);
    const userDir = path.join(
      this.userWorkspacesDir,
      sanitizedUserId,
      'workspaces',
      sanitizedIsolationId
    );
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
  }

  /**
   * Performs LRU (Least Recently Used) sandbox eviction if the total number of user containers
   * exceeds the maximum limit (`maxContainers`). It prioritizes unregistered/leaked containers
   * and then evicts the oldest active session.
   * @async
   * @param {string | null} [excludeUniqueSessionId=null] - An optional uniqueSessionId to exclude from eviction.
   * @returns {Promise<void>} A promise that resolves when a slot has been reclaimed or if no eviction was needed.
   */
  async _reclaimContainerSlot(excludeUniqueSessionId = null) {
    try {
      const containers = execSync(
        `docker ps -a --filter "name=inso_workspace_" --format "{{.Names}}"`,
        { encoding: 'utf8' }
      )
        .trim()
        .split('\n')
        .map((n) => n.trim())
        .filter(Boolean);

      if (containers.length < this.maxContainers) {
        return; // Safe, under limit
      }

      logger.info(
        `[DOCKER LIMIT] Sandbox container ceiling reached (${containers.length}/${this.maxContainers}). Reclaiming slot...`
      );

      // 1. Evict any container not registered in activeSessions
      for (const name of containers) {
        const match = name.match(/^inso_workspace_(.+)$/);
        if (match) {
          const sId = match[1]; // sId is the uniqueSessionId
          if (sId === excludeUniqueSessionId) continue;
          if (!this.activeSessions.has(sId)) {
            logger.info(
              `[DOCKER EVICT] Evicting unregistered/leaked container: ${name}`
            );
            try {
              execSync(`docker rm -f ${name}`);
            } catch (e) {}
            return;
          }
        }
      }

      // 2. Evict the least recently active registered session
      let oldestSessionId = null;
      let oldestTime = Infinity;

      for (const [sId, session] of this.activeSessions.entries()) {
        // sId is uniqueSessionId
        if (sId === excludeUniqueSessionId) continue;
        const lastAct = session.lastActivity.getTime();
        if (lastAct < oldestTime) {
          oldestTime = lastAct;
          oldestSessionId = sId;
        }
      }

      if (oldestSessionId) {
        logger.info(
          `[DOCKER EVICT] Evicting LRU container ${oldestSessionId} (inactive since ${new Date(oldestTime).toISOString()})`
        );
        try {
          execSync(`docker rm -f inso_workspace_${oldestSessionId}`);
        } catch (e) {}
        this.activeSessions.delete(oldestSessionId);
      } else {
        // 3. Fallback eviction if map is empty/unavailable
        for (const name of containers) {
          const match = name.match(/^inso_workspace_(.+)$/);
          if (match) {
            const sId = match[1]; // sId is uniqueSessionId
            if (sId !== excludeUniqueSessionId) {
              logger.info(
                `[DOCKER EVICT] Fallback evicting container: ${name}`
              );
              try {
                execSync(`docker rm -f ${name}`);
              } catch (e) {}
              return;
            }
          }
        }
      }
    } catch (err) {
      logger.error(
        `[DOCKER EVICT ERROR] Failed to reclaim container slot: ${err.message}`
      );
    }
  }

  /**
   * Enqueues high-resource Docker operations to limit parallel concurrency and prevent host resource exhaustion.
   * Operations are executed sequentially if the active operation count reaches `maxConcurrentOperations`.
   * @async
   * @template T
   * @param {function(): Promise<T>} operationFn - An asynchronous function representing the Docker operation to enqueue.
   * @returns {Promise<T>} A promise that resolves with the result of `operationFn` when it's executed.
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
        logger.info(
          `[DOCKER QUEUE] Queueing Docker operation due to concurrency limit (${this.activeOperationsCount}/${this.maxConcurrentOperations} active)`
        );
        this.concurrencyQueue.push(execute);
      }
    });
  }

  /**
   * Retrieves or dynamically spins up the user's isolated container workspace.
   * If the container doesn't exist, it's created. If it's paused or stopped, it's started.
   * Sanitizes userId, isolationId, and projectId to prevent command injection.
   * @async
   * @param {string} userId - The ID of the user.
   * @param {string} [isolationId='default'] - A unique identifier for the specific workspace instance (e.g., project ID, session ID).
   * @param {string | null} [projectId=null] - Optional project ID to mount read-only project data.
   * @returns {Promise<{ success: boolean; mode: 'docker-isolated' | 'local-fallback'; containerId: string | null; }>}
   *   An object indicating success, the execution mode, and the container ID if successful.
   */
  async getOrCreateWorkspace(
    userId,
    isolationId = 'default',
    projectId = null
  ) {
    await this.initialize();

    const sanitizedUserId = this._sanitizeIdentifier(userId);
    const sanitizedIsolationId = this._sanitizeIdentifier(isolationId);
    const sanitizedProjectId = projectId
      ? this._sanitizeIdentifier(projectId)
      : null;

    const uniqueSessionId = `${sanitizedUserId}_${sanitizedIsolationId}`;
    this.activeSessions.set(uniqueSessionId, { lastActivity: new Date() });

    if (!this.initialized) {
      return { success: false, mode: 'local-fallback', containerId: null };
    }

    const containerName = `inso_workspace_${uniqueSessionId}`;
    const hostVolumePath = this._ensureHostUserDir(
      sanitizedUserId,
      sanitizedIsolationId
    );

    // Ensure project data directory exists if projectId is provided
    let projectDataMount = '';
    if (sanitizedProjectId) {
      const projectDataDir = path.join(
        path.resolve('storage/projects'),
        sanitizedProjectId,
        'data'
      );
      if (!fs.existsSync(projectDataDir)) {
        fs.mkdirSync(projectDataDir, { recursive: true });
      }
      // The projectDataDir path is constructed using sanitizedProjectId, making it safe for shell.
      projectDataMount = `-v "${projectDataDir}:/mnt/project_data:ro"`;
    }

    return this._enqueueDockerOperation(async () => {
      // Reclaim slot if at or above container limit, excluding the current session.
      await this._reclaimContainerSlot(uniqueSessionId);

      try {
        // Check if container already exists
        const containerStatus = execSync(
          `docker inspect -f "{{.State.Status}}" ${containerName} 2>/dev/null || echo "none"`,
          { encoding: 'utf8' }
        ).trim();

        if (containerStatus === 'none') {
          logger.info(
            `[DOCKER] Creating new workspace container: ${containerName}`
          );

          const skillsBaseDir =
            'C:\\Users\\hyper\\.gemini\\config\\plugins\\science\\skills';
          const mcpToolboxDir = path.resolve('mcp-toolbox');

          // Spawn container in background with resource constraints (CPU shares, Memory ceiling)
          // Mounting workspace to /workspace, skills to /skills (ro), and mcp-toolbox to /mcp-toolbox (ro)
          // Connecting to secure internal network and setting up loopback database gateway support
          // All variables interpolated into createCmd (containerName, hostVolumePath, projectDataMount)
          // are derived from sanitized inputs or internal constants, preventing command injection.
          const createCmd = `docker run -d \
            --name ${containerName} \
            --network inso_sandbox_net \
            --add-host=host.docker.internal:host-gateway \
            --memory 512m \
            --cpus 1.0 \
            --pids-limit 100 \
            --cap-drop=ALL \
            --security-opt=no-new-privileges:true \
            --read-only \
            --tmpfs /tmp:rw,noexec,nosuid,size=64m \
            -v "${hostVolumePath}:/workspace" \
            ${projectDataMount} \
            -v "${skillsBaseDir}:/skills:ro" \
            -v "${mcpToolboxDir}:/mcp-toolbox:ro" \
            ${this.imageName} sleep infinity`;

          execSync(createCmd);
          logger.info(
            `[SUCCESS] Created container workspace: ${containerName}`
          );
        } else if (containerStatus === 'paused') {
          logger.info(
            `[DOCKER] Unpausing workspace container: ${containerName}`
          );
          execSync(`docker unpause ${containerName}`);
        } else if (containerStatus !== 'running') {
          logger.info(
            `[DOCKER] Restarting stopped workspace container: ${containerName}`
          );
          execSync(`docker start ${containerName}`);
        }

        return {
          success: true,
          mode: 'docker-isolated',
          containerId: containerName,
        };
      } catch (err) {
        logger.error(
          `[DOCKER] Failed to manage workspace for user ${sanitizedUserId}: ${err.message}`
        );
        return { success: false, mode: 'local-fallback', containerId: null };
      }
    });
  }

  /**
   * Executes a command securely inside the user's isolated workspace container.
   * Provides a local fallback if the Docker environment is not initialized.
   * Includes resource monitoring to prevent memory exhaustion within the container.
   * Sanitizes userId, isolationId, and projectId to prevent command injection.
   * @async
   * @param {string} userId - The ID of the user.
   * @param {string} [isolationId='default'] - A unique identifier for the specific workspace instance.
   * @param {string[]} commandArgs - An array of strings representing the command and its arguments to execute.
   * @param {object} [options={}] - Additional options for command execution.
   * @param {number} [options.timeoutMs=20000] - The maximum time in milliseconds to wait for the command to complete.
   * @param {string} [options.cwd] - The current working directory for local fallback execution.
   * @param {string | null} [options.projectId=null] - Optional project ID to ensure correct workspace context.
   * @returns {Promise<{ code: number; stdout: string; stderr: string; mode: 'docker-isolated' | 'local-fallback'; }>}
   *   An object containing the exit code, standard output, standard error, and execution mode.
   */
  async executeCommand(
    userId,
    isolationId = 'default',
    commandArgs,
    options = {}
  ) {
    const sanitizedUserId = this._sanitizeIdentifier(userId);
    const sanitizedIsolationId = this._sanitizeIdentifier(isolationId);
    const sanitizedProjectId = options.projectId
      ? this._sanitizeIdentifier(options.projectId)
      : null;

    const workspace = await this.getOrCreateWorkspace(
      sanitizedUserId,
      sanitizedIsolationId,
      sanitizedProjectId
    );
    const uniqueSessionId = `${sanitizedUserId}_${sanitizedIsolationId}`;
    this.activeSessions.set(uniqueSessionId, { lastActivity: new Date() }); // Update activity for the correct uniqueSessionId

    const timeoutMs = options.timeoutMs || 20000;

    // A. Local process fallback if Docker layer is unavailable
    if (workspace.mode === 'local-fallback') {
      logger.warn(
        `[DOCKER FALLBACK] Running locally for user ${sanitizedUserId}: ${commandArgs.join(' ')}`
      );
      return new Promise((resolve) => {
        // `spawn` handles commandArgs as separate arguments, preventing shell injection at this level.
        const cmd = commandArgs[0];
        const args = commandArgs.slice(1);
        const child = spawn(cmd, args, {
          cwd: options.cwd || process.cwd(),
          env: process.env,
        });

        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
          child.kill('SIGTERM');
        }, timeoutMs);

        child.stdout.on('data', (d) => {
          stdout += d.toString();
        });
        child.stderr.on('data', (d) => {
          stderr += d.toString();
        });

        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({ code, stdout, stderr, mode: 'local-fallback' });
        });
      });
    }

    // B. Strict isolated Docker Exec container execution
    const containerName = workspace.containerId; // This is already `inso_workspace_${uniqueSessionId}`
    logger.info(
      `[DOCKER EXEC] Running inside ${containerName}: ${commandArgs.join(' ')}`
    );

    return new Promise((resolve) => {
      // Execute command under non-root sandbox user inside /workspace folder
      // `commandArgs` are passed as separate arguments to `docker exec`, preventing shell injection
      // into the `docker` command itself. The commands executed *inside* the container are user-controlled,
      // but the container's security profile mitigates risks.
      const execArgs = [
        'exec',
        '-u',
        'sandbox',
        '-w',
        '/workspace',
        containerName,
        ...commandArgs,
      ];

      const child = spawn('docker', execArgs);

      let stdout = '';
      let stderr = '';
      let aborted = false;
      let monitorInterval = null;

      const timer = setTimeout(() => {
        aborted = true;
        clearInterval(monitorInterval);
        logger.error(
          `[DOCKER TIMEOUT] Exec command expired inside ${containerName}`
        );
        child.kill('SIGTERM');
        // Force kill target container subprocess if unresponsive
        try {
          // containerName is sanitized, so this execSync is safe.
          execSync(`docker exec ${containerName} pkill -u sandbox`);
        } catch (err) {
          logger.debug(
            `[DOCKER] Force-kill sandbox processes did not succeed or container is already stopped: ${err.message}`
          );
        }
      }, timeoutMs);

      // --- RESOURCE EXHAUSTION GUARD & OOM PREVENTION LOOP ---
      monitorInterval = setInterval(async () => {
        if (aborted) return;
        try {
          // Call getWorkspaceMetrics with sanitized IDs
          const metrics = await this.getWorkspaceMetrics(
            sanitizedUserId,
            sanitizedIsolationId
          );
          if (metrics.connected && !aborted) {
            const cpu = parseFloat(
              String(metrics.cpuPercent || '0').replace('%', '')
            );
            const mem = parseFloat(
              String(metrics.memoryPercent || '0').replace('%', '')
            );

            if (mem > 90) {
              aborted = true;
              clearInterval(monitorInterval);
              clearTimeout(timer);
              logger.error(
                `[DOCKER RESOURCE CAP] Aborting execution inside ${containerName} due to Memory ceiling violation: ${mem}%`
              );

              child.kill('SIGKILL');
              try {
                // containerName is sanitized, so this execSync is safe.
                execSync(`docker exec ${containerName} pkill -u sandbox`);
              } catch (err) {
                logger.debug(
                  `[DOCKER] Failed to force-kill processes during resource cap abort: ${err.message}`
                );
              }

              resolve({
                code: 137, // Out-Of-Memory standard exit code
                stdout,
                stderr: `Execution Aborted: Sandbox memory limit exceeded (${mem}% >= 90%).`,
                mode: 'docker-isolated',
              });
            }
          }
        } catch (err) {
          logger.debug(
            `[DOCKER MONITOR] Error checking running container resource levels: ${err.message}`
          );
        }
      }, 3000);

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('close', (code) => {
        clearInterval(monitorInterval);
        clearTimeout(timer);
        if (!aborted) {
          resolve({
            code,
            stdout,
            stderr: stderr.includes('read-only')
              ? 'Access Denied: Root filesystem restrictions active.'
              : stderr,
            mode: 'docker-isolated',
          });
        }
      });
    });
  }

  /**
   * Pauses an active workspace container, freeing up CPU resources.
   * Sanitizes userId and isolationId to prevent command injection.
   * @async
   * @param {string} userId - The ID of the user.
   * @param {string} [isolationId='default'] - A unique identifier for the specific workspace instance.
   * @returns {Promise<boolean>} True if the container was successfully paused, false otherwise.
   */
  async pauseWorkspace(userId, isolationId = 'default') {
    const sanitizedUserId = this._sanitizeIdentifier(userId);
    const sanitizedIsolationId = this._sanitizeIdentifier(isolationId);
    const uniqueSessionId = `${sanitizedUserId}_${sanitizedIsolationId}`;
    const containerName = `inso_workspace_${uniqueSessionId}`; // containerName is safe due to sanitized uniqueSessionId
    try {
      execSync(`docker pause ${containerName}`);
      logger.info(
        `[DOCKER] Successfully paused workspace container: ${containerName}`
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stops and removes a workspace container, cleaning up its resources.
   * Sanitizes userId and isolationId to prevent command injection.
   * @async
   * @param {string} userId - The ID of the user.
   * @param {string} [isolationId='default'] - A unique identifier for the specific workspace instance.
   * @returns {Promise<boolean>} True if the container was successfully stopped and removed, false otherwise.
   */
  async stopWorkspace(userId, isolationId = 'default') {
    const sanitizedUserId = this._sanitizeIdentifier(userId);
    const sanitizedIsolationId = this._sanitizeIdentifier(isolationId);
    const uniqueSessionId = `${sanitizedUserId}_${sanitizedIsolationId}`;
    const containerName = `inso_workspace_${uniqueSessionId}`; // containerName is safe due to sanitized uniqueSessionId
    try {
      execSync(`docker rm -f ${containerName}`);
      logger.info(
        `[DOCKER] Safely destroyed workspace container: ${containerName}`
      );
      this.activeSessions.delete(uniqueSessionId); // Delete the correct uniqueSessionId from the map
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Performs an audit cleanup cycle on inactive containers.
   * Containers inactive for more than 5 minutes are paused.
   * Containers inactive for more than 20 minutes are destroyed.
   * @async
   * @returns {Promise<void>} A promise that resolves when the audit cycle is complete.
   */
  async auditActiveWorkspaces() {
    logger.info('[DOCKER CRON] Auditing active user container workspaces...');
    const now = new Date();

    // Iterate over uniqueSessionId keys in activeSessions map
    for (const [uniqueSessionId, session] of this.activeSessions.entries()) {
      const idleTimeSec =
        (now.getTime() - session.lastActivity.getTime()) / 1000;
      const containerName = `inso_workspace_${uniqueSessionId}`; // Use the consistent container naming

      // Parse userId and isolationId from uniqueSessionId to pass to stop/pause methods
      const [userId, isolationId = 'default'] = uniqueSessionId.split('_');

      try {
        if (idleTimeSec > 1200) {
          // 20 minutes inactive -> Destroy container
          logger.info(
            `[DOCKER CRON] User ${userId} (session: ${uniqueSessionId}) is inactive for ${Math.round(idleTimeSec / 60)}m. Destroying container.`
          );
          await this.stopWorkspace(userId, isolationId); // Await the async call
        } else if (idleTimeSec > 300) {
          // 5 minutes inactive -> Pause container to free host CPU
          const status = execSync(
            `docker inspect -f "{{.State.Status}}" ${containerName} 2>/dev/null || echo "none"`,
            { encoding: 'utf8' }
          ).trim();

          if (status === 'running') {
            logger.info(
              `[DOCKER CRON] User ${userId} (session: ${uniqueSessionId}) is inactive for ${Math.round(idleTimeSec / 60)}m. Pausing container CPU.`
            );
            await this.pauseWorkspace(userId, isolationId); // Await the async call
          }
        }
      } catch (err) {
        logger.error(
          `[DOCKER CRON] Audit failed for user workspace ${uniqueSessionId}: ${err.message}`
        );
      }
    }
  }

  /**
   * Pre-warms the workspace for a user by creating it and placing it in a paused state.
   * This completely eliminates cold start latency during execution requests.
   * Ensures consistent naming and session management with other methods.
   * Sanitizes userId and isolationId to prevent command injection.
   * @async
   * @param {string} userId - The ID of the user.
   * @param {string} [isolationId='default'] - A unique identifier for the specific workspace instance.
   * @returns {Promise<void>} A promise that resolves when the workspace is pre-warmed and paused.
   */
  async prewarmWorkspace(userId, isolationId = 'default') {
    if (!this.initialized) await this.initialize();
    if (!this.initialized) return;

    const sanitizedUserId = this._sanitizeIdentifier(userId);
    const sanitizedIsolationId = this._sanitizeIdentifier(isolationId);
    const uniqueSessionId = `${sanitizedUserId}_${sanitizedIsolationId}`; // Consistent uniqueSessionId
    const containerName = `inso_workspace_${uniqueSessionId}`; // Consistent container naming

    return this._enqueueDockerOperation(async () => {
      // Reclaim slot if at or above container limit, excluding the current session.
      await this._reclaimContainerSlot(uniqueSessionId);

      try {
        const containerStatus = execSync(
          `docker inspect -f "{{.State.Status}}" ${containerName} 2>/dev/null || echo "none"`,
          { encoding: 'utf8' }
        ).trim();

        if (containerStatus === 'none') {
          logger.info(
            `[DOCKER PREWARM] Pre-warming new container for user: ${uniqueSessionId}`
          );
          const hostVolumePath = this._ensureHostUserDir(
            sanitizedUserId,
            sanitizedIsolationId
          ); // Pass sanitized IDs
          const skillsBaseDir =
            'C:\\Users\\hyper\\.gemini\\config\\plugins\\science\\skills';
          const mcpToolboxDir = path.resolve('mcp-toolbox');

          // All variables interpolated into createCmd (containerName, hostVolumePath)
          // are derived from sanitized inputs or internal constants, preventing command injection.
          const createCmd = `docker run -d \
            --name ${containerName} \
            --network inso_sandbox_net \
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
          logger.info(
            `[SUCCESS] Pre-warmed container ${containerName} and placed in paused state.`
          );
        } else if (containerStatus === 'running') {
          logger.info(
            `[DOCKER PREWARM] Suspending active container ${containerName} to free host resources.`
          );
          execSync(`docker pause ${containerName}`);
        }
        this.activeSessions.set(uniqueSessionId, { lastActivity: new Date() }); // Consistent key
      } catch (err) {
        logger.error(
          `[DOCKER PREWARM ERROR] Failed to pre-warm workspace: ${err.message}`
        );
      }
    });
  }

  /**
   * Scrapes real-time CPU, Memory, and I/O metrics for a user's isolated workspace container.
   * Sanitizes userId and isolationId to prevent command injection.
   * @async
   * @param {string} userId - The ID of the user.
   * @param {string} [isolationId='default'] - A unique identifier for the specific workspace instance.
   * @returns {Promise<{ connected: boolean; uniqueSessionId: string; containerId?: string; cpuPercent?: string; memoryUsage?: string; memoryPercent?: string; netIO?: string; blockIO?: string; pids?: string; error?: string; }>}
   *   An object containing connection status, unique session ID, and various container metrics if connected.
   */
  async getWorkspaceMetrics(userId, isolationId = 'default') {
    if (!this.initialized) return { connected: false, userId };
    const sanitizedUserId = this._sanitizeIdentifier(userId);
    const sanitizedIsolationId = this._sanitizeIdentifier(isolationId);
    const uniqueSessionId = `${sanitizedUserId}_${sanitizedIsolationId}`;
    const containerName = `inso_workspace_${uniqueSessionId}`; // containerName is safe due to sanitized uniqueSessionId

    try {
      const statsJson = execSync(
        `docker stats ${containerName} --no-stream --format "{{json .}}" 2>/dev/null || echo ""`,
        { encoding: 'utf8' }
      ).trim();

      if (!statsJson) {
        return { connected: false, uniqueSessionId }; // Return uniqueSessionId for clarity
      }

      const parsed = JSON.parse(statsJson);
      return {
        connected: true,
        uniqueSessionId, // Return uniqueSessionId
        containerId: containerName,
        cpuPercent: parsed.CPUPerc,
        memoryUsage: parsed.MemUsage,
        memoryPercent: parsed.MemPerc,
        netIO: parsed.NetIO,
        blockIO: parsed.BlockIO,
        pids: parsed.PIDs,
      };
    } catch (err) {
      return { connected: false, error: err.message, uniqueSessionId }; // Return uniqueSessionId
    }
  }

  /**
   * Scrapes metrics for all currently active workspace containers concurrently.
   * @async
   * @returns {Promise<Array<ReturnType<DockerWorkspaceService['getWorkspaceMetrics']>>>}
   *   A promise that resolves to an array of metric objects for each active workspace.
   */
  async getAllActiveMetrics() {
    // Collect all promises for metrics concurrently using Promise.all
    const metricPromises = Array.from(this.activeSessions.keys()).map(
      async (uniqueSessionId) => {
        // Parse userId and isolationId from uniqueSessionId to pass to getWorkspaceMetrics
        const [userId, isolationId = 'default'] = uniqueSessionId.split('_');
        return this.getWorkspaceMetrics(userId, isolationId);
      }
    );
    return Promise.all(metricPromises); // Execute all metric scraping in parallel
  }
}

/**
 * @constant {DockerWorkspaceService} dockerWorkspaceService
 * @description Singleton instance of the DockerWorkspaceService for managing Docker container workspaces.
 */
export const dockerWorkspaceService = new DockerWorkspaceService();
