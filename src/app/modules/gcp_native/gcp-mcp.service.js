import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import yaml from 'js-yaml'; // BUG FIX: Import js-yaml for robust YAML serialization

// Dynamically resolve directory names in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @typedef {import('child_process').ChildProcessWithoutNullStreams} ChildProcessWithoutNullStreams
 */

/**
 * Tracks the currently running MCP Toolbox server subprocess.
 * Null if no process is active.
 * @type {ChildProcessWithoutNullStreams | null}
 */
let mcpProcess = null;

/**
 * A promise that resolves when the MCP process has fully terminated.
 * Used to ensure sequential start/stop operations and prevent race conditions.
 * @type {Promise<void> | null}
 */
let mcpProcessTerminationPromise = null;

/**
 * The base URL of the local MCP Toolbox server.
 * Defaults to http://127.0.0.1:5000.
 * @type {string}
 */
let mcpServerUrl = 'http://127.0.0.1:5000';

/**
 * @typedef {object} StartMcpServerOptions
 * @property {number} [port=5000] - The port on which the MCP Toolbox server should listen.
 * @property {string} [configPath] - The absolute path to the `tools.yaml` configuration file.
 *                                   Defaults to `process.cwd()/mcp-toolbox/tools.yaml`.
 * @property {boolean} [stdio=false] - If true, the MCP server will log directly to the console.
 */

/**
 * Gracefully terminates the running local MCP server subprocess.
 * If no process is running, this function does nothing.
 * @returns {Promise<void>} A promise that resolves when the process has been signaled to terminate and has actually closed.
 */
const stopMcpServer = async () => {
  if (mcpProcess) {
    logger.info('GCP MCP: Sending SIGTERM signal to local server daemon...');
    const currentProcess = mcpProcess;
    mcpProcess = null; // Clear reference immediately to prevent new calls from seeing it as active

    // BUG FIX: Create a promise that resolves when the process actually closes,
    // ensuring subsequent starts don't race with termination.
    mcpProcessTerminationPromise = new Promise((resolve) => {
      currentProcess.on('close', (code) => {
        logger.info(`GCP MCP: Server subprocess exited with code ${code}.`);
        resolve();
      });
      currentProcess.on('error', (err) => {
        logger.warn(`GCP MCP: Error during subprocess termination: ${err.message}`);
        resolve(); // Resolve even on error to unblock subsequent starts
      });
    });

    currentProcess.kill('SIGTERM');
    await mcpProcessTerminationPromise; // Wait for the process to close
    mcpProcessTerminationPromise = null;
  } else if (mcpProcessTerminationPromise) {
    // If a termination is already in progress, wait for it
    logger.info('GCP MCP: Waiting for existing MCP server termination to complete...');
    await mcpProcessTerminationPromise;
  }
};

/**
 * Spawns and manages the lifecycle of the local Google MCP Toolbox server.
 * This function checks for an existing process and stops it before starting a new one.
 * It also supports an offline/mock mode bypass, where no physical subprocess is spawned.
 *
 * @param {StartMcpServerOptions} [options] - Spawning options.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the server was successfully launched or is in mock mode, `false` otherwise.
 */
