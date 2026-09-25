/**
 * Test Suite: Aphura Sovereign Together.ai Function Calling Suite
 * Validates all 5 Function Calling domains, Validation Engine, Agentic Loop, Gateway Handlers, and CLI Commands
 */

import assert from 'node:assert';
import {
  FUNCTION_CALLING_MODELS,
  FUNCTION_CALLING_PATTERNS,
  TOOL_CHOICE_OPTIONS,
  BEST_PRACTICES_CATALOG,
  getFunctionCallingOverview,
  getSingleCallDocs,
  getParallelCallDocs,
  getAgenticPatternsDocs,
  getBestPracticesDocs,
  validateToolDefinition,
  formatAssistantToolCallMessage,
  formatToolResponseMessage,
  executeFunctionCallLoop,
} from '../src/app/services/together.function_calling.js';
import { executeTogetherCliCommand } from '../src/app/services/together.cli.js';
import { InferenceGateway } from '../src/app/modules/inference/inference.gateway.js';

console.log('🧪 Starting Together.ai Function Calling Suite Validation...\n');

// 1. Overview & Architecture
console.log('1. Testing Function Calling Overview & Flow...');
const overview = getFunctionCallingOverview();
assert.strictEqual(overview.success, true);
assert.strictEqual(overview.recommended_model, 'zai-org/GLM-5.3');
assert.strictEqual(overview.patterns.length, 7);
assert.strictEqual(overview.flow.length, 5);
assert.ok(FUNCTION_CALLING_MODELS.some(m => m.id === 'zai-org/GLM-5.3'));
assert.ok(FUNCTION_CALLING_MODELS.some(m => m.id === 'Qwen/Qwen3.5-9B'));
console.log('   ✅ Function Calling Overview passed.');

// 2. Single Function Calling & Tool Choice
console.log('2. Testing Single Function Calling & Tool Choice...');
const singleDocs = getSingleCallDocs();
assert.strictEqual(singleDocs.success, true);
assert.strictEqual(singleDocs.modes.length, 3);
assert.ok('auto' in singleDocs.tool_choice_options);
assert.ok('none' in singleDocs.tool_choice_options);
assert.ok('required' in singleDocs.tool_choice_options);
assert.ok('specific_tool' in singleDocs.tool_choice_options);
assert.ok(singleDocs.critical_notes.some(n => n.includes('message.tool_calls')));
assert.strictEqual(singleDocs.example_schema.type, 'function');
console.log('   ✅ Single Function Calling passed.');

// 3. Parallel Function Calling
console.log('3. Testing Parallel Function Calling...');
const parallelDocs = getParallelCallDocs();
assert.strictEqual(parallelDocs.success, true);
assert.strictEqual(parallelDocs.variants.length, 2);
assert.ok(parallelDocs.response_structure.sample.length >= 2);
assert.ok(parallelDocs.client_execution_rule.includes('Promise.all'));
console.log('   ✅ Parallel Function Calling passed.');

// 4. Agentic Loops (Multi-step & Multi-turn)
console.log('4. Testing Agentic Loops (Multi-step & Multi-turn)...');
const agenticDocs = getAgenticPatternsDocs();
assert.strictEqual(agenticDocs.success, true);
assert.ok(agenticDocs.patterns.multi_step.steps.length >= 5);
assert.ok(agenticDocs.patterns.multi_turn.steps.length >= 3);
assert.strictEqual(agenticDocs.message_protocol.length, 5);
console.log('   ✅ Agentic Loops passed.');

// 5. Best Practices & Hardening
console.log('5. Testing Best Practices & Hardening...');
const bpDocs = getBestPracticesDocs();
assert.strictEqual(bpDocs.success, true);
assert.strictEqual(bpDocs.soft_tool_limit, 20);
assert.strictEqual(bpDocs.practices.length, 6);
assert.ok(bpDocs.good_vs_poor_example.good_description.length > 50);
assert.ok(bpDocs.good_vs_poor_example.poor_description.length < 40);
console.log('   ✅ Best Practices passed.');

// 6. Tool Definition Validation
console.log('6. Testing Tool Definition Validation Engine...');
// Valid tool
const validTool = {
  type: 'function',
  function: {
    name: 'fetch_weather_report',
    description: 'Retrieves current weather status and forecast for given coordinates.',
    parameters: {
      type: 'object',
      properties: {
        lat: { type: 'number' },
        lon: { type: 'number' },
      },
      required: ['lat', 'lon'],
      additionalProperties: false,
    },
    strict: true,
  },
};
const valResult1 = validateToolDefinition(validTool);
assert.strictEqual(valResult1.valid, true);
assert.strictEqual(valResult1.errors.length, 0);

// Invalid tool (missing parameters and bad name)
const invalidTool = {
  type: 'function',
  function: {
    name: 'fetch weather', // spaces invalid
    description: 'too short', // warning
  },
};
const valResult2 = validateToolDefinition(invalidTool);
assert.strictEqual(valResult2.valid, false);
assert.ok(valResult2.errors.length > 0);
assert.ok(valResult2.warnings.length > 0);
console.log('   ✅ Tool Definition Validation passed.');

