import readline from 'readline';
import { Composio } from '@composio/core';

// ==========================================
// 1. Initializing and Dynamic Environment Fetching
// ==========================================

/**
 * @constant {string} apiKey - The API key for authenticating with the Composio API.
 * This environment variable (COMPOSIO_API_KEY) is required for the server to function.
 */
const apiKey = process.env.COMPOSIO_API_KEY;
/**
 * @constant {string} tenantId - The identifier for the tenant or user on whose behalf actions are executed.
 * Defaults to 'default_user' if not provided via the TENANT_ID environment variable.
 */
const tenantId = process.env.TENANT_ID || 'default_user';
/**
 * @constant {string} toolkitsString - A comma-separated string of Composio toolkit slugs
 * to be loaded and exposed by this server. Fetched from the COMPOSIO_TOOLKITS environment variable.
 */
const toolkitsString = process.env.COMPOSIO_TOOLKITS || '';

if (!apiKey) {
  process.stderr.write('[COMPOSIO MCP ERROR] COMPOSIO_API_KEY environment variable is required.\n');
  process.exit(1);
}

/**
 * @constant {string[]} toolkits - An array of cleaned and lowercased toolkit slugs,
 * parsed from the `toolkitsString`. Used to specify which toolkits to load from Composio.
 */
const toolkits = toolkitsString
  .split(',')
  .map(slug => slug.trim().toLowerCase())
  .filter(Boolean);

/**
 * @constant {Composio} composio - An instance of the Composio core client,
 * initialized with the provided API key. Used to interact with the Composio API.
 */
const composio = new Composio({ apiKey });

/**
 * @typedef {object} McpToolInputProperty
 * @property {string} type - The data type of the property (e.g., 'string', 'number', 'boolean', 'object', 'array').
 * @property {string} description - A human-readable description of the property.
 */

/**
 * @typedef {object} McpToolInputSchema
 * @property {string} type - The overall type of the input (typically 'object').
 * @property {Record<string, McpToolInputProperty>} properties - An object where keys are parameter names and values are their schemas.
 * @property {string[]} [required] - An optional array of property names that are required.
 */

/**
 * @typedef {object} McpTool
 * @property {string} name - The unique name of the tool.
 * @property {string} description - A brief description of what the tool does.
 * @property {McpToolInputSchema} inputSchema - The JSON schema defining the input parameters for the tool.
 */

/**
 * @type {McpTool[]} cachedMcpTools - A cache of parsed dynamic tools,
 * mapped into the Model Context Protocol (MCP) tool schema format.
 * This array is populated by the `loadAndMapTools` function.
 */
let cachedMcpTools = [];

// ==========================================
// 2. Dynamic Tool Mapping Engine
// ==========================================

/**
 * Asynchronously loads toolkits from the Composio API, maps them to the
 * Model Context Protocol (MCP) tool schema, and caches the results in `cachedMcpTools`.
 *
 * Handles a special 'test_mock_key' for offline testing, exposing static mock tools.
 * If no toolkits are specified, an empty list of tools is exposed.
 *
 * @async
 * @returns {Promise<void>} A promise that resolves when tools are loaded and mapped, or rejects on error.
 * The function updates `cachedMcpTools` directly.
 */
async function loadAndMapTools() {
  try {
    // Mock branch for offline tests
    if (apiKey === 'test_mock_key') {
      process.stderr.write(`[COMPOSIO MCP] Mock testing key detected. Exposing static mock tools.\n`);
      cachedMcpTools = [
        {
          name: 'GITHUB_STAR_A_REPOSITORY',
          description: 'Stars a repository on GitHub',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Owner of the repo' },
              repo: { type: 'string', description: 'Name of the repo' }
            },
            required: ['owner', 'repo']
          }
        }
      ];
      return;
    }

    if (toolkits.length === 0) {
      process.stderr.write(`[COMPOSIO MCP] No toolkits specified. Exposing empty tools list.\n`);
      cachedMcpTools = [];
      return;
    }

    process.stderr.write(`[COMPOSIO MCP] Introspecting toolkits from Composio API: [${toolkits.join(', ')}]\n`);
    
    // Fetch tools from the official Composio SDK
    const tools = await composio.tools.get({
      apps: toolkits
    });

    // Map Composio tools schema into standard Model Context Protocol tool definitions
    cachedMcpTools = (tools || []).map(t => {
      // Map parameters schema safely to standard JSON Schema structures
      const properties = {};
      const required = [];

      if (t.parameters && t.parameters.properties) {
        Object.keys(t.parameters.properties).forEach(key => {
          const param = t.parameters.properties[key];
          properties[key] = {
            type: param.type || 'string',
            description: param.description || ''
          };
          if (param.required) {
            required.push(key);
          }
        });
      }

      return {
        name: t.name || t.slug,
        description: t.description || 'Pre-approved Composio tool integration.',
        inputSchema: {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined
        }
      };
    });

    process.stderr.write(`[COMPOSIO MCP] Successfully mapped ${cachedMcpTools.length} compliant tools.\n`);
  } catch (err) {
    process.stderr.write(`[COMPOSIO MCP ERROR] Failed to load toolkits: ${err.message}\n`);
    cachedMcpTools = [];
    // Re-throw the error so the caller (rl.on('line')) can handle it as an internal error
    throw err; 
  }
}

// ==========================================
// 3. Stdio JSON-RPC 2.0 Framing Stream
// ==========================================

