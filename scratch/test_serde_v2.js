import { MemorySaver } from '@langchain/langgraph';

const saver = new MemorySaver();
const testCheckpoint = {
  v: 4,
  id: 'test-id',
  ts: new Date().toISOString(),
  channel_values: { a: 1, b: 'hello' },
  channel_versions: { a: 1, b: 1 },
  versions_seen: {}
};

const stringified = saver.serde.stringify(testCheckpoint);
console.log('stringified output type:', typeof stringified);
console.log('stringified output length:', stringified.length);
console.log('stringified preview:', stringified.substring(0, 100));

const parsed = await saver.serde.parse(stringified);
console.log('parsed output:', parsed);
