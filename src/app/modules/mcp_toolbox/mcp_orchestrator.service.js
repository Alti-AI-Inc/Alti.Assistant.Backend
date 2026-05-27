import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import readline from 'readline';
import config from '../../../../config/index.js';
import ComposioAuth from '../composio_v2/composio.model.js';

/**
 * Robust JSON-RPC 2.0 Bridge over Standard I/O (stdio) for MCP Servers
 */
class McpGenericServerInstance {
  constructor(serverId, config, tenantId, onLog) {
    this.serverId = serverId;
    this.config = config;
    this.tenantId = tenantId;
    this.onLog = onLog;
    this.process = null;
    this.rl = null;
    this.requestId = 1;
    this.pendingRequests = new Map(); // id -> { resolve, reject }
    this.initialized = false;
    this.tools = [];
    this.terminalLogs = [];
    this.customEnv = config.env || {};
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
    this.isStopping = false;

    // Resolve placeholders (e.g. {{tenantId}}) in args and env values
    this.resolvedArgs = (config.args || []).map(arg => 
      arg.replace(/\{\{tenantId\}\}/g, tenantId)
    );
    this.resolvedEnv = {};
    Object.keys(this.customEnv).forEach(key => {
      this.resolvedEnv[key] = this.customEnv[key].replace(/\{\{tenantId\}\}/g, tenantId);
    });
  }

  log(message) {
    const logLine = `[${this.serverId.toUpperCase()}] ${message}`;
    this.terminalLogs.push(logLine);
    if (this.terminalLogs.length > 500) this.terminalLogs.shift();
    this.onLog(logLine);
  }

