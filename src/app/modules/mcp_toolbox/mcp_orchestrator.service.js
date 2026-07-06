import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import readline from 'readline';
import config from '../../../../config/index.js';

import { promises as fsPromises } from 'fs'; // Import fs.promises for asynchronous file operations

/**
 * @typedef {object} McpServerConfig
 * @property {string} id - The unique identifier for the MCP server.
 * @property {string} name - A human-readable name for the server.
 * @property {string} description - A brief description of the server's purpose.
 * @property {string} command - The command to execute to start the MCP server process.
 * @property {string[]} [args] - An array of command-line arguments to pass to the server process.
 * @property {object} [env] - An object of environment variables to set for the server process.
 */

/**
 * @typedef {object} McpTool
 * @property {string} name - The name of the tool.
 * @property {string} description - A description of what the tool does.
 * @property {object} parameters - OpenAPI schema for the tool's input parameters.
 * @property {string} [serverId] - Custom metadata: The ID of the server that owns this tool.
 */

/**
 * Robust JSON-RPC 2.0 Bridge over Standard I/O (stdio) for MCP Servers.
 * This class manages the lifecycle of a single MCP (Model Context Protocol) server subprocess,
 * handling its startup, communication, logging, and self-healing in case of crashes.
 */
class McpGenericServerInstance {
  /**
   * Creates an instance of McpGenericServerInstance.
   * @param {string} serverId - The unique identifier for this server instance.
   * @param {McpServerConfig} config - The configuration object for spawning the server process.
   * @param {string} tenantId - The ID of the tenant (user) associated with this server instance.
   * @param {function(string): void} onLog - A callback function to handle log messages from this instance.
   */
  constructor(serverId, config, tenantId, onLog) {
    /** @type {string} */
    this.serverId = serverId;
    /** @type {McpServerConfig} */
    this.config = config;
    /** @type {string} */
    this.tenantId = tenantId;
    /** @type {function(string): void} */
    this.onLog = onLog;
    /** @type {import('child_process').ChildProcess | null} */
    this.process = null;
    /** @type {readline.Interface | null} */
    this.rl = null;
    /** @type {number} */
    this.requestId = 1;
    /** @type {Map<number, {resolve: Function, reject: Function}>} */
    this.pendingRequests = new Map(); // id -> { resolve, reject }
    /** @type {boolean} */
    this.initialized = false;
    /** @type {McpTool[]} */
    this.tools = [];
    /** @type {string[]} */
    this.terminalLogs = [];
    /** @type {object} */
    this.customEnv = config.env || {};
    /** @type {number} */
    this.restartAttempts = 0;
    /** @type {number} */
    this.maxRestartAttempts = 3;
    /** @type {boolean} */
    this.isStopping = false;

    // Resolve placeholders (e.g. {{tenantId}}) in args and env values
    /** @type {string[]} */
    this.resolvedArgs = (config.args || []).map(arg => 
      arg.replace(/\{\{tenantId\}\}/g, tenantId)
    );
    /** @type {object} */
    this.resolvedEnv = {};
    Object.keys(this.customEnv).forEach(key => {
      this.resolvedEnv[key] = this.customEnv[key].replace(/\{\{tenantId\}\}/g, tenantId);
    });
  }

  /**
   * Logs a message, adds it to the terminal logs buffer, and calls the external log handler.
   * @param {string} message - The message to log.
   * @returns {void}
   */
  log(message) {
    const logLine = `[${this.serverId.toUpperCase()}] ${message}`;
    this.terminalLogs.push(logLine);
    if (this.terminalLogs.length > 500) this.terminalLogs.shift();
    // Call the onLog handler, which might be asynchronous.
    // We don't await it here to avoid blocking the main log flow,
    // as log writing can happen in the background.
    this.onLog(logLine); 
  }

