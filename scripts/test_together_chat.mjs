/**
 * Test Suite: Aphura Sovereign Together.ai Chat Inference Suite
 * Validates all 6 Chat Inference domains, Gateway Handlers, and CLI Commands
 */

import assert from 'node:assert';
import {
  CHAT_ROLES,
  CHAT_PARAMETERS_SCHEMA,
  STRUCTURED_OUTPUT_MODES,
  REASONING_MODELS_CATALOG,
  getChatOverview,
  getChatParametersDocs,
  getStructuredOutputsDocs,
  getReasoningDocs,
  extractReasoningTokens,
  getPromptCachingDocs,
  getLogprobsDocs,
  calculateTokenConfidence,
  executeChatCompletion,
} from '../src/app/services/together.chat.js';
import { executeTogetherCliCommand } from '../src/app/services/together.cli.js';
import { InferenceGateway } from '../src/app/modules/inference/inference.gateway.js';

console.log('🧪 Starting Together.ai Chat Inference Suite Validation...\n');

// 1. Roles & Chat Overview
console.log('1. Testing Chat Overview & Roles...');
const overview = getChatOverview();
assert.strictEqual(overview.success, true);
assert.strictEqual(overview.roles.length, 4);
assert.deepStrictEqual(CHAT_ROLES, ['system', 'user', 'assistant', 'tool']);
assert.ok(overview.code_snippets.python.includes('client.chat.completions.create'));
assert.ok(overview.code_snippets.typescript.includes('client.chat.completions.create'));
console.log('   ✅ Chat Overview passed.');

// 2. Chat Parameters Schema
console.log('2. Testing Chat Parameters Schema...');
const paramsDocs = getChatParametersDocs();
assert.strictEqual(paramsDocs.success, true);
assert.ok('max_tokens' in paramsDocs.schema);
assert.ok('temperature' in paramsDocs.schema);
assert.ok('top_p' in paramsDocs.schema);
assert.ok('top_k' in paramsDocs.schema);
assert.ok('repetition_penalty' in paramsDocs.schema);
assert.ok('frequency_penalty' in paramsDocs.schema);
assert.ok('presence_penalty' in paramsDocs.schema);
assert.ok('seed' in paramsDocs.schema);
assert.ok('response_format' in paramsDocs.schema);
assert.ok('reasoning_effort' in paramsDocs.schema);
assert.ok('prompt_cache_key' in paramsDocs.schema);
assert.ok(paramsDocs.quick_troubleshooting.length >= 5);
console.log('   ✅ Chat Parameters Schema passed.');

// 3. Structured Outputs & JSON Mode
console.log('3. Testing Structured Outputs...');
const structDocs = getStructuredOutputsDocs();
assert.strictEqual(structDocs.success, true);
assert.ok('json_schema' in structDocs.modes);
assert.ok('regex' in structDocs.modes);
assert.strictEqual(structDocs.modes.regex.type, 'regex');
assert.ok(structDocs.best_practices.length >= 4);
console.log('   ✅ Structured Outputs passed.');

// 4. Reasoning Models & Thinking Modes
console.log('4. Testing Reasoning Models & Token Extractors...');
const reasoningDocs = getReasoningDocs();
assert.strictEqual(reasoningDocs.success, true);
assert.ok(reasoningDocs.models.some(m => m.model.includes('DeepSeek-R1')));
assert.ok(reasoningDocs.models.some(m => m.model.includes('MiniMax-M3')));
assert.ok(reasoningDocs.models.some(m => m.model.includes('GLM-5.2')));

// Test extraction with explicit reasoning_content
const choice1 = {
  message: {
    role: 'assistant',
    content: 'The answer is 42.',
    reasoning_content: 'Let X be the unknown. Compute 6 * 7 = 42.',
  },
};
const res1 = extractReasoningTokens(choice1);
assert.strictEqual(res1.has_reasoning, true);
assert.strictEqual(res1.content, 'The answer is 42.');
assert.strictEqual(res1.reasoning, 'Let X be the unknown. Compute 6 * 7 = 42.');

// Test extraction with embedded <think> tags (DeepSeek-R1)
const choice2 = {
  message: {
    role: 'assistant',
    content: '<think>Step 1: Check inputs. Step 2: Conclude.</think>Here is the final output.',
  },
};
const res2 = extractReasoningTokens(choice2);
assert.strictEqual(res2.has_reasoning, true);
assert.strictEqual(res2.reasoning, 'Step 1: Check inputs. Step 2: Conclude.');
assert.strictEqual(res2.content, 'Here is the final output.');

// Test extraction with no reasoning
const choice3 = {
  message: {
    role: 'assistant',
    content: 'Just normal text.',
  },
};
const res3 = extractReasoningTokens(choice3);
assert.strictEqual(res3.has_reasoning, false);
assert.strictEqual(res3.reasoning, null);
assert.strictEqual(res3.content, 'Just normal text.');
console.log('   ✅ Reasoning Models and Token Extraction passed.');