  /**
   * Spawns the MCP subprocess securely over stdio and executes standard handshake
   */
  start() {
    return new Promise((resolve, reject) => {
      if (this.process) {
        return resolve(true);
      }

      this.isStopping = false;
      const cmd = this.config.command;
      const args = this.resolvedArgs;

      this.log(`Spawning MCP process: ${cmd} ${args.join(' ')}`);

      // Ensure directory for storage exists if needed
      const storageDir = path.resolve(`storage/users/${this.tenantId}/mcp_memory`);
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }
      const workspaceDir = path.resolve(`storage/users/${this.tenantId}/workspace`);
      if (!fs.existsSync(workspaceDir)) {
        fs.mkdirSync(workspaceDir, { recursive: true });
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
          shell: true // Required for npx on Windows platforms
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
                name: 'Alti-Backend-Orchestrator',
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
   * Self-Healing recovery daemon
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
   * Refreshes the local tools registration cache by sending tools/list
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
   * Sends a JSON-RPC 2.0 request frame over process stdin
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
   * Sends a JSON-RPC 2.0 notification frame over process stdin
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

  cleanup(error) {
    this.rl = null;
    this.pendingRequests.forEach(({ reject }) => reject(error));
    this.pendingRequests.clear();
    this.initialized = false;
  }

  /**
   * Graceful process termination
   */
  stop() {
    this.isStopping = true;
    this.log('Terminating server process gracefully...');
    
    if (this.process) {
      this.process.removeAllListeners('exit');
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.cleanup(new Error('Process stopped.'));
  }
}

/**
 * Universal Multi-Server MCP Orchestrator Service
 */
class McpOrchestratorService {
  constructor() {
    this.activeUserServers = new Map(); // Record<tenantId, Map<serverId, McpGenericServerInstance>>
    this.globalRegistry = {};
    this.loadRegistry();
    this.startConfigWatcher();
  }

  /**
   * Loads registry config file securely
   */
  loadRegistry() {
    try {
      const configPath = path.resolve('config/mcp_servers.json');
      if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        this.globalRegistry = parsed.mcp_servers || {};
      }
    } catch (err) {
      console.error(`[McpOrchestrator] Failed to load config/mcp_servers.json: ${err.message}`);
    }
  }

  /**
   * Dynamic registry config file watcher daemon (Dynamic Hot-Reloading)
   */
  startConfigWatcher() {
    try {
      const configPath = path.resolve('config/mcp_servers.json');
      if (fs.existsSync(configPath)) {
        let debounceTimer;
        fs.watch(configPath, (eventType) => {
          if (eventType === 'change') {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              console.log('[McpOrchestrator] Dynamic config change detected! Hot-reloading registry...');
              this.loadRegistry();
            }, 300);
          }
        });
      }
    } catch (err) {
      console.error(`[McpOrchestrator] Failed to start config watcher: ${err.message}`);
    }
  }

  /**
   * Virtual tool aggregator - compiles all dynamic tools from all active servers
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
   * Virtual tool caller routing gateway - identifies tool ownership and routes executions dynamically
   */
  async callUnifiedTool(tenantId, toolName, args = {}) {
    const userServers = this.getUserServers(tenantId);
    let targetServerId = null;

    userServers.forEach((instance, serverId) => {
      if (instance.initialized && instance.tools.some(t => t.name === toolName)) {
        targetServerId = serverId;
      }
    });

    if (!targetServerId) {
      throw new Error(`Tool "${toolName}" is not registered on any active MCP Server.`);
    }

    return this.callTool(tenantId, targetServerId, toolName, args);
  }

  /**
   * On-the-fly server registration API - updates config file which triggers the dynamic hot-watcher
   */
  async registerServer(tenantId, serverId, serverConfig) {
    if (!serverId || !serverConfig.name || !serverConfig.command) {
      throw new Error('Invalid server configuration. Name and command are required.');
    }

    const configPath = path.resolve('config/mcp_servers.json');
    let currentConfig = { mcp_servers: {} };

    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      currentConfig = JSON.parse(fileContent);
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

    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf-8');
    
    // Manually force immediate update in memory to prevent watcher delay race-conditions
    this.globalRegistry = currentConfig.mcp_servers;

    return {
      success: true,
      message: `Server "${serverConfig.name}" registered successfully.`,
      registry: this.globalRegistry
    };
  }

  /**
   * Fetches the nested server map for a user workspace
   */
  getUserServers(tenantId) {
    if (!this.activeUserServers.has(tenantId)) {
      this.activeUserServers.set(tenantId, new Map());
    }
    return this.activeUserServers.get(tenantId);
  }

  /**
   * Boots up a specific MCP server for a tenant workspace
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
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const appendLog = (line) => {
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`, 'utf-8');
    };

    const instance = new McpGenericServerInstance(serverId, definition, tenantId, appendLog);

    // Inject active connected toolkits and API keys dynamically for Composio
    if (serverId === 'composio') {
      try {
        const activeAuths = await ComposioAuth.find({ userId: tenantId, status: 'ACTIVE' }).lean();
        const toolkits = activeAuths.map(auth => auth.toolkit?.slug).filter(Boolean);
        const toolkitsString = toolkits.join(',');

        instance.resolvedEnv['COMPOSIO_API_KEY'] = config.composio.orgApiKey;
        instance.resolvedEnv['TENANT_ID'] = tenantId;
        instance.resolvedEnv['COMPOSIO_TOOLKITS'] = toolkitsString;
      } catch (dbError) {
        appendLog(`[ERROR] Failed to query active Composio toolkits: ${dbError.message}`);
      }
    }

    userServers.set(serverId, instance);

    await instance.start();

    return {
      success: true,
      message: `MCP Server "${definition.name}" successfully connected.`,
      server: this.getServerStatusDTO(instance)
    };
  }

  /**
   * Halts a specific active MCP server instance
   */
  async stopServer(tenantId, serverId) {
    const userServers = this.getUserServers(tenantId);
    if (userServers.has(serverId)) {
      const active = userServers.get(serverId);
      active.stop();
      userServers.delete(serverId);
      return { success: true, message: `MCP Server "${serverId}" stopped successfully.` };
    }
    return { success: false, message: `No active server instance found for ID "${serverId}".` };
  }

  /**
   * Halts all active MCP servers for a tenant workspace
   */
  async stopAllUserServers(tenantId) {
    const userServers = this.getUserServers(tenantId);
    userServers.forEach((instance, serverId) => {
      instance.stop();
    });
    userServers.clear();
    return { success: true, message: 'All active MCP servers stopped successfully.' };
  }

  /**
   * Executes a safe dynamic tool call on a specific running server instance
   */
  async callTool(tenantId, serverId, toolName, args = {}) {
    const userServers = this.getUserServers(tenantId);
    const instance = userServers.get(serverId);

    if (!instance || !instance.initialized) {
      throw new Error(`MCP Server "${serverId}" is not running or initialized.`);
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
   * Helper that extracts client DTO status details
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
   * Returns complete overview of all global and active user servers
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

export const mcpOrchestratorService = new McpOrchestratorService();
