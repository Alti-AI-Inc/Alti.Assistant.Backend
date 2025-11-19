#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { openMemoryClient } from '../src/app/shared/openMemoryClient.js';
import config from '../config/index.js';

const parseArgs = () => {
  return process.argv.slice(2).reduce((acc, arg) => {
    if (arg.startsWith('--')) {
      const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
      acc[key] = value;
    } else {
      acc._.push(arg);
    }
    return acc;
  }, { _: [] });
};

const log = (label, value) => {
  console.log(`\n${label}:`);
  console.log(value);
};

const formatAxiosError = (error) => {
  if (error.response) {
    return `${error.message} (status ${error.response.status})\nResponse body: ${JSON.stringify(error.response.data, null, 2)}`;
  }
  if (error.request) {
    return `${error.message} (no response received)`;
  }
  return error.message;
};

const exitWithError = (message) => {
  console.error(`\n❌ ${message}`);
  process.exit(1);
};

const args = parseArgs();
const userId = args.user || process.env.OPENMEMORY_TEST_USER || `openmemory-test-${randomUUID()}`;
const testQuery = args.query || 'openmemory connectivity check';
const testContent = args.content || `Connectivity test entry created at ${new Date().toISOString()}`;
const topK = Number(args.k || config.openMemory.defaultTopK || 5);

async function main() {
  console.log('🔍 OpenMemory connectivity test');
  console.log('--------------------------------');

  if (!openMemoryClient.enabled) {
    exitWithError('OpenMemory is disabled (OPENMEMORY_ENABLED must be true).');
  }

  // 1) Health check
  try {
    const { data } = await openMemoryClient.http.get('/health');
    log('Health endpoint response', data);
  } catch (error) {
    exitWithError(`Health check failed: ${formatAxiosError(error)}`);
  }

  // 2) Add a temporary memory entry
  try {
    const addResponse = await openMemoryClient.addMemory({
      content: testContent,
      userId,
      tags: ['connectivity-test'],
      metadata: {
        source: 'scripts/test-openmemory.js',
        createdAt: new Date().toISOString(),
        query: testQuery,
      },
      sector: args.sector || 'semantic',
    });
    log('Add memory response', addResponse);
  } catch (error) {
    exitWithError(`Failed to add memory: ${formatAxiosError(error)}`);
  }

  // 3) Query for the memory we just added
  try {
    const matches = await openMemoryClient.queryMemories({
      query: args.search || testQuery,
      userId,
      k: topK,
    });

    log('Query matches', matches);

    const match = matches.find((item) => item.content?.includes(testContent));
    if (!match) {
      console.warn('\n⚠️ The inserted memory was not returned in the top results. Try increasing --k or adjusting the query.');
    } else {
      console.log('\n✅ OpenMemory is responding correctly and returned the test memory.');
    }
  } catch (error) {
    exitWithError(`Failed to query memories: ${formatAxiosError(error)}`);
  }

  console.log('\n🎉 OpenMemory test completed.');
}

main().catch((error) => {
  exitWithError(formatAxiosError(error));
});