// 7. Message Protocol Formatters
console.log('7. Testing Message Formatters...');
const asstMsg = formatAssistantToolCallMessage([{ id: 'call_1', function: { name: 'test' } }]);
assert.strictEqual(asstMsg.role, 'assistant');
assert.strictEqual(asstMsg.tool_calls.length, 1);

const toolMsg = formatToolResponseMessage('call_1', 'test', { status: 'ok' });
assert.strictEqual(toolMsg.role, 'tool');
assert.strictEqual(toolMsg.tool_call_id, 'call_1');
assert.strictEqual(toolMsg.content, '{"status":"ok"}');
console.log('   ✅ Message Formatters passed.');

// 8. Agentic Loop Execution (Dry Run)
console.log('8. Testing Agentic Loop Execution (Dry Run)...');
const loopRes = await executeFunctionCallLoop({
  prompt: 'Check weather in Berlin',
  dry_run: true,
});
assert.strictEqual(loopRes.success, true);
assert.strictEqual(loopRes.dry_run, true);
assert.strictEqual(loopRes.iterations, 2);
assert.ok(loopRes.final_response.includes('Tokyo, Japan') || loopRes.final_response.includes('temperature'));
assert.strictEqual(loopRes.messages.length, 4);
console.log('   ✅ Agentic Loop Execution passed.');

// 9. Together CLI Subcommands
console.log('9. Testing Together CLI Function Calling Subcommands...');
const cliOverview = await executeTogetherCliCommand(['fc', 'overview']);
assert.ok(cliOverview.output.includes('Together AI Function Calling Overview:'));

const cliSingle = await executeTogetherCliCommand(['fc', 'single']);
assert.ok(cliSingle.output.includes('Single Function Calling Reference:'));

const cliParallel = await executeTogetherCliCommand(['fc', 'parallel']);
assert.ok(cliParallel.output.includes('Parallel Function Calling Reference:'));

const cliAgentic = await executeTogetherCliCommand(['fc', 'agentic']);
assert.ok(cliAgentic.output.includes('Agentic Function Calling Patterns:'));

const cliBP = await executeTogetherCliCommand(['fc', 'best-practices']);
assert.ok(cliBP.output.includes('Function Calling Best Practices & Reliability Guide:'));

const cliValidate = await executeTogetherCliCommand(['fc', 'validate']);
assert.ok(cliValidate.output.includes('Tool Definition Validation:'));
assert.ok(cliValidate.output.includes('VALID ✅'));

const cliRun = await executeTogetherCliCommand(['fc', 'run', '--dry-run', '--prompt', 'Test loop']);
assert.ok(cliRun.output.includes('Function Calling Agentic Loop'));
console.log('   ✅ Together CLI Function Calling subcommands passed.');

// 10. Inference Gateway Handlers
console.log('10. Testing Inference Gateway Handlers...');
function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

const mockRes1 = createMockRes();
await InferenceGateway.handleGetFunctionCallingOverview({}, mockRes1);
assert.strictEqual(mockRes1.statusCode, 200);
assert.strictEqual(mockRes1.body.success, true);

const mockRes2 = createMockRes();
await InferenceGateway.handleGetSingleCallDocs({}, mockRes2);
assert.strictEqual(mockRes2.statusCode, 200);
assert.strictEqual(mockRes2.body.success, true);

const mockRes3 = createMockRes();
await InferenceGateway.handleGetParallelCallDocs({}, mockRes3);
assert.strictEqual(mockRes3.statusCode, 200);
assert.strictEqual(mockRes3.body.success, true);

const mockRes4 = createMockRes();
await InferenceGateway.handleGetAgenticPatternsDocs({}, mockRes4);
assert.strictEqual(mockRes4.statusCode, 200);
assert.strictEqual(mockRes4.body.success, true);

const mockRes5 = createMockRes();
await InferenceGateway.handleGetBestPracticesDocs({}, mockRes5);
assert.strictEqual(mockRes5.statusCode, 200);
assert.strictEqual(mockRes5.body.success, true);

const mockRes6 = createMockRes();
await InferenceGateway.handleValidateToolDefinition({ body: validTool }, mockRes6);
assert.strictEqual(mockRes6.statusCode, 200);
assert.strictEqual(mockRes6.body.valid, true);

const mockRes7 = createMockRes();
await InferenceGateway.handleExecuteFunctionCallingLoop({ body: { dry_run: true } }, mockRes7);
assert.strictEqual(mockRes7.statusCode, 200);
assert.strictEqual(mockRes7.body.dry_run, true);
console.log('   ✅ Inference Gateway Handlers passed.');

console.log('\n🎉 ALL 10 FUNCTION CALLING TEST SUITES COMPLETED WITH 100% SUCCESS!');