/**
 * @constant {readline.Interface} rl - A readline interface instance configured to read from
 * `process.stdin` and write to `process.stdout`. It operates in non-terminal mode.
 * This interface is used to receive and send JSON-RPC 2.0 messages.
 */
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

/**
 * Helper function to send a JSON-RPC 2.0 error response.
 * @param {string|number|null} id - The ID of the request, or null for parse errors.
 * @param {number} code - The error code.
 * @param {string} message - The error message.
 */
function sendErrorResponse(id, code, message) {
  const errorResponse = {
    jsonrpc: '2.0',
    id: id,
    error: { code, message }
  };
  process.stdout.write(JSON.stringify(errorResponse) + '\n');
}

/**
 * Event listener for incoming lines from stdin.
 * This function parses each line as a JSON-RPC 2.0 request and dispatches it
 * to the appropriate handler based on the `method` field.
 *
 * Supported methods:
 * - `initialize`: Performs a handshake, loads tools, and returns server capabilities.
 * - `tools/list`: Returns the list of dynamically mapped Composio tools.
 * - `tools/call`: Executes a specified Composio tool with provided arguments.
 *
 * Errors during parsing or execution are reported to `process.stderr` and
 * sent back as JSON-RPC error responses.
 *
 * @async
 * @param {string} line - The raw string line read from `process.stdin`.
 * @returns {Promise<void>} A promise that resolves after processing the line and sending a response.
 */
rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let request;
  let requestId = null; // Default to null for parse errors, will be updated if request.id exists

  try {
    request = JSON.parse(trimmed);
    // If request.id is undefined, it's a notification, and we should not respond.
    // If request.id is null, it's a request expecting a response with id: null.
    // If request.id is a string/number, it's a request expecting a response with that id.
    if (request.id !== undefined) {
      requestId = request.id;
    }
  } catch (parseError) {
    process.stderr.write(`[COMPOSIO MCP ERROR] Unparsable stdin frame: ${parseError.message}\n`);
    // As per JSON-RPC 2.0 spec, for Parse Error, id MUST be null.
    sendErrorResponse(null, -32700, 'Parse error: Invalid JSON was received by the server.');
    return; // Stop processing this line
  }

  // If it's a notification (request.id is undefined), we should not send any response, even errors.
  const isNotification = request.id === undefined;

  try {
    // Basic JSON-RPC 2.0 validation
    if (request.jsonrpc !== '2.0' || !request.method) {
      const errorMessage = 'Invalid Request: Missing jsonrpc version or method.';
      process.stderr.write(`[COMPOSIO MCP ERROR] ${errorMessage} - Request: ${JSON.stringify(request)}\n`);
      if (!isNotification) {
        sendErrorResponse(requestId, -32600, errorMessage);
      }
      return;
    }

    // A. Model Context Protocol standard handshake
    if (request.method === 'initialize') {
      await loadAndMapTools(); // This might throw, caught by the outer try/catch
      if (!isNotification) {
        const response = {
          jsonrpc: '2.0',
          id: requestId,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'Composio-Self-Hosted-MCP',
              version: '1.2.0'
            }
          }
        };
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    }
    
    // B. Expose dynamic mapped tools schema list
    else if (request.method === 'tools/list') {
      if (!isNotification) {
        const response = {
          jsonrpc: '2.0',
          id: requestId,
          result: {
            tools: cachedMcpTools
          }
        };
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    }

    // C. Execute standard compliant dynamic action tool execution
    else if (request.method === 'tools/call') {
      // Use optional chaining for safer access to params
      const toolName = request.params?.name;
      const args = request.params?.arguments || {};

      if (!toolName) {
        const errorMessage = 'Invalid params: Missing tool name for tools/call.';
        process.stderr.write(`[COMPOSIO MCP ERROR] ${errorMessage} - Request: ${JSON.stringify(request)}\n`);
        if (!isNotification) {
          sendErrorResponse(requestId, -32602, errorMessage);
        }
        return;
      }

      process.stderr.write(`[COMPOSIO MCP] Executing action: "${toolName}" on behalf of user: "${tenantId}"\n`);

      try {
        let result;
        if (apiKey === 'test_mock_key') {
          result = { success: true, message: `Mock execution successful for: ${toolName}`, arguments: args };
        } else {
          // Execute dynamic action natively through @composio/core
          result = await composio.tools.execute(toolName, {
            userId: tenantId,
            arguments: args
          });
        }

        if (!isNotification) {
          const response = {
            jsonrpc: '2.0',
            id: requestId,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result)
                }
              ]
            }
          };
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      } catch (execError) {
        process.stderr.write(`[COMPOSIO MCP EXEC ERROR] Action execution failed: ${execError.message}\n`);
        if (!isNotification) {
          sendErrorResponse(requestId, -32603, execError.message || 'Action execution failed.');
        }
      }
    } else {
      // Method not found
      const errorMessage = `Method not found: ${request.method}`;
      process.stderr.write(`[COMPOSIO MCP ERROR] ${errorMessage} - Request: ${JSON.stringify(request)}\n`);
      if (!isNotification) {
        sendErrorResponse(requestId, -32601, errorMessage);
      }
    }
  } catch (processingError) {
    // Catch any unexpected errors during request processing (e.g., in loadAndMapTools)
    process.stderr.write(`[COMPOSIO MCP ERROR] Internal server error during request processing: ${processingError.message}\n`);
    if (!isNotification) {
      sendErrorResponse(requestId, -32603, processingError.message || 'Internal server error.');
    }
  }
});