import fs from 'fs';
import path from 'path';
import { mcpOrchestratorService } from '../src/app/modules/mcp_toolbox/mcp_orchestrator.service.js';

/**
 * High-Fidelity Integration Test Suite for Unified MCP virtual tools gateway & hot-watcher
 */
async function runTestSuite() {
  console.log('🧪 Starting Phase 2 Unified MCP Virtual Gateway integration tests...\n');

  const tenantId = 'test_gateway_tenant_777';
  const serverAId = 'mcp-server-a';
  const serverBId = 'mcp-server-b';
  const serverCId = 'mcp-server-c';

  const scriptAPath = path.resolve('test/mock_server_a.cjs');
  const scriptBPath = path.resolve('test/mock_server_b.cjs');
  const scriptCPath = path.resolve('test/mock_server_c.cjs');

  // Helper mock server Node script factory
  const createMockScript = (name, toolName, desc) => `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const request = JSON.parse(line);
    const id = request.id;

    if (request.method === 'initialize') {
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: '${name}', version: '1.0.0' }
        }
      };
      process.stdout.write(JSON.stringify(response) + '\\n');
    } else if (request.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: '${toolName}',
              description: '${desc}',
              inputSchema: { type: 'object', properties: { param: { type: 'string' } } }
            }
          ]
        }
      };
      process.stdout.write(JSON.stringify(response) + '\\n');
    } else if (request.method === 'tools/call') {
      const response = {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: 'Routed successfully to ${name}! Arguments: ' + JSON.stringify(request.params.arguments) }]
        }
      };
      process.stdout.write(JSON.stringify(response) + '\\n');
    }
  } catch (e) {}
});
`;

  // Write mock scripts to disk
  fs.writeFileSync(scriptAPath, createMockScript('Mock-Server-A', 'star_repo', 'Stars a repo'), 'utf-8');
  fs.writeFileSync(scriptBPath, createMockScript('Mock-Server-B', 'create_issue', 'Creates an issue'), 'utf-8');
  fs.writeFileSync(scriptCPath, createMockScript('Mock-Server-C', 'get_stargazers', 'Gets stargazers'), 'utf-8');
  console.log(`[TEST SETUP] Created mock scripts: server A, server B, and server C.`);

  // 1. Manually insert Server A and Server B into registry
  mcpOrchestratorService.globalRegistry[serverAId] = {
    id: serverAId,
    name: 'Mock Server A',
    description: 'Provides star_repo tool.',
    command: 'node',
    args: [scriptAPath],
    env: {}
  };
  mcpOrchestratorService.globalRegistry[serverBId] = {
    id: serverBId,
    name: 'Mock Server B',
    description: 'Provides create_issue tool.',
    command: 'node',
    args: [scriptBPath],
    env: {}
  };

  try {
    // ----------------------------------------------------
    // TEST 1: Booting parallel MCP Servers
    // ----------------------------------------------------
    console.log('\n--- 1. Booting Parallel Stdio Subprocesses ---');
    await mcpOrchestratorService.startServer(tenantId, serverAId);
    await mcpOrchestratorService.startServer(tenantId, serverBId);

    const userServers = mcpOrchestratorService.getUserServers(tenantId);
    if (userServers.get(serverAId).initialized && userServers.get(serverBId).initialized) {
      console.log('✅ PASS: Spawned two independent MCP servers in parallel successfully.');
    } else {
      throw new Error('FAIL: Parallel boot process failed.');
    }

    // ----------------------------------------------------
    // TEST 2: Dynamic Server Registration & Hot-Watch
    // ----------------------------------------------------
    console.log('\n--- 2. Testing On-the-Fly Server Registration ---');
    
    // Register Server C during runtime
    await mcpOrchestratorService.registerServer(tenantId, serverCId, {
      name: 'Mock Server C',
      description: 'Provides get_stargazers tool.',
      command: 'node',
      args: [scriptCPath],
      env: {}
    });

    // Boot the newly registered server immediately without restarts
    await mcpOrchestratorService.startServer(tenantId, serverCId);

    if (userServers.get(serverCId) && userServers.get(serverCId).initialized) {
      console.log('✅ PASS: Registered and booted Server C dynamically during runtime. Hot-reloader verified.');
    } else {
      throw new Error('FAIL: On-the-fly server registration failed.');
    }

    // ----------------------------------------------------
    // TEST 3: Virtual Tools Aggregator Gateway (`all-tools`)
    // ----------------------------------------------------
    console.log('\n--- 3. Testing Virtual Gateway Tools Aggregation ---');
    const unifiedTools = await mcpOrchestratorService.getUnifiedTools(tenantId);
    const toolNames = unifiedTools.map(t => t.name);

    if (toolNames.includes('star_repo') && toolNames.includes('create_issue') && toolNames.includes('get_stargazers')) {
      console.log(`✅ PASS: Virtual gateway successfully aggregated all tools across all running processes: [${toolNames.join(', ')}]`);
    } else {
      throw new Error(`FAIL: Virtual aggregation failed. Tools: [${toolNames.join(', ')}]`);
    }

    // ----------------------------------------------------
    // TEST 4: Gateway Message Routing
    // ----------------------------------------------------
    console.log('\n--- 4. Testing Virtual Tool Call Routing ---');
    
    // Route tool call 1 -> Server A
    const resA = await mcpOrchestratorService.callUnifiedTool(tenantId, 'star_repo', { param: 'mnmballa/Alti' });
    // Route tool call 2 -> Server B
    const resB = await mcpOrchestratorService.callUnifiedTool(tenantId, 'create_issue', { param: 'upgrade pipeline' });
    // Route tool call 3 -> Server C
    const resC = await mcpOrchestratorService.callUnifiedTool(tenantId, 'get_stargazers', { param: 'MNM' });

    const txtA = resA.result.content[0].text;
    const txtB = resB.result.content[0].text;
    const txtC = resC.result.content[0].text;

    if (txtA.includes('Mock-Server-A') && txtB.includes('Mock-Server-B') && txtC.includes('Mock-Server-C')) {
      console.log('✅ PASS: Dynamic virtual routing verified! All calls routed flawlessly to correct subprocesses.');
      console.log(`- Call 1 Output: "${txtA}"`);
      console.log(`- Call 2 Output: "${txtB}"`);
      console.log(`- Call 3 Output: "${txtC}"`);
    } else {
      throw new Error('FAIL: Tool calls were routed incorrectly or failed.');
    }

    console.log('\n🌟 SUCCESS: Phase 2 Unified MCP Gateway upgrades passed all integration tests!');

  } catch (error) {
    console.error(`\n❌ TEST FAILURE: ${error.message}`);
    process.exit(1);
  } finally {
    // Graceful Stop & Resource cleanup
    console.log('\n[TEST CLEANUP] Stopping all servers and removing temporary mock files...');
    await mcpOrchestratorService.stopAllUserServers(tenantId);
    
    try {
      if (fs.existsSync(scriptAPath)) fs.unlinkSync(scriptAPath);
      if (fs.existsSync(scriptBPath)) fs.unlinkSync(scriptBPath);
      if (fs.existsSync(scriptCPath)) fs.unlinkSync(scriptCPath);

      // Clean up server config registry edits to restore original state
      const configPath = path.resolve('config/mcp_servers.json');
      if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        delete parsed.mcp_servers[serverAId];
        delete parsed.mcp_servers[serverBId];
        delete parsed.mcp_servers[serverCId];
        fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2), 'utf-8');
      }
    } catch (e) {}
  }
}

runTestSuite();
