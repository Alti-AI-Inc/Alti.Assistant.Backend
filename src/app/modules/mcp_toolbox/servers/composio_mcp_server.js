import readline from 'readline';
import { Composio } from '@composio/core';

// ==========================================
// 1. Initializing and Dynamic Environment Fetching
// ==========================================

const apiKey = process.env.COMPOSIO_API_KEY;
const tenantId = process.env.TENANT_ID || 'default_user';
const toolkitsString = process.env.COMPOSIO_TOOLKITS || '';

if (!apiKey) {
  process.stderr.write('[COMPOSIO MCP ERROR] COMPOSIO_API_KEY environment variable is required.\n');
  process.exit(1);
}

// Convert comma-separated string to list of toolkit slugs
const toolkits = toolkitsString
  .split(',')
  .map(slug => slug.trim().toLowerCase())
  .filter(Boolean);

// Initialize Composio core client
const composio = new Composio({ apiKey });

// Cache of parsed dynamic tools mapped to MCP tool schema
let cachedMcpTools = [];

// ==========================================
// 2. Dynamic Tool Mapping Engine
// ==========================================

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
  }
}

// ==========================================
// 3. Stdio JSON-RPC 2.0 Framing Stream
// ==========================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const request = JSON.parse(trimmed);
    const id = request.id;

    // A. Model Context Protocol standard handshake
    if (request.method === 'initialize') {
      // Load and map tools upon active handshake sequence
      await loadAndMapTools();

      const response = {
        jsonrpc: '2.0',
        id,
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
    
    // B. Expose dynamic mapped tools schema list
    else if (request.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          tools: cachedMcpTools
        }
      };
      process.stdout.write(JSON.stringify(response) + '\n');
    }

    // C. Execute standard compliant dynamic action tool execution
    else if (request.method === 'tools/call') {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

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

        const response = {
          jsonrpc: '2.0',
          id,
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
      } catch (execError) {
        process.stderr.write(`[COMPOSIO MCP EXEC ERROR] Action execution failed: ${execError.message}\n`);
        const response = {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: execError.message || 'Action execution failed.'
          }
        };
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    }
  } catch (err) {
    process.stderr.write(`[COMPOSIO MCP ERROR] Unparsable stdin frame: ${err.message}\n`);
  }
});