  /**
   * Spawns the MCP subprocess securely over stdio and executes the standard handshake protocol.
   * Implements self-healing by attempting to restart the process on unexpected exits.
   * @returns {Promise<boolean>} A promise that resolves to true if the server starts successfully and completes the handshake, or rejects on failure.
   */
  async start() { // Made async to use await for fsPromises
    return new Promise(async (resolve, reject) => { // Inner Promise for compatibility with existing structure
      if (this.process) {
        this.log(`Server "${this.serverId}" is already running.`);
        return resolve(true);
      }

      this.isStopping = false;
      const cmd = this.config.command;
      const args = this.resolvedArgs;

      this.log(`Spawning MCP process: ${cmd} ${args.join(' ')}`);

      // Ensure directory for storage exists if needed
      const storageDir = path.resolve(`storage/users/${this.tenantId}/mcp_memory`);
      try {
        await fsPromises.mkdir(storageDir, { recursive: true }); // Use fsPromises for async operation
      } catch (err) {
        this.log(`[ERROR] Failed to create storage directory ${storageDir}: ${err.message}`);
        return reject(err);
      }
      const workspaceDir = path.resolve(`storage/users/${this.tenantId}/workspace`);
      try {
        await fsPromises.mkdir(workspaceDir, { recursive: true }); // Use fsPromises for async operation
      } catch (err) {
        this.log(`[ERROR] Failed to create workspace directory ${workspaceDir}: ${err.message}`);
        return reject(err);
      }

      // Merge environment variables safely
      const spawnEnv = {
        ...process.env,
        ...this.resolvedEnv,
        FORCE_COLOR: '1'
      };

      try {
        this.process = spawn(cmd, args, {
          env: spawnEnv,
          shell: true // WARNING: Using 'shell: true' can be a security risk if 'cmd' or 'args' come from untrusted input.
                      // It is used here, as per original code, potentially for 'npx' on Windows.
                      // Ensure 'config/mcp_servers.json' is a trusted, admin-controlled configuration.
        });

        this.process.on('error', (err) => {
          this.log(`[PROCESS ERROR] Failed to spawn process: ${err.message}`);
          this.cleanup(err);
          reject(err);
        });

        // Interface stdout readline stream parser
        this.rl = readline.createInterface({
          input: this.process.stdout,
          output: this.process.stdin,
          terminal: false
        });

        this.rl.on('line', (line) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          
          try {
            const frame = JSON.parse(trimmed);
            
            // 1. Check if it's a response to a pending request
            if (frame.id !== undefined && this.pendingRequests.has(frame.id)) {
              const { resolve: reqResolve, reject: reqReject } = this.pendingRequests.get(frame.id);
              this.pendingRequests.delete(frame.id);

              if (frame.error) {
                this.log(`JSON-RPC Error: ${frame.error.message || JSON.stringify(frame.error)}`);
                reqReject(new Error(frame.error.message || 'MCP JSON-RPC Error'));
              } else {
                reqResolve(frame.result);
              }
            } else {
              // 2. Handle server-initiated requests or notifications (like logging/progress)
              if (frame.method === 'notifications/message' || frame.method === 'notifications/log') {
                this.log(`[Server Log] ${JSON.stringify(frame.params)}`);
              }
            }
          } catch (err) {
            // Ignore non-json text lines or standard debugging headers
            if (!trimmed.startsWith('{')) {
              this.log(`[STDOUT Log] ${trimmed}`);
            } else {
              this.log(`Unparsable JSON stdout frame: ${trimmed}`);
            }
          }
        });

        // Listen to stderr for diagnostic logs
        this.process.stderr.on('data', (data) => {
          const lines = data.toString().split('\n');
          lines.forEach(line => {
            const cleaned = line.trim();
            if (cleaned) {
              this.log(`[STDERR] ${cleaned}`);
            }
          });
        });

        // Process exit code handling with dynamic self-healing recovery daemon
        this.process.on('exit', (code) => {
          this.log(`Subprocess exited with code ${code}`);
          this.process = null; // Clear process reference so start() can spawn a new one!
          this.cleanup(new Error(`MCP process exited with code ${code}`));

          if (!this.isStopping) {
            this.handleCrashAndHealing();
          }
        });

        // Standard Handshake initiation delay
        setTimeout(async () => {
          try {
            this.log('Initiating Model Context Protocol v2024-11-05 handshake...');

            // 1. Send dynamic initialize frame
            const initResult = await this.sendRequest('initialize', {
              protocolVersion: '2024-11-05',
              capabilities: {
                sampling: {}
              },
              clientInfo: {
                name: 'Alti Assistant-Backend-Orchestrator',
                version: '1.2.0'
              }
            });

            this.log(`Handshake approved. Server: ${initResult.serverInfo?.name || 'Generic'} (v${initResult.serverInfo?.version || '1.0.0'})`);

            // 2. Send standard initialized notification
            this.sendNotification('notifications/initialized', {});
            this.initialized = true;
            this.restartAttempts = 0; // Reset restart tracking on success

            // 3. Introspect dynamic tools list
            await this.refreshToolsList();

            resolve(true);
          } catch (err) {
            this.log(`Handshake protocol failed: ${err.message}`);
            this.stop();
            reject(err);
          }
        }, 2000);

      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Implements a self-healing recovery daemon. If the process crashes, it attempts to restart
   * the server up to `maxRestartAttempts` times with increasing delays.
   * @returns {void}
   */
  handleCrashAndHealing() {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      this.log(`[FATAL] Server crashed repeatedly. Disabling self-healing daemon to avoid infinite loop.`);
      return;
    }

    this.restartAttempts++;
    const delay = this.restartAttempts * 3000;
    this.log(`[ALERT] Recovering process... Auto-restarting in ${delay}ms (Attempt ${this.restartAttempts}/${this.maxRestartAttempts})`);

    setTimeout(() => {
      if (!this.isStopping) {
        this.start().catch(err => {
          this.log(`Self-healing restart attempt failed: ${err.message}`);
        });
      }
    }, delay);
  }

  /**
   * Refreshes the local tools registration cache by sending a 'tools/list' request to the MCP server.
   * Updates the `this.tools` array with the latest available tools.
   * @returns {Promise<void>} A promise that resolves when the tools list has been refreshed.
   */
  async refreshToolsList() {
    try {
      this.log('Fetching dynamic tools list...');
      const response = await this.sendRequest('tools/list', {});
      this.tools = response.tools || [];
      const toolNames = this.tools.map(t => t.name);
      this.log(`Available dynamic tools: [${toolNames.join(', ')}]`);
    } catch (err) {
      this.log(`Failed to retrieve dynamic tools schemas: ${err.message}`);
      this.tools = [];
    }
  }

  /**
   * Sends a JSON-RPC 2.0 request frame over the subprocess's stdin and waits for a response.
   * @param {string} method - The JSON-RPC method name.
   * @param {object} [params={}] - The parameters for the JSON-RPC method.
   * @returns {Promise<any>} A promise that resolves with the result of the JSON-RPC call or rejects on error.
   */
  sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.process || this.process.killed) {
        return reject(new Error(`MCP server "${this.serverId}" is not running.`));
      }

      const id = this.requestId++;
      const request = {
        jsonrpc: '2.0',
        method,
        params,
        id
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  /**
   * Sends a JSON-RPC 2.0 notification frame over the subprocess's stdin.
   * Notifications do not expect a response.
   * @param {string} method - The JSON-RPC method name.
   * @param {object} [params={}] - The parameters for the JSON-RPC method.
   * @returns {void}
   */
  sendNotification(method, params = {}) {
    if (!this.process || this.process.killed) return;

    const notification = {
      jsonrpc: '2.0',
      method,
      params
    };

    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  /**
   * Cleans up resources associated with the subprocess, such as pending requests and readline interface.
   * This is called when the process exits or is stopped.
   * @param {Error} error - The error that caused the cleanup, used to reject pending requests.
   * @returns {void}
   */
  cleanup(error) {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    this.pendingRequests.forEach(({ reject }) => reject(error));
    this.pendingRequests.clear();
    this.initialized = false;
  }

  /**
   * Gracefully terminates the MCP server subprocess.
   * Sets `isStopping` to true to prevent self-healing restarts.
   * @returns {void}
   */
  stop() {
    this.isStopping = true;
    this.log('Terminating server process gracefully...');
    
    if (this.process) {
      this.process.removeAllListeners('exit'); // Prevent self-healing on intentional stop
      this.process.kill('SIGTERM'); // Send SIGTERM for graceful shutdown
      this.process = null;
    }
    this.cleanup(new Error('Process stopped.'));
  }
}

/**
 * Universal Multi-Server MCP Orchestrator Service.
 * Manages multiple `McpGenericServerInstance` instances for different tenants,
 * providing a unified interface for starting, stopping, and interacting with MCP servers and their tools.
 * It also handles dynamic configuration loading and hot-reloading.
 */
class McpOrchestratorService {
  /**
   * Creates an instance of McpOrchestratorService.
   * Initializes the active user servers map, loads the global registry, and starts the config watcher.
   */
  constructor() {
    /**
     * Stores active MCP server instances per tenant.
     * @type {Map<string, Map<string, McpGenericServerInstance>>}
     * @example
     * // Structure: Map<tenantId, Map<serverId, McpGenericServerInstance>>
     */
    this.activeUserServers = new Map();
    /**
     * Global registry of all available MCP server definitions loaded from `config/mcp_servers.json`.
     * @type {Record<string, McpServerConfig>}
     */
    this.globalRegistry = {};
    this._loadRegistrySync(); // Initial synchronous load for constructor
    this.startConfigWatcher();
  }

  /**
   * Synchronously loads the MCP server registry configuration from `config/mcp_servers.json`.
   * This method is intended for initial synchronous loading in the constructor.
   * For asynchronous reloads, use `loadRegistry()`.
   * @private
   * @returns {void}
   */
  _loadRegistrySync() {
    try {
      const configPath = path.resolve('config/mcp_servers.json');
      if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        this.globalRegistry = parsed.mcp_servers || {};
        console.log(`[McpOrchestrator] Loaded ${Object.keys(this.globalRegistry).length} MCP server definitions.`);
      } else {
        console.warn(`[McpOrchestrator] config/mcp_servers.json not found. Initializing with empty registry.`);
        this.globalRegistry = {};
      }
    } catch (err) {
      console.error(`[McpOrchestrator] Failed to load config/mcp_servers.json: ${err.message}`);
      this.globalRegistry = {}; // Ensure registry is empty on error
    }
  }

  /**
   * Asynchronously loads the MCP server registry configuration from `config/mcp_servers.json`.
   * This method is used for dynamic hot-reloading.
   * @returns {Promise<void>}
   */
  async loadRegistry() {
    try {
      const configPath = path.resolve('config/mcp_servers.json');
      let fileContent;
      try {
        await fsPromises.access(configPath, fs.constants.F_OK); // Check if file exists
        fileContent = await fsPromises.readFile(configPath, 'utf-8');
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.warn(`[McpOrchestrator] config/mcp_servers.json not found. Initializing with empty registry.`);
          this.globalRegistry = {};
          return;
        }
        throw error; // Re-throw other errors
      }
      
      const parsed = JSON.parse(fileContent);
      this.globalRegistry = parsed.mcp_servers || {};
      console.log(`[McpOrchestrator] Loaded ${Object.keys(this.globalRegistry).length} MCP server definitions.`);
    } catch (err) {
      console.error(`[McpOrchestrator] Failed to load config/mcp_servers.json: ${err.message}`);
      this.globalRegistry = {}; // Ensure registry is empty on error
    }
  }

  /**
   * Starts a file system watcher on `config/mcp_servers.json` to enable dynamic hot-reloading
   * of server definitions without requiring a service restart.
   * @returns {void}
   */
  startConfigWatcher() {
    try {
      const configPath = path.resolve('config/mcp_servers.json');
      // Check existence synchronously for watcher setup, as fs.watch doesn't throw ENOENT immediately
      if (fs.existsSync(configPath)) { 
        let debounceTimer;
        fs.watch(configPath, (eventType) => {
          if (eventType === 'change') {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => { // Made callback async
              console.log('[McpOrchestrator] Dynamic config change detected! Hot-reloading registry...');
              await this.loadRegistry(); // Use async loadRegistry
            }, 300); // Debounce to prevent multiple reloads on rapid changes
          }
        });
        console.log(`[McpOrchestrator] Started watcher for ${configPath}`);
      } else {
        console.warn(`[McpOrchestrator] Cannot start config watcher: ${configPath} does not exist.`);
      }
    } catch (err) {
      console.error(`[McpOrchestrator] Failed to start config watcher: ${err.message}`);
    }
  }

