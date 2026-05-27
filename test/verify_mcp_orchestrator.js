import fs from 'fs';
import path from 'path';
import { mcpOrchestratorService } from '../src/app/modules/mcp_toolbox/mcp_orchestrator.service.js';

/**
 * High-Fidelity Automated Test Suite for MCP Orchestrator & Multi-Process Bridge
 */
async function runTestSuite() {
  console.log('🧪 Starting high-fidelity backend MCP Orchestrator test suite...\n');

  const tenantId = 'test_tenant_999';
  const serverId = 'mock-test-server';

  // 1. Write an inline mock Node.js script to act as a standard stdio JSON-RPC MCP server
  const mockServerScriptPath = path.resolve('test/mock_mcp_server.cjs');
  const mockScriptContent = `
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const request = JSON.parse(line);
    const id = request.id;

    if (request.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id: id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'Mock-Test-MCP-Server',
            version: '1.0.0'
          }
        }
      };
      process.stdout.write(JSON.stringify(response) + '\\n');
    } else if (request.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: id,
        result: {
          tools: [
            {
              name: 'sequential_think',
              description: 'Performs sequential thinking processes',
              inputSchema: {
                type: 'object',
                properties: {
                  thought: { type: 'string' }
                }
              }
            },
            {
              name: 'read_memory',
              description: 'Reads semantic persistent concepts',
              inputSchema: {
                type: 'object',
                properties: {
                  concept: { type: 'string' }
                }
              }
            }
          ]
        }
      };
      process.stdout.write(JSON.stringify(response) + '\\n');
    } else if (request.method === 'tools/call') {
      const toolName = request.params.name;
      const args = request.params.arguments || {};
      
      const response = {
        jsonrpc: '2.0',
        id: id,
        result: {
          content: [
            {
              type: 'text',
              text: \`Mock execution successful for tool "\${toolName}" with arguments: \${JSON.stringify(args)}\`
            }
          ]
        }
      };
      process.stdout.write(JSON.stringify(response) + '\\n');
    }
  } catch (err) {
    process.stderr.write('Error processing mock input: ' + err.message + '\\n');
  }
});
`;

  fs.mkdirSync(path.dirname(mockServerScriptPath), { recursive: true });
  fs.writeFileSync(mockServerScriptPath, mockScriptContent, 'utf-8');
  console.log(`[TEST SETUP] Wrote mock MCP server script to: ${mockServerScriptPath}`);

  // 2. Inject mock server config into global registry dynamically
  mcpOrchestratorService.globalRegistry[serverId] = {
    id: serverId,
    name: 'Simulated Testing Server',
    description: 'A mock server to validate stdin/stdout JSON-RPC orchestration.',
    command: 'node',
    args: [mockServerScriptPath],
    env: {}
  };

  try {
    // ----------------------------------------------------
    // TEST 1: Spawning and Handshake Validation
    // ----------------------------------------------------
    console.log('\n--- 1. Testing Server Boot & JSON-RPC Handshake ---');
    const bootResult = await mcpOrchestratorService.startServer(tenantId, serverId);
    
    if (bootResult.success && bootResult.server.connected) {
      console.log('✅ PASS: Server successfully booted, process spawned, and standard handshake completed.');
    } else {
      throw new Error('FAIL: Server failed to connect or initialize.');
    }

    // ----------------------------------------------------
    // TEST 2: Schema Introspection Validation
    // ----------------------------------------------------
    console.log('\n--- 2. Testing Dynamic Schema Introspection ---');
    const status = mcpOrchestratorService.getDashboardStatus(tenantId);
    const mockStatus = status.find(s => s.id === serverId);

    if (mockStatus && mockStatus.toolsCount === 2) {
      const toolNames = mockStatus.tools.map(t => t.name);
      console.log(`✅ PASS: Successfully retrieved tools list: [${toolNames.join(', ')}]`);
    } else {
      throw new Error(`FAIL: Dynamic schema introspection failed. Expected 2 tools, got: ${mockStatus?.toolsCount || 0}`);
    }

    // ----------------------------------------------------
    // TEST 3: Safe Parameterized Tool Invocation
    // ----------------------------------------------------
    console.log('\n--- 3. Testing Dynamic Tool Call Routing ---');
    const callResult = await mcpOrchestratorService.callTool(tenantId, serverId, 'sequential_think', {
      thought: 'Refactoring Alti backend for multi-server parallel serving'
    });

    if (callResult.success && callResult.result.content?.[0]?.text?.includes('sequential_think')) {
      console.log(`✅ PASS: Tool call resolved successfully. Result: "${callResult.result.content[0].text}"`);
    } else {
      throw new Error('FAIL: Tool call execution returned an invalid or empty response.');
    }

    // ----------------------------------------------------
    // TEST 4: Self-Healing Recovery Daemon Validation
    // ----------------------------------------------------
    console.log('\n--- 4. Testing Self-Healing Process Recovery ---');
    const userServers = mcpOrchestratorService.getUserServers(tenantId);
    const serverInstance = userServers.get(serverId);

    console.log('[HEALING TEST] Killing process abruptly to trigger crash handler...');
    serverInstance.process.kill('SIGKILL'); // Abrupt kill bypasses standard graceful stop

    console.log('[HEALING TEST] Waiting 8s to verify auto-restart recovery triggers...');
    await new Promise(resolve => setTimeout(resolve, 8000));

    if (serverInstance.process && !serverInstance.process.killed && serverInstance.initialized) {
      console.log('✅ PASS: Self-healing daemon successfully detected the crash, re-spawned the subprocess, and re-established the standard handshake!');
    } else {
      throw new Error('FAIL: Self-healing daemon failed to automatically recover the connection.');
    }

    // ----------------------------------------------------
    // TEST 5: Graceful Termination Verification
    // ----------------------------------------------------
    console.log('\n--- 5. Testing Graceful Termination ---');
    const stopResult = await mcpOrchestratorService.stopServer(tenantId, serverId);
    
    if (stopResult.success && !serverInstance.process) {
      console.log('✅ PASS: Server process gracefully stopped and resources cleaned.');
    } else {
      throw new Error('FAIL: Stop server method failed to terminate process.');
    }

    console.log('\n🌟 SUCCESS: All integration and stability tests passed successfully!');

  } catch (error) {
    console.error(`\n❌ TEST FAILURE: ${error.message}`);
    process.exit(1);
  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(mockServerScriptPath)) {
        fs.unlinkSync(mockServerScriptPath);
      }
      // Stop all servers in case of error
      await mcpOrchestratorService.stopAllUserServers(tenantId);
    } catch (e) {}
  }
}

runTestSuite();