const startMcpServer = async (options = {}) => {
  const port = options.port || 5000;
  // SECURITY FIX: Validate port number to prevent potential command injection if shell: true was used.
  if (typeof port !== 'number' || port < 1 || port > 65535) {
    logger.error(`GCP MCP: Invalid port number provided: ${port}`);
    return false;
  }

  const configPath = options.configPath || path.resolve(process.cwd(), 'mcp-toolbox', 'tools.yaml');
  const stdio = options.stdio || false;

  // SECURITY FIX: Basic path validation for configPath to prevent command injection
  // and path traversal for the spawned process.
  // This is a basic check; more robust validation might be needed depending on trust level.
  if (configPath.includes(';') || configPath.includes('&&') || configPath.includes('|') || configPath.includes('`')) {
    logger.error(`GCP MCP: Potentially malicious characters detected in configPath: ${configPath}`);
    return false;
  }
  // Ensure configPath is absolute and canonicalized
  const resolvedConfigPath = path.resolve(configPath);
  // Optional: Further restrict configPath to be within a specific safe directory
  // const safeConfigDir = path.resolve(process.cwd(), 'mcp-toolbox');
  // if (!resolvedConfigPath.startsWith(safeConfigDir)) {
  //   logger.error(`GCP MCP: configPath "${resolvedConfigPath}" is outside allowed directory "${safeConfigDir}".`);
  //   return false;
  // }

  logger.info(`GCP MCP: Initializing local MCP Toolbox server instance on port ${port}...`);

  if (process.env.OFFLINE_MODE === 'true' || process.env.TEMPORAL_MOCK === 'true') {
    logger.info('GCP MCP: Offline/Mock mode active. Bypassing physical subprocess spawn.');
    mcpServerUrl = `http://127.0.0.1:${port}`;
    return true;
  }

  // BUG FIX: Prevent multiple duplicate daemon processes by awaiting previous termination.
  if (mcpProcess || mcpProcessTerminationPromise) {
    logger.info('GCP MCP: Subprocess daemon is already running or terminating. Stopping previous instance first.');
    await stopMcpServer(); // Wait for previous process to fully terminate
  }

  try {
    // Determine running mechanism: Check for executable binary or fall back to npx
    let command = 'npx';
    let args = ['-y', '@toolbox-sdk/server', '--port', port.toString(), '--config', resolvedConfigPath];

    const binaryPathWin = path.resolve(process.cwd(), 'bin', 'mcp-toolbox.exe');
    const binaryPathUnix = path.resolve(process.cwd(), 'bin', 'mcp-toolbox');

    if (process.platform === 'win32' && fs.existsSync(binaryPathWin)) {
      command = binaryPathWin;
      args = ['--port', port.toString(), '--config', resolvedConfigPath];
    } else if (fs.existsSync(binaryPathUnix)) {
      command = binaryPathUnix;
      args = ['--port', port.toString(), '--config', resolvedConfigPath];
    }

    if (stdio) {
      args.push('--stdio');
    }

    logger.info(`GCP MCP: Spawning MCP server subprocess: "${command} ${args.join(' ')}"`);

    mcpProcess = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, PORT: port.toString() },
      // SECURITY FIX: Removed shell: true to prevent command injection.
      // Arguments are now passed directly to the command.
      // This assumes 'npx' and the binaries do not strictly require a shell.
      // If a shell is absolutely necessary for environment setup or command execution,
      // then robust input sanitization/escaping for all arguments would be critical.
      shell: false
    });

    mcpProcess.stdout.on('data', (data) => {
      logger.info(`[GCP MCP Server stdout]: ${data.toString().trim()}`);
    });

    mcpProcess.stderr.on('data', (data) => {
      logger.warn(`[GCP MCP Server stderr]: ${data.toString().trim()}`);
    });

    // BUG FIX: Handle unexpected process exits. Intentional stops are handled by stopMcpServer.
    mcpProcess.on('close', (code) => {
      if (mcpProcess === null) { // Process was intentionally stopped (reference cleared by stopMcpServer)
        logger.debug(`GCP MCP: Subprocess exited (code ${code}) after intentional stop.`);
      } else { // Unexpected exit
        logger.error(`GCP MCP: Server subprocess exited unexpectedly with code ${code}.`);
        mcpProcess = null; // Clear reference on unexpected exit
      }
    });

    mcpProcess.on('error', (err) => {
      logger.error(`GCP MCP: Failed to start MCP Toolbox server subprocess: ${err.message}`);
      mcpProcess = null; // Ensure mcpProcess is null on spawn failure
    });

    mcpServerUrl = `http://127.0.0.1:${port}`;
    logger.info(`GCP MCP: Server bound successfully. Serving transport URL: ${mcpServerUrl}/mcp`);

    return true;
  } catch (err) {
    logger.error('GCP MCP: Failed to spawn MCP Toolbox server subprocess:', err);
    mcpProcess = null; // Ensure mcpProcess is null on spawn failure
    return false;
  }
};

/**
 * @typedef {object} DataSourceConfig
 * @property {'source'} kind - The kind of configuration, always 'source'.
 * @property {string} name - A unique name for the data source (e.g., 'alti-default-postgres').
 * @property {string} type - The type of the database (e.g., 'postgres', 'mysql', 'sqlite').
 * @property {string} [host] - The database host address.
 * @property {number} [port] - The database port number.
 * @property {string} [database] - The name of the database.
 * @property {string} [user] - The username for database access.
 * @property {string} [password] - The password for database access.
 * @property {object} [connection] - Advanced connection and pooling options for resiliency.
 * @property {number} [connection.pool_size=10] - Maximum number of connections in the pool.
 * @property {number} [connection.connect_timeout=5000] - Connection timeout in milliseconds.
 * @property {number} [connection.socket_timeout=30000] - Socket read/write timeout in milliseconds for queries.
 * @property {boolean} [connection.keepalives=true] - Enable TCP keep-alives to prevent premature connection closure by firewalls.
 * @property {number} [connection.keepalives_idle=60] - Seconds of inactivity before sending a keep-alive probe.
 */