  /**
   * Aggregates and returns a unified list of all dynamic tools available from all
   * active and initialized MCP servers for a given tenant.
   * Each tool will have an additional `serverId` property indicating its origin.
   * @param {string} tenantId - The ID of the tenant.
   * @returns {Promise<McpTool[]>} A promise that resolves to an array of unified tool definitions.
   */
  async getUnifiedTools(tenantId) {
    const userServers = this.getUserServers(tenantId);
    const unifiedTools = [];

    userServers.forEach((instance, serverId) => {
      if (instance.initialized) {
        instance.tools.forEach(tool => {
          unifiedTools.push({
            ...tool,
            serverId: serverId // Track ownership in custom metadata properties
          });
        });
      }
    });

    return unifiedTools;
  }

  /**
   * Routes a tool call to the appropriate active MCP server based on the tool's registration.
   * This acts as a gateway for calling tools without needing to know their specific server.
   * @param {string} tenantId - The ID of the tenant.
   * @param {string} toolName - The name of the tool to call.
   * @param {object} [args={}] - The arguments to pass to the tool.
   * @returns {Promise<object>} A promise that resolves with the result of the tool call.
   * @throws {Error} If the tool is not found on any active server.
   */
  async callUnifiedTool(tenantId, toolName, args = {}) {
    const userServers = this.getUserServers(tenantId);
    let targetServerId = null;

    // Find which server owns the tool
    for (const [serverId, instance] of userServers.entries()) {
      if (instance.initialized && instance.tools.some(t => t.name === toolName)) {
        targetServerId = serverId;
        break;
      }
    }

    if (!targetServerId) {
      throw new Error(`Tool "${toolName}" is not registered on any active MCP Server for tenant "${tenantId}".`);
    }

    return this.callTool(tenantId, targetServerId, toolName, args);
  }

