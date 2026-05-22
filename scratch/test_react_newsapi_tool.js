import dotenv from 'dotenv';
dotenv.config();

import assert from 'assert';
import { executeToolBasedConversation } from '../src/app/modules/search/services/reactAgent.js';
import { newsapiGlobalNewsSearch } from '../src/app/modules/search/tools.js';

console.log('======================================================================');
console.log('🧪 VERIFYING REACT AGENT NEWSAPI TOOL REGISTRATION');
console.log('======================================================================\n');

// 1. Tool Identity and Schema verification
console.log('▸ Verifying tool instance...');
assert.ok(newsapiGlobalNewsSearch, 'newsapiGlobalNewsSearch tool must be exported');
assert.strictEqual(newsapiGlobalNewsSearch.name, 'newsapi_global_news_search', 'Tool name must match exactly');
assert.ok(newsapiGlobalNewsSearch.schema, 'Tool schema must be defined');
console.log('  ✅ [PASS] Tool identity is correct.\n');

// 2. Local tool execution verification
console.log('▸ Testing local tool execution on "Ethereum"...');
const mockOutput = await newsapiGlobalNewsSearch.invoke({ query: 'Ethereum' });
assert.ok(mockOutput.includes('EVENT REGISTRY / NEWSAPI.AI GLOBAL NEWS INTELLIGENCE'), 'Tool output must contain correct header');
assert.ok(mockOutput.includes('Ethereum'), 'Tool output must contain the sanitized topic name');
console.log('  ✅ [PASS] Tool executes and formats markdown successfully.\n');

console.log('======================================================================');
console.log('🎉 ALL REACT AGENT NEWSAPI TOOL VERIFICATIONS PASSED SUCCESSFULLY!');
console.log('======================================================================');
process.exit(0);
