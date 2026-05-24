import { MemorySaver } from '@langchain/langgraph';

const saver = new MemorySaver();
console.log('serde is:', saver.serde);

const testCheckpoint = {
  v: 4,
  id: 'test-id',
  ts: new Date().toISOString(),
  channel_values: { a: 1, b: 'hello' },
  channel_versions: { a: 1, b: 1 },
  versions_seen: {}
};

const [type, serialized] = await saver.serde.dumpsTyped(testCheckpoint);
console.log('dumpsTyped output type:', type);
console.log('dumpsTyped output serialized:', typeof serialized, serialized);

const deserialized = await saver.serde.loadsTyped(type, serialized);
console.log('loadsTyped output:', deserialized);