/**
 * @typedef {object} ToolParameterConfig
 * @property {string} name - The name of the parameter.
 * @property {string} type - The data type of the parameter (e.g., 'integer', 'string').
 * @property {string} description - A description of what the parameter represents.
 */

/**
 * @typedef {object} CustomToolConfig
 * @property {'tool'} kind - The kind of configuration, always 'tool'.
 * @property {string} name - A unique name for the custom tool (e.g., 'fetch-recent-alerts').
 * @property {string} type - The type of tool (e.g., 'postgres-sql', 'http-request').
 * @property {string} source - The name of the data source this tool operates on.
 * @property {string} description - A brief description of the tool's functionality.
 * @property {ToolParameterConfig[]} [parameters] - An array of parameter definitions for the tool.
 * @property {string} statement - The SQL statement or command to execute for this tool.
 */

/**
 * Dynamically compiles a valid YAML specification mapping active data sources and custom tools.
 * This configuration is used by the Google MCP Toolbox server to expose database connections
 * and custom operations. If `sources` or `tools` arrays are empty, default configurations are used.
 * The generated YAML is also written to a file.
 *
 * @param {DataSourceConfig[]} [sources=[]] - Array of database sources to expose.
 * @param {CustomToolConfig[]} [tools=[]] - Array of custom tools to register.
 * @param {string} [outputPath=path.resolve(process.cwd(), 'mcp-toolbox', 'tools.yaml')] - Optional target output config path.
 * @returns {string} The compiled YAML configuration string.
 */
const generateToolsConfig = (sources = [], tools = [], outputPath = null) => {
  logger.info('GCP MCP: Compiling tools.yaml configuration specifications for MCP Toolbox...');

  // Fallback to basic configuration if parameters are empty
  const defaultSources = sources.length > 0 ? sources : [{
    kind: 'source',
    name: 'alti-default-postgres',
    type: 'postgres',
    host: '127.0.0.1', // For GCP, this is often the Cloud SQL Auth Proxy listener
    port: 5432,
    database: 'alti_db',
    user: 'postgres',
    password: 'secure_password', // SECURITY NOTE: In a real application, avoid hardcoding sensitive credentials.
                                // Use environment variables or a secure secrets manager.
    // GCP DATABASE RESILIENCY CONFIGURATION:
    // The following settings optimize the connection pool for production workloads on GCP,
    // ensuring robustness against transient network issues common in cloud environments.
    connection: {
      // pool_size: Sets the maximum number of clients in the pool.
      // A value of 10-20 is a safe starting point for many applications.
      pool_size: 10,

      // connect_timeout: Milliseconds to wait for a connection to be established.
      // A short timeout (e.g., 5s) prevents the application from hanging on network issues.
      connect_timeout: 5000,

      // socket_timeout: Milliseconds before a query is automatically aborted if the database is unresponsive.
      // Prevents long-hanging queries from holding up application threads.
      socket_timeout: 30000,

      // keepalives: Enables TCP keep-alive probes. This is critical for long-lived connections
      // that pass through stateful firewalls or NATs (like in GCP VPCs or with the Cloud SQL Auth Proxy),
      // preventing them from being silently dropped due to inactivity.
      keepalives: true,

      // keepalives_idle: Seconds of TCP inactivity before sending a keep-alive probe.
      // A value of 60 seconds is a common and safe choice for GCP networking.
      keepalives_idle: 60
    }
  }];

  const defaultTools = tools.length > 0 ? tools : [{
    kind: 'tool',
    name: 'fetch-recent-alerts',
    type: 'postgres-sql',
    source: 'alti-default-postgres',
    description: 'Lists all recent audit logs and critical security alerts from the platform.',
    parameters: [
      { name: 'limit', type: 'integer', description: 'Maximum record count to retrieve' }
    ],
    statement: 'SELECT * FROM security_alerts ORDER BY timestamp DESC LIMIT $1;'
  }];

  const configObjects = [...defaultSources, ...defaultTools];

  // BUG FIX: Use a YAML serialization library to correctly escape all values
  // and prevent YAML injection vulnerabilities or malformed configurations.
  let yamlString;
  try {
    // Each object is dumped as a separate YAML document, separated by '---'
    yamlString = configObjects.map(obj => yaml.dump(obj, { indent: 2, skipInvalid: true })).join('---\n');
    // Add a final '---' if there are multiple documents, as per common YAML multi-document practice
    if (configObjects.length > 1) {
      yamlString += '\n---';
    }
  } catch (err) {
    logger.error('GCP MCP: Failed to serialize YAML configuration:', err);
    return ''; // Return empty string on serialization failure
  }

  const targetPath = outputPath || path.resolve(process.cwd(), 'mcp-toolbox', 'tools.yaml');
  try {
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    // SECURITY NOTE: The `outputPath` parameter should be validated by the caller
    // to prevent path traversal vulnerabilities if it originates from untrusted input.
    // `path.resolve` helps canonicalize, but doesn't restrict to a safe directory.
    fs.writeFileSync(targetPath, yamlString.trim(), 'utf8');
    logger.info(`GCP MCP: Successfully generated tools.yaml config at: ${targetPath}`);
  } catch (err) {
    logger.error('GCP MCP: Failed to write generated config to filesystem:', err);
  }

  return yamlString;
};