// 5. Prompt Caching
console.log('5. Testing Prompt Caching...');
const cachingDocs = getPromptCachingDocs();
assert.strictEqual(cachingDocs.success, true);
assert.ok(cachingDocs.rules_for_max_hits.length >= 4);
assert.ok(cachingDocs.usage_reporting.nested.includes('cached_tokens'));
console.log('   ✅ Prompt Caching passed.');

// 6. Log Probabilities & Confidence
console.log('6. Testing Log Probabilities & Math Calculations...');
const logprobsDocs = getLogprobsDocs();
assert.strictEqual(logprobsDocs.success, true);
assert.strictEqual(logprobsDocs.parameter, 'logprobs: 1');

// Confidence math tests
const conf1 = calculateTokenConfidence(0);
assert.strictEqual(conf1, 1.0);
const conf2 = calculateTokenConfidence(-0.05);
assert.ok(conf2 > 0.94 && conf2 < 0.96);
const confNull = calculateTokenConfidence(undefined);
assert.strictEqual(confNull, null);
console.log('   ✅ Log Probabilities and Confidence Math passed.');

// 7. Chat Completion Execution (Dry Run)
console.log('7. Testing Chat Completion Execution (Dry Run)...');
const completionDryRun = await executeChatCompletion({
  model: 'deepseek-ai/DeepSeek-V4-Pro-0813',
  prompt: 'Analyze token velocity.',
  prompt_cache_key: 'session-tx-99',
  logprobs: 1,
  dry_run: true,
});
assert.strictEqual(completionDryRun.success, true);
assert.strictEqual(completionDryRun.dry_run, true);
assert.strictEqual(completionDryRun.choices[0].finish_reason, 'stop');
assert.ok(completionDryRun.choices[0].message.reasoning_content);
assert.ok(completionDryRun.choices[0].logprobs.content.length > 0);
assert.strictEqual(completionDryRun.usage.cached_tokens, 10);
console.log('   ✅ Chat Completion Dry Run passed.');

// 8. Together CLI Commands
console.log('8. Testing Together CLI Chat Subcommands...');
const cliOverview = await executeTogetherCliCommand(['chat', 'overview']);
assert.ok(cliOverview.output.includes('Together AI Chat Completions:'));

const cliParams = await executeTogetherCliCommand(['chat', 'parameters']);
assert.ok(cliParams.output.includes('Chat Completion Parameters Reference:'));

const cliStructured = await executeTogetherCliCommand(['chat', 'structured']);
assert.ok(cliStructured.output.includes('Structured Outputs & JSON Mode:'));

const cliReasoning = await executeTogetherCliCommand(['chat', 'reasoning']);
assert.ok(cliReasoning.output.includes('Reasoning Models & Thinking Modes:'));

const cliCaching = await executeTogetherCliCommand(['chat', 'caching']);
assert.ok(cliCaching.output.includes('Automatic Prompt Caching:'));

const cliLogprobs = await executeTogetherCliCommand(['chat', 'logprobs']);
assert.ok(cliLogprobs.output.includes('Log Probabilities Reference:'));

const cliRun = await executeTogetherCliCommand(['chat', 'completion', '--dry-run', '--prompt', 'Test message']);
assert.ok(cliRun.output.includes('Chat Completion'));
console.log('   ✅ Together CLI Chat subcommands passed.');

// 9. Inference Gateway Handlers
console.log('9. Testing Inference Gateway Handlers...');
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
await InferenceGateway.handleGetChatOverview({}, mockRes1);
assert.strictEqual(mockRes1.statusCode, 200);
assert.strictEqual(mockRes1.body.success, true);

const mockRes2 = createMockRes();
await InferenceGateway.handleGetChatParameters({}, mockRes2);
assert.strictEqual(mockRes2.statusCode, 200);
assert.strictEqual(mockRes2.body.success, true);

const mockRes3 = createMockRes();
await InferenceGateway.handleGetStructuredOutputs({}, mockRes3);
assert.strictEqual(mockRes3.statusCode, 200);
assert.strictEqual(mockRes3.body.success, true);

const mockRes4 = createMockRes();
await InferenceGateway.handleGetReasoningDocs({}, mockRes4);
assert.strictEqual(mockRes4.statusCode, 200);
assert.strictEqual(mockRes4.body.success, true);

const mockRes5 = createMockRes();
await InferenceGateway.handleGetPromptCachingDocs({}, mockRes5);
assert.strictEqual(mockRes5.statusCode, 200);
assert.strictEqual(mockRes5.body.success, true);

const mockRes6 = createMockRes();
await InferenceGateway.handleGetLogprobsDocs({}, mockRes6);
assert.strictEqual(mockRes6.statusCode, 200);
assert.strictEqual(mockRes6.body.success, true);

const mockRes7 = createMockRes();
await InferenceGateway.handleExecuteChatCompletion({ body: { dry_run: true } }, mockRes7);
assert.strictEqual(mockRes7.statusCode, 200);
assert.strictEqual(mockRes7.body.dry_run, true);
console.log('   ✅ Inference Gateway Handlers passed.');

console.log('\n🎉 ALL 9 TEST SUITES COMPLETED WITH 100% SUCCESS!');
