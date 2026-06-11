import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { mcpToolboxService } from './mcp_toolbox.service.js';
import { mcpOrchestratorService } from './mcp_orchestrator.service.js';
import { mcpCatalog } from './mcp_catalog.js';

// GCP Secret Manager Integration: Initialize client.
// This will use Application Default Credentials (ADC) to authenticate.
// Ensure the service account running this code has the "Secret Manager Secret Accessor" role.
const secretManagerClient = new SecretManagerServiceClient();
const GcpProjectId = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;

/**
 * GCP Secret Manager Integration: Resolves a value if it's a secret reference.
 * Supports GCP Secret Manager secrets (e.g., "gcp-secret-manager://my-secret-name")
 * and environment variables (e.g., "env://MY_ENV_VAR").
 * If no project is specified in the GCP path, it uses the project from the environment.
 * @param {string} value The value to resolve.
 * @returns {Promise<string>} The resolved secret or the original value.
 */
const resolveSecret = async (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  // Resolve GCP Secret Manager secrets
  if (value.startsWith('gcp-secret-manager://')) {
    let secretPath = value.substring('gcp-secret-manager://'.length);
    // Automatically prepend project ID if not present
    if (!secretPath.startsWith('projects/')) {
        if (!GcpProjectId) {
            throw new Error('GCP Project ID is not configured. Set GCP_PROJECT or GOOGLE_CLOUD_PROJECT environment variable.');
        }
        secretPath = `projects/${GcpProjectId}/secrets/${secretPath}`;
    }
    // Append /versions/latest if no version is specified
    if (!/versions\//.test(secretPath)) {
        secretPath = `${secretPath}/versions/latest`;
    }

    try {
      const [version] = await secretManagerClient.accessSecretVersion({ name: secretPath });
      return version.payload.data.toString('utf8');
    } catch (error) {
      console.error(`Failed to resolve GCP Secret Manager secret: ${secretPath}`, error);
      throw new Error(`Could not resolve secret: ${value}`);
    }
  }

  // Resolve secrets from environment variables
  if (value.startsWith('env://')) {
    const envVarName = value.substring('env://'.length);
    const envVarValue = process.env[envVarName];
    if (envVarValue === undefined) {
      throw new Error(`Environment variable not found for secret reference: ${value}`);
    }
    return envVarValue;
  }

  return value;
};

/**
 * GCP Secret Manager Integration: Recursively traverses an object or array
 * and resolves any string values that are secret references.
 * @param {any} data The object or array to process.
 * @returns {Promise<void>} A promise that resolves when all secrets are processed.
 */
const resolveSecretsInObject = async (data) => {
    if (data === null || typeof data !== 'object') {
        return;
    }

    if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            if (typeof item === 'string') {
                data[i] = await resolveSecret(item);
            } else if (typeof item === 'object') {
                await resolveSecretsInObject(item);
            }
        }
    } else {
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                const value = data[key];
                if (typeof value === 'string') {
                    data[key] = await resolveSecret(value);
                } else if (typeof value === 'object') {
                    await resolveSecretsInObject(value);
                }
            }
        }
    }
};

// SECURITY PATCH: Helper function to sanitize output and prevent reflected XSS.
// This should be used for any user-provided input that is reflected in responses (e.g., error messages).
const sanitizeForOutput = (str) => {
  if (typeof str !== 'string') return str;
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  return str.replace(/[&<>"'`=/]/g, (m) => map[m]);
};

// SECURITY PATCH: Helper function to validate identifiers (e.g., userId, serverId, appId, toolName).
// This helps prevent path traversal, command injection, and other injection attacks by enforcing a strict format.
const isValidIdentifier = (id) => {
    if (typeof id !== 'string' || id.length === 0 || id.length > 128) return false;
    // Allows alphanumeric characters, hyphens, and underscores.
    const validIdentifierRegex = /^[a-zA-Z0-9_-]+$/;
    return validIdentifierRegex.test(id);
};

// ==========================================
// A. Legacy Database MCP Toolbox Endpoints
// ==========================================

const connectController = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    // SECURITY WARNING: The connectionDetails object contains sensitive credentials.
    // Ensure this data is handled securely, encrypted in transit (with TLS), and not logged.
    // A schema validation should be performed on this object.
    const { connectionDetails, customTools } = req.body;

    if (!connectionDetails || !connectionDetails.type) {
      return res.status(400).json({
        success: false,
        error: 'connectionDetails with type (e.g. postgres, bigquery) is required.',
      });
    }

    // GCP Secret Manager Integration: Resolve any secret references in connectionDetails.
    await resolveSecretsInObject(connectionDetails);

    const result = await mcpToolboxService.startMcpServer(userId, connectionDetails, customTools || []);
    res.status(200).json(result);
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in connectController:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

const queryController = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'query prompt is required and must be a string.' });
    }

    // SECURITY WARNING: The 'query' parameter is passed to the service layer. This is a high-risk area for SQL injection.
    // The mcpToolboxService.querySecureDatabase service MUST use parameterized queries to prevent SQL injection.
    // As a defense-in-depth measure, we add a basic check to block queries containing multiple statements.
    const sanitizedQuery = query.trim();
    if (sanitizedQuery.includes(';')) {
        return res.status(400).json({ success: false, error: 'Multiple statements are not allowed in a single query.' });
    }

    const result = await mcpToolboxService.querySecureDatabase(userId, sanitizedQuery);
    res.status(200).json(result);
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in queryController:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