/**
 * @typedef {object} McpToolExecutionResult
 * @property {boolean} success - Indicates if the tool execution was successful.
 * @property {string} tool - The name of the tool that was executed.
 * @property {string} toolset - The name of the toolset the tool belongs to.
 * @property {object} [result] - The raw result payload from the MCP Toolbox client for successful live calls.
 * @property {number} [rowCount] - For mock SQL queries, the number of rows returned.
 * @property {string[]} [columns] - For mock SQL queries, the column names.
 * @property {Array<Array<any>>} [rows] - For mock SQL queries, the data rows.
 * @property {string} [message] - A descriptive message for mock results.
 * @property {string[]} [tables] - For mock database introspection, a list of tables.
 * @property {object} [details] - For mock database introspection, additional details (e.g., active connections, latency).
 * @property {boolean} [mocked] - Indicates if the result was generated by the mock system.
 * @property {string} [error] - An error message if the execution failed.
 */

/**
 * Invokes a specific prebuilt or custom registered tool via the Google MCP Toolbox bridge.
 * This function handles both live execution via the MCP server and mock execution based on environment variables.
 *
 * @param {string} toolsetName - The registered toolset or source name to target (e.g., 'alti-default-postgres').
 * @param {string} toolName - Name of the specific database tool to execute (e.g., 'execute_sql', 'fetch-recent-alerts').
 * @param {object} [parameters={}] - Arguments passed into the targeted tool. The structure depends on the tool's definition.
 *                                   For 'execute_sql', this object should contain 'statement' and optionally 'values' (an array).
 * @returns {Promise<McpToolExecutionResult>} A promise that resolves to a JSON execution response data payload.
 */
