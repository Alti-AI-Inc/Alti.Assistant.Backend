import fs from 'fs';
import path from 'path';
import { mcpOrchestratorService } from '../src/app/modules/mcp_toolbox/mcp_orchestrator.service.js';
import { mcpToolboxController } from '../src/app/modules/mcp_toolbox/mcp_toolbox.controller.js';

// Setup colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

console.log(`${CYAN}🧪 Starting Phase 3 Dynamic MCP App Catalog & Installer integration tests...${RESET}\n`);

// Backup original mcp_servers.json config
const configPath = path.resolve('config/mcp_servers.json');
let originalConfigContent = null;
if (fs.existsSync(configPath)) {
  originalConfigContent = fs.readFileSync(configPath, 'utf-8');
}

// Ensure clean environment directories exist
const tempDbDir = path.resolve('storage/users/test_tenant_abc/databases');
fs.mkdirSync(tempDbDir, { recursive: true });

const cleanup = async () => {
  console.log(`\n${YELLOW}[TEST CLEANUP] Restoring configuration and stopping servers...${RESET}`);
  
  // Stop all active servers spawned during the test
  await mcpOrchestratorService.stopAllUserServers('test_tenant_abc');

  // Restore original config
  if (originalConfigContent !== null) {
    fs.writeFileSync(configPath, originalConfigContent, 'utf-8');
  } else if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }

  // Delete temp database folder
  if (fs.existsSync(tempDbDir)) {
    try {
      // 1.5s delay to let Windows fully release process file handles on termination
      await new Promise(resolve => setTimeout(resolve, 1500));
      fs.rmSync(path.resolve('storage/users/test_tenant_abc'), { recursive: true, force: true });
    } catch (err) {
      console.log(`${YELLOW}[TEST CLEANUP WARNING] Temporary directories will be pruned on next startup: ${err.message}${RESET}`);
    }
  }

  console.log(`${GREEN}✅ Cleanup completed successfully!${RESET}`);
};

const runTests = async () => {
  try {
    // ----------------------------------------------------
    // Test 1: Robust Validation & Missing Env Key Rejection
    // ----------------------------------------------------
    console.log(`${CYAN}--- 1. Testing Validation Robustness ---${RESET}`);
    const badReq = {
      user: { userId: 'test_tenant_abc' },
      body: {
        appId: 'brave-search',
        env: {} // Missing BRAVE_API_KEY
      }
    };
    
    let statusCode = 200;
    let responseBody = {};
    
    const badRes = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    await mcpToolboxController.installAppController(badReq, badRes);
    
    if (statusCode === 400 && responseBody.success === false && responseBody.error.includes('BRAVE_API_KEY')) {
      console.log(`${GREEN}✅ PASS: Correctly rejected Brave Search installation due to missing API key.${RESET}`);
    } else {
      throw new Error(`Expected 400 Bad Request for missing key, got ${statusCode} with body: ${JSON.stringify(responseBody)}`);
    }

    // ----------------------------------------------------
    // Test 2: Dynamic SQLite Blueprint Installation & Boot
    // ----------------------------------------------------
    console.log(`\n${CYAN}--- 2. Testing 1-Click SQLite Installation & Boot ---${RESET}`);
    
    const goodReq = {
      user: { userId: 'test_tenant_abc' },
      body: {
        appId: 'sqlite'
      }
    };

    let goodStatusCode = 200;
    let goodResponseBody = {};

    const goodRes = {
      status(code) {
        goodStatusCode = code;
        return this;
      },
      json(data) {
        goodResponseBody = data;
        return this;
      }
    };

    await mcpToolboxController.installAppController(goodReq, goodRes);

    if (goodStatusCode !== 200 || !goodResponseBody.success) {
      throw new Error(`Expected 200 OK for SQLite install, got ${goodStatusCode} with body: ${JSON.stringify(goodResponseBody)}`);
    }

    console.log(`${GREEN}✅ PASS: Endpoint returned success. Registration and connection results received.${RESET}`);
    console.log(`- Installed App Name: "${goodResponseBody.connection.server.name}"`);
    console.log(`- Connection Status:  ${goodResponseBody.connection.server.status}`);
    console.log(`- Sandbox DB Path:    ${goodResponseBody.registration.registry.sqlite.args[2]}`);

    // Wait a brief moment to allow npx stdio handshake to complete
    console.log(`\n${YELLOW}[McpOrchestrator] Waiting 4000ms for npx stdio handshake...${RESET}`);
    await new Promise(resolve => setTimeout(resolve, 4000));

    // ----------------------------------------------------
    // Test 3: Gateway Aggregation & Schema Verification
    // ----------------------------------------------------
    console.log(`\n${CYAN}--- 3. Verifying Aggregated Gateway Tools ---${RESET}`);
    const tools = await mcpOrchestratorService.getUnifiedTools('test_tenant_abc');
    
    console.log(`Aggregated tools list: [${tools.map(t => t.name).join(', ')}]`);
    
    const hasSqliteTools = tools.some(t => t.name === 'query' || t.name === 'describe_table' || t.name === 'list_tables');
    if (hasSqliteTools) {
      console.log(`${GREEN}✅ PASS: Virtual gateway successfully detected and aggregated SQLite schema tools!${RESET}`);
    } else {
      throw new Error(`SQLite tools not present in aggregated list: ${JSON.stringify(tools)}`);
    }

    console.log(`\n${GREEN}🌟 SUCCESS: 1-Click MCP App Installer passed all integration tests!${RESET}`);
  } catch (error) {
    console.error(`\n${RED}❌ TEST FAILED: ${error.message}${RESET}`);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
};

runTests();
