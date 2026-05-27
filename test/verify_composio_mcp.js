import fs from 'fs';
import path from 'path';
import config from '../config/index.js';
import ComposioAuth from '../src/app/modules/composio_v2/composio.model.js';
import { mcpOrchestratorService } from '../src/app/modules/mcp_toolbox/mcp_orchestrator.service.js';

/**
 * High-Fidelity Integration Test Suite for Unified Composio MCP Serving Upgrades
 */
async function runTestSuite() {
  console.log('🧪 Starting high-fidelity backend Composio MCP Server integration tests...\n');

  const tenantId = 'test_composio_tenant_111';
  const serverId = 'composio';

  // 1. Mock Database lookups to avoid connecting to MongoDB
  console.log('[TEST SETUP] Mocking ComposioAuth.find() database query...');
  ComposioAuth.find = () => {
    return {
      lean: () => Promise.resolve([
        { toolkit: { slug: 'github' } },
        { toolkit: { slug: 'gmail' } }
      ])
    };
  };

  // 2. Mock global config credentials with test mock key
  const originalApiKey = config.composio.orgApiKey;
  config.composio.orgApiKey = 'test_mock_key';

  try {
    // ----------------------------------------------------
    // TEST 1: Spawning and Handshake Validation
    // ----------------------------------------------------
    console.log('\n--- 1. Testing Composio Server Boot & Handshake ---');
    const bootResult = await mcpOrchestratorService.startServer(tenantId, serverId);
    
    if (bootResult.success && bootResult.server.connected) {
      console.log(`✅ PASS: Composio MCP server successfully booted and handshake approved.`);
      console.log(`Server metadata: ${bootResult.server.name} - ${bootResult.server.description}`);
    } else {
      throw new Error('FAIL: Composio MCP server failed to initialize.');
    }

    // ----------------------------------------------------
    // TEST 2: Dynamic Schema Retrieval Verification
    // ----------------------------------------------------
    console.log('\n--- 2. Testing Dynamic Schema Introspection ---');
    const status = mcpOrchestratorService.getDashboardStatus(tenantId);
    const composioStatus = status.find(s => s.id === serverId);

    if (composioStatus && composioStatus.toolsCount === 1) {
      const toolNames = composioStatus.tools.map(t => t.name);
      console.log(`✅ PASS: Mapped active toolkits successfully. Mapped Tools list: [${toolNames.join(', ')}]`);
      console.log(`Tool parameters definition:`, JSON.stringify(composioStatus.tools[0].inputSchema, null, 2));
    } else {
      throw new Error(`FAIL: Dynamic tool schema introspection failed. Expected 1 tool, got: ${composioStatus?.toolsCount || 0}`);
    }

    // ----------------------------------------------------
    // TEST 3: Stdio JSON-RPC Tool Execution
    // ----------------------------------------------------
    console.log('\n--- 3. Testing Dynamic Tool Call Routing ---');
    const callResult = await mcpOrchestratorService.callTool(tenantId, serverId, 'GITHUB_STAR_A_REPOSITORY', {
      owner: 'mnmballa2323',
      repo: 'Alti.Assistant'
    });

    if (callResult.success && callResult.result.content?.[0]?.text) {
      const payload = JSON.parse(callResult.result.content[0].text);
      if (payload.success && payload.arguments.repo === 'Alti.Assistant') {
        console.log(`✅ PASS: Unified JSON-RPC tool call executed successfully.`);
        console.log(`Execution Output Payload:`, JSON.stringify(payload, null, 2));
      } else {
        throw new Error('FAIL: Execution output returned incorrect parameters.');
      }
    } else {
      throw new Error('FAIL: Tool call execution failed or returned invalid response.');
    }

    // ----------------------------------------------------
    // TEST 4: Graceful Shutdown Verification
    // ----------------------------------------------------
    console.log('\n--- 4. Testing Graceful Shutdown ---');
    const stopResult = await mcpOrchestratorService.stopServer(tenantId, serverId);
    
    if (stopResult.success) {
      console.log('✅ PASS: Server process gracefully stopped and resources cleaned.');
    } else {
      throw new Error('FAIL: Stop server method failed.');
    }

    console.log('\n🌟 SUCCESS: Composio MCP Server integration validation completed successfully!');

  } catch (error) {
    console.error(`\n❌ TEST FAILURE: ${error.message}`);
    process.exit(1);
  } finally {
    // Restore original credentials
    config.composio.orgApiKey = originalApiKey;
    // Stop server
    await mcpOrchestratorService.stopAllUserServers(tenantId);
  }
}

runTestSuite();