const disconnectController = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    const result = await mcpToolboxService.stopMcpServer(userId);
    res.status(200).json(result);
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in disconnectController:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

const statusController = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    const result = await mcpToolboxService.getStatus(userId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in statusController:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

// ==========================================
// B. New Universal Multi-Server Endpoints
// ==========================================

const connectServerController = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    const { serverId } = req.body;

    if (!serverId) {
      return res.status(400).json({ success: false, error: 'serverId is required.' });
    }

    // SECURITY PATCH: Validate serverId format to prevent injection attacks.
    if (!isValidIdentifier(serverId)) {
        return res.status(400).json({ success: false, error: 'Invalid serverId format.' });
    }

    const result = await mcpOrchestratorService.startServer(userId, serverId);
    res.status(200).json(result);
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in connectServerController:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

const stopServerController = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    const { serverId } = req.body;

    if (!serverId) {
      return res.status(400).json({ success: false, error: 'serverId is required.' });
    }

    // SECURITY PATCH: Validate serverId format to prevent injection attacks.
    if (!isValidIdentifier(serverId)) {
        return res.status(400).json({ success: false, error: 'Invalid serverId format.' });
    }

    const result = await mcpOrchestratorService.stopServer(userId, serverId);
    res.status(200).json(result);
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in stopServerController:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

const listToolsController = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    const { serverId } = req.params;

    if (!serverId) {
      return res.status(400).json({ success: false, error: 'serverId parameter is required.' });
    }

    // SECURITY PATCH: Validate serverId format to prevent injection attacks.
    if (!isValidIdentifier(serverId)) {
        return res.status(400).json({ success: false, error: 'Invalid serverId format.' });
    }

    const userServers = await mcpOrchestratorService.getUserServers(userId);
    const active = userServers.get(serverId);

    if (!active) {
      // SECURITY PATCH: Sanitize serverId before including it in the response to prevent reflected XSS.
      return res.status(404).json({ success: false, error: `MCP Server "${sanitizeForOutput(serverId)}" is not active.` });
    }

    res.status(200).json({
      success: true,
      tools: active.tools
    });
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in listToolsController:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

const callToolController = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    const { serverId, toolName, arguments: toolArgs } = req.body;

    if (!serverId || !toolName) {
      return res.status(400).json({ success: false, error: 'serverId and toolName are required.' });
    }

    // SECURITY PATCH: Validate serverId and toolName format to prevent injection attacks.
    if (!isValidIdentifier(serverId) || !isValidIdentifier(toolName)) {
        return res.status(400).json({ success: false, error: 'Invalid serverId or toolName format.' });
    }

    // GCP Secret Manager Integration: Resolve any secret references in tool arguments.
    if (toolArgs) {
        await resolveSecretsInObject(toolArgs);
    }

    // SECURITY WARNING: The toolArgs object is passed directly to the service.
    // It should be validated against a schema specific to the tool being called to prevent unexpected behavior or injection.
    const result = await mcpOrchestratorService.callTool(userId, serverId, toolName, toolArgs || {});
    res.status(200).json(result);
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in callToolController:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

const dashboardStatusController = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    const status = await mcpOrchestratorService.getDashboardStatus(userId);
    res.status(200).json({ success: true, servers: status });
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in dashboardStatusController:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

/**
 * Server-Sent Events (SSE) dynamic connection bridge
 * Exposes full compatibility with SSE-based web transports
 */
const sseConnectionHandler = async (req, res) => {
  // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
  const userId = req.user?.userId || req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
  }
  // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
  if (!isValidIdentifier(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
  }

  const { serverId } = req.query;

  if (!serverId) {
    return res.status(400).json({ success: false, error: 'serverId parameter is required for SSE transport.' });
  }

  // SECURITY PATCH: Validate serverId format to prevent injection attacks.
  if (!isValidIdentifier(serverId)) {
      return res.status(400).json({ success: false, error: 'Invalid serverId format.' });
  }

  try {
    const userServers = await mcpOrchestratorService.getUserServers(userId);
    const server = userServers.get(serverId);

    if (!server || !server.process) {
      return res.status(404).json({ success: false, error: 'Server is not running or process not found.' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      // SECURITY PATCH: Add security headers for SSE endpoints.
      'X-Content-Type-Options': 'nosniff'
    });

    res.write(`event: endpoint\ndata: ${JSON.stringify({ message: 'SSE Connection Established.' })}\n\n`);

    const onData = (data) => {
      if (res.writableEnded) {
        server.process.stdout.off('data', onData);
        return;
      }
      // SECURITY PATCH: Ensure data sent over SSE is properly formatted as a JSON string.
      // This prevents multi-line data chunks from breaking the SSE message framing.
      const message = data.toString();
      res.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
    };

    server.process.stdout.on('data', onData);

    req.on('close', () => {
      if (server.process) {
        server.process.stdout.off('data', onData);
      }
      if (!res.writableEnded) {
        res.end();
      }
    });
  } catch (error) {
    console.error('Error in SSE handler:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'An internal server error occurred.' });
    } else if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'An internal server error occurred.' })}\n\n`);
      res.end();
    }
  }
};

/**
 * Handles REST/HTTP Message Delivery directly to standard stdin streams
 */
const mcpMessageHandler = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    const { serverId, message } = req.body;

    if (!serverId || !message) {
      return res.status(400).json({ success: false, error: 'serverId and message payload are required.' });
    }

    // SECURITY PATCH: Validate serverId format to prevent injection attacks.
    if (!isValidIdentifier(serverId)) {
        return res.status(400).json({ success: false, error: 'Invalid serverId format.' });
    }

    // SECURITY WARNING: The 'message' object is passed to a remote process.
    // It should be validated against a strict schema of allowed methods and parameters
    // to prevent remote code execution or other exploits.
    if (typeof message !== 'object' || message === null || !message.method) {
        return res.status(400).json({ success: false, error: 'Invalid message payload format.' });
    }

    // GCP Secret Manager Integration: Resolve any secret references in message parameters.
    if (message.params) {
        await resolveSecretsInObject(message.params);
    }

    const userServers = await mcpOrchestratorService.getUserServers(userId);
    const server = userServers.get(serverId);

    if (!server || !server.initialized) {
      // SECURITY PATCH: Sanitize serverId before including it in the response to prevent reflected XSS.
      return res.status(404).json({ success: false, error: `MCP Server "${sanitizeForOutput(serverId)}" is not running.` });
    }

    const response = await server.sendRequest(message.method, message.params || {});
    res.status(200).json({
      jsonrpc: '2.0',
      result: response,
      id: message.id
    });
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in mcpMessageHandler:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

const registerServerController = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    const { serverId, serverConfig } = req.body;

    if (!serverId || !serverConfig) {
      return res.status(400).json({ success: false, error: 'serverId and serverConfig details are required.' });
    }

    // SECURITY PATCH: Validate serverId format to prevent injection attacks.
    if (!isValidIdentifier(serverId)) {
        return res.status(400).json({ success: false, error: 'Invalid serverId format.' });
    }

    // GCP Secret Manager Integration: Resolve any secret references in the server configuration.
    if (serverConfig) {
        await resolveSecretsInObject(serverConfig);
    }

    // SECURITY WARNING: The 'serverConfig' object is written to disk and used to spawn processes.
    // This is a high-risk operation. The config MUST be validated against a strict schema
    // to prevent arbitrary code execution, path traversal, or other exploits.
    // Example: Whitelist allowed 'command' and 'args' values.

    const result = await mcpOrchestratorService.registerServer(userId, serverId, serverConfig);
    res.status(200).json(result);
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in registerServerController:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

const installAppController = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal in file paths.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    const { appId, env, databaseUrl: rawDatabaseUrl } = req.body;

    if (!appId) {
      return res.status(400).json({ success: false, error: 'appId parameter is required.' });
    }

    // SECURITY PATCH: Validate appId format to prevent injection attacks.
    if (!isValidIdentifier(appId)) {
        return res.status(400).json({ success: false, error: 'Invalid appId format.' });
    }

    // GCP Secret Manager Integration: Resolve databaseUrl and env vars if they are secret references.
    const databaseUrl = rawDatabaseUrl ? await resolveSecret(rawDatabaseUrl) : undefined;
    if (env) {
        for (const key of Object.keys(env)) {
            env[key] = await resolveSecret(env[key]);
        }
    }

    const blueprint = mcpCatalog[appId];
    if (!blueprint) {
      // SECURITY PATCH: Sanitize appId before including it in the response to prevent reflected XSS.
      return res.status(404).json({ success: false, error: `MCP Application "${sanitizeForOutput(appId)}" not found in catalog.` });
    }

    const config = JSON.parse(JSON.stringify(blueprint));

    if (config.requiredEnv) {
      for (const requiredKey of config.requiredEnv) {
        const clientVal = env?.[requiredKey];
        if (!clientVal) {
          return res.status(400).json({
            success: false,
            // SECURITY PATCH: Sanitize identifiers in error messages.
            error: `Missing required environment variable "${sanitizeForOutput(requiredKey)}" for app "${sanitizeForOutput(appId)}".`
          });
        }
        config.env[requiredKey] = clientVal;
      }
    }

    // SECURITY WARNING: Merging a user-provided 'env' object can be dangerous.
    // An attacker could override sensitive variables (e.g., PATH, NODE_OPTIONS).
    // It is safer to use an allow-list of environment variables that can be set by the user.
    if (env) {
      config.env = { ...config.env, ...env };
    }

    // SECURITY WARNING: User-provided URLs or arguments can lead to command injection
    // if not handled carefully by the process execution service. The service layer
    // must ensure arguments are passed securely and not interpreted by a shell.
    if (appId === 'postgres' || appId === 'postgresql') {
      if (!databaseUrl) {
        return res.status(400).json({ success: false, error: 'databaseUrl is required to install postgres/postgresql app.' });
      }
      // Further validation on databaseUrl (e.g., format) is recommended.
      config.args.push(databaseUrl);
    } else if (appId === 'sqlite') {
      // The userId has been validated, mitigating path traversal risk here.
      const tenantDbPath = `storage/users/${userId}/databases/sqlite.db`;
      config.args[2] = tenantDbPath;
    }

    const regResult = await mcpOrchestratorService.registerServer(userId, appId, config);
    const startResult = await mcpOrchestratorService.startServer(userId, appId);

    res.status(200).json({
      success: true,
      message: `Application "${config.name}" installed and booted successfully.`,
      serverId: appId,
      registration: regResult,
      connection: startResult
    });
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in installAppController:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

const listUnifiedToolsController = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    const tools = await mcpOrchestratorService.getUnifiedTools(userId);
    res.status(200).json({ success: true, tools });
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in listUnifiedToolsController:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

const callUnifiedToolController = async (req, res) => {
  try {
    // SECURITY PATCH: Removed fallback to 'default_user'. A valid user context is required.
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User not authenticated.' });
    }
    // SECURITY PATCH: Validate userId format to prevent path traversal and other injection attacks.
    if (!isValidIdentifier(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user identifier format.' });
    }

    const { toolName, arguments: toolArgs } = req.body;

    if (!toolName) {
      return res.status(400).json({ success: false, error: 'toolName is required.' });
    }

    // SECURITY PATCH: Validate toolName format to prevent injection attacks.
    if (!isValidIdentifier(toolName)) {
        return res.status(400).json({ success: false, error: 'Invalid toolName format.' });
    }

    // GCP Secret Manager Integration: Resolve any secret references in tool arguments.
    if (toolArgs) {
        await resolveSecretsInObject(toolArgs);
    }

    // SECURITY WARNING: The toolArgs object is passed directly to the service.
    // It should be validated against a schema specific to the tool being called.
    const result = await mcpOrchestratorService.callUnifiedTool(userId, toolName, toolArgs || {});
    res.status(200).json(result);
  } catch (error) {
    // SECURITY PATCH: Avoid leaking internal error details. Log them instead.
    console.error('Error in callUnifiedToolController:', error);
    res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }
};

export const mcpToolboxController = {
  // Legacy
  connectController,
  queryController,
  disconnectController,
  statusController,
  // New Universal
  connectServerController,
  stopServerController,
  listToolsController,
  callToolController,
  dashboardStatusController,
  sseConnectionHandler,
  mcpMessageHandler,
  // Gateway & Registration
  registerServerController,
  installAppController,
  listUnifiedToolsController,
  callUnifiedToolController
};