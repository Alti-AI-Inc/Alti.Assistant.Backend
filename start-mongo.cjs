const { MongoMemoryReplSet } = require('mongodb-memory-server');
(async () => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ port: 27017 }] });
  console.log('MongoDB Memory ReplSet running on', replSet.getUri());
})();