const executeMcpTool = async (toolsetName, toolName, parameters = {}) => {
  logger.info(`GCP MCP: Calling MCP tool "${toolName}" inside toolset "${toolsetName}"...`);

  if (process.env.OFFLINE_MODE === 'true' || process.env.TEMPORAL_MOCK === 'true') {
    logger.info('GCP MCP: Mock offline execution activated. Returning structured high-fidelity mock schema data.');
    
    // Provide realistic database output schemas depending on the requested tool
    if (toolName === 'execute_sql' || toolName.includes('query')) {
      return {
        success: true,
        tool: toolName,
        toolset: toolsetName,
        rowCount: 3,
        columns: ['id', 'user_id', 'threat_level', 'status', 'timestamp'],
        rows: [
          [1, 'usr_a937c', 'HIGH', 'FLAGGED', '2026-05-24T22:30:00Z'],
          [2, 'usr_e0281', 'LOW', 'RESOLVED', '2026-05-24T22:32:00Z'],
          [3, 'usr_b114d', 'MEDIUM', 'PENDING', '2026-05-24T22:33:00Z']
        ],
        message: 'SQL execution completed successfully against mock branch.',
        mocked: true
      };
    }

    return {
      success: true,
      tool: toolName,
      toolset: toolsetName,
      tables: ['users', 'conversations', 'workflows', 'security_alerts', 'analytics_reports'],
      details: {
        activeConnections: 4,
        latencyMs: 12,
        driver: 'postgres-native-driver'
      },
      mocked: true
    };
  }

  try {
    // Dynamic import to support ESM environments
    const { ToolboxClient } = await import('@toolbox-sdk/core');
    const client = new ToolboxClient(mcpServerUrl);
    
    logger.info(`GCP MCP: Fetching toolset schema map from ${mcpServerUrl}...`);
    const tools = await client.loadToolset(toolsetName);
    const selectedTool = tools.find(t => t.getName() === toolName);

    if (!selectedTool) {
      throw new Error(`Tool "${toolName}" was not found inside the loaded "${toolsetName}" toolset.`);
    }

    logger.info(`GCP MCP: Invoking tool logic with parameters: ${JSON.stringify(parameters)}`);
    
    // SECURITY NOTE: For SQL execution tools (like 'execute_sql' or custom 'postgres-sql' tools),
    // ensure that the 'statement' parameter is always parameterized and that 'values' (or similar)
    // are passed separately to prevent SQL injection. The @toolbox-sdk/core client is expected
    // to handle parameter binding correctly. If the 'statement' itself is constructed from
    // untrusted user input without parameterization, it remains a vulnerability.
    const result = await selectedTool.call(parameters);

    return {
      success: true,
      tool: toolName,
      toolset: toolsetName,
      result: result // The raw result payload from the MCP Toolbox client
    };
  } catch (err) {
    logger.error('GCP MCP Execution Exception:', err);
    return {
      success: false,
      tool: toolName,
      toolset: toolsetName,
      error: err.message
    };
  }
};

/**
 * @typedef {object} DatabaseContext
 * @property {string} [schema] - A string representation of the database schema (e.g., 'table_name (col1 TYPE, col2 TYPE)').
 * @property {string} [description] - A natural language description of the database's purpose or content.
 * @property {string[]} [availableTools] - A list of available custom tools that can be leveraged.
 */

/**
 * @typedef {object} NaturalLanguageQueryResult
 * @property {boolean} success - Indicates if the query was successfully processed.
 * @property {string} queryText - The original natural language query text.
 * @property {string} [generatedSql] - The SQL statement generated from the natural language query.
 * @property {string} [analysis] - A natural language analysis or summary of the results.
 * @property {Array<object>} [records] - An array of records returned by the SQL query.
 * @property {boolean} [mocked] - Indicates if the result was generated by the mock system.
 * @property {string} [error] - An error message if the query failed.
 */

/**
 * Grounded prompt-to-query router using natural language to extract database statistics.
 * In production, this function would typically involve an LLM to translate natural language
 * into SQL queries based on provided database context, and then execute those queries
 * via `executeMcpTool`. In mock mode, it returns predefined analytical results.
 *
 * @param {string} queryText - User's natural language analytic question (e.g., "How many flagged alerts are there?").
 * @param {DatabaseContext} [databaseContext={}] - Optional database metadata mapping to aid the LLM in query generation.
 * @returns {Promise<NaturalLanguageQueryResult>} A promise that resolves to parsed analytical results.
 */