  /**
   * Registers or updates an MCP server definition in the `config/mcp_servers.json` file.
   * This action triggers the dynamic hot-reloading mechanism.
   * This method operates on a global configuration file and should be protected by appropriate
   * authorization checks in the API layer (e.g., only accessible by administrators).
   * @param {string} serverId - The unique ID for the server to register.
   * @param {object} serverConfig - The configuration details for the server.
   * @param {string} serverConfig.name - The human-readable name of the server.
   * @param {string} serverConfig.command - The command to execute to start the server.
   * @param {string} [serverConfig.description] - A description of the server.
   * @param {string[]} [serverConfig.args] - Command-line arguments.
   * @param {object} [serverConfig.env] - Environment variables.
   * @returns {Promise<object>} A promise that resolves with a success message and the updated registry.
   * @throws {Error} If the server configuration is invalid.
   */
  async registerServer(serverId, serverConfig) { // Removed tenantId as it's a global config
    if (!serverId || !serverConfig.name || !serverConfig.command) {
      throw new Error('Invalid server configuration. Server ID, name, and command are required.');
    }

    const configPath = path.resolve('config/mcp_servers.json');
    let currentConfig = { mcp_servers: {} };

    try {
      // Use fsPromises for asynchronous file operations
      const fileContent = await fsPromises.readFile(configPath, 'utf-8');
      currentConfig = JSON.parse(fileContent);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, start with an empty config
        console.warn(`[McpOrchestrator] config/mcp_servers.json not found during registration. Creating new file.`);
      } else {
        console.error(`[McpOrchestrator] Failed to read config/mcp_servers.json: ${error.message}`);
        throw new Error(`Failed to read server registry: ${error.message}`);
      }
    }

    if (!currentConfig.mcp_servers) {
      currentConfig.mcp_servers = {};
    }

    // Register or update server definition dynamically
    currentConfig.mcp_servers[serverId] = {
      id: serverId,
      name: serverConfig.name,
      description: serverConfig.description || 'Custom registered server.',
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: serverConfig.env || {}
    };

    await fsPromises.writeFile(configPath, JSON.stringify(currentConfig, null, 2), 'utf-8');
    
    // Manually force immediate update in memory to prevent watcher delay race-conditions
    await this.loadRegistry(); // Use async loadRegistry to update globalRegistry
    console.log(`[McpOrchestrator] Server "${serverConfig.name}" (${serverId}) registered/updated.`);

    return {
      success: true,
      message: `Server "${serverConfig.name}" registered successfully.`,
      registry: this.globalRegistry
    };
  }

  /**
   * Retrieves the map of active MCP server instances for a specific tenant.
   * If no servers are active for the tenant, an empty map is created and returned.
   * @param {string} tenantId - The ID of the tenant.
   * @returns {Map<string, McpGenericServerInstance>} A map where keys are server IDs and values are `McpGenericServerInstance` objects.
   */
  getUserServers(tenantId) {
    if (!this.activeUserServers.has(tenantId)) {
      this.activeUserServers.set(tenantId, new Map());
    }
    return this.activeUserServers.get(tenantId);
  }

  /**
   * Boots up a specific MCP server for a given tenant's workspace.
   * If the server is already running, it returns its current status.
   * It also injects dynamic environment variables for specific servers (e.g., third-party API keys).
   * @param {string} tenantId - The ID of the tenant.
   * @param {string} serverId - The ID of the server to start.
   * @returns {Promise<object>} A promise that resolves with the server's status and a success message.
   * @throws {Error} If the server ID is not registered or if the server fails to start.
   */
  async startServer(tenantId, serverId) {
    const userServers = this.getUserServers(tenantId);

    // 1. Return existing instance if already active and running
    if (userServers.has(serverId)) {
      const active = userServers.get(serverId);
      if (active.process && !active.process.killed) {
        return {
          success: true,
          message: `Server "${serverId}" is already running.`,
          server: this.getServerStatusDTO(active)
        };
      }
    }

    // 2. Fetch server definition from registry
    const definition = this.globalRegistry[serverId];
    if (!definition) {
      throw new Error(`Server ID "${serverId}" is not registered in the global registry.`);
    }

    // 3. Spawns new generic server instance
    const logFile = path.resolve(`logs/mcp_${tenantId}_${serverId}.log`);
    const logDir = path.dirname(logFile);
    try {
      await fsPromises.mkdir(logDir, { recursive: true }); // Use fsPromises for async operation
    } catch (err) {
      console.error(`[McpOrchestrator] Failed to create log directory ${logDir}: ${err.message}`);
      throw err; // Re-throw to indicate startup failure
    }

    // Optimization: Use asynchronous file appending for logs to prevent blocking the event loop.
    const appendLog = async (line) => {
      try {
        await fsPromises.appendFile(logFile, `${new Date().toISOString()} ${line}\n`, 'utf-8');
      } catch (err) {
        console.error(`[McpOrchestrator] Failed to write to log file ${logFile}: ${err.message}`);
      }
    };

    const instance = new McpGenericServerInstance(serverId, definition, tenantId, appendLog);



    userServers.set(serverId, instance);

    await instance.start();

    return {
      success: true,
      message: `MCP Server "${definition.name}" successfully connected.`,
      server: this.getServerStatusDTO(instance)
    };
  }

  /**
   * Halts a specific active MCP server instance for a tenant.
   * @param {string} tenantId - The ID of the tenant.
   * @param {string} serverId - The ID of the server to stop.
   * @returns {Promise<object>} A promise that resolves with a success or failure message.
   */
  async stopServer(tenantId, serverId) {
    const userServers = this.getUserServers(tenantId);
    if (userServers.has(serverId)) {
      const active = userServers.get(serverId);
      active.stop();
      userServers.delete(serverId);
      console.log(`[McpOrchestrator] Server "${serverId}" for tenant "${tenantId}" stopped.`);
      return { success: true, message: `MCP Server "${serverId}" stopped successfully.` };
    }
    return { success: false, message: `No active server instance found for ID "${serverId}" for tenant "${tenantId}".` };
  }

  /**
   * Halts all active MCP servers for a given tenant workspace.
   * @param {string} tenantId - The ID of the tenant.
   * @returns {Promise<object>} A promise that resolves with a success message.
   */
  async stopAllUserServers(tenantId) {
    const userServers = this.getUserServers(tenantId);
    userServers.forEach((instance, serverId) => {
      instance.stop();
      console.log(`[McpOrchestrator] Server "${serverId}" for tenant "${tenantId}" stopped.`);
    });
    userServers.clear();
    return { success: true, message: 'All active MCP servers stopped successfully.' };
  }

  /**
   * Executes a dynamic tool call on a specific running MCP server instance.
   * @param {string} tenantId - The ID of the tenant.
   * @param {string} serverId - The ID of the server where the tool is registered.
   * @param {string} toolName - The name of the tool to call.
   * @param {object} [args={}] - The arguments to pass to the tool.
   * @returns {Promise<object>} A promise that resolves with the result of the tool call.
   * @throws {Error} If the server is not running/initialized or the tool is not registered on that server.
   */
  async callTool(tenantId, serverId, toolName, args = {}) {
    const userServers = this.getUserServers(tenantId);
    const instance = userServers.get(serverId);

    if (!instance || !instance.initialized) {
      throw new Error(`MCP Server "${serverId}" is not running or initialized for tenant "${tenantId}".`);
    }

    // Verify tool is registered on this server instance
    const toolExists = instance.tools.some(t => t.name === toolName);
    if (!toolExists) {
      throw new Error(`Tool "${toolName}" is not registered on MCP Server "${serverId}".`);
    }

    instance.log(`Calling dynamic tool "${toolName}" with args: ${JSON.stringify(args)}`);

    // Standard tools/call JSON-RPC payload delivery
    const response = await instance.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });

    instance.log(`Tool "${toolName}" execution completed successfully.`);

    return {
      success: true,
      result: response
    };
  }

  /**
   * Helper function that extracts client-friendly DTO (Data Transfer Object) status details
   * from an `McpGenericServerInstance` object.
   * @param {McpGenericServerInstance} instance - The server instance to get status from.
   * @returns {object} An object containing the server's ID, name, description, connection status, tool count, tools, and recent logs.
   */
  getServerStatusDTO(instance) {
    return {
      id: instance.serverId,
      name: instance.config.name,
      description: instance.config.description,
      connected: instance.initialized,
      toolsCount: instance.tools.length,
      tools: instance.tools,
      logs: instance.terminalLogs
    };
  }

  /**
   * Returns a complete overview of all globally registered servers and their active status
   * for a specific tenant, suitable for a dashboard display.
   * @param {string} tenantId - The ID of the tenant.
   * @returns {object[]} An array of server status objects, including both registered and active servers.
   */
  getDashboardStatus(tenantId) {
    const userServers = this.getUserServers(tenantId);
    const dashboard = [];

    Object.keys(this.globalRegistry).forEach(serverId => {
      const definition = this.globalRegistry[serverId];
      const active = userServers.get(serverId);

      dashboard.push({
        id: serverId,
        name: definition.name,
        description: definition.description,
        isInstalled: true, // Registered globally
        connected: active ? active.initialized : false,
        toolsCount: active ? active.tools.length : 0,
        tools: active ? active.tools : [],
        logs: active ? active.terminalLogs : []
      });
    });

    return dashboard;
  }
}

/**
 * Singleton instance of the McpOrchestratorService.
 * This instance manages all MCP server operations across the application.
 * @type {McpOrchestratorService}
 */
export const mcpOrchestratorService = new McpOrchestratorService();