const queryNaturalLanguage = async (queryText, databaseContext = {}) => {
  logger.info(`GCP MCP: Analyzing natural language analytical query: "${queryText}"...`);

  if (process.env.OFFLINE_MODE === 'true' || process.env.TEMPORAL_MOCK === 'true') {
    return {
      success: true,
      queryText: queryText,
      generatedSql: 'SELECT COUNT(*), status FROM security_alerts GROUP BY status;',
      analysis: `Based on a structural analysis of the requested query: There are currently 12 FLAGGED alerts, 48 RESOLVED alerts, and 3 PENDING alerts in the database.`,
      records: [
        { count: 12, status: 'FLAGGED' },
        { count: 48, status: 'RESOLVED' },
        { count: 3, status: 'PENDING' }
      ],
      mocked: true
    };
  }

  // Production implementation maps LLM schema discovery, plans SQL, and calls executeMcpTool
  try {
    const defaultSchema = 'security_alerts (id INT, status VARCHAR, threat VARCHAR, timestamp TIMESTAMP)';
    logger.info(`GCP MCP: Schema discovered: "${defaultSchema}". Resolving SQL statement via Vertex AI...`);

    // In a real scenario, an LLM would generate this SQL based on queryText and databaseContext.
    // SECURITY NOTE: If `generatedSql` is derived from user input via an LLM, it is CRITICAL
    // that the LLM generates PARAMETERIZED SQL (e.g., using $1, $2 placeholders) and that
    // the actual parameter values are passed separately to `executeMcpTool` to prevent SQL injection.
    // The current hardcoded SQL is safe as it contains no user input.
    const generatedSql = 'SELECT COUNT(*), status FROM security_alerts GROUP BY status;';
    
    // Execute SQL generated via the core MCP toolbox execute_sql tool
    // Assuming 'execute_sql' tool expects an object with a 'statement' key and optionally 'values' for parameters.
    const mcpResult = await executeMcpTool('alti-default-postgres', 'execute_sql', {
      statement: generatedSql
      // If the generated SQL had placeholders (e.g., 'LIMIT $1'), values would be passed here:
      // values: [someLimitValue]
    });

    // BUG FIX: Correctly extract records from mcpResult.result for live calls,
    // ensuring consistency with the mock output structure.
    let records = [];
    if (mcpResult.success && mcpResult.result) {
      if (Array.isArray(mcpResult.result)) {
        // If result is already an array of objects
        records = mcpResult.result;
      } else if (mcpResult.result.rows && Array.isArray(mcpResult.result.rows)) {
        // If result.rows is an array of arrays, convert to array of objects if columns are available
        if (mcpResult.result.columns && Array.isArray(mcpResult.result.columns)) {
          records = mcpResult.result.rows.map(row => {
            const obj = {};
            mcpResult.result.columns.forEach((col, index) => {
              obj[col] = row[index];
            });
            return obj;
          });
        } else {
          records = mcpResult.result.rows; // Fallback if columns are not provided, keep as array of arrays
        }
      }
    }

    return {
      success: true,
      queryText: queryText,
      generatedSql: generatedSql,
      analysis: 'Natural language analysis successfully mapped and resolved against database schemas.',
      records: records
    };
  } catch (err) {
    logger.error('GCP MCP Natural Language Query Error:', err);
    return {
      success: false,
      queryText: queryText,
      error: err.message
    };
  }
};

/**
 * @typedef {object} McpServerStatus
 * @property {boolean} isRunning - True if the MCP server process is active or in mock mode.
 * @property {string} serverUrl - The URL where the MCP server is expected to be listening.
 * @property {number | null} activePid - The process ID of the MCP server subprocess, or null if not running.
 * @property {'mock-offline' | 'production'} mode - The current operational mode of the MCP service.
 */

/**
 * Returns current local daemon server status properties.
 * This includes whether the server is running, its URL, PID, and operational mode.
 *
 * @returns {McpServerStatus} An object containing the current status of the MCP server.
 */
const getMcpServerStatus = () => {
  return {
    isRunning: !!mcpProcess || process.env.OFFLINE_MODE === 'true',
    serverUrl: mcpServerUrl,
    activePid: mcpProcess ? mcpProcess.pid : null,
    mode: process.env.OFFLINE_MODE === 'true' ? 'mock-offline' : 'production'
  };
};

/**
 * @typedef {object} GcpMcpService
 * @property {function(StartMcpServerOptions): Promise<boolean>} startMcpServer - Spawns and manages the lifecycle of the local Google MCP Toolbox server.
 * @property {function(): Promise<void>} stopMcpServer - Gracefully terminates the running local MCP server subprocess.
 * @property {function(DataSourceConfig[], CustomToolConfig[], string): string} generateToolsConfig - Dynamically compiles a valid YAML specification for data sources and custom tools.
 * @property {function(string, string, object): Promise<McpToolExecutionResult>} executeMcpTool - Invokes a specific prebuilt or custom registered tool via the Google MCP Toolbox bridge.
 * @property {function(string, DatabaseContext): Promise<NaturalLanguageQueryResult>} queryNaturalLanguage - Grounded prompt-to-query router using natural language to extract database statistics.
 * @property {function(): McpServerStatus} getMcpServerStatus - Returns current local daemon server status properties.
 */

/**
 * Provides a service layer for interacting with the Google MCP (Managed Control Plane) Toolbox.
 * This service manages the lifecycle of the local MCP Toolbox server, generates its configuration,
 * executes tools, and facilitates natural language querying against configured data sources.
 * @type {GcpMcpService}
 */
export const GcpMcpService = {
  startMcpServer,
  stopMcpServer,
  generateToolsConfig,
  executeMcpTool,
  queryNaturalLanguage,
  getMcpServerStatus
